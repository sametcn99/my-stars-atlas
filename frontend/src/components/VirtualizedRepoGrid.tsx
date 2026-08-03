import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useResponsiveColumns } from "../hooks/useResponsiveColumns";
import type { ClassifiedStarRecord } from "../types";
import { RepositoryCard } from "./RepositoryCard";

interface VirtualizedRepoGridProps {
	records: ClassifiedStarRecord[];
}

export function VirtualizedRepoGrid({ records }: VirtualizedRepoGridProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const columns = useResponsiveColumns();

	const rowCount = Math.ceil(records.length / columns);

	const virtualizer = useWindowVirtualizer({
		count: rowCount,
		estimateSize: () => 280,
		overscan: 3,
		scrollMargin: containerRef.current?.offsetTop ?? 0,
	});

	return (
		<div ref={containerRef} className="virtual-grid-container">
			<div
				style={{
					height: `${virtualizer.getTotalSize()}px`,
					width: "100%",
					position: "relative",
				}}
			>
				{virtualizer.getVirtualItems().map((virtualRow) => {
					const startIndex = virtualRow.index * columns;
					const rowItems = records.slice(startIndex, startIndex + columns);

					return (
						<div
							key={virtualRow.key}
							data-index={virtualRow.index}
							ref={virtualizer.measureElement}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
								display: "grid",
								gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
								gap: "0.8rem",
								paddingBottom: "0.8rem",
							}}
						>
							{rowItems.map((record) => (
								<RepositoryCard key={record.id} record={record} />
							))}
						</div>
					);
				})}
			</div>
		</div>
	);
}
