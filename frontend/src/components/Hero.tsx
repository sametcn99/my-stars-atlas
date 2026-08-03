import type { CatalogManifest } from "../types";
import { formatDate, formatNumber } from "../utils";

interface HeroProps {
	manifest: CatalogManifest | null;
	categoryCount: number;
}

export function Hero({ manifest, categoryCount }: HeroProps) {
	return (
		<header className="hero">
			<div className="hero-kicker">CURATED GITHUB CATALOG</div>
			<div className="hero-layout">
				<div>
					<h1>{manifest?.title ?? "My Stars Atlas"}</h1>
					<p>
						{manifest?.description ??
							"Loading your starred repositories into a browsable atlas."}
					</p>
					<a
						className="profile-link"
						href={`https://github.com/${manifest?.username ?? "sametcn99"}`}
						target="_blank"
						rel="noreferrer noopener"
					>
						Open GitHub profile ↗
					</a>
				</div>
				<div className="stats">
					<div>
						<strong>{formatNumber(manifest?.total ?? 0)}</strong>
						<span>repositories</span>
					</div>
					<div>
						<strong>{categoryCount}</strong>
						<span>categories</span>
					</div>
					<div>
						<strong>{formatDate(manifest?.generatedAt ?? null)}</strong>
						<span>last update</span>
					</div>
				</div>
			</div>
		</header>
	);
}
