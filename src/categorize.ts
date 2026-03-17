import type {
	CategoryConfig,
	CategoryDefinition,
	CategoryOverrideRule,
	ClassifiedStarRecord,
	DeterministicClassification,
	OverridesConfig,
	RepoMatchRule,
	StarRecord,
} from "./types.ts";

type RepoSearchIndex = {
	normalizedFullName: string;
	normalizedName: string;
	normalizedOwner: string;
	normalizedDescription: string;
	normalizedHomepage: string;
	tokens: Set<string>;
	topicsExact: Set<string>;
	topicsNormalized: string[];
	language: string;
};

type KeywordMatch = {
	score: number;
	reasons: string[];
};

type CategoryEvaluation = {
	score: number;
	signalCount: number;
	reasons: string[];
};

function categoryMap(config: CategoryConfig): Map<string, CategoryDefinition> {
	return new Map(config.categories.map((category) => [category.id, category]));
}

function getDefaultCategoryDefinition(
	categoryConfig: CategoryConfig,
	categoriesById: Map<string, CategoryDefinition>,
): CategoryDefinition {
	const defaultCategory = categoriesById.get(categoryConfig.defaultCategory);
	if (!defaultCategory) {
		throw new Error(
			`Unknown default category '${categoryConfig.defaultCategory}'.`,
		);
	}

	return defaultCategory;
}

function resolveConfiguredClassification(
	classification: DeterministicClassification,
	defaultCategory: CategoryDefinition,
	categoriesById: Map<string, CategoryDefinition>,
): DeterministicClassification {
	if (categoriesById.has(classification.category)) {
		return classification;
	}

	return {
		category: defaultCategory.id,
		confidence: 0.2,
		reason: `Unknown category '${classification.category}' resolved to default '${defaultCategory.id}'.`,
		source: "default",
	};
}

function normalizeRuleValue(value: string): string {
	return value.trim().toLowerCase();
}

