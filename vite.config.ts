import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const frontendRoot = resolve(process.cwd(), "frontend");

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

			if (existsSync(catalogPath)) {
				const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
					chunkCount?: number;
				};
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

			return html.replace(
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
