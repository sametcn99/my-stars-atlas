import { useRef } from "react";
import { CatalogControls } from "./components/CatalogControls";
import { CategoryStrip } from "./components/CategoryStrip";
import { Hero } from "./components/Hero";
import { VirtualizedRepoGrid } from "./components/VirtualizedRepoGrid";
import { useCatalogData } from "./hooks/useCatalogData";
import { useInfiniteScroll } from "./hooks/useInfiniteScroll";
import { formatNumber } from "./utils";

export function App() {
	const {
		manifest,
		filters,
		visibleRecords,
		categoryRecords,
		categories,
		isLoading,
		isLoadingAll,
		error,
		loadManifest,
		filterOptions,
		updateFilter,
	} = useCatalogData();

	const sentinelRef = useRef<HTMLDivElement>(null);
	useInfiniteScroll(sentinelRef);

	return (
		<main className="app-shell">
			<Hero manifest={manifest} categoryCount={categories.length} />

			<CatalogControls
				filters={filters}
				filterOptions={filterOptions}
				onUpdateFilter={updateFilter}
			/>

			<CategoryStrip
				selectedCategory={filters.category}
				categories={categories}
				categoryRecords={categoryRecords}
				onSelectCategory={(category) => updateFilter("category", category)}
			/>

			<div className="catalog-toolbar">
				<span>{formatNumber(visibleRecords.length)} repositories shown</span>
				{isLoadingAll && (
					<span className="loading-note">
						Loading remaining repositories...
					</span>
				)}
			</div>

			{error && (
				<div className="state-card error-state">
					<strong>Catalog unavailable</strong>
					<span>{error}</span>
					<button type="button" onClick={() => void loadManifest()}>
						Try again
					</button>
				</div>
			)}

			{!error && visibleRecords.length === 0 && !isLoading && (
				<div className="state-card">
					<strong>No repositories matched</strong>
					<span>Try a broader search or reset one of the filters.</span>
				</div>
			)}

			{visibleRecords.length > 0 && (
				<VirtualizedRepoGrid records={visibleRecords} />
			)}

			<div ref={sentinelRef} className="infinite-sentinel">
				{isLoading && !isLoadingAll && (
					<span className="loading-note">Loading more repositories...</span>
				)}
			</div>
		</main>
	);
}
