import type {
	AppConfig,
	AppConfigFile,
	CategoryConfig,
	OverridesConfig,
	RuntimeConfig,
} from "./types.ts";

const rootUrl = new URL("../", import.meta.url);

export const paths = {
	root: rootUrl,
	siteShell: new URL("assets/site/", rootUrl),
	publishRoot: new URL("dist/", rootUrl),
	data: new URL("dist/data/", rootUrl),
	catalog: new URL("dist/data/catalog.json", rootUrl),
	appConfig: new URL("config/config.json", rootUrl),
	categories: new URL("config/categories.json", rootUrl),
	overrides: new URL("config/overrides.json", rootUrl),
	template: new URL("templates/README.hbs", rootUrl),
	readme: new URL("README.md", rootUrl),
};

const DEFAULT_README_TITLE = "My Stars";
const DEFAULT_README_DESCRIPTION =
	"A generated catalog of starred GitHub repositories, grouped into stable categories.";
const DEFAULT_SITE_TITLE = "My Stars Atlas";
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

export async function readJsonFile<T>(file: URL): Promise<T> {
	return (await Bun.file(file).json()) as T;
}

export async function loadCategoryConfig(): Promise<CategoryConfig> {
	return readJsonFile<CategoryConfig>(paths.categories);
}

export async function loadOverridesConfig(): Promise<OverridesConfig> {
	return readJsonFile<OverridesConfig>(paths.overrides);
}

export async function loadAppConfig(): Promise<AppConfig> {
	const fileConfig = await readJsonFile<AppConfigFile>(paths.appConfig);
	const username = fileConfig.github?.username?.trim();

	if (!username) {
		throw new Error("Missing github.username in config/config.json.");
	}

	const profileUrl = `https://github.com/${username}`;
	const avatarUrl = `${profileUrl}.png`;
	const readmeTitle = fileConfig.readme?.title?.trim() || DEFAULT_README_TITLE;
	const readmeDescription =
		fileConfig.readme?.description?.trim() || DEFAULT_README_DESCRIPTION;
	const siteTitle = fileConfig.site?.title?.trim() || DEFAULT_SITE_TITLE;
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
		readme: {
			title: readmeTitle,
			description: readmeDescription,
		},
		site: {
			title: siteTitle,
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

	return {
		app,
		username: app.github.username,
		dryRun: readFlag("--dry-run"),
		stdout: readFlag("--stdout"),
		forceRefresh: readFlag("--force") || readBooleanEnv("FORCE_REFRESH"),
		title: app.readme.title,
		description: app.readme.description,
		githubToken: Bun.env.GITHUB_TOKEN ?? Bun.env.GH_TOKEN,
		githubApiBaseUrl: GITHUB_API_BASE_URL,
	};
}
