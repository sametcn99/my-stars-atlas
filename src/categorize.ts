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
	normalizedReadme: string;
	metadataTokens: Set<string>;
	topicsExact: Set<string>;
	topicsNormalized: string[];
	language: string;
};

type RepoClassificationOptions = {
	enableReadmeFallback?: boolean;
	readmeByFullName?: ReadonlyMap<string, string>;
	readmeFallbackConfidenceThreshold?: number;
};

type KeywordMatch = {
	score: number;
	reasons: string[];
};

type CategoryEvaluation = {
	score: number;
	signalCount: number;
	reasons: string[];
	matchedKeywords: string[];
};

type DeterministicClassificationResult = DeterministicClassification & {
	score: number;
	signalCount: number;
};

const README_GENERIC_KEYWORDS = new Set([
	"awesome",
	"awesome list",
	"awesome-list",
	"documentation",
	"docs",
	"docsite",
	"docs site",
	"docs-site",
	"documentation site",
	"documentation-site",
	"guide",
	"how to",
	"how-to",
	"tutorial",
	"tutorials",
	"examples",
	"example",
	"demo",
	"demos",
	"starter",
	"starter template",
	"starter-template",
	"template",
]);

const MIN_NON_DEFAULT_CATEGORY_SCORE = 4.25;

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

function normalizeRuleList(values: string[]): string[] {
	return values.map((value) => normalizeSearchText(value)).filter(Boolean);
}

function isReadmeKeywordEligible(
	category: CategoryDefinition,
	normalizedKeyword: string,
): boolean {
	if (README_GENERIC_KEYWORDS.has(normalizedKeyword)) {
		return false;
	}

	if (
		normalizeRuleList(category.rules.readmeExcludedKeywords).includes(
			normalizedKeyword,
		)
	) {
		return false;
	}

	return true;
}

function buildSearchIndex(repo: StarRecord, readmeText?: string): RepoSearchIndex {
	const normalizedFullName = normalizeSearchText(repo.fullName);
	const normalizedName = normalizeSearchText(repo.name);
	const normalizedOwner = normalizeSearchText(repo.owner);
	const normalizedDescription = normalizeSearchText(repo.description ?? "");
	const normalizedHomepage = normalizeSearchText(repo.homepage ?? "");
	const normalizedReadme = normalizeSearchText(readmeText ?? "");
	const topicsExact = new Set(
		repo.topics.map((topic) => normalizeRuleValue(topic)).filter(Boolean),
	);
	const topicsNormalized = repo.topics
		.map((topic) => normalizeSearchText(topic))
		.filter(Boolean);
	const metadataTokens = new Set(
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
		normalizedReadme,
		metadataTokens,
		topicsExact,
		topicsNormalized,
		language: (repo.language ?? "").toLowerCase(),
	};
}

function matchKeyword(
	index: RepoSearchIndex,
	category: CategoryDefinition,
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
		score += 9 * specificity;
		reasons.push(`topic:${keyword}`);
	} else if (index.topicsNormalized.includes(normalizedKeyword)) {
		score += 8 * specificity;
		reasons.push(`topic:${keyword}`);
	} else if (
		index.topicsNormalized.some((topic) =>
			containsNormalizedPhrase(topic, normalizedKeyword),
		)
	) {
		score += 6.5 * specificity;
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
		score += 4.25 * specificity;
		reasons.push(`description:${keyword}`);
	}

	if (containsNormalizedPhrase(index.normalizedHomepage, normalizedKeyword)) {
		score += 3 * specificity;
		reasons.push(`homepage:${keyword}`);
	}

	if (
		isReadmeKeywordEligible(category, normalizedKeyword) &&
		containsNormalizedPhrase(index.normalizedReadme, normalizedKeyword)
	) {
		score += 2.75 * specificity;
		reasons.push(`readme:${keyword}`);
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
		keywordTokens.every((token) => index.metadataTokens.has(token))
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
	const matchedKeywords = new Set<string>();

	for (const keyword of category.rules.keywords) {
		const match = matchKeyword(index, category, keyword);
		if (!match) {
			continue;
		}

		score += match.score;
		matchedKeywords.add(normalizeSearchText(keyword));
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
		matchedKeywords: [...matchedKeywords],
	};
}

function categoryMinimumScore(category: CategoryDefinition): number {
	return category.rules.minScore || MIN_NON_DEFAULT_CATEGORY_SCORE;
}

function categoryKeywordSet(values: string[]): Set<string> {
	return new Set(normalizeRuleList(values));
}

function countStrongSignals(
	evaluation: CategoryEvaluation,
	category: CategoryDefinition,
): number {
	const strongKeywords = categoryKeywordSet(category.rules.strongKeywords);
	return evaluation.matchedKeywords.filter((keyword) => strongKeywords.has(keyword))
		.length;
}

