import { mkdir, readdir, rm } from "node:fs/promises";
import { categorizeRepositories } from "./categorize.ts";
import {
	loadCategoryConfig,
	loadOverridesConfig,
	loadRuntimeConfig,
	paths,
	readJsonFile,
} from "./config.ts";
import { diffSnapshots } from "./diff.ts";
import {
	fetchStarredRepositories,
	fetchStarredRepositoryCount,
} from "./github.ts";
import { renderReadme } from "./render.ts";
import { syncStaticSiteShell } from "./site-shell.ts";
import type {
	CatalogManifest,
	CategoryConfig,
	StarRecord,
	StarsSnapshot,
	StarsSnapshotChunk,
} from "./types.ts";

const STAR_CHUNK_SIZE = 100;
function getChunkFileName(index: number): string {
	return `stars-${String(index + 1).padStart(3, "0")}.json`;
}

async function listChunkFiles(directory: URL = paths.data): Promise<string[]> {
	let entries: string[] = [];

	try {
		entries = await readdir(directory);
	} catch {
		return [];
	}

	return entries
		.filter((name) => /^stars-\d{3}\.json$/.test(name))
		.sort((left, right) => left.localeCompare(right));
}

function buildSnapshotFromChunks(
	chunks: StarsSnapshotChunk[],
): StarsSnapshot | undefined {
	if (chunks.length === 0) {
		return undefined;
	}

	const [firstChunk] = chunks;
	return {
		version: firstChunk.version,
		username: firstChunk.username,
		generatedAt: firstChunk.generatedAt,
		items: chunks.flatMap((chunk) => chunk.items),
	};
}

function chunkSnapshot(snapshot: StarsSnapshot): StarsSnapshotChunk[] {
	const chunkCount = Math.max(
		1,
		Math.ceil(snapshot.items.length / STAR_CHUNK_SIZE),
	);

	return Array.from({ length: chunkCount }, (_, index) => ({
		version: snapshot.version,
		username: snapshot.username,
		generatedAt: snapshot.generatedAt,
		chunkIndex: index + 1,
		chunkCount,
		items: snapshot.items.slice(
			index * STAR_CHUNK_SIZE,
			(index + 1) * STAR_CHUNK_SIZE,
		),
	}));
}

async function loadExistingSnapshot(): Promise<StarsSnapshot | undefined> {
	const chunkFiles = await listChunkFiles(paths.data);
	if (chunkFiles.length > 0) {
		const chunks = await Promise.all(
			chunkFiles.map((fileName) =>
				readJsonFile<StarsSnapshotChunk>(new URL(fileName, paths.data)),
			),
		);

		return buildSnapshotFromChunks(chunks);
	}

	return undefined;
}

function buildCatalogManifest(payload: {
	title: string;
	description: string;
	snapshot: StarsSnapshot;
	categoryConfig: CategoryConfig;
}): CatalogManifest {
	const counts = new Map<string, number>();
	const configuredCategoryIds = new Set(
		payload.categoryConfig.categories.map((category) => category.id),
	);

	for (const item of payload.snapshot.items) {
		if (!configuredCategoryIds.has(item.category)) {
			continue;
		}

		counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
	}

	return {
		version: 1,
		title: payload.title,
		description: payload.description,
		username: payload.snapshot.username,
		generatedAt: payload.snapshot.generatedAt,
		total: payload.snapshot.items.length,
		recentCount: payload.categoryConfig.recentCount,
		chunkSize: STAR_CHUNK_SIZE,
		chunkCount: Math.max(
			1,
			Math.ceil(payload.snapshot.items.length / STAR_CHUNK_SIZE),
		),
		categories: payload.categoryConfig.categories
			.map((category) => ({
				id: category.id,
				title: category.title,
				description: category.description,
				priority: category.priority,
				count: counts.get(category.id) ?? 0,
			}))
			.filter((category) => category.count > 0),
	};
}
async function writeOutputs(payload: {
	readme: string;
	snapshot: StarsSnapshot;
	catalog: CatalogManifest;
	appConfig: Awaited<ReturnType<typeof loadRuntimeConfig>>["app"];
}): Promise<void> {
	await mkdir(paths.publishRoot, { recursive: true });
	await mkdir(paths.data, { recursive: true });
	await syncStaticSiteShell(payload.appConfig);

	const chunks = chunkSnapshot(payload.snapshot);
	const existingChunkFiles = await listChunkFiles(paths.data);
	const nextChunkFiles = new Set(
		chunks.map((_, index) => getChunkFileName(index)),
	);

	await Bun.write(paths.readme, payload.readme);
	await Bun.write(
		paths.catalog,
		`${JSON.stringify(payload.catalog, null, 2)}\n`,
	);
	await Promise.all(
		chunks.map((chunk, index) =>
			Bun.write(
				new URL(getChunkFileName(index), paths.data),
				`${JSON.stringify(chunk, null, 2)}\n`,
			),
		),
	);

	await Promise.all(
		existingChunkFiles
			.filter((fileName) => !nextChunkFiles.has(fileName))
			.map((fileName) => rm(new URL(fileName, paths.data), { force: true })),
	);
}

async function main(): Promise<void> {
	const runtimeConfig = await loadRuntimeConfig();
	const [categoryConfig, overrides, previousSnapshot] = await Promise.all([
		loadCategoryConfig(),
		loadOverridesConfig(),
		loadExistingSnapshot(),
	]);

	const previousCount = previousSnapshot?.items.length;
	const currentCount = runtimeConfig.forceRefresh
		? (previousCount ?? null)
		: await fetchStarredRepositoryCount(runtimeConfig);
	const shouldRefreshAll =
		runtimeConfig.forceRefresh ||
		previousSnapshot === undefined ||
		previousCount !== currentCount;

	const repos: StarRecord[] = shouldRefreshAll
		? await fetchStarredRepositories(runtimeConfig)
		: previousSnapshot.items;
	const resolvedCurrentCount = shouldRefreshAll ? repos.length : currentCount;

	const classified = categorizeRepositories(repos, categoryConfig, overrides);
	const generatedAt = new Date().toISOString();
	const snapshot: StarsSnapshot = {
		version: 1,
		username: runtimeConfig.username,
		generatedAt,
		items: classified,
	};

	const changes = diffSnapshots(previousSnapshot?.items, snapshot.items);
	const catalog = buildCatalogManifest({
		title: runtimeConfig.title,
		description: runtimeConfig.description,
		snapshot,
		categoryConfig,
	});
	const readme = await renderReadme(paths.template, {
		title: runtimeConfig.title,
		description: runtimeConfig.description,
		username: runtimeConfig.username,
		generatedAt,
		categoryConfig,
		records: snapshot.items,
		changes,
	});

	if (runtimeConfig.stdout) {
		console.log(readme);
	}

	if (!runtimeConfig.dryRun) {
		await writeOutputs({
			readme,
			snapshot,
			catalog,
			appConfig: runtimeConfig.app,
		});
	}

	console.log(
		JSON.stringify(
			{
				username: runtimeConfig.username,
				forcedRefresh: runtimeConfig.forceRefresh,
				countChanged: shouldRefreshAll,
				previousCount: previousCount ?? null,
				currentCount: resolvedCurrentCount,
				refreshedFromApi: shouldRefreshAll,
				total: snapshot.items.length,
				added: changes.added,
				removed: changes.removed,
				updated: changes.updated,
				dryRun: runtimeConfig.dryRun,
			},
			null,
			2,
		),
	);
}

await main();
