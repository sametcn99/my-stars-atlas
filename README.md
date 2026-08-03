# My Stars

A generated catalog of starred GitHub repositories, grouped into stable categories.

Last updated: `2026-08-03T06:24:41.656Z`

## About This Project

This repository generates a curated, searchable catalog from a GitHub account's starred repositories. It combines a data
pipeline, deterministic categorization rules, chunked JSON exports, and a static frontend so the result can be published
on GitHub Pages without a server runtime.

The project is useful if you want to:

- publish your starred repositories as a clean public directory,
- keep repository metadata and categories in version control,
- customize how projects are grouped with your own rules and overrides,
- reuse the structure for your own profile by forking or cloning the repository.

## Overview

- Total starred repositories: **950**
- Categories in use: **24**
- Newly detected this run: **7**
- Removed this run: **1**
- Metadata/category updates: **14**

## How It Works

The generator fetches starred repositories for `@sametcn99`, classifies each repository with stable rule-based
categories, writes the results into chunked files under `dist/data/`, and rebuilds this README together with the static
site
assets. The frontend then reads the generated catalog and chunk files to provide filtering, search, sorting, and
progressive loading in the browser. The main project-level settings now live in `config/config.json`, while
classification behavior stays in `config/categories.json` and `config/overrides.json`.

## Detailed Architecture Diagrams

The project is easiest to understand as six connected layers: orchestration, refresh decisions, classification,
artifact generation, browser runtime, and automation. The diagrams below map each layer to the actual source files.

### Deterministic Classification Engine

```mermaid
flowchart TD
Repo["StarRecord"] --> Override{"Explicit override match?\nconfig/overrides.json"}
Override -- Yes --> OverrideWin["Return override category\nsource=override"]
Override -- No --> Prepare["Build normalized search index\nname, owner, description, homepage, topics, language"]

Prepare --> Evaluate["Evaluate every category\nfrom config/categories.json"]
Evaluate --> Signals["Score signals\nstrong keywords, keywords, language, shape hints"]
Signals --> Rank["Rank candidates by score, signals, priority"]
Rank --> Threshold{"Best category passes\nminimum score rules?"}

Threshold -- No --> Default["Use defaultCategory\nsource=default"]
Threshold -- Yes --> Winner["Use winning category\nsource=rules"]

Winner --> Confidence["Compute confidence\nscore + signal count + margin over runner-up"]
Default --> Confidence
OverrideWin --> Final["ClassifiedStarRecord"]
Confidence --> Final

Final --> Fallback{"Confidence below threshold\nand README fallback enabled?"}
Fallback -- No --> Persist["Keep current classification"]
Fallback -- Yes --> ReadmeLookup["Fetch repository README"]
ReadmeLookup --> Reindex["Augment index with README text"]
Reindex --> Reevaluate["Re-run category evaluation\nfor low-confidence subset only"]
Reevaluate --> Persist
```

Classification is intentionally deterministic. The taxonomy lives in configuration, not hardcoded per repository.
Overrides win first, then rule-based scoring tries to find the strongest category. Only low-confidence items may trigger
extra README fetches, which keeps the fallback precise and avoids paying that cost for the full dataset.

## Use This Project

You can use this project in three common ways:

### 1. Fork It

Fork the repository if you want to keep the existing setup and adapt it for your own GitHub account. After forking,
edit `config/config.json` for your own username, README copy, and site SEO settings, then add a GitHub token before
running the generator on your fork.

### 2. Clone It

Clone the repository if you want full local control or if you plan to customize the data model, categorization rules,
UI, or deployment flow.

```bash
git clone <your-fork-or-copy-url>
cd my-stars-atlas
bun install
```

The easiest setup flow is:

```bash
bun run update
```

Before your first run, update `config/config.json`:

- `github.username`: the GitHub account whose stars will be indexed.
- `readme.title` and `readme.description`: the generated README heading and intro text.
- `site.title`, `site.heroDescription`, and `site.profileLinkLabel`: the visible site branding.
- `site.seo.description`, `site.seo.ogDescription`, `site.seo.twitterDescription`: editable share text.
- `site.manifest.shortName`, `site.manifest.description`: editable PWA labels.

Additional config files:

- `config/categories.json`: deterministic category definitions and priorities.
- `config/overrides.json`: exclusions and manual category overrides.

Optional environment variables:

- `GITHUB_TOKEN` or `GH_TOKEN`: recommended to avoid low unauthenticated API limits.
- `FORCE_REFRESH=true`: forces a full refetch even if the cached count has not changed.

If you want to preview the generated site locally after a run, use `bun run preview` and open
`http://localhost:4173`.

### 3. Contribute To It

If you want to improve the project itself, contributions are welcome. Useful contribution areas include:

- better category definitions and override rules,
- UI and accessibility improvements for the static site,
- GitHub API efficiency and sync logic,
- documentation, automation, and deployment workflows.

## Contributing

If you plan to contribute, use a normal fork-and-pull-request workflow:

1. Fork the repository.
2. Create a feature branch for your change.
3. Run the generator or relevant checks locally.
4. Open a pull request with a clear explanation of the change and its impact.

Small fixes are fine, but detailed pull requests are especially helpful when they include rationale for taxonomy
changes, UX adjustments, or sync behavior updates.

## Recent Stars

- [matrix-org/matrix.to](https://github.com/matrix-org/matrix.to) - A simple stateless privacy-protecting URL redirecting service for Matrix
- [libredirect/browser_extension](https://github.com/libredirect/browser_extension) - A browser extension that redirects popular sites to alternative privacy friendly frontends
- [reactos/reactos](https://github.com/reactos/reactos) - A free Windows-compatible Operating System
- [dbcodeio/public](https://github.com/dbcodeio/public) - The database IDE for VS Code, Cursor, and Windsurf. 80+ databases: Postgres, MySQL, SQL Server, MongoDB, Snowflake, and more. AI queries, ER diagrams, SQL notebooks.
- [PlasmoHQ/plasmo](https://github.com/PlasmoHQ/plasmo) - 🧩 The Browser Extension Framework
- [Automattic/docspress](https://github.com/Automattic/docspress) - Publish Markdown documentation from GitHub to native WordPress Pages and Gutenberg blocks.
- [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search) - The job search that runs on your machine. AI job application framework built on Claude Code: evaluate postings, tailor CVs, write cover letters, prep interviews. Fork it and own it.
- [mrbesher/bertfinetuner](https://github.com/mrbesher/bertfinetuner)
- [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat) - Enhanced ChatGPT Clone: Features Agents, MCP, Skills, DeepSeek, Anthropic, AWS, OpenAI, Responses API, Azure, Groq, o1, GPT-5, Mistral, OpenRouter, Vertex AI, Gemini, Artifacts, AI model switching, message search, Code Interpreter, langchain, DALL-E-3, OpenAPI Actions, Functions, Secure Multi-User Auth, Presets, open-source for self-hosting. Active
- [winsiderss/systeminformer](https://github.com/winsiderss/systeminformer) - A free, powerful, multi-purpose tool that helps you monitor system resources, debug software and detect malware. Brought to you by Winsider Seminars & Solutions, Inc. @ https://windows-internals.com
- [safing/portmaster](https://github.com/safing/portmaster) - 🏔 Love Freedom - ❌ Block Mass Surveillance
- [minio/minio](https://github.com/minio/minio) - MinIO is a high-performance, S3 compatible object store, open sourced under GNU AGPLv3 license.
