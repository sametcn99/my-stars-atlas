import type { ClassifiedStarRecord, DiffSummary } from "./types.ts";

function comparableFields(record: ClassifiedStarRecord): string {
	return JSON.stringify({
		description: record.description,
		homepage: record.homepage,
		language: record.language,
		topics: record.topics,
		category: record.category,
		confidence: record.classificationConfidence,
		reason: record.classificationReason,
		source: record.classificationSource,
		readmeUsed: record.classificationReadmeUsed,
	});
}

export function diffSnapshots(
	previous: ClassifiedStarRecord[] | undefined,
	current: ClassifiedStarRecord[],
): DiffSummary {
	if (!previous) {
		return {
			added: current.length,
			removed: 0,
			updated: 0,
		};
	}

	const previousMap = new Map(previous.map((item) => [item.fullName, item]));
	const currentMap = new Map(current.map((item) => [item.fullName, item]));

	let added = 0;
	let removed = 0;
	let updated = 0;

	for (const [fullName, item] of currentMap.entries()) {
		const previousItem = previousMap.get(fullName);
		if (!previousItem) {
			added += 1;
			continue;
		}

		if (comparableFields(previousItem) !== comparableFields(item)) {
			updated += 1;
		}
	}

	for (const fullName of previousMap.keys()) {
		if (!currentMap.has(fullName)) {
			removed += 1;
		}
	}

	return { added, removed, updated };
}
