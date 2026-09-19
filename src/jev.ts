import { sleep } from "./util.ts";

/** Jev input-token price, in USD per million tokens. Output tokens are free. */
const INPUT_COST_PER_MILLION_TOKENS = 0.042;

/** Jev accepts at most 255 options in a single choice question. */
export const MAX_CHOICE_OPTIONS = 255;

const MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504, 529]);

export type JevState = Record<
	string,
	string | number | boolean | null | string[]
>;

/** The three Jev primitives. `noul` is its name for a yes/no question. */
export type JevQuestion =
	| {
			type: "choice";
			instructions: string;
			/** Option id to description. At most MAX_CHOICE_OPTIONS entries. */
			criteria: Record<string, string>;
	  }
	| {
			type: "score";
			instructions: string;
			/** Two to ten rungs, ordered lowest to highest. */
			criteria: string[];
	  }
	| {
			type: "noul";
			instructions: string;
			criteria?: { true?: string; false?: string };
	  };

export type JevAlternative = {
	id: string;
	probability: number;
};

export type JevChoiceAnswer = {
	type: "choice";
	choice: string;
	/** Probability Jev assigned to the selected option. */
	confidence: number;
	/** Runner-up options, most likely first, so decisions can be explained. */
	alternatives: JevAlternative[];
};

export type JevScoreAnswer = {
	type: "score";
	/** Interpolated position on the rubric, from 0 to criteria.length - 1. */
	score: number;
};

export type JevNoulAnswer = {
	type: "noul";
	/** 0 is a strong no, 1 a strong yes, 0.5 undecided. */
	probability: number;
};

export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer;

export type JevChoiceRequest = {
	state: JevState;
	instructions: string;
	criteria: Record<string, string>;
};

export type JevUsage = {
	requests: number;
	inputTokens: number;
	estimatedCostUsd: number;
};

/** What the pipeline needs from a decision model, so tests can stand one in. */
export type JevEvaluator = {
	/** Several questions about one shared state, answered in a single request. */
	ask(
		state: JevState,
		questions: Record<string, JevQuestion>,
	): Promise<Record<string, JevAnswer>>;
	choose(request: JevChoiceRequest): Promise<JevChoiceAnswer>;
	readonly usage: JevUsage;
};

type RawAnswer = {
	type?: string;
	choice?: string;
	score?: number;
	noul?: number;
	confidence?: number;
	probabilities?: Record<string, number>;
};

type DecisionsResponse = {
	answers?: Record<string, RawAnswer>;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
	};
};

export type JevClientOptions = {
	/** Decisions endpoint, e.g. https://openrouter.ai/api/alpha/decisions */
	baseUrl: string;
	apiKey: string;
	model: string;
};

function isRetryable(status: number): boolean {
	return RETRY_STATUS_CODES.has(status);
}

/** The two next-likeliest options, used only for explaining a decision. */
function topAlternatives(
	probabilities: Record<string, number> | undefined,
	choice: string,
): JevAlternative[] {
	if (!probabilities) {
		return [];
	}

	return Object.entries(probabilities)
		.filter(([id, probability]) => id !== choice && probability > 0)
		.sort((left, right) => right[1] - left[1])
		.slice(0, 2)
		.map(([id, probability]) => ({ id, probability }));
}

function parseAnswer(
	id: string,
	question: JevQuestion,
	raw: RawAnswer | undefined,
): JevAnswer {
	if (!raw) {
		throw new Error(`Jev returned no answer for question '${id}'.`);
	}

	if (question.type === "choice") {
		if (!raw.choice) {
			throw new Error(`Jev returned no choice for question '${id}'.`);
		}
		if (!(raw.choice in question.criteria)) {
			throw new Error(
				`Jev returned '${raw.choice}' for '${id}', which is not one of the offered options.`,
			);
		}

		return {
			type: "choice",
			choice: raw.choice,
			confidence: raw.confidence ?? raw.probabilities?.[raw.choice] ?? 1,
			alternatives: topAlternatives(raw.probabilities, raw.choice),
		};
	}

	if (question.type === "score") {
		if (typeof raw.score !== "number") {
			throw new Error(`Jev returned no score for question '${id}'.`);
		}

		return { type: "score", score: raw.score };
	}

	if (typeof raw.noul !== "number") {
		throw new Error(`Jev returned no probability for question '${id}'.`);
	}

	return { type: "noul", probability: raw.noul };
}

/**
 * Minimal client for the Jev decisions wire format, as served by OpenRouter.
 * The AI SDK's evaluation modality only speaks to Vercel AI Gateway, so this
 * talks to the endpoint directly.
 */
export class JevClient implements JevEvaluator {
	private readonly options: JevClientOptions;
	private requests = 0;
	private inputTokens = 0;

	constructor(options: JevClientOptions) {
		this.options = options;
	}

	async ask(
		state: JevState,
		questions: Record<string, JevQuestion>,
	): Promise<Record<string, JevAnswer>> {
		if (Object.keys(questions).length === 0) {
			throw new Error("Jev needs at least one question.");
		}

		for (const [id, question] of Object.entries(questions)) {
			if (question.type !== "choice") {
				continue;
			}

			const optionCount = Object.keys(question.criteria).length;
			if (optionCount === 0) {
				throw new Error(`Question '${id}' needs at least one option.`);
			}
			if (optionCount > MAX_CHOICE_OPTIONS) {
				throw new Error(
					`Jev supports at most ${MAX_CHOICE_OPTIONS} choice options, question '${id}' has ${optionCount}.`,
				);
			}
		}

		const payload = await this.post(
			JSON.stringify({ model: this.options.model, state, questions }),
		);

		this.requests += 1;
		this.inputTokens += payload.usage?.input_tokens ?? 0;

		return Object.fromEntries(
			Object.entries(questions).map(([id, question]) => [
				id,
				parseAnswer(id, question, payload.answers?.[id]),
			]),
		);
	}

	async choose(request: JevChoiceRequest): Promise<JevChoiceAnswer> {
		const answers = await this.ask(request.state, {
			category: {
				type: "choice",
				instructions: request.instructions,
				criteria: request.criteria,
			},
		});
		const answer = answers.category;

		if (answer.type !== "choice") {
			throw new Error("Jev answered the category question with a wrong type.");
		}

		return answer;
	}

	private async post(body: string): Promise<DecisionsResponse> {
		let lastError: Error | undefined;

		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
			const response = await fetch(this.options.baseUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.options.apiKey}`,
					"Content-Type": "application/json",
					"X-Title": "my-stars-atlas",
				},
				body,
			});

			if (response.ok) {
				return (await response.json()) as DecisionsResponse;
			}

			const detail = (await response.text()).slice(0, 300);
			lastError = new Error(
				`Jev request failed with status ${response.status}: ${detail}`,
			);

			if (!isRetryable(response.status) || attempt === MAX_ATTEMPTS) {
				throw lastError;
			}

			await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
		}

		throw lastError ?? new Error("Jev request failed.");
	}

	get usage(): JevUsage {
		return {
			requests: this.requests,
			inputTokens: this.inputTokens,
			estimatedCostUsd:
				(this.inputTokens / 1_000_000) * INPUT_COST_PER_MILLION_TOKENS,
		};
	}
}
