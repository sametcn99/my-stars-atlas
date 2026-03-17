import { loadAppConfig } from "./config.ts";
import { syncStaticSiteShell } from "./site-shell.ts";

async function buildSite(): Promise<void> {
	const appConfig = await loadAppConfig();
	await syncStaticSiteShell(appConfig);
}

await buildSite();
