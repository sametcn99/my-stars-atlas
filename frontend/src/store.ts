import { create } from "zustand";
import type {
	CatalogFilters,
	CatalogManifest,
	ClassifiedStarRecord,
} from "./types";

const ALL = "all";
const INITIAL_CHUNKS = 2;

type CatalogState = {
	manifest: CatalogManifest | null;
	records: ClassifiedStarRecord[];
	loadedChunks: Set<number>;
	filters: CatalogFilters;
	isLoading: boolean;
	isLoadingAll: boolean;
	error: string | null;
	loadManifest: () => Promise<void>;
	loadNextChunks: (count?: number) => Promise<void>;
	loadAllChunks: () => Promise<void>;
	setFilter: <T extends keyof CatalogFilters>(
		key: T,
		value: CatalogFilters[T],
	) => void;
};

async function fetchJson<T>(path: string): Promise<T> {
	const response = await fetch(path, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) {
		throw new Error(
			`Request failed for ${path} with status ${response.status}.`,
		);
	}
	return response.json() as Promise<T>;
}

function chunkPath(index: number): string {
	return `./data/stars-${String(index).padStart(3, "0")}.json`;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
	manifest: null,
	records: [],
	loadedChunks: new Set(),
	filters: {
		query: "",
		category: ALL,
		language: ALL,
		license: ALL,
		sort: "starred-desc",
		visibility: "all",
	},
	isLoading: false,
	isLoadingAll: false,
	error: null,
	loadManifest: async () => {
		set({ isLoading: true, error: null });
		try {
			const manifest = await fetchJson<CatalogManifest>("./data/catalog.json");
			document.title = manifest.title;
			set({ manifest });
			await get().loadNextChunks(Math.min(INITIAL_CHUNKS, manifest.chunkCount));
		} catch (error) {
			set({
				error:
					error instanceof Error ? error.message : "Unable to load catalog.",
			});
		} finally {
			set({ isLoading: false });
		}
	},
	loadNextChunks: async (count = 1) => {
		const { manifest } = get();
		if (!manifest) return;
		set({ isLoading: true, error: null });
		try {
			for (let step = 0; step < count; step += 1) {
				const nextIndex = Array.from(
					{ length: manifest.chunkCount },
					(_, index) => index + 1,
				).find((index) => !get().loadedChunks.has(index));
				if (!nextIndex) break;
				const chunk = await fetchJson<{ items: ClassifiedStarRecord[] }>(
					chunkPath(nextIndex),
				);
				const existingIds = new Set(get().records.map((record) => record.id));
				const records = [
					...get().records,
					...chunk.items.filter((record) => !existingIds.has(record.id)),
				];
				const loadedChunks = new Set(get().loadedChunks).add(nextIndex);
				set({ records, loadedChunks });
			}
		} catch (error) {
			set({
				error:
					error instanceof Error
						? error.message
						: "Unable to load repositories.",
			});
		} finally {
			set({ isLoading: false });
		}
	},
	loadAllChunks: async () => {
		if (get().isLoadingAll) return;
		set({ isLoadingAll: true });
		const manifest = get().manifest;
		if (manifest) await get().loadNextChunks(manifest.chunkCount);
		set({ isLoadingAll: false });
	},
	setFilter: (key, value) =>
		set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));
