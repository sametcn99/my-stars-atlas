import { ClassificationCache, cacheKey } from "./cache.ts";
import { fetchRepositoryReadme } from "./github.ts";
import {
	type JevAlternative,
	JevClient,
	type JevEvaluator,
	type JevState,
} from "./jev.ts";
import {
	buildCandidateTaxonomy,
	buildChoiceCriteria,
	mineTopicCandidates,
	pruneTaxonomy,
	screenTopicCandidates,
	seedCategories,
	sortCategories,
	taxonomyHash,
} from "./taxonomy.ts";
import type {
	CategoryConfig,
	ClassificationStats,
	ClassifiedStarRecord,
	JevClassification,
	ResolvedCategory,
	RuntimeConfig,
	StarRecord,
} from "./types.ts";
import { mapWithConcurrency } from "./util.ts";

/** Progress heartbeat for non-verbose runs. */
const PROGRESS_EVERY = 50;

const INSTRUCTIONS =
	"Pick the single category that best describes what this GitHub repository is for. Judge the repository's own purpose, not the technologies it happens to use.";

export type ClassificationResult = {
	records: ClassifiedStarRecord[];
	categories: ResolvedCategory[];
	stats: ClassificationStats;
};

function buildState(repo: StarRecord, readme?: string): JevState {
	return {
		name: repo.name,
		owner: repo.owner,
		description: repo.description,
		topics: repo.topics,
		language: repo.language,
		homepage: repo.homepage,
		stars: repo.stargazersCount,
		archived: repo.archived,
		fork: repo.fork,
		...(readme ? { readme } : {}),
	};
}

function countByCategory(
	classifications: Map<string, JevClassification>,
): Map<string, number> {
	const counts = new Map<string, number>();

	for (const classification of classifications.values()) {
		counts.set(
			classification.category,
			(counts.get(classification.category) ?? 0) + 1,
		);
	}

	return counts;
}

function formatConfidence(value: number): string {
	return value.toFixed(2);
}

function formatAlternatives(alternatives: JevAlternative[]): string {
	if (alternatives.length === 0) {
		return "";
	}

	return ` | next: ${alternatives
		.map(
			(alternative) =>
				`${alternative.id} ${formatConfidence(alternative.probability)}`,
		)
		.join(", ")}`;
}

/** Decision logs go to stderr, so stdout stays reserved for the run summary. */
function log(message: string): void {
	console.error(message);
}

