import type { CatalogFilters, ClassifiedStarRecord, SortOption } from "./types";

export const formatNumber = (value: number): string =>
	new Intl.NumberFormat().format(value);

export const formatDate = (value: string | null): string =>
	value
		? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" })
		: "Unknown";

export const formatRelative = (value: string | null): string => {
	if (!value) return "unknown";
	const days = Math.max(
		0,
		Math.round((Date.now() - new Date(value).getTime()) / 86_400_000),
	);
	return days === 0 ? "today" : `${days}d ago`;
};

export function matches(
	record: ClassifiedStarRecord,
	filters: CatalogFilters,
	excluded: string[] = [],
): boolean {
	const query = filters.query.trim().toLowerCase();
	if (
		!excluded.includes("category") &&
		filters.category !== "all" &&
		record.category !== filters.category
	) {
		return false;
	}
	if (
		!excluded.includes("visibility") &&
		filters.visibility === "active" &&
		record.archived
	) {
		return false;
	}
	if (
		!excluded.includes("visibility") &&
		filters.visibility === "archived" &&
		!record.archived
	) {
		return false;
	}
	if (
		!excluded.includes("language") &&
		filters.language !== "all" &&
		(record.language ?? "__none__") !== filters.language
	) {
		return false;
	}
	if (
		!excluded.includes("license") &&
		filters.license !== "all" &&
		(record.license ?? "__none__") !== filters.license
	) {
		return false;
	}
	if (
		!excluded.includes("query") &&
		query &&
		![
			record.fullName,
			record.description ?? "",
			record.language ?? "",
			record.categoryTitle,
			record.license ?? "",
			...record.topics,
		]
			.join(" ")
			.toLowerCase()
			.includes(query)
	) {
		return false;
	}
	return true;
}

export function sortRecords(
	records: ClassifiedStarRecord[],
	sort: SortOption,
): ClassifiedStarRecord[] {
	return [...records].sort((left, right) => {
		if (sort === "stars-desc") {
			return (
				right.stargazersCount - left.stargazersCount ||
				left.fullName.localeCompare(right.fullName)
			);
		}
		if (sort === "updated-desc") {
			return (
				(right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") ||
				left.fullName.localeCompare(right.fullName)
			);
		}
		if (sort === "name-asc") {
			return left.fullName.localeCompare(right.fullName);
		}
		return (
			(right.starredAt ?? "").localeCompare(left.starredAt ?? "") ||
			left.fullName.localeCompare(right.fullName)
		);
	});
}
