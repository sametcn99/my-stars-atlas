import { mkdir } from "node:fs/promises";
import { paths } from "./config.ts";

const STATIC_SITE_FILES = [
	"index.html",
	"styles.css",
	"app.js",
	"manifest.json",
	"sw.js",
	"robots.txt",
];

async function buildSite(): Promise<void> {
	await mkdir(paths.publishRoot, { recursive: true });

	await Promise.all(
		STATIC_SITE_FILES.map((fileName) =>
			Bun.write(
				new URL(fileName, paths.publishRoot),
				Bun.file(new URL(fileName, paths.siteShell)),
			),
		),
	);

	await Bun.write(new URL(".nojekyll", paths.publishRoot), "");
}

await buildSite();