function normalizeSearchText(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function splitSearchTokens(value: string): string[] {
	const normalized = normalizeSearchText(value);
	return normalized ? normalized.split(" ") : [];
}

function containsNormalizedPhrase(haystack: string, needle: string): boolean {
	if (!haystack || !needle) {
		return false;
	}

	if (haystack === needle) {
		return true;
	}

	return ` ${haystack} `.includes(` ${needle} `);
}

function keywordSpecificity(
	tokens: string[],
	normalizedKeyword: string,
): number {
	if (tokens.length >= 3) {
		return 1.5;
	}

	if (tokens.length === 2) {
		return normalizedKeyword.length >= 10 ? 1.35 : 1.2;
	}

	if (normalizedKeyword.length <= 2) {
		return 0.55;
	}

	if (normalizedKeyword.length <= 4) {
		return 0.8;
	}

	if (normalizedKeyword.length <= 7) {
		return 1;
	}

	return 1.15;
}

function roundScore(value: number): number {
	return Math.round(value * 100) / 100;
}

function normalizeRepoUrl(url: string): string {
	return normalizeRuleValue(url).replace(/\/+$/, "");
}

function buildSearchIndex(repo: StarRecord): RepoSearchIndex {
	const normalizedFullName = normalizeSearchText(repo.fullName);
	const normalizedName = normalizeSearchText(repo.name);
	const normalizedOwner = normalizeSearchText(repo.owner);
	const normalizedDescription = normalizeSearchText(repo.description ?? "");
	const normalizedHomepage = normalizeSearchText(repo.homepage ?? "");
	const topicsExact = new Set(
		repo.topics.map((topic) => normalizeRuleValue(topic)).filter(Boolean),
	);
	const topicsNormalized = repo.topics
		.map((topic) => normalizeSearchText(topic))
		.filter(Boolean);
	const tokens = new Set(
		splitSearchTokens(
			[
				repo.fullName,
				repo.name,
				repo.owner,
				repo.description ?? "",
				repo.homepage ?? "",
				repo.topics.join(" "),
			].join(" "),
		),
	);

	return {
		normalizedFullName,
		normalizedName,
		normalizedOwner,
		normalizedDescription,
		normalizedHomepage,
		tokens,
		topicsExact,
		topicsNormalized,
		language: (repo.language ?? "").toLowerCase(),
	};
}

function matchKeyword(
	index: RepoSearchIndex,
	keyword: string,
): KeywordMatch | null {
	const rawKeyword = normalizeRuleValue(keyword);
	const normalizedKeyword = normalizeSearchText(keyword);
	if (!rawKeyword || !normalizedKeyword) {
		return null;
	}

	const keywordTokens = normalizedKeyword.split(" ");
	const specificity = keywordSpecificity(keywordTokens, normalizedKeyword);
	let score = 0;
	const reasons: string[] = [];

	if (index.topicsExact.has(rawKeyword)) {
		score += 8 * specificity;
		reasons.push(`topic:${keyword}`);
	} else if (index.topicsNormalized.includes(normalizedKeyword)) {
		score += 7 * specificity;
		reasons.push(`topic:${keyword}`);
	} else if (
		index.topicsNormalized.some((topic) =>
			containsNormalizedPhrase(topic, normalizedKeyword),
		)
	) {
		score += 5.5 * specificity;
		reasons.push(`topic:${keyword}`);
	}

	if (index.normalizedName === normalizedKeyword) {
		score += 6 * specificity;
		reasons.push(`name:${keyword}`);
	} else if (
		containsNormalizedPhrase(index.normalizedName, normalizedKeyword)
	) {
		score += 4.5 * specificity;
		reasons.push(`name:${keyword}`);
	}

	if (
		containsNormalizedPhrase(index.normalizedDescription, normalizedKeyword)
	) {
		score += 3.5 * specificity;
		reasons.push(`description:${keyword}`);
	}

	if (containsNormalizedPhrase(index.normalizedHomepage, normalizedKeyword)) {
		score += 3 * specificity;
		reasons.push(`homepage:${keyword}`);
	}

	if (index.normalizedOwner === normalizedKeyword) {
		score += 2.5 * specificity;
		reasons.push(`owner:${keyword}`);
	}

	if (containsNormalizedPhrase(index.normalizedFullName, normalizedKeyword)) {
		score += 2.5 * specificity;
		reasons.push(`repo:${keyword}`);
	}

	if (
		reasons.length === 0 &&
		keywordTokens.length > 1 &&
		keywordTokens.every((token) => index.tokens.has(token))
	) {
		score += 1.75 * specificity;
		reasons.push(`tokens:${keyword}`);
	}

	if (score === 0) {
		return null;
	}

	return {
		score: roundScore(score),
		reasons,
	};
}

function evaluateCategory(
	index: RepoSearchIndex,
	category: CategoryDefinition,
): CategoryEvaluation | null {
	let score = 0;
	const reasons = new Set<string>();

	for (const keyword of category.rules.keywords) {
		const match = matchKeyword(index, keyword);
		if (!match) {
			continue;
		}

		score += match.score;
		for (const reason of match.reasons) {
			reasons.add(reason);
		}
	}

	for (const language of category.rules.languages) {
		if (index.language === language.toLowerCase()) {
			score += 3;
			reasons.add(`language:${language}`);
		}
	}

	if (score === 0) {
		return null;
	}

	return {
		score: roundScore(score),
		signalCount: reasons.size,
		reasons: [...reasons].slice(0, 8),
	};
}

function matchesRepo(repo: StarRecord, rule: RepoMatchRule): boolean {
	const checks = [
		rule.fullName === undefined
			? true
			: normalizeRuleValue(repo.fullName) === normalizeRuleValue(rule.fullName),
		rule.name === undefined
			? true
			: normalizeRuleValue(repo.name) === normalizeRuleValue(rule.name),
		rule.url === undefined
			? true
			: normalizeRepoUrl(repo.url) === normalizeRepoUrl(rule.url),
	];

	return (
		checks.every(Boolean) &&
		(rule.fullName !== undefined ||
			rule.name !== undefined ||
			rule.url !== undefined)
	);
}

function isExcluded(repo: StarRecord, overrides: OverridesConfig): boolean {
	return overrides.exclude.some((rule) => matchesRepo(repo, rule));
}

function findCategoryOverride(
	repo: StarRecord,
	overrides: OverridesConfig,
): CategoryOverrideRule | undefined {
	return overrides.categories.find((entry) => matchesRepo(repo, entry.match));
}

function deterministicClassify(
	repo: StarRecord,
	categoryConfig: CategoryConfig,
	overrides: OverridesConfig,
): DeterministicClassification {
	const override = findCategoryOverride(repo, overrides);
	if (override) {
		return {
			category: override.category,
			confidence: 1,
			reason: "Pinned by manual override.",
			source: "override",
		};
	}

	const index = buildSearchIndex(repo);
	const evaluations = new Map<string, CategoryEvaluation>();
	const categoriesById = categoryMap(categoryConfig);

	for (const category of categoryConfig.categories) {
		const evaluation = evaluateCategory(index, category);
		if (evaluation) {
			evaluations.set(category.id, evaluation);
		}
	}

	const ranked = [...evaluations.entries()].sort((left, right) => {
		if (right[1].score !== left[1].score) {
			return right[1].score - left[1].score;
		}

		if (right[1].signalCount !== left[1].signalCount) {
			return right[1].signalCount - left[1].signalCount;
		}

		const leftPriority = categoriesById.get(left[0])?.priority ?? 999;
		const rightPriority = categoriesById.get(right[0])?.priority ?? 999;
		return leftPriority - rightPriority;
	});

	if (ranked.length === 0) {
		return {
			category: categoryConfig.defaultCategory,
			confidence: 0.2,
			reason: "No deterministic signals matched.",
			source: "default",
		};
	}

	const [winner, winnerEvaluation] = ranked[0];
	const secondScore = ranked[1]?.[1].score ?? 0;
	const confidence = Math.min(
		0.98,
		0.28 +
			Math.min(0.38, winnerEvaluation.score / 20) +
			Math.min(0.16, winnerEvaluation.signalCount * 0.035) +
			Math.min(0.16, Math.max(0, winnerEvaluation.score - secondScore) / 12),
	);

	return {
		category: winner,
		confidence: roundScore(confidence),
		reason: winnerEvaluation.reasons.join(", "),
		source: "rules",
	};
}

export function categorizeRepositories(
	repos: StarRecord[],
	categoryConfig: CategoryConfig,
	overrides: OverridesConfig,
): ClassifiedStarRecord[] {
	const categoriesById = categoryMap(categoryConfig);
	const defaultCategory = getDefaultCategoryDefinition(
		categoryConfig,
		categoriesById,
	);
	const classified: ClassifiedStarRecord[] = [];

	for (const repo of repos) {
		if (isExcluded(repo, overrides)) {
			continue;
		}

		const deterministic = deterministicClassify(
			repo,
			categoryConfig,
			overrides,
		);
		const resolved = resolveConfiguredClassification(
			deterministic,
			defaultCategory,
			categoriesById,
		);
		const category = resolved.category;
		const confidence = resolved.confidence;
		const reason = resolved.reason;
		const source: ClassifiedStarRecord["classificationSource"] =
			resolved.source;

		const categoryDefinition = categoriesById.get(category);
		if (!categoryDefinition) {
			throw new Error(`Unknown category '${category}'.`);
		}

		classified.push({
			...repo,
			category: categoryDefinition.id,
			categoryTitle: categoryDefinition.title,
			classificationConfidence: confidence,
			classificationReason: reason,
			classificationSource: source,
		});
	}

	return classified;
}