function hasSingletonStrongKeyword(
	evaluation: CategoryEvaluation,
	category: CategoryDefinition,
): boolean {
	const singletonStrongKeywords = categoryKeywordSet(
		category.rules.singletonStrongKeywords,
	);
	return evaluation.matchedKeywords.some((keyword) =>
		singletonStrongKeywords.has(keyword),
	);
}

function hasNonReadmeSignal(evaluation: CategoryEvaluation): boolean {
	return evaluation.reasons.some((reason) => !reason.startsWith("readme:"));
}

function matchesShapeHints(
	index: RepoSearchIndex,
	category: CategoryDefinition,
): boolean {
	const searchableFields = [
		index.normalizedName,
		index.normalizedDescription,
		index.normalizedReadme,
		...index.topicsNormalized,
	];

	return normalizeRuleList(category.rules.shapeHints).some((normalizedHint) => {
		return searchableFields.some((field) =>
			containsNormalizedPhrase(field, normalizedHint),
		);
	});
}

function pickPreferredFallback(
	winnerCategory: CategoryDefinition,
	categoriesById: Map<string, CategoryDefinition>,
	ranked: Array<[string, CategoryEvaluation]>,
	winningScore: number,
): [string, CategoryEvaluation] | undefined {
	const preferredFallbackCategories = new Set(
		winnerCategory.rules.preferredFallbackCategories,
	);

	for (const [categoryId, evaluation] of ranked.slice(1)) {
		if (!preferredFallbackCategories.has(categoryId)) {
			continue;
		}

		const category = categoriesById.get(categoryId);
		if (!category) {
			continue;
		}

		if (evaluation.score < categoryMinimumScore(category)) {
			continue;
		}

		if (evaluation.score + 3 < winningScore) {
			continue;
		}

		return [categoryId, evaluation];
	}

	for (const [categoryId, evaluation] of ranked.slice(1)) {
		const category = categoriesById.get(categoryId);
		if (!category) {
			continue;
		}

		if (evaluation.score < categoryMinimumScore(category)) {
			continue;
		}

		return [categoryId, evaluation];
	}

	return undefined;
}

function shouldRejectWinner(
	repo: StarRecord,
	index: RepoSearchIndex,
	category: CategoryDefinition,
	evaluation: CategoryEvaluation,
): boolean {
	const hasDescription = Boolean(repo.description?.trim());
	const hasTopics = repo.topics.some((topic) => Boolean(topic.trim()));
	const strongSignalCount = countStrongSignals(evaluation, category);
	const strongKeywords = category.rules.strongKeywords.length;

	if (evaluation.score < categoryMinimumScore(category)) {
		return true;
	}

	if (strongKeywords > 0 && strongSignalCount === 0) {
		return true;
	}

	if (
		category.rules.minStrongKeywordMatches > 0 &&
		strongSignalCount < category.rules.minStrongKeywordMatches &&
		!hasSingletonStrongKeyword(evaluation, category)
	) {
		return true;
	}

	if (
		category.rules.allowReadmeOnly === false &&
		!hasDescription &&
		!hasTopics &&
		!hasNonReadmeSignal(evaluation)
	) {
		return true;
	}

	if (
		category.rules.shapeHintMinStrongKeywordMatches > 0 &&
		matchesShapeHints(index, category) &&
		strongSignalCount < category.rules.shapeHintMinStrongKeywordMatches
	) {
		return true;
	}

	return false;
}

