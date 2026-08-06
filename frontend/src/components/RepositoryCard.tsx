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
			<h3>
				<a
					className="repo-name"
					href={record.url}
					target="_blank"
					rel="noreferrer noopener"
				>
					{record.fullName}
				</a>
			</h3>
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
				<time dateTime={record.starredAt ?? undefined}>
					Starred {formatRelative(record.starredAt)}
				</time>
				<time
					dateTime={record.updatedAt}
				>{`Updated ${formatRelative(record.updatedAt)}`}</time>
			</footer>
		</article>
	);
}
