import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { paths } from "./config.ts";
import type { StarRecord, TopicScreening } from "./types.ts";

/** Bump when the state sent to Jev or the classification flow changes. */
const CLASSIFIER_VERSION = 3;

export type CacheEntry = {
	category: string;
	confidence: number;
	readmeUsed: boolean;
};

type CacheFile = {
	version: number;
	entries: Record<string, CacheEntry>;
	/** Topic screening verdicts, keyed by the topic itself. */
	topics?: Record<string, TopicScreening>;
};

/**
 * Keyed by everything that can change a classification: the repository fields
 * Jev sees and the option set it chose from.
 */
export function cacheKey(
	repo: StarRecord,
	taxonomyHash: string,
	model: string,
): string {
	return createHash("sha256")
		.update(
			JSON.stringify([
				CLASSIFIER_VERSION,
				model,
				taxonomyHash,
				repo.id,
				repo.fullName,
				repo.description,
				repo.language,
				repo.topics,
				repo.homepage,
				repo.archived,
			]),
		)
		.digest("hex")
		.slice(0, 32);
}

export class ClassificationCache {
	private readonly enabled: boolean;
	private readonly entries: Map<string, CacheEntry>;
	private readonly used = new Map<string, CacheEntry>();
	private readonly topics: Map<string, TopicScreening>;
	private readonly usedTopics = new Map<string, TopicScreening>();

	private constructor(
		enabled: boolean,
		entries: Map<string, CacheEntry>,
		topics: Map<string, TopicScreening> = new Map(),
	) {
		this.enabled = enabled;
		this.entries = entries;
		this.topics = topics;
	}

	static async load(enabled: boolean): Promise<ClassificationCache> {
		if (!enabled) {
			return new ClassificationCache(false, new Map());
		}

		try {
			const file = (await Bun.file(
				paths.classificationCache,
			).json()) as CacheFile;
			if (file.version !== CLASSIFIER_VERSION) {
				return new ClassificationCache(true, new Map());
			}

			return new ClassificationCache(
				true,
				new Map(Object.entries(file.entries)),
				new Map(Object.entries(file.topics ?? {})),
			);
		} catch {
			return new ClassificationCache(true, new Map());
		}
	}

	get(key: string): CacheEntry | undefined {
		const entry = this.enabled ? this.entries.get(key) : undefined;
		if (entry) {
			this.used.set(key, entry);
		}

		return entry;
	}

	set(key: string, entry: CacheEntry): void {
		this.used.set(key, entry);
	}

	getTopic(topic: string): TopicScreening | undefined {
		const screening = this.enabled ? this.topics.get(topic) : undefined;
		if (screening) {
			this.usedTopics.set(topic, screening);
		}

		return screening;
	}

	setTopic(topic: string, screening: TopicScreening): void {
		this.usedTopics.set(topic, screening);
	}

	/** Only entries touched by this run are kept, so the file cannot grow forever. */
	async save(): Promise<void> {
		if (!this.enabled) {
			return;
		}

		await mkdir(paths.cache, { recursive: true });
		await Bun.write(
			paths.classificationCache,
			`${JSON.stringify(
				{
					version: CLASSIFIER_VERSION,
					entries: Object.fromEntries(this.used),
					topics: Object.fromEntries(this.usedTopics),
				} satisfies CacheFile,
				null,
			)}\n`,
		);
	}
}