function buildRuleClassification(
	category: string,
	evaluation: CategoryEvaluation,
	secondScore: number,
): DeterministicClassificationResult {
	const confidence = Math.min(
		0.98,
		0.28 +
			Math.min(0.38, evaluation.score / 20) +
			Math.min(0.16, evaluation.signalCount * 0.035) +
			Math.min(0.16, Math.max(0, evaluation.score - secondScore) / 12),
	);

	return {
		category,
		confidence: roundScore(confidence),
		reason: evaluation.reasons.join(", "),
		source: "rules",
		score: evaluation.score,
		signalCount: evaluation.signalCount,
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

function createDefaultClassification(
	category: string,
	reason: string,
): DeterministicClassificationResult {
	return {
		category,
		confidence: 0.2,
		reason,
		source: "default",
		score: 0,
		signalCount: 0,
	};
}

function isStrongReadmeClassification(
	classification: DeterministicClassificationResult,
): boolean {
	return classification.signalCount >= 2 && classification.score >= 6;
}

function deterministicClassify(
	repo: StarRecord,
	categoryConfig: CategoryConfig,
	overrides: OverridesConfig,
	readmeText?: string,
): DeterministicClassificationResult {
	const override = findCategoryOverride(repo, overrides);
	if (override) {
		return {
			category: override.category,
			confidence: 1,
			reason: "Pinned by manual override.",
			source: "override",
			score: Number.POSITIVE_INFINITY,
			signalCount: 1,
		};
	}

	const hasDescription = Boolean(repo.description?.trim());
	const hasTopics = repo.topics.some((topic) => Boolean(topic.trim()));
	const hasReadme = Boolean(readmeText?.trim());
	if (!hasDescription && !hasTopics && !hasReadme) {
		return createDefaultClassification(
			categoryConfig.defaultCategory,
			"Missing description and topics, resolved to default category.",
		);
	}

	const index = buildSearchIndex(repo, readmeText);
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
		return createDefaultClassification(
			categoryConfig.defaultCategory,
			"No deterministic signals matched.",
		);
	}

	const [winner, winnerEvaluation] = ranked[0];
	const winnerCategory = categoriesById.get(winner);
	if (!winnerCategory) {
		throw new Error(`Unknown category '${winner}'.`);
	}
	if (
		winner !== categoryConfig.defaultCategory &&
		winnerEvaluation.score < categoryMinimumScore(winnerCategory)
	) {
		return createDefaultClassification(
			categoryConfig.defaultCategory,
			`Top score ${roundScore(winnerEvaluation.score)} stayed below the minimum category threshold.`,
		);
	}

	if (shouldRejectWinner(repo, index, winnerCategory, winnerEvaluation)) {
		const fallback = pickPreferredFallback(
			winnerCategory,
			categoriesById,
			ranked,
			winnerEvaluation.score,
		);
		if (fallback) {
			const [fallbackCategory, fallbackEvaluation] = fallback;
			const fallbackSecondScore =
				ranked.find(([categoryId]) => categoryId !== fallbackCategory)?.[1].score ?? 0;

			return buildRuleClassification(
				fallbackCategory,
				fallbackEvaluation,
				fallbackSecondScore,
			);
		}

		return createDefaultClassification(
			categoryConfig.defaultCategory,
			`${winnerCategory.title} signals were too generic to keep the winning category.`,
		);
	}

	const secondScore = ranked[1]?.[1].score ?? 0;
	return {
		...buildRuleClassification(winner, winnerEvaluation, secondScore),
		score: winnerEvaluation.score,
		signalCount: winnerEvaluation.signalCount,
	};
}

function shouldPreferReadmeClassification(
	base: DeterministicClassificationResult,
	readme: DeterministicClassificationResult,
): boolean {
	if (base.source === "default" && readme.source !== "default") {
		return isStrongReadmeClassification(readme);
	}

	if (readme.source === "default" && base.source !== "default") {
		return false;
	}

	if (readme.confidence > base.confidence) {
		if (readme.category !== base.category && base.source !== "default") {
			return false;
		}

		return true;
	}

	if (
		readme.category === base.category &&
		(readme.confidence > base.confidence ||
			readme.signalCount >= base.signalCount ||
			readme.score >= base.score)
	) {
		return true;
	}

	return false;
}

export function categorizeRepositories(
	repos: StarRecord[],
	categoryConfig: CategoryConfig,
	overrides: OverridesConfig,
	options: RepoClassificationOptions = {},
): ClassifiedStarRecord[] {
	const categoriesById = categoryMap(categoryConfig);
	const defaultCategory = getDefaultCategoryDefinition(
		categoryConfig,
		categoriesById,
	);
	const classified: ClassifiedStarRecord[] = [];
	const readmeFallbackConfidenceThreshold =
		options.readmeFallbackConfidenceThreshold ?? 0.6;

	for (const repo of repos) {
		if (isExcluded(repo, overrides)) {
			continue;
		}

		let deterministic = deterministicClassify(
			repo,
			categoryConfig,
			overrides,
		);
		let classificationReadmeUsed = false;
		const readmeText = options.readmeByFullName?.get(repo.fullName);
		const shouldEvaluateReadme =
			options.enableReadmeFallback === true &&
			deterministic.source !== "override" &&
			deterministic.confidence < readmeFallbackConfidenceThreshold &&
			Boolean(readmeText?.trim());

		if (shouldEvaluateReadme) {
			classificationReadmeUsed = true;
			const readmeDeterministic = deterministicClassify(
				repo,
				categoryConfig,
				overrides,
				readmeText,
			);

			if (shouldPreferReadmeClassification(deterministic, readmeDeterministic)) {
				deterministic = readmeDeterministic;
			}
		}

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
			classificationReadmeUsed,
		});
	}

	return classified;
}
