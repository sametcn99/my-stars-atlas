import type {
	GitHubRepo,
	GitHubStarResponse,
	RuntimeConfig,
	StarRecord,
} from "./types.ts";

const GITHUB_STARS_ACCEPT = "application/vnd.github.star+json";
const GITHUB_README_ACCEPT = "application/vnd.github.raw+json";

function normalizeRepo(entry: GitHubStarResponse): StarRecord {
	const repo =
		"repo" in entry && entry.repo ? entry.repo : (entry as GitHubRepo);
	const starredAt = "starred_at" in entry ? (entry.starred_at ?? null) : null;

	return {
		id: repo.id,
		fullName: repo.full_name,
		name: repo.name,
		owner: repo.owner.login,
		ownerType: repo.owner.type,
		url: repo.html_url,
		description: repo.description,
		homepage: repo.homepage,
		language: repo.language,
		topics: (repo.topics ?? []).map((topic) => topic.toLowerCase()).sort(),
		archived: repo.archived,
		disabled: repo.disabled,
		fork: repo.fork,
		createdAt: repo.created_at,
		updatedAt: repo.updated_at,
		pushedAt: repo.pushed_at,
		starredAt,
		stargazersCount: repo.stargazers_count,
		license: repo.license?.spdx_id ?? repo.license?.name ?? null,
	};
}

function buildHeaders(token?: string, accept: string = GITHUB_STARS_ACCEPT): HeadersInit {
	return {
		Accept: accept,
		"User-Agent": "my-stars-bun",
		...(token ? { Authorization: `Bearer ${token}` } : {}),
		"X-GitHub-Api-Version": "2022-11-28",
	};
}

function buildStarredUrl(
	config: RuntimeConfig,
	page: number,
	perPage: number,
): URL {
	const url = new URL(
		`/users/${config.username}/starred`,
		config.githubApiBaseUrl,
	);
	url.searchParams.set("per_page", String(perPage));
	url.searchParams.set("page", String(page));
	url.searchParams.set("sort", "created");
	url.searchParams.set("direction", "desc");
	return url;
}

function buildReadmeUrl(config: RuntimeConfig, fullName: string): URL {
	const [owner, name] = fullName.split("/");
	if (!owner || !name) {
		throw new Error(`Invalid repository full name '${fullName}'.`);
	}

	return new URL(
		`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/readme`,
		config.githubApiBaseUrl,
	);
}

async function ensureGitHubResponse(
	response: Response,
	username: string,
): Promise<void> {
	if (response.ok) {
		return;
	}

	if (response.status === 404) {
		throw new Error(`GitHub user '${username}' was not found.`);
	}

	if (response.status === 403) {
		const remaining = response.headers.get("x-ratelimit-remaining");
		const reset = response.headers.get("x-ratelimit-reset");
		throw new Error(
			`GitHub API rate limited or forbidden. Remaining=${remaining ?? "unknown"}, reset=${reset ?? "unknown"}.`,
		);
	}

	throw new Error(`GitHub API request failed with status ${response.status}.`);
}

function parseLastPage(linkHeader: string | null): number | null {
	if (!linkHeader) {
		return null;
	}

	const lastMatch = linkHeader.match(
		/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/i,
	);
	if (lastMatch) {
		return Number(lastMatch[1]);
	}

	const nextMatch = linkHeader.match(
		/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="next"/i,
	);
	if (nextMatch) {
		return Number(nextMatch[1]);
	}

	return null;
}

export async function fetchStarredRepositoryCount(
	config: RuntimeConfig,
): Promise<number> {
	const headers = buildHeaders(config.githubToken);
	const response = await fetch(buildStarredUrl(config, 1, 1), { headers });

	await ensureGitHubResponse(response, config.username);

	const pageItems = (await response.json()) as GitHubStarResponse[];
	const lastPage = parseLastPage(response.headers.get("link"));

	if (lastPage !== null) {
		return lastPage;
	}

	return pageItems.length;
}

export async function fetchStarredRepositories(
	config: RuntimeConfig,
): Promise<StarRecord[]> {
	const headers = buildHeaders(config.githubToken);
	const items: StarRecord[] = [];

	for (let page = 1; ; page += 1) {
		const response = await fetch(buildStarredUrl(config, page, 100), {
			headers,
		});

		await ensureGitHubResponse(response, config.username);

		const pageItems = (await response.json()) as GitHubStarResponse[];
		items.push(...pageItems.map(normalizeRepo));

		if (pageItems.length < 100) {
			break;
		}
	}

	return items;
}

export async function fetchRepositoryReadme(
	config: RuntimeConfig,
	fullName: string,
): Promise<string | null> {
	const response = await fetch(buildReadmeUrl(config, fullName), {
		headers: buildHeaders(config.githubToken, GITHUB_README_ACCEPT),
	});

	if (response.ok) {
		const readme = (await response.text()).trim();
		return readme || null;
	}

	if (response.status === 404) {
		return null;
	}

	if (response.status === 403) {
		await ensureGitHubResponse(response, config.username);
	}

	return null;
}
