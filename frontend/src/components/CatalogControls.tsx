import type { CatalogFilters, SortOption, VisibilityOption } from "../types";
import { Select } from "./Select";

interface CatalogControlsProps {
	filters: CatalogFilters;
	filterOptions: (
		key: "language" | "license",
	) => { value: string; label: string }[];
	onUpdateFilter: <T extends keyof CatalogFilters>(
		key: T,
		value: CatalogFilters[T],
	) => void;
}

export function CatalogControls({
	filters,
	filterOptions,
	onUpdateFilter,
}: CatalogControlsProps) {
	return (
		<section className="controls" aria-label="Catalog controls">
			<label className="search-field">
				<span>Search the atlas</span>
				<input
					type="search"
					value={filters.query}
					onChange={(event) => onUpdateFilter("query", event.target.value)}
					placeholder="Name, topic, language, description..."
				/>
			</label>
			<Select
				label="Sort"
				value={filters.sort}
				onChange={(value) => onUpdateFilter("sort", value as SortOption)}
				options={[
					{ value: "starred-desc", label: "Recently starred" },
					{ value: "stars-desc", label: "Most stars" },
					{ value: "updated-desc", label: "Recently updated" },
					{ value: "name-asc", label: "Name A-Z" },
				]}
			/>
			<Select
				label="Visibility"
				value={filters.visibility}
				onChange={(value) =>
					onUpdateFilter("visibility", value as VisibilityOption)
				}
				options={[
					{ value: "all", label: "All repositories" },
					{ value: "active", label: "Active only" },
					{ value: "archived", label: "Archived only" },
				]}
			/>
			<Select
				label="Language"
				value={filters.language}
				onChange={(value) => onUpdateFilter("language", value)}
				options={[
					{ value: "all", label: "All languages" },
					...filterOptions("language"),
				]}
			/>
			<Select
				label="License"
				value={filters.license}
				onChange={(value) => onUpdateFilter("license", value)}
				options={[
					{ value: "all", label: "All licenses" },
					...filterOptions("license"),
				]}
			/>
		</section>
	);
}
