import { useEffect, useState } from "react";

export function useResponsiveColumns(): number {
	const [columns, setColumns] = useState(3);

	useEffect(() => {
		const updateColumns = () => {
			const width = window.innerWidth;
			if (width <= 600) setColumns(1);
			else if (width <= 900) setColumns(2);
			else setColumns(3);
		};
		updateColumns();
		window.addEventListener("resize", updateColumns);
		return () => window.removeEventListener("resize", updateColumns);
	}, []);

	return columns;
}
