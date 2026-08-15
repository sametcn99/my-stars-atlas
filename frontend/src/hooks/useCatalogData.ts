import { useEffect, useMemo } from "react";
import { useCatalogStore } from "../store";
import type { CatalogFilters } from "../types";
import { matches, sortRecords } from "../utils";

export function useCatalogData() {
	const manifest = useCatalogStore((state) => state.manifest);
	const records = useCatalogStore((state) => state.records);
	const filters = useCatalogStore((state) => state.filters);
	const isLoading = useCatalogStore((state) => state.isLoading);
	const isLoadingAll = useCatalogStore((state) => state.isLoadingAll);
	const error = useCatalogStore((state) => state.error);
	const loadedChunks = useCatalogStore((state) => state.loadedChunks);
	const loadManifest = useCatalogStore((state) => state.loadManifest);
	const loadAllChunks = useCatalogStore((state) => state.loadAllChunks);
	const setFilter = useCatalogStore((state) => state.setFilter);

	useEffect(() => {
		void loadManifest();
	}, [loadManifest]);

	// Filtering and filter options must be based on the complete catalog. The
	// first chunks are only a rendering/loading optimization, not a data limit.
	useEffect(() => {
		if (manifest && loadedChunks.size < manifest.chunkCount) {
			void loadAllChunks();
		}
	}, [manifest, loadedChunks.size, loadAllChunks]);

	const visibleRecords = useMemo(
		() =>
			sortRecords(
				records.filter((record) => matches(record, filters)),
				filters.sort,
			),
		[records, filters],
	);

	const categoryRecords = useMemo(
		() => records.filter((record) => matches(record, filters, ["category"])),
		[records, filters],
	);

	const filterOptions = (key: "language" | "license") =>
		Array.from(new Set(records.map((record) => record[key] ?? "__none__")))
			.sort()
			.map((value) => ({
				value,
				label: value === "__none__" ? `No ${key}` : value,
			}));

	const updateFilter = <T extends keyof CatalogFilters>(
		key: T,
		value: CatalogFilters[T],
	) => setFilter(key, value);

	return {
		manifest,
		filters,
		visibleRecords,
		categoryRecords,
		categories: manifest?.categories ?? [],
		isLoading,
		isLoadingAll,
		error,
		loadManifest,
		filterOptions,
		updateFilter,
	};
}
