export async function mapWithConcurrency<T, TResult>(
	items: T[],
	limit: number,
	mapper: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
	if (items.length === 0) {
		return [];
	}

	const results = new Array<TResult>(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[currentIndex] = await mapper(items[currentIndex], currentIndex);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, () => worker()),
	);

	return results;
}

export function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
