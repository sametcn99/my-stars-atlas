export type {
	CatalogCategorySummary,
	CatalogManifest,
	ClassifiedStarRecord,
} from "../../src/types.ts";

export type SortOption =
	| "starred-desc"
	| "stars-desc"
	| "updated-desc"
	| "name-asc";

export type VisibilityOption = "all" | "active" | "archived";

export type CatalogFilters = {
	query: string;
	category: string;
	language: string;
	license: string;
	sort: SortOption;
	visibility: VisibilityOption;
};
