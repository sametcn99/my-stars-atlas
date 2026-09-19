import type {
	AppConfig,
	AppConfigFile,
	CategoryConfig,
	ClassificationConfig,
	RuntimeConfig,
} from "./types.ts";

const rootUrl = new URL("../", import.meta.url);

export const paths = {
	root: rootUrl,
	publishRoot: new URL("frontend/public/", rootUrl),
	data: new URL("frontend/public/data/", rootUrl),
	catalog: new URL("frontend/public/data/catalog.json", rootUrl),
	manifest: new URL("frontend/public/manifest.webmanifest", rootUrl),
	robots: new URL("frontend/public/robots.txt", rootUrl),
	sitemap: new URL("frontend/public/sitemap.xml", rootUrl),
	cache: new URL(".cache/", rootUrl),
	classificationCache: new URL(".cache/jev-classifications.json", rootUrl),
	appConfig: new URL("config/config.json", rootUrl),
	categories: new URL("config/categories.json", rootUrl),
};

const DEFAULT_CATALOG_TITLE = "My Stars";
const DEFAULT_CATALOG_DESCRIPTION =
	"A generated catalog of starred GitHub repositories, grouped into stable categories.";
const DEFAULT_README_FALLBACK_CONFIDENCE_THRESHOLD = 0.4;
const DEFAULT_CLASSIFICATION_MODEL = "typesafe/jev-1.13";
const DEFAULT_CLASSIFICATION_BASE_URL =
	"https://openrouter.ai/api/alpha/decisions";
const DEFAULT_CLASSIFICATION_CONCURRENCY = 12;
const DEFAULT_MIN_CATEGORY_SIZE = 5;
const DEFAULT_MIN_TOPIC_COUNT = 8;
const DEFAULT_MAX_DERIVED_CATEGORIES = 25;
const DEFAULT_DERIVED_CATEGORY_MIN_SCORE = 2;
const DEFAULT_README_CHARACTER_LIMIT = 8000;
const DEFAULT_SITE_TITLE = "My Stars Atlas";
const DEFAULT_SITE_URL = "https://sametcn99.github.io/my-stars-atlas";
const DEFAULT_HERO_DESCRIPTION =
	"Explore starred repositories with progressive chunk loading, category-first browsing, debounced search, and a tailored dark interface.";
const DEFAULT_SEO_DESCRIPTION =
	"Browse starred GitHub repositories with progressive loading, category sections, search, filters, and sorting.";
const DEFAULT_OG_DESCRIPTION =
	"A searchable, installable catalog of starred repositories with progressive chunk loading and category-first browsing.";
const DEFAULT_TWITTER_DESCRIPTION =
	"Explore starred repositories by category, language, popularity, and recency without loading the whole dataset upfront.";
const GITHUB_API_BASE_URL = "https://api.github.com";
const MANIFEST_START_URL = "./";
const MANIFEST_SCOPE = "./";
const MANIFEST_DISPLAY = "standalone";
const MANIFEST_THEME_COLOR = "#0f1115";
const MANIFEST_LANGUAGE = "en";

function readFlag(name: string): boolean {
	return Bun.argv.includes(name);
}

function readBooleanEnv(name: string): boolean {
	const value = Bun.env[name]?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes" || value === "on";
}

/** Supports both `--limit 25` and `--limit=25`. */
function readNumberFlag(name: string): number {
	const inlineFlag = Bun.argv.find((argument) =>
		argument.startsWith(`${name}=`),
	);
	const raw = inlineFlag
		? inlineFlag.slice(name.length + 1)
		: Bun.argv[Bun.argv.indexOf(name) + 1];
	const parsed = Number(raw);

	if (!Bun.argv.some((argument) => argument.split("=")[0] === name)) {
		return 0;
	}

	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`${name} must be a non-negative number.`);
	}

	return Math.floor(parsed);
}

