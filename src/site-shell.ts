import { mkdir } from "node:fs/promises";
import Handlebars from "handlebars";
import { paths } from "./config.ts";
import type { AppConfig } from "./types.ts";

const STATIC_SITE_FILES = ["styles.css", "app.js"];
const SITE_TEMPLATE_FILES = [
	{
		templateName: "index.html.hbs",
		outputName: "index.html",
	},
	{
		templateName: "manifest.json.hbs",
		outputName: "manifest.json",
	},
	{
		templateName: "robots.txt.hbs",
		outputName: "robots.txt",
	},
];

type SiteShellContext = {
	github: AppConfig["github"];
	site: AppConfig["site"];
};

function createTemplateEngine() {
	const engine = Handlebars.create();
	engine.registerHelper("json", (value: unknown) => JSON.stringify(value));
	return engine;
}

async function renderTemplateFile(
	templateName: string,
	context: SiteShellContext,
): Promise<string> {
	const templateSource = await Bun.file(
		new URL(templateName, paths.siteShell),
	).text();
	const template = createTemplateEngine().compile(templateSource);
	return `${template(context).trim()}\n`;
}

export async function syncStaticSiteShell(appConfig: AppConfig): Promise<void> {
	await mkdir(paths.publishRoot, { recursive: true });

	await Promise.all(
		STATIC_SITE_FILES.map((fileName) =>
			Bun.write(
				new URL(fileName, paths.publishRoot),
				Bun.file(new URL(fileName, paths.siteShell)),
			),
		),
	);

	const templateContext: SiteShellContext = {
		github: appConfig.github,
		site: appConfig.site,
	};

	await Promise.all([
		...SITE_TEMPLATE_FILES.map(async ({ templateName, outputName }) =>
			Bun.write(
				new URL(outputName, paths.publishRoot),
				await renderTemplateFile(templateName, templateContext),
			),
		),
		Bun.write(new URL(".nojekyll", paths.publishRoot), ""),
	]);
}
