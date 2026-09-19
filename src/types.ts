export type CategoryDefinition = {
	id: string;
	title: string;
	description: string;
};

export type CategoryConfig = {
	$schema?: string;
	recentCount: number;
	defaultCategory: string;
	categories: CategoryDefinition[];
};

/**
 * A category that survived taxonomy resolution and is offered to Jev as a
 * choice option. `derived` categories were mined from repository topics
 * instead of the seed taxonomy in config/categories.json, and `priority` is
 * assigned from the seed order rather than configured by hand.
 */
export type ResolvedCategory = CategoryDefinition & {
	priority: number;
	derived: boolean;
};

/** Jev's verdict on whether a mined topic deserves to be a category. */
export type TopicScreening = {
	/** Position on the topic-quality rubric, 0 (useless) to 3 (clear category). */
	score: number;
	/** Probability the label is merely a technology name. */
	technologyName: number;
};

export type ClassificationConfigFile = {
	model?: string;
	baseUrl?: string;
	concurrency?: number;
	minCategorySize?: number;
	minTopicCount?: number;
	maxDerivedCategories?: number;
	derivedCategoryMinScore?: number;
	enableReadmeFallback?: boolean;
	readmeFallbackConfidenceThreshold?: number;
	readmeCharacterLimit?: number;
};

export type ClassificationConfig = {
	model: string;
	baseUrl: string;
	concurrency: number;
	minCategorySize: number;
	minTopicCount: number;
	maxDerivedCategories: number;
	derivedCategoryMinScore: number;
	enableReadmeFallback: boolean;
	readmeFallbackConfidenceThreshold: number;
	readmeCharacterLimit: number;
};

export type AppConfigFile = {
	github: {
		username: string;
	};
	classification?: ClassificationConfigFile;
	readme?: {
		title?: string;
		description?: string;
	};
	site?: {
		title?: string;
		url?: string;
		heroTitle?: string;
		heroDescription?: string;
		profileLinkLabel?: string;
		seo?: {
			description?: string;
			ogDescription?: string;
			twitterDescription?: string;
			twitterCard?: string;
			socialImageUrl?: string;
			iconUrl?: string;
		};
		manifest?: {
			shortName?: string;
			description?: string;
		};
	};
};

export type SiteManifestIconConfig = {
	src: string;
	sizes: string;
	type: string;
};

export type SiteManifestConfig = {
	name: string;
	shortName: string;
	description: string;
	startUrl: string;
	scope: string;
	display: string;
	themeColor: string;
	lang: string;
	icons: SiteManifestIconConfig[];
};

export type SiteSeoConfig = {
	description: string;
	ogType: string;
	ogTitle: string;
	ogDescription: string;
	imageUrl: string;
	siteName: string;
	twitterCard: string;
	twitterTitle: string;
	twitterDescription: string;
};

export type SiteConfig = {
	title: string;
	url: string;
	fullTitle: string;
	heroTitle: string;
	heroDescription: string;
	profileLinkLabel: string;
	seo: SiteSeoConfig;
	manifest: SiteManifestConfig;
};

export type AppConfig = {
	github: {
		username: string;
		profileUrl: string;
		avatarUrl: string;
	};
	classification: ClassificationConfig;
	readme: {
		title: string;
		description: string;
	};
	site: SiteConfig;
};

export type GitHubRepoOwner = {
	login: string;
	type: string;
};

export type GitHubRepo = {
	id: number;
	name: string;
	full_name: string;
	html_url: string;
	description: string | null;
	homepage: string | null;
	language: string | null;
	topics?: string[];
	archived: boolean;
	disabled: boolean;
	fork: boolean;
	created_at: string;
	updated_at: string;
	pushed_at: string | null;
	stargazers_count: number;
	owner: GitHubRepoOwner;
	license?: {
		spdx_id?: string | null;
		name?: string | null;
	} | null;
};

export type GitHubStarResponse =
	| {
			starred_at?: string;
			repo?: GitHubRepo;
	  }
	| GitHubRepo;

export type StarRecord = {
	id: number;
	fullName: string;
	name: string;
	owner: string;
	ownerType: string;
	url: string;
	description: string | null;
	homepage: string | null;
	language: string | null;
	topics: string[];
	archived: boolean;
	disabled: boolean;
	fork: boolean;
	createdAt: string;
	updatedAt: string;
	pushedAt: string | null;
	starredAt: string | null;
	stargazersCount: number;
	license: string | null;
};

export type ClassificationSource = "jev" | "jev-readme" | "cache";

export type JevClassification = {
	category: string;
	confidence: number;
	source: ClassificationSource;
	readmeUsed: boolean;
};

export type ClassifiedStarRecord = StarRecord & {
	category: string;
	categoryTitle: string;
	classificationConfidence: number;
	classificationSource: ClassificationSource;
	classificationReadmeUsed: boolean;
};

export type ClassificationStats = {
	total: number;
	topicsScreened: number;
	topicsAccepted: number;
	fromCache: number;
	evaluated: number;
	readmeEvaluated: number;
	repromptedAfterPruning: number;
	inputTokens: number;
	estimatedCostUsd: number;
};

export type StarsSnapshot = {
	version: 1;
	username: string;
	generatedAt: string;
	items: ClassifiedStarRecord[];
};

export type StarsSnapshotChunk = {
	version: 1;
	username: string;
	generatedAt: string;
	chunkIndex: number;
	chunkCount: number;
	items: ClassifiedStarRecord[];
};

export type CatalogCategorySummary = {
	id: string;
	title: string;
	description: string;
	priority: number;
	count: number;
};

export type CatalogManifestSeo = {
	title: string;
	description: string;
	heroTitle: string;
	heroDescription: string;
	canonicalUrl: string;
	ogType: string;
	ogTitle: string;
	ogDescription: string;
	imageUrl: string;
	siteName: string;
	twitterCard: string;
	twitterTitle: string;
	twitterDescription: string;
	profileUrl: string;
};

export type CatalogManifest = {
	version: 1;
	title: string;
	description: string;
	seo?: CatalogManifestSeo;
	username: string;
	generatedAt: string;
	total: number;
	recentCount: number;
	chunkSize: number;
	chunkCount: number;
	categories: CatalogCategorySummary[];
};

export type DiffSummary = {
	added: number;
	removed: number;
	updated: number;
};

export type RuntimeConfig = {
	app: AppConfig;
	username: string;
	dryRun: boolean;
	stdout: boolean;
	forceRefresh: boolean;
	useCache: boolean;
	/** Log every individual decision instead of periodic progress. */
	verbose: boolean;
	limit: number;
	classification: ClassificationConfig;
	title: string;
	description: string;
	githubToken?: string;
	githubApiBaseUrl: string;
	/** OpenRouter key used for every Jev decision request. */
	apiKey: string;
};
