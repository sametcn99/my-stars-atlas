# My Stars

A generated catalog of starred GitHub repositories, grouped into stable categories.

Last updated: `2026-03-19T05:42:56.513Z`

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

- Total starred repositories: **745**
- Categories in use: **24**
- Newly detected this run: **3**
- Removed this run: **0**
- Metadata/category updates: **742**

## How It Works

The generator fetches starred repositories for `@sametcn99`, classifies each repository with stable rule-based
categories, writes the results into chunked files under `dist/data/`, and rebuilds this README together with the static site
assets. The frontend then reads the generated catalog and chunk files to provide filtering, search, sorting, and
progressive loading in the browser. The main project-level settings now live in `config/config.json`, while
classification behavior stays in `config/categories.json` and `config/overrides.json`.

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

If you want to preview the generated site locally after a run, use `bun run preview` and open `http://localhost:4173`.

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

- [Megabit/Blazorise](https://github.com/Megabit/Blazorise) - Blazorise is a component library built on top of Blazor with support for CSS frameworks like Bootstrap, Tailwind, Bulma, AntDesign, and Material.
- [MudBlazor/MudBlazor](https://github.com/MudBlazor/MudBlazor) - Blazor Component Library based on Material Design principles with an emphasis on ease of use and extensibility
- [TamerSarioglu/Resume-Architect](https://github.com/TamerSarioglu/Resume-Architect)
- [coollabsio/serverlesshorrors.com](https://github.com/coollabsio/serverlesshorrors.com)
- [techwithanirudh/coolify-tweaks](https://github.com/techwithanirudh/coolify-tweaks) - A userstyle that enhances Coolify's UI by applying opinionated tweaks, spacing, colors, and layout fixes, to make the UI more polished and user-friendly.
- [Dokploy/dokploy](https://github.com/Dokploy/dokploy) - Open Source Alternative to Vercel, Netlify and Heroku.
- [Dokploy/mcp](https://github.com/Dokploy/mcp)
- [Elagoht/cvgo](https://github.com/Elagoht/cvgo) - Create your CV with HTML templating with Go!
- [abhigyanpatwari/GitNexus](https://github.com/abhigyanpatwari/GitNexus) - GitNexus: The Zero-Server Code Intelligence Engine -       GitNexus is a client-side knowledge graph creator that runs entirely in your browser. Drop in a GitHub repo or ZIP file, and get an interactive knowledge graph wit a built in Graph RAG Agent. Perfect for code exploration
- [nitrojs/nitro](https://github.com/nitrojs/nitro) - Next Generation Server Toolkit. Create web servers with everything you need and deploy them wherever you prefer.
- [sametcn99/my-stars-atlas](https://github.com/sametcn99/my-stars-atlas) - A generated catalog of starred GitHub repositories, grouped into stable categories.
- [karpathy/jobs](https://github.com/karpathy/jobs) - A research tool for visually exploring Bureau of Labor Statistics Occupational Outlook Handbook data. This is not a report, a paper, or a serious economic publication — it is a development tool for exploring BLS data visually.
