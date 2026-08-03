import type {
	CategoryConfig,
	ClassifiedStarRecord,
	DiffSummary,
} from "./types.ts";

function withTopicDisplay(
	item: ClassifiedStarRecord,
): ClassifiedStarRecord & { topicDisplay: string | null } {
	return {
		...item,
		topicDisplay:
			item.topics.length > 0 ? item.topics.slice(0, 3).join(", ") : null,
	};
}

export async function renderReadme(
	_templateFile: URL,
	options: {
		title: string;
		description: string;
		username: string;
		generatedAt: string;
		categoryConfig: CategoryConfig;
		records: ClassifiedStarRecord[];
		changes: DiffSummary;
	},
): Promise<string> {
	const categories = options.categoryConfig.categories
		.map((category) => {
			const items = options.records
				.filter((record) => record.category === category.id)
				.sort((left, right) => left.fullName.localeCompare(right.fullName))
				.map(withTopicDisplay);

			return {
				id: category.id,
				title: category.title,
				description: category.description,
				count: items.length,
				items,
			};
		})
		.filter((category) => category.count > 0);

	const recent = [...options.records]
		.sort((left, right) =>
			(right.starredAt ?? "").localeCompare(left.starredAt ?? ""),
		)
		.slice(0, options.categoryConfig.recentCount)
		.map(withTopicDisplay);

	const lines: string[] = [
		`# ${options.title}`,
		"",
		options.description,
		"",
		`> Generated at ${options.generatedAt} for [@${options.username}](https://github.com/${options.username}) | Total Repositories: **${options.records.length}** across **${categories.length}** categories.`,
		"",
		"## Recent Stars",
		"",
		...recent.map(
			(item) =>
				`- [**${item.fullName}**](${item.url}) - ${item.description || "No description"} (${item.stargazersCount} ★)`,
		),
		"",
		"## Categories",
		"",
	];

	for (const cat of categories) {
		lines.push(`### ${cat.title} (${cat.count})`);
		if (cat.description) {
			lines.push(`*${cat.description}*`);
		}
		lines.push("");
		for (const item of cat.items) {
			lines.push(
				`- [${item.fullName}](${item.url}) - ${item.description || "No description"} (${item.stargazersCount} ★)`,
			);
		}
		lines.push("");
	}

	return `${lines.join("\n").trim()}\n`;
}
