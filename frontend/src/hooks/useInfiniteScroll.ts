import type { RefObject } from "react";
import { useEffect } from "react";
import { useCatalogStore } from "../store";

export function useInfiniteScroll(
	sentinelRef: RefObject<HTMLDivElement | null>,
): void {
	const manifest = useCatalogStore((state) => state.manifest);
	const loadedChunks = useCatalogStore((state) => state.loadedChunks);
	const isLoading = useCatalogStore((state) => state.isLoading);
	const isLoadingAll = useCatalogStore((state) => state.isLoadingAll);
	const query = useCatalogStore((state) => state.filters.query);
	const loadNextChunks = useCatalogStore((state) => state.loadNextChunks);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (
					entry?.isIntersecting &&
					manifest &&
					loadedChunks.size < manifest.chunkCount &&
					!isLoading &&
					!isLoadingAll &&
					!query
				) {
					void loadNextChunks();
				}
			},
			{ rootMargin: "400px" },
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [
		manifest,
		loadedChunks.size,
		isLoading,
		isLoadingAll,
		query,
		loadNextChunks,
		sentinelRef,
	]);
}
