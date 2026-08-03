import type { CatalogCategorySummary, ClassifiedStarRecord } from "../types";

interface CategoryStripProps {
	selectedCategory: string;
	categories: CatalogCategorySummary[];
	categoryRecords: ClassifiedStarRecord[];
	onSelectCategory: (id: string) => void;
}

export function CategoryStrip({
	selectedCategory,
	categories,
	categoryRecords,
	onSelectCategory,
}: CategoryStripProps) {
	return (
		<section className="category-strip" aria-label="Categories">
			<button
				type="button"
				className={selectedCategory === "all" ? "active" : ""}
				onClick={() => onSelectCategory("all")}
			>
				All <b>{categoryRecords.length}</b>
			</button>
			{categories.map((category) => (
				<button
					type="button"
					key={category.id}
					className={selectedCategory === category.id ? "active" : ""}
					onClick={() => onSelectCategory(category.id)}
				>
					{category.title}{" "}
					<b>
						{
							categoryRecords.filter(
								(record) => record.category === category.id,
							).length
						}
					</b>
				</button>
			))}
		</section>
	);
}