function readPositiveNumber(
	value: number | undefined,
	fallback: number,
	label: string,
): number {
	if (value === undefined) {
		return fallback;
	}

	if (!Number.isFinite(value) || value < 1) {
		throw new Error(`${label} must be a number greater than or equal to 1.`);
	}

	return Math.floor(value);
}

export async function readJsonFile<T>(file: URL): Promise<T> {
	return (await Bun.file(file).json()) as T;
}

export async function loadCategoryConfig(): Promise<CategoryConfig> {
	return readJsonFile<CategoryConfig>(paths.categories);
}

/** Rubric position between 0 and 3, matching the topic-quality rubric. */
function readScore(value: number | undefined, fallback: number): number {
	if (value === undefined) {
		return fallback;
	}

	if (!Number.isFinite(value) || value < 0 || value > 3) {
		throw new Error(
			"config/classification.derivedCategoryMinScore must be a number between 0 and 3.",
		);
	}

	return value;
}

function buildClassificationConfig(
	fileConfig: AppConfigFile,
): ClassificationConfig {
	const file = fileConfig.classification ?? {};
	const enableReadmeFallback = file.enableReadmeFallback ?? false;
	const readmeFallbackConfidenceThreshold =
		file.readmeFallbackConfidenceThreshold ??
		DEFAULT_README_FALLBACK_CONFIDENCE_THRESHOLD;

	if (typeof enableReadmeFallback !== "boolean") {
		throw new Error(
			"config/classification.enableReadmeFallback must be a boolean.",
		);
	}

	if (
		typeof readmeFallbackConfidenceThreshold !== "number" ||
		!Number.isFinite(readmeFallbackConfidenceThreshold) ||
		readmeFallbackConfidenceThreshold < 0 ||
		readmeFallbackConfidenceThreshold > 1
	) {
		throw new Error(
			"config/classification.readmeFallbackConfidenceThreshold must be a number between 0 and 1.",
		);
	}

	return {
		model: file.model?.trim() || DEFAULT_CLASSIFICATION_MODEL,
		baseUrl: file.baseUrl?.trim() || DEFAULT_CLASSIFICATION_BASE_URL,
		concurrency: readPositiveNumber(
			file.concurrency,
			DEFAULT_CLASSIFICATION_CONCURRENCY,
			"config/classification.concurrency",
		),
		minCategorySize: readPositiveNumber(
			file.minCategorySize,
			DEFAULT_MIN_CATEGORY_SIZE,
			"config/classification.minCategorySize",
		),
		minTopicCount: readPositiveNumber(
			file.minTopicCount,
			DEFAULT_MIN_TOPIC_COUNT,
			"config/classification.minTopicCount",
		),
		maxDerivedCategories: readPositiveNumber(
			file.maxDerivedCategories,
			DEFAULT_MAX_DERIVED_CATEGORIES,
			"config/classification.maxDerivedCategories",
		),
		derivedCategoryMinScore: readScore(
			file.derivedCategoryMinScore,
			DEFAULT_DERIVED_CATEGORY_MIN_SCORE,
		),
		enableReadmeFallback,
		readmeFallbackConfidenceThreshold,
		readmeCharacterLimit: readPositiveNumber(
			file.readmeCharacterLimit,
			DEFAULT_README_CHARACTER_LIMIT,
			"config/classification.readmeCharacterLimit",
		),
	};
}

