import type { ClassifiedStarRecord } from "../types";
import { formatNumber, formatRelative } from "../utils";

interface RepositoryCardProps {
	record: ClassifiedStarRecord;
}

export function RepositoryCard({ record }: RepositoryCardProps) {
	return (
		<article className="repo-card">
			<div className="repo-card-top">
				<span className="category-label">{record.categoryTitle}</span>
				{record.archived && <span className="status-label">Archived</span>}
			</div>
			<a
				className="repo-name"
				href={record.url}
				target="_blank"
				rel="noreferrer noopener"
			>
				{record.fullName}
			</a>
			<p>{record.description || "No description provided."}</p>
			<div className="tag-row">
				{record.language && <span>{record.language}</span>}
				{record.license && <span>{record.license}</span>}
				{record.fork && <span>Fork</span>}
				{record.topics.slice(0, 3).map((topic) => (
					<span key={topic}>{topic}</span>
				))}
			</div>
			<footer>
				<span>★ {formatNumber(record.stargazersCount)}</span>
				<span>Starred {formatRelative(record.starredAt)}</span>
				<span>Updated {formatRelative(record.updatedAt)}</span>
			</footer>
		</article>
	);
}
