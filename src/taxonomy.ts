import { createHash } from "node:crypto";
import type { ClassificationCache } from "./cache.ts";
import { type JevEvaluator, MAX_CHOICE_OPTIONS } from "./jev.ts";
import type {
	CategoryConfig,
	ClassificationConfig,
	ResolvedCategory,
	StarRecord,
	TopicScreening,
} from "./types.ts";
import { mapWithConcurrency } from "./util.ts";

/** Topic-derived categories are ordered after every seed category. */
const DERIVED_PRIORITY_BASE = 1000;

/** The catch-all bucket always sorts last, wherever it sits in the config. */
const DEFAULT_CATEGORY_PRIORITY = 2000;

/** How many example repositories Jev sees when judging a candidate topic. */
const SCREENING_EXAMPLES = 6;

/** Ordered lowest to highest; the threshold lives in the classification config. */
const TOPIC_QUALITY_RUBRIC = [
	"Useless for grouping: a community tag, a license, a status badge, or filler such as awesome, hacktoberfest, or open-source.",
	"Names only a programming language, runtime, framework, library, or product, and says nothing about what the software is for.",
	"A real but narrow niche that only a handful of repositories would ever belong to.",
	"A clear purpose-based category that someone browsing a catalog of starred repositories would expect to see.",
];

export type TopicCandidate = {
	topic: string;
	count: number;
	examples: string[];
};

function toTitle(topic: string): string {
	return topic
		.split(/[-_]/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/** Crude singular form, so `database` cannot shadow a seed named `databases`. */
function singular(value: string): string {
	return value.replace(/(?:ies)$/, "y").replace(/(?<=[a-z]{3})s$/, "");
}

function seedReservedTokens(config: CategoryConfig): Set<string> {
	const reserved = new Set<string>();

	const add = (value: string): void => {
		reserved.add(value);
		reserved.add(singular(value));
	};

	for (const category of config.categories) {
		add(category.id);
		for (const token of category.title.toLowerCase().split(/[^a-z0-9]+/)) {
			if (token.length > 2) {
				add(token);
			}
		}
	}

	return reserved;
}

function countTopics(repos: StarRecord[]): Map<string, number> {
	const counts = new Map<string, number>();

	for (const repo of repos) {
		for (const topic of new Set(repo.topics)) {
			counts.set(topic, (counts.get(topic) ?? 0) + 1);
		}
	}

	return counts;
}

export function seedCategories(config: CategoryConfig): ResolvedCategory[] {
	// Display order comes from the order categories are listed in the config.
	return config.categories.map((category, index) => ({
		...category,
		priority:
			category.id === config.defaultCategory
				? DEFAULT_CATEGORY_PRIORITY
				: index,
		derived: false,
	}));
}

/**
 * Topics frequent enough to be worth judging, minus the ones a seed category
 * already covers. No hand-written blocklist: Jev decides what survives.
 */
export function mineTopicCandidates(
	repos: StarRecord[],
	config: CategoryConfig,
	classification: ClassificationConfig,
): TopicCandidate[] {
	const reserved = seedReservedTokens(config);
	const counts = countTopics(repos);

	return [...counts.entries()]
		.filter(
			([topic, count]) =>
				count >= classification.minTopicCount &&
				!reserved.has(topic) &&
				!reserved.has(singular(topic)) &&
				/^[a-z0-9][a-z0-9-]{2,30}$/.test(topic),
		)
		.sort(
			(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
		)
		.map(([topic, count]) => ({
			topic,
			count,
			examples: repos
				.filter((repo) => repo.topics.includes(topic))
				.slice(0, SCREENING_EXAMPLES)
				.map(
					(repo) =>
						`${repo.fullName} - ${repo.description ?? "no description"}`,
				),
		}));
}

/**
 * Asks Jev, per candidate, whether the topic is a usable category at all and
 * whether it is merely a technology name. Both judgments come back in one
 * request, and decisions are cached because they do not change with the corpus.
 */
export async function screenTopicCandidates(
	candidates: TopicCandidate[],
	evaluator: JevEvaluator,
	cache: ClassificationCache,
	classification: ClassificationConfig,
	onScreened?: (candidate: TopicCandidate, screening: TopicScreening) => void,
): Promise<ResolvedCategory[]> {
	const screenings = await mapWithConcurrency(
		candidates,
		classification.concurrency,
		async (candidate) => {
			const cached = cache.getTopic(candidate.topic);
			if (cached) {
				onScreened?.(candidate, cached);
				return { candidate, screening: cached };
			}

			const answers = await evaluator.ask(
				{
					label: candidate.topic,
					repositoryCount: candidate.count,
					examples: candidate.examples,
				},
				{
					quality: {
						type: "score",
						instructions:
							"How useful is this GitHub topic as a top-level category in a catalog of starred repositories?",
						criteria: TOPIC_QUALITY_RUBRIC,
					},
					technologyName: {
						type: "noul",
						instructions:
							"Is this label just the name of a programming language, runtime, framework, library, or product?",
						criteria: {
							true: "It names a specific technology, such as react, docker, or postgresql.",
							false:
								"It describes what the software does or who it is for, such as web-scraping or self-hosted.",
						},
					},
				},
			);

			const quality = answers.quality;
			const technologyName = answers.technologyName;
			const screening: TopicScreening = {
				score: quality.type === "score" ? quality.score : 0,
				technologyName:
					technologyName.type === "noul" ? technologyName.probability : 1,
			};

			cache.setTopic(candidate.topic, screening);
			onScreened?.(candidate, screening);
			return { candidate, screening };
		},
	);

	return screenings
		.filter(
			({ screening }) =>
				screening.score >= classification.derivedCategoryMinScore &&
				screening.technologyName < 0.5,
		)
		.slice(0, classification.maxDerivedCategories)
		.map(({ candidate }, index) => ({
			id: candidate.topic,
			title: toTitle(candidate.topic),
			description: `Repositories whose primary purpose is ${toTitle(candidate.topic).toLowerCase()}.`,
			priority: DERIVED_PRIORITY_BASE + index,
			derived: true,
		}));
}

export function buildCandidateTaxonomy(
	seeds: ResolvedCategory[],
	derived: ResolvedCategory[],
): ResolvedCategory[] {
	return [...seeds, ...derived].slice(0, MAX_CHOICE_OPTIONS);
}

/**
 * Drop categories that attracted too few repositories. The default category is
 * always kept so every repository has somewhere to land.
 */
export function pruneTaxonomy(
	categories: ResolvedCategory[],
	counts: Map<string, number>,
	config: CategoryConfig,
	classification: ClassificationConfig,
): ResolvedCategory[] {
	return categories.filter(
		(category) =>
			category.id === config.defaultCategory ||
			(counts.get(category.id) ?? 0) >= classification.minCategorySize,
	);
}

export function buildChoiceCriteria(
	categories: ResolvedCategory[],
): Record<string, string> {
	return Object.fromEntries(
		categories.map((category) => [
			category.id,
			`${category.title}: ${category.description}`,
		]),
	);
}

/** Stable fingerprint of the option set a classification was produced against. */
export function taxonomyHash(categories: ResolvedCategory[]): string {
	return createHash("sha256")
		.update(
			categories
				.map((category) => `${category.id}|${category.description}`)
				.sort()
				.join("\n"),
		)
		.digest("hex")
		.slice(0, 16);
}

export function sortCategories(
	categories: ResolvedCategory[],
): ResolvedCategory[] {
	return [...categories].sort(
		(left, right) =>
			left.priority - right.priority || left.title.localeCompare(right.title),
	);
}