export async function loadAppConfig(): Promise<AppConfig> {
	const fileConfig = await readJsonFile<AppConfigFile>(paths.appConfig);
	const username = fileConfig.github?.username?.trim();

	if (!username) {
		throw new Error("Missing github.username in config/config.json.");
	}

	const profileUrl = `https://github.com/${username}`;
	const avatarUrl = `${profileUrl}.png`;
	const classification = buildClassificationConfig(fileConfig);

	const catalogTitle =
		fileConfig.catalog?.title?.trim() || DEFAULT_CATALOG_TITLE;
	const catalogDescription =
		fileConfig.catalog?.description?.trim() || DEFAULT_CATALOG_DESCRIPTION;
	const siteTitle = fileConfig.site?.title?.trim() || DEFAULT_SITE_TITLE;
	const siteUrl = (fileConfig.site?.url?.trim() || DEFAULT_SITE_URL).replace(
		/\/$/,
		"",
	);
	try {
		const parsedSiteUrl = new URL(siteUrl);
		if (!/^https?:$/.test(parsedSiteUrl.protocol)) throw new Error();
	} catch {
		throw new Error("site.url must be an absolute HTTP(S) URL.");
	}
	const fullTitle = `${siteTitle} | @${username}`;
	const seoDescription =
		fileConfig.site?.seo?.description?.trim() || DEFAULT_SEO_DESCRIPTION;
	const manifestDescription =
		fileConfig.site?.manifest?.description?.trim() || seoDescription;
	const socialImageUrl =
		fileConfig.site?.seo?.socialImageUrl?.trim() || `${avatarUrl}?size=512`;
	const iconUrl =
		fileConfig.site?.seo?.iconUrl?.trim() || `${avatarUrl}?size=192`;

	return {
		github: {
			username,
			profileUrl,
			avatarUrl,
		},
		classification,
		catalog: {
			title: catalogTitle,
			description: catalogDescription,
		},
		site: {
			title: siteTitle,
			url: siteUrl,
			fullTitle,
			heroTitle: fileConfig.site?.heroTitle?.trim() || siteTitle,
			heroDescription:
				fileConfig.site?.heroDescription?.trim() || DEFAULT_HERO_DESCRIPTION,
			profileLinkLabel:
				fileConfig.site?.profileLinkLabel?.trim() || "GitHub Profile",
			seo: {
				description: seoDescription,
				ogType: "website",
				ogTitle: fullTitle,
				ogDescription:
					fileConfig.site?.seo?.ogDescription?.trim() || DEFAULT_OG_DESCRIPTION,
				imageUrl: socialImageUrl,
				siteName: fullTitle,
				twitterCard:
					fileConfig.site?.seo?.twitterCard?.trim() || "summary_large_image",
				twitterTitle: fullTitle,
				twitterDescription:
					fileConfig.site?.seo?.twitterDescription?.trim() ||
					DEFAULT_TWITTER_DESCRIPTION,
			},
			manifest: {
				name: `${siteTitle} - ${manifestDescription}`,
				shortName:
					fileConfig.site?.manifest?.shortName?.trim() || "Stars Atlas",
				description: manifestDescription,
				startUrl: MANIFEST_START_URL,
				scope: MANIFEST_SCOPE,
				display: MANIFEST_DISPLAY,
				themeColor: MANIFEST_THEME_COLOR,
				lang: MANIFEST_LANGUAGE,
				icons: [
					{
						src: iconUrl,
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: socialImageUrl,
						sizes: "512x512",
						type: "image/png",
					},
				],
			},
		},
	};
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
	const app = await loadAppConfig();
	const apiKey = Bun.env.OPENROUTER_API_KEY?.trim();

	if (!apiKey) {
		throw new Error(
			"Missing OPENROUTER_API_KEY. Classification runs entirely on Jev through OpenRouter, so the key is required.",
		);
	}

	return {
		app,
		username: app.github.username,
		dryRun: readFlag("--dry-run"),
		forceRefresh: readFlag("--force") || readBooleanEnv("FORCE_REFRESH"),
		useCache: !readFlag("--no-cache") && !readBooleanEnv("NO_CACHE"),
		verbose: readFlag("--verbose") || readBooleanEnv("VERBOSE"),
		limit: readNumberFlag("--limit"),
		classification: app.classification,
		title: app.catalog.title,
		description: app.catalog.description,
		githubToken: Bun.env.GITHUB_TOKEN ?? Bun.env.GH_TOKEN,
		githubApiBaseUrl: GITHUB_API_BASE_URL,
		apiKey,
	};
}
