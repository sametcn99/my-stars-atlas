import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const frontendRoot = resolve(process.cwd(), "frontend");

type SeoMetadata = {
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

type CatalogBuildData = {
	chunkCount?: number;
	total?: number;
	seo?: Partial<SeoMetadata>;
	categories?: { title: string; count: number }[];
};

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function inlineStylesAndPreloadData(): Plugin {
	return {
		name: "inline-styles-and-preload-catalog",
		transformIndexHtml(html) {
			const styles = readFileSync(
				resolve(frontendRoot, "src/styles.css"),
				"utf8",
			);
			const catalogPath = resolve(frontendRoot, "public/data/catalog.json");
			const preloadLinks: string[] = [];
			const catalog = existsSync(catalogPath)
				? (JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogBuildData)
				: null;

			if (catalog) {
				preloadLinks.push(
					'<link rel="preload" href="./data/catalog.json" as="fetch" type="application/json" crossorigin />',
				);
				for (
					let index = 1;
					index <= Math.min(catalog.chunkCount ?? 0, 2);
					index += 1
				) {
					preloadLinks.push(
						`<link rel="preload" href="./data/stars-${String(index).padStart(3, "0")}.json" as="fetch" type="application/json" crossorigin />`,
					);
				}
			}

			const config = JSON.parse(
				readFileSync(resolve(process.cwd(), "config/config.json"), "utf8"),
			) as {
				github?: { username?: string };
				site?: {
					title?: string;
					url?: string;
					heroTitle?: string;
					heroDescription?: string;
					seo?: {
						description?: string;
						ogDescription?: string;
						twitterDescription?: string;
						twitterCard?: string;
						socialImageUrl?: string;
					};
				};
			};
			const username = config.github?.username ?? "sametcn99";
			const siteTitle = config.site?.title ?? "My Stars Atlas";
			const canonicalUrl = (
				config.site?.url ?? "https://sametcn99.github.io/my-stars-atlas"
			).replace(/\/$/, "");
			const seo: SeoMetadata = {
				title: `${siteTitle} | @${username}`,
				description:
					config.site?.seo?.description ??
					"Browse starred GitHub repositories with categories, search, filters, and sorting.",
				heroTitle: config.site?.heroTitle ?? siteTitle,
				heroDescription:
					config.site?.heroDescription ??
					"Explore a curated catalog of starred GitHub repositories.",
				canonicalUrl,
				ogType: "website",
				ogTitle: `${siteTitle} | @${username}`,
				ogDescription:
					config.site?.seo?.ogDescription ??
					"A searchable catalog of starred GitHub repositories.",
				imageUrl:
					config.site?.seo?.socialImageUrl ??
					`https://github.com/${username}.png?size=512`,
				siteName: `${siteTitle} | @${username}`,
				twitterCard: config.site?.seo?.twitterCard ?? "summary_large_image",
				twitterTitle: `${siteTitle} | @${username}`,
				twitterDescription:
					config.site?.seo?.twitterDescription ??
					"Explore starred GitHub repositories by category, language, popularity, and recency.",
				profileUrl: `https://github.com/${username}`,
			};
			Object.assign(seo, catalog?.seo);
			const jsonLd = JSON.stringify({
				"@context": "https://schema.org",
				"@graph": [
					{
						"@type": "WebSite",
						"@id": `${seo.canonicalUrl}#website`,
						url: seo.canonicalUrl,
						name: seo.siteName,
						description: seo.description,
						publisher: { "@id": `${seo.canonicalUrl}#profile` },
					},
					{
						"@type": "ProfilePage",
						"@id": `${seo.canonicalUrl}#profile-page`,
						url: seo.canonicalUrl,
						mainEntity: {
							"@type": "Person",
							"@id": `${seo.canonicalUrl}#profile`,
							name: `@${username}`,
							url: seo.profileUrl,
						},
					},
					{
						"@type": "CollectionPage",
						"@id": `${seo.canonicalUrl}#collection`,
						url: seo.canonicalUrl,
						name: seo.heroTitle,
						description: seo.heroDescription,
						isPartOf: { "@id": `${seo.canonicalUrl}#website` },
						numberOfItems: catalog?.total ?? 0,
					},
				],
			}).replace(/</g, "\\u003c");
			const categories = (catalog?.categories ?? [])
				.map((category) => `${category.title} (${category.count})`)
				.join(", ");
			const head = `
					<meta name="author" content="@${escapeHtml(username)}" />
					<meta name="theme-color" content="#0f1115" />
					<link rel="canonical" href="${escapeHtml(seo.canonicalUrl)}" />
					<meta property="og:type" content="${escapeHtml(seo.ogType)}" />
					<meta property="og:url" content="${escapeHtml(seo.canonicalUrl)}" />
					<meta property="og:title" content="${escapeHtml(seo.ogTitle)}" />
					<meta property="og:description" content="${escapeHtml(seo.ogDescription)}" />
					<meta property="og:image" content="${escapeHtml(seo.imageUrl)}" />
					<meta property="og:site_name" content="${escapeHtml(seo.siteName)}" />
					<meta name="twitter:card" content="${escapeHtml(seo.twitterCard)}" />
					<meta name="twitter:title" content="${escapeHtml(seo.twitterTitle)}" />
					<meta name="twitter:description" content="${escapeHtml(seo.twitterDescription)}" />
					<meta name="twitter:image" content="${escapeHtml(seo.imageUrl)}" />
					<script type="application/ld+json">${jsonLd}</script>`;
			const fallback = `<noscript><main><h1>${escapeHtml(seo.heroTitle)}</h1><p>${escapeHtml(seo.heroDescription)}</p><p>Browse ${catalog?.total ?? 0} starred GitHub repositories${categories ? ` across ${escapeHtml(categories)}` : ""}.</p><p><a href="${escapeHtml(seo.profileUrl)}">View @${escapeHtml(username)} on GitHub</a></p></main></noscript>`;

			return html
				.replace(
					/<title>[\s\S]*?<\/title>/,
					`<title>${escapeHtml(seo.title)}</title>`,
				)
				.replace(
					/<meta name="description" content="[^"]*" \/>/,
					`<meta name="description" content="${escapeHtml(seo.description)}" />`,
				)
				.replace("<!-- SEO_HEAD -->", head)
				.replace("<!-- SEO_BODY -->", fallback)
				.replace(
					"</head>",
					`${preloadLinks.join("\n")}\n<style>${styles}</style>\n</head>`,
				);
		},
	};
}

export default defineConfig({
	plugins: [react(), inlineStylesAndPreloadData()],
	root: "frontend",
	base: "./",
	build: {
		outDir: "../dist",
		emptyOutDir: true,
	},
});