export async function classifyRepositories(
	repos: StarRecord[],
	categoryConfig: CategoryConfig,
	runtime: RuntimeConfig,
	/** Overridable so tests can stand in a stub decision model. */
	evaluator?: JevEvaluator,
): Promise<ClassificationResult> {
	const { classification } = runtime;
	const jev =
		evaluator ??
		new JevClient({
			baseUrl: classification.baseUrl,
			apiKey: runtime.apiKey,
			model: classification.model,
		});
	const cache = await ClassificationCache.load(runtime.useCache);
	const classifications = new Map<string, JevClassification>();

	// Taxonomy: configured seeds plus topics Jev judges worth keeping.
	const seeds = seedCategories(categoryConfig);
	const topicCandidates = mineTopicCandidates(
		repos,
		categoryConfig,
		classification,
	);
	if (topicCandidates.length > 0) {
		log(
			`Screening ${topicCandidates.length} candidate topics for category quality.`,
		);
	}

	const derived = await screenTopicCandidates(
		topicCandidates,
		jev,
		cache,
		classification,
		(candidate, screening) => {
			if (runtime.verbose) {
				log(
					`  topic ${candidate.topic} (${candidate.count} repos): quality ${screening.score.toFixed(2)}, technology-name ${screening.technologyName.toFixed(2)}`,
				);
			}
		},
	);
	log(
		`Topic screening: ${derived.length}/${topicCandidates.length} candidates accepted as categories${
			derived.length > 0
				? ` (${derived.map((category) => category.id).join(", ")})`
				: ""
		}`,
	);

	const candidates = buildCandidateTaxonomy(seeds, derived);
	const candidateHash = taxonomyHash(candidates);
	const candidateCriteria = buildChoiceCriteria(candidates);

	let fromCache = 0;
	let readmeEvaluated = 0;
	let reprompted = 0;
	let completed = 0;

	const { verbose } = runtime;

	log(
		`Classifying ${repos.length} repositories with ${classification.model} across ${candidates.length} candidate categories (${candidates.filter((category) => category.derived).length} derived from topics).`,
	);

	// Pass 1: every repository against the full candidate set.
	const firstPass = await mapWithConcurrency(
		repos,
		classification.concurrency,
		async (repo) => {
			const key = cacheKey(repo, candidateHash, classification.model);
			const cached = cache.get(key);

			if (cached) {
				fromCache += 1;
				completed += 1;
				if (verbose) {
					log(
						`  ${repo.fullName} -> ${cached.category} ${formatConfidence(cached.confidence)} (cache)`,
					);
				}
				return {
					repo,
					key,
					classification: {
						category: cached.category,
						confidence: cached.confidence,
						source: "cache",
						readmeUsed: cached.readmeUsed,
					} satisfies JevClassification,
				};
			}

			const answer = await jev.choose({
				state: buildState(repo),
				instructions: INSTRUCTIONS,
				criteria: candidateCriteria,
			});

			completed += 1;
			if (verbose) {
				log(
					`  ${repo.fullName} -> ${answer.choice} ${formatConfidence(answer.confidence)}${formatAlternatives(answer.alternatives)}`,
				);
			} else if (completed % PROGRESS_EVERY === 0) {
				log(`  ${completed}/${repos.length} classified`);
			}

			return {
				repo,
				key,
				classification: {
					category: answer.choice,
					confidence: answer.confidence,
					source: "jev",
					readmeUsed: false,
				} satisfies JevClassification,
			};
		},
	);

	const keyByFullName = new Map<string, string>();
	for (const entry of firstPass) {
		keyByFullName.set(entry.repo.fullName, entry.key);
		classifications.set(entry.repo.fullName, entry.classification);
	}

	// README pass: repositories Jev was unsure about get more evidence.
	if (classification.enableReadmeFallback) {
		const unsureBefore = firstPass.filter(
			(entry) =>
				entry.classification.source === "jev" &&
				entry.classification.confidence <
					classification.readmeFallbackConfidenceThreshold,
		);

		if (unsureBefore.length > 0) {
			log(
				`README pass: ${unsureBefore.length} repositories below ${classification.readmeFallbackConfidenceThreshold} confidence.`,
			);
		}

		await mapWithConcurrency(
			unsureBefore,
			classification.concurrency,
			async (entry) => {
				const readme = await fetchRepositoryReadme(
					runtime,
					entry.repo.fullName,
				);
				if (!readme) {
					return;
				}

				readmeEvaluated += 1;
				const answer = await jev.choose({
					state: buildState(
						entry.repo,
						readme.slice(0, classification.readmeCharacterLimit),
					),
					instructions: INSTRUCTIONS,
					criteria: candidateCriteria,
				});

				if (answer.confidence <= entry.classification.confidence) {
					if (verbose) {
						log(
							`  ${entry.repo.fullName} readme kept ${entry.classification.category} ${formatConfidence(entry.classification.confidence)} (readme said ${answer.choice} ${formatConfidence(answer.confidence)})`,
						);
					}
					return;
				}

				log(
					`  ${entry.repo.fullName} readme -> ${answer.choice} ${formatConfidence(answer.confidence)} (was ${entry.classification.category} ${formatConfidence(entry.classification.confidence)})`,
				);

				classifications.set(entry.repo.fullName, {
					category: answer.choice,
					confidence: answer.confidence,
					source: "jev-readme",
					readmeUsed: true,
				});
			},
		);
	}

	// Prune thin categories, then re-ask only for the repositories they held.
	const survivors = pruneTaxonomy(
		candidates,
		countByCategory(classifications),
		categoryConfig,
		classification,
	);
	const survivorIds = new Set(survivors.map((category) => category.id));

	if (survivors.length < candidates.length) {
		const counts = countByCategory(classifications);
		const pruned = candidates.filter(
			(category) => !survivorIds.has(category.id),
		);
		const nonEmpty = pruned.filter(
			(category) => (counts.get(category.id) ?? 0) > 0,
		);
		log(
			`Pruned ${pruned.length} categories under ${classification.minCategorySize} repositories (${pruned.length - nonEmpty.length} unused)${
				nonEmpty.length > 0
					? `: ${nonEmpty
							.map(
								(category) => `${category.id}(${counts.get(category.id) ?? 0})`,
							)
							.join(", ")}`
					: ""
			}`,
		);

		const survivorCriteria = buildChoiceCriteria(survivors);
		const orphans = repos.filter((repo) => {
			const current = classifications.get(repo.fullName);
			return current !== undefined && !survivorIds.has(current.category);
		});

		if (orphans.length > 0) {
			log(`  reprompting ${orphans.length} repositories with the survivors.`);
		}

		await mapWithConcurrency(
			orphans,
			classification.concurrency,
			async (repo) => {
				const previous = classifications.get(repo.fullName)?.category;
				let answer = await jev.choose({
					state: buildState(repo),
					instructions: INSTRUCTIONS,
					criteria: survivorCriteria,
				});
				let readmeUsed = false;

				// A pruned repository with a weak second answer is exactly the
				// case where the README is worth the extra request.
				if (
					classification.enableReadmeFallback &&
					answer.confidence < classification.readmeFallbackConfidenceThreshold
				) {
					const readme = await fetchRepositoryReadme(runtime, repo.fullName);
					if (readme) {
						readmeEvaluated += 1;
						const withReadme = await jev.choose({
							state: buildState(
								repo,
								readme.slice(0, classification.readmeCharacterLimit),
							),
							instructions: INSTRUCTIONS,
							criteria: survivorCriteria,
						});

						if (withReadme.confidence > answer.confidence) {
							answer = withReadme;
							readmeUsed = true;
						}
					}
				}

				reprompted += 1;
				log(
					`  ${repo.fullName} reprompt -> ${answer.choice} ${formatConfidence(answer.confidence)} (was ${previous}${readmeUsed ? ", readme" : ""})`,
				);
				classifications.set(repo.fullName, {
					category: answer.choice,
					confidence: answer.confidence,
					source: readmeUsed ? "jev-readme" : "jev",
					readmeUsed,
				});
			},
		);
	}

	const categoriesById = new Map(
		survivors.map((category) => [category.id, category]),
	);
	const defaultCategory =
		categoriesById.get(categoryConfig.defaultCategory) ??
		survivors[survivors.length - 1];

	const records: ClassifiedStarRecord[] = repos.map((repo) => {
		const current = classifications.get(repo.fullName);
		const category =
			current && categoriesById.has(current.category)
				? categoriesById.get(current.category)
				: defaultCategory;
		const resolved = category ?? defaultCategory;
		const confidence =
			current && resolved.id === current.category ? current.confidence : 0;

		const key = keyByFullName.get(repo.fullName);
		if (key) {
			cache.set(key, {
				category: resolved.id,
				confidence,
				readmeUsed: current?.readmeUsed ?? false,
			});
		}

		return {
			...repo,
			category: resolved.id,
			categoryTitle: resolved.title,
			classificationConfidence: Number(confidence.toFixed(4)),
			classificationSource: current?.source ?? "jev",
			classificationReadmeUsed: current?.readmeUsed ?? false,
		};
	});

	await cache.save();

	log("Final distribution:");
	for (const category of sortCategories(survivors)) {
		const count = records.filter(
			(record) => record.category === category.id,
		).length;
		if (count > 0) {
			log(
				`  ${category.id.padEnd(24)} ${String(count).padStart(4)}${category.derived ? "  (derived)" : ""}`,
			);
		}
	}
	const usage = jev.usage;

	return {
		records,
		categories: sortCategories(survivors),
		stats: {
			total: repos.length,
			topicsScreened: topicCandidates.length,
			topicsAccepted: derived.length,
			fromCache,
			evaluated: usage.requests,
			readmeEvaluated,
			repromptedAfterPruning: reprompted,
			inputTokens: usage.inputTokens,
			estimatedCostUsd: Number(usage.estimatedCostUsd.toFixed(4)),
		},
	};
}
