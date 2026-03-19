import type {
	CategoryConfig,
	CategoryDefinition,
	CategoryOverrideRule,
	ClassifiedStarRecord,
	CompiledCategory,
	CompiledCategoryConfig,
	CompiledKeyword,
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
	paddedFullName: string;
	paddedName: string;
	paddedDescription: string;
	paddedHomepage: string;
	paddedReadme: string;
	metadataTokens: Set<string>;
	topicsExact: Set<string>;
	topicsNormalized: string[];
	topicsPadded: string[];
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

function padForSearch(value: string): string {
	return value ? ` ${value} ` : "";
}

function containsNormalizedPhrase(
	paddedHaystack: string,
	paddedNeedle: string,
): boolean {
	if (!paddedHaystack || !paddedNeedle) {
		return false;
	}
	return paddedHaystack.includes(paddedNeedle);
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

function compileKeyword(
	raw: string,
	cache: Map<string, CompiledKeyword>,
): CompiledKeyword | null {
	const existing = cache.get(raw);
	if (existing) {
		return existing;
	}

	const rawNormalized = normalizeRuleValue(raw);
	const normalized = normalizeSearchText(raw);
	if (!rawNormalized || !normalized) {
		return null;
	}

	const tokens = normalized.split(" ");
	const specificity = keywordSpecificity(tokens, normalized);
	const compiled: CompiledKeyword = {
		raw,
		rawNormalized,
		normalized,
		tokens,
		specificity,
	};
	cache.set(raw, compiled);
	return compiled;
}

function normalizeStringSet(values: string[]): Set<string> {
	const set = new Set<string>();
	for (const value of values) {
		const normalized = normalizeSearchText(value);
		if (normalized) {
			set.add(normalized);
		}
	}
	return set;
}

function normalizeStringList(values: string[]): string[] {
	const result: string[] = [];
	for (const value of values) {
		const normalized = normalizeSearchText(value);
		if (normalized) {
			result.push(normalized);
		}
	}
	return result;
}

function compileCategory(
	definition: CategoryDefinition,
	keywordCache: Map<string, CompiledKeyword>,
): CompiledCategory {
	const keywords: CompiledKeyword[] = [];
	for (const raw of definition.rules.keywords) {
		const compiled = compileKeyword(raw, keywordCache);
		if (compiled) {
			keywords.push(compiled);
		}
	}

	return {
		definition,
		keywords,
		strongKeywordSet: normalizeStringSet(definition.rules.strongKeywords),
		singletonStrongKeywordSet: normalizeStringSet(
			definition.rules.singletonStrongKeywords,
		),
		readmeExcludedKeywordSet: normalizeStringSet(
			definition.rules.readmeExcludedKeywords,
		),
		normalizedShapeHints: normalizeStringList(definition.rules.shapeHints),
		preferredFallbackSet: new Set(definition.rules.preferredFallbackCategories),
		languagesLower: definition.rules.languages.map((l) => l.toLowerCase()),
		minScore: definition.rules.minScore || MIN_NON_DEFAULT_CATEGORY_SCORE,
	};
}

export function compileCategories(
	config: CategoryConfig,
): CompiledCategoryConfig {
	const keywordCache = new Map<string, CompiledKeyword>();
	const categories = config.categories.map((def) =>
		compileCategory(def, keywordCache),
	);
	const categoriesById = new Map<string, CompiledCategory>();
	for (const compiled of categories) {
		categoriesById.set(compiled.definition.id, compiled);
	}

	const defaultCat = categoriesById.get(config.defaultCategory);
	if (!defaultCat) {
		throw new Error(`Unknown default category '${config.defaultCategory}'.`);
	}

	return {
		defaultCategory: config.defaultCategory,
		recentCount: config.recentCount,
		categories,
		categoriesById,
		defaultCategoryDefinition: defaultCat.definition,
	};
}

function resolveConfiguredClassification(
	classification: DeterministicClassification,
	compiled: CompiledCategoryConfig,
): DeterministicClassification {
	if (compiled.categoriesById.has(classification.category)) {
		return classification;
	}

	return {
		category: compiled.defaultCategory,
		confidence: 0.2,
		reason: `Unknown category '${classification.category}' resolved to default '${compiled.defaultCategory}'.`,
		source: "default",
	};
}

function buildSearchIndex(
	repo: StarRecord,
	readmeText?: string,
): RepoSearchIndex {
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
		paddedFullName: padForSearch(normalizedFullName),
		paddedName: padForSearch(normalizedName),
		paddedDescription: padForSearch(normalizedDescription),
		paddedHomepage: padForSearch(normalizedHomepage),
		paddedReadme: padForSearch(normalizedReadme),
		metadataTokens,
		topicsExact,
		topicsNormalized,
		topicsPadded: topicsNormalized.map(padForSearch),
		language: (repo.language ?? "").toLowerCase(),
	};
}

function matchKeyword(
	index: RepoSearchIndex,
	compiled: CompiledCategory,
	keyword: CompiledKeyword,
): KeywordMatch | null {
	const { rawNormalized, normalized, tokens, specificity, raw } = keyword;
	const paddedNeedle = ` ${normalized} `;
	let score = 0;
	const reasons: string[] = [];

	if (index.topicsExact.has(rawNormalized)) {
		score += 9 * specificity;
		reasons.push(`topic:${raw}`);
	} else if (index.topicsNormalized.includes(normalized)) {
		score += 8 * specificity;
		reasons.push(`topic:${raw}`);
	} else if (
		index.topicsPadded.some((padded) =>
			containsNormalizedPhrase(padded, paddedNeedle),
		)
	) {
		score += 6.5 * specificity;
		reasons.push(`topic:${raw}`);
	}

	if (index.normalizedName === normalized) {
		score += 6 * specificity;
		reasons.push(`name:${raw}`);
	} else if (containsNormalizedPhrase(index.paddedName, paddedNeedle)) {
		score += 4.5 * specificity;
		reasons.push(`name:${raw}`);
	}

	if (containsNormalizedPhrase(index.paddedDescription, paddedNeedle)) {
		score += 4.25 * specificity;
		reasons.push(`description:${raw}`);
	}

	if (containsNormalizedPhrase(index.paddedHomepage, paddedNeedle)) {
		score += 3 * specificity;
		reasons.push(`homepage:${raw}`);
	}

	if (
		!README_GENERIC_KEYWORDS.has(normalized) &&
		!compiled.readmeExcludedKeywordSet.has(normalized) &&
		containsNormalizedPhrase(index.paddedReadme, paddedNeedle)
	) {
		score += 2.75 * specificity;
		reasons.push(`readme:${raw}`);
	}

	if (index.normalizedOwner === normalized) {
		score += 2.5 * specificity;
		reasons.push(`owner:${raw}`);
	}

	if (containsNormalizedPhrase(index.paddedFullName, paddedNeedle)) {
		score += 2.5 * specificity;
		reasons.push(`repo:${raw}`);
	}

	if (
		reasons.length === 0 &&
		tokens.length > 1 &&
		tokens.every((token) => index.metadataTokens.has(token))
	) {
		score += 1.75 * specificity;
		reasons.push(`tokens:${raw}`);
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
	compiled: CompiledCategory,
): CategoryEvaluation | null {
	let score = 0;
	const reasons = new Set<string>();
	const matchedKeywords = new Set<string>();

	for (const keyword of compiled.keywords) {
		const match = matchKeyword(index, compiled, keyword);
		if (!match) {
			continue;
		}

		score += match.score;
		matchedKeywords.add(keyword.normalized);
		for (const reason of match.reasons) {
			reasons.add(reason);
		}
	}

	for (const language of compiled.languagesLower) {
		if (index.language === language) {
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

function countStrongSignals(
	evaluation: CategoryEvaluation,
	compiled: CompiledCategory,
): number {
	return evaluation.matchedKeywords.filter((keyword) =>
		compiled.strongKeywordSet.has(keyword),
	).length;
}

function hasSingletonStrongKeyword(
	evaluation: CategoryEvaluation,
	compiled: CompiledCategory,
): boolean {
	return evaluation.matchedKeywords.some((keyword) =>
		compiled.singletonStrongKeywordSet.has(keyword),
	);
}

function hasNonReadmeSignal(evaluation: CategoryEvaluation): boolean {
	return evaluation.reasons.some((reason) => !reason.startsWith("readme:"));
}

function matchesShapeHints(
	index: RepoSearchIndex,
	compiled: CompiledCategory,
): boolean {
	const searchableFields = [
		index.paddedName,
		index.paddedDescription,
		index.paddedReadme,
		...index.topicsPadded,
	];

	return compiled.normalizedShapeHints.some((normalizedHint) => {
		const paddedHint = ` ${normalizedHint} `;
		return searchableFields.some((field) =>
			containsNormalizedPhrase(field, paddedHint),
		);
	});
}

function pickPreferredFallback(
	winnerCompiled: CompiledCategory,
	compiledMap: Map<string, CompiledCategory>,
	ranked: Array<[string, CategoryEvaluation]>,
	winningScore: number,
): [string, CategoryEvaluation] | undefined {
	let bestAny: [string, CategoryEvaluation] | undefined;

	for (const [categoryId, evaluation] of ranked.slice(1)) {
		const compiled = compiledMap.get(categoryId);
		if (!compiled) continue;
		if (evaluation.score < compiled.minScore) continue;

		if (
			winnerCompiled.preferredFallbackSet.has(categoryId) &&
			evaluation.score + 3 >= winningScore
		) {
			return [categoryId, evaluation];
		}

		if (!bestAny) {
			bestAny = [categoryId, evaluation];
		}
	}

	return bestAny;
}

function shouldRejectWinner(
	repo: StarRecord,
	index: RepoSearchIndex,
	compiled: CompiledCategory,
	evaluation: CategoryEvaluation,
): boolean {
	const hasDescription = Boolean(repo.description?.trim());
	const hasTopics = repo.topics.some((topic) => Boolean(topic.trim()));
	const strongSignalCount = countStrongSignals(evaluation, compiled);
	const strongKeywords = compiled.definition.rules.strongKeywords.length;

	if (evaluation.score < compiled.minScore) {
		return true;
	}

	if (strongKeywords > 0 && strongSignalCount === 0) {
		return true;
	}

	if (
		compiled.definition.rules.minStrongKeywordMatches > 0 &&
		strongSignalCount < compiled.definition.rules.minStrongKeywordMatches &&
		!hasSingletonStrongKeyword(evaluation, compiled)
	) {
		return true;
	}

	if (
		compiled.definition.rules.allowReadmeOnly === false &&
		!hasDescription &&
		!hasTopics &&
		!hasNonReadmeSignal(evaluation)
	) {
		return true;
	}

	if (
		compiled.definition.rules.shapeHintMinStrongKeywordMatches > 0 &&
		matchesShapeHints(index, compiled) &&
		strongSignalCount <
			compiled.definition.rules.shapeHintMinStrongKeywordMatches
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
	compiled: CompiledCategoryConfig,
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
			compiled.defaultCategory,
			"Missing description and topics, resolved to default category.",
		);
	}

	const index = buildSearchIndex(repo, readmeText);
	const evaluations = new Map<string, CategoryEvaluation>();

	for (const category of compiled.categories) {
		const evaluation = evaluateCategory(index, category);
		if (evaluation) {
			evaluations.set(category.definition.id, evaluation);
		}
	}

	const ranked = [...evaluations.entries()].sort((left, right) => {
		if (right[1].score !== left[1].score) {
			return right[1].score - left[1].score;
		}

		if (right[1].signalCount !== left[1].signalCount) {
			return right[1].signalCount - left[1].signalCount;
		}

		const leftPriority =
			compiled.categoriesById.get(left[0])?.definition.priority ?? 999;
		const rightPriority =
			compiled.categoriesById.get(right[0])?.definition.priority ?? 999;
		return leftPriority - rightPriority;
	});

	if (ranked.length === 0) {
		return createDefaultClassification(
			compiled.defaultCategory,
			"No deterministic signals matched.",
		);
	}

	const [winner, winnerEvaluation] = ranked[0];
	const winnerCompiled = compiled.categoriesById.get(winner);
	if (!winnerCompiled) {
		throw new Error(`Unknown category '${winner}'.`);
	}
	if (
		winner !== compiled.defaultCategory &&
		winnerEvaluation.score < winnerCompiled.minScore
	) {
		return createDefaultClassification(
			compiled.defaultCategory,
			`Top score ${roundScore(winnerEvaluation.score)} stayed below the minimum category threshold.`,
		);
	}

	if (shouldRejectWinner(repo, index, winnerCompiled, winnerEvaluation)) {
		const fallback = pickPreferredFallback(
			winnerCompiled,
			compiled.categoriesById,
			ranked,
			winnerEvaluation.score,
		);
		if (fallback) {
			const [fallbackCategory, fallbackEvaluation] = fallback;
			const fallbackSecondScore =
				ranked.find(([categoryId]) => categoryId !== fallbackCategory)?.[1]
					.score ?? 0;

			return buildRuleClassification(
				fallbackCategory,
				fallbackEvaluation,
				fallbackSecondScore,
			);
		}

		return createDefaultClassification(
			compiled.defaultCategory,
			`${winnerCompiled.definition.title} signals were too generic to keep the winning category.`,
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
	const compiled = compileCategories(categoryConfig);
	const classified: ClassifiedStarRecord[] = [];
	const readmeFallbackConfidenceThreshold =
		options.readmeFallbackConfidenceThreshold ?? 0.6;

	for (const repo of repos) {
		if (isExcluded(repo, overrides)) {
			continue;
		}

		let deterministic = deterministicClassify(repo, compiled, overrides);
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
				compiled,
				overrides,
				readmeText,
			);

			if (
				shouldPreferReadmeClassification(deterministic, readmeDeterministic)
			) {
				deterministic = readmeDeterministic;
			}
		}

		const resolved = resolveConfiguredClassification(deterministic, compiled);
		const category = resolved.category;
		const confidence = resolved.confidence;
		const reason = resolved.reason;
		const source: ClassifiedStarRecord["classificationSource"] =
			resolved.source;

		const compiledCategory = compiled.categoriesById.get(category);
		if (!compiledCategory) {
			throw new Error(`Unknown category '${category}'.`);
		}

		classified.push({
			...repo,
			category: compiledCategory.definition.id,
			categoryTitle: compiledCategory.definition.title,
			classificationConfidence: confidence,
			classificationReason: reason,
			classificationSource: source,
			classificationReadmeUsed,
		});
	}

	return classified;
}
