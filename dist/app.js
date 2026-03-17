const ALL_CATEGORY = "all";
const ALL_LANGUAGE = "all";
const ALL_LICENSE = "all";
const NO_LANGUAGE = "__no_language__";
const NO_LICENSE = "__no_license__";
const INITIAL_CHUNKS = 2;
const SEARCH_DEBOUNCE_MS = 300;

const state = {
	manifest: null,
	records: [],
	recordIds: new Set(),
	loadedChunks: new Set(),
	filters: {
		query: "",
		category: ALL_CATEGORY,
		language: ALL_LANGUAGE,
		license: ALL_LICENSE,
		sort: "starred-desc",
		visibility: "all",
	},
	isLoadingChunk: false,
	isLoadingAll: false,
	error: "",
};

const elements = {
	pageTitle: document.querySelector("#page-title"),
	pageDescription: document.querySelector("#page-description"),
	loadedCount: document.querySelector("#loaded-count"),
	totalCount: document.querySelector("#total-count"),
	generatedAt: document.querySelector("#generated-at"),
	statusBanner: document.querySelector("#status-banner"),
	searchInput: document.querySelector("#search-input"),
	sortSelect: document.querySelector("#sort-select"),
	visibilitySelect: document.querySelector("#visibility-select"),
	languageSelect: document.querySelector("#language-select"),
	licenseSelect: document.querySelector("#license-select"),
	activeSummary: document.querySelector("#active-summary"),
	categoryPills: document.querySelector("#category-pills"),
	sectionsRoot: document.querySelector("#sections-root"),
	emptyState: document.querySelector("#empty-state"),
	loadSentinel: document.querySelector("#load-sentinel"),
};

let sentinelObserver;
const enhancedSelects = new Map();
let enhancedSelectEventsBound = false;

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function debounce(callback, wait) {
	let timeoutId = null;

	return (...args) => {
		window.clearTimeout(timeoutId);
		timeoutId = window.setTimeout(() => callback(...args), wait);
	};
}

function formatChunkFile(index) {
	return `./data/stars-${String(index).padStart(3, "0")}.json`;
}

function formatDateTime(value) {
	if (!value) {
		return "Unknown";
	}

	return new Date(value).toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function formatRelativeDate(value) {
	if (!value) {
		return "unknown";
	}

	const diff = Date.now() - new Date(value).getTime();
	const minutes = Math.round(diff / 60000);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}

	const hours = Math.round(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}

	const days = Math.round(hours / 24);
	if (days < 30) {
		return `${days}d ago`;
	}

	const months = Math.round(days / 30);
	return `${months}mo ago`;
}

function formatNumber(value) {
	return new Intl.NumberFormat().format(value);
}

function getFilterValue(recordValue, emptyValue) {
	return recordValue ?? emptyValue;
}

function matchesRecordFilters(record, excludedFilters = []) {
	const excluded = new Set(excludedFilters);
	const query = state.filters.query.trim().toLowerCase();

	if (!excluded.has("category") && state.filters.category !== ALL_CATEGORY) {
		if (record.category !== state.filters.category) {
			return false;
		}
	}

	if (!excluded.has("visibility")) {
		if (state.filters.visibility === "active" && record.archived) {
			return false;
		}

		if (state.filters.visibility === "archived" && !record.archived) {
			return false;
		}
	}

	if (!excluded.has("language") && state.filters.language !== ALL_LANGUAGE) {
		if (
			getFilterValue(record.language, NO_LANGUAGE) !== state.filters.language
		) {
			return false;
		}
	}

	if (!excluded.has("license") && state.filters.license !== ALL_LICENSE) {
		if (getFilterValue(record.license, NO_LICENSE) !== state.filters.license) {
			return false;
		}
	}

	if (!excluded.has("query") && query) {
		const haystack = [
			record.fullName,
			record.description ?? "",
			record.language ?? "",
			record.categoryTitle,
			record.license ?? "",
			record.topics.join(" "),
		]
			.join(" ")
			.toLowerCase();

		if (!haystack.includes(query)) {
			return false;
		}
	}

	return true;
}

function buildCountedOptions(records, getValue, getLabel, allValue, allLabel) {
	const counts = new Map();

	for (const record of records) {
		const value = getValue(record);
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}

	const options = Array.from(counts.entries())
		.sort((left, right) => left[0].localeCompare(right[0]))
		.map(([value, count]) => ({
			value,
			label: `${getLabel(value)} (${formatNumber(count)})`,
		}));

	return [{ value: allValue, label: allLabel }, ...options];
}

function preserveSelectedOption(options, currentValue, allValue, getLabel) {
	if (
		currentValue === allValue ||
		options.some((option) => option.value === currentValue)
	) {
		return options;
	}

	return [
		...options,
		{
			value: currentValue,
			label: `${getLabel(currentValue)} (${formatNumber(0)})`,
		},
	].sort((left, right) => {
		if (left.value === allValue) {
			return -1;
		}

		if (right.value === allValue) {
			return 1;
		}

		return left.value.localeCompare(right.value);
	});
}

function updateSelectOptions(select, options, currentValue) {
	select.replaceChildren(
		...options.map((option) => {
			const element = document.createElement("option");
			element.value = option.value;
			element.textContent = option.label;
			return element;
		}),
	);

	const nextValue = options.some((option) => option.value === currentValue)
		? currentValue
		: options[0]?.value;

	if (nextValue) {
		select.value = nextValue;
	}

	const enhanced = enhancedSelects.get(select.id);
	if (enhanced) {
		enhanced.rebuildOptions();
		enhanced.syncFromSelect();
	}

	return nextValue;
}

function closeEnhancedSelects(exceptId = null) {
	for (const enhanced of enhancedSelects.values()) {
		const shouldStayOpen = exceptId && enhanced.select.id === exceptId;
		enhanced.shell.classList.toggle("open", shouldStayOpen);
		enhanced.trigger.setAttribute(
			"aria-expanded",
			shouldStayOpen ? "true" : "false",
		);
	}
}

function enhanceSelect(select) {
	if (!select) {
		return null;
	}

	const existing = enhancedSelects.get(select.id);
	if (existing) {
		return existing;
	}

	const labelText =
		document.querySelector(`label[for="${select.id}"]`)?.textContent?.trim() ??
		select.getAttribute("aria-label") ??
		select.name ??
		select.id;

	const shell = document.createElement("div");
	shell.className = "atlas-select-shell";

	const trigger = document.createElement("button");
	trigger.type = "button";
	trigger.className = "atlas-select-trigger";
	trigger.setAttribute("aria-haspopup", "listbox");
	trigger.setAttribute("aria-expanded", "false");
	trigger.setAttribute("aria-label", labelText);

	const triggerLabel = document.createElement("span");
	triggerLabel.className = "atlas-select-trigger-label";

	const triggerIcon = document.createElement("span");
	triggerIcon.className = "atlas-select-trigger-icon";
	triggerIcon.innerHTML =
		"<svg viewBox='0 0 16 16' aria-hidden='true' fill='none'><path d='M4 6.5 8 10.5 12 6.5' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>";

	const menu = document.createElement("div");
	menu.className = "atlas-select-menu";
	menu.setAttribute("role", "listbox");
	menu.setAttribute("aria-label", labelText);

	const enhanced = {
		select,
		shell,
		trigger,
		menu,
		optionButtons: [],
		syncFromSelect: () => {
			const selectedOption = select.selectedOptions[0];
			triggerLabel.textContent = selectedOption?.textContent ?? "Select";

			for (const optionButton of enhanced.optionButtons) {
				const isSelected = optionButton.dataset.value === select.value;
				optionButton.classList.toggle("is-selected", isSelected);
				optionButton.setAttribute(
					"aria-selected",
					isSelected ? "true" : "false",
				);
			}
		},
		rebuildOptions: () => {
			menu.replaceChildren();
			enhanced.optionButtons = [];

			for (const option of select.options) {
				const optionButton = document.createElement("button");
				optionButton.type = "button";
				optionButton.className = "atlas-select-option";
				optionButton.dataset.value = option.value;
				optionButton.setAttribute("role", "option");
				optionButton.textContent = option.textContent;

				optionButton.addEventListener("click", () => {
					if (select.value !== option.value) {
						select.value = option.value;
						select.dispatchEvent(new Event("change", { bubbles: true }));
					}

					closeEnhancedSelects();
					trigger.focus();
				});

				optionButton.addEventListener("keydown", (event) => {
					const currentIndex = enhanced.optionButtons.indexOf(optionButton);
					if (event.key === "ArrowDown") {
						event.preventDefault();
						enhanced.optionButtons[
							(currentIndex + 1) % enhanced.optionButtons.length
						].focus();
					}

					if (event.key === "ArrowUp") {
						event.preventDefault();
						enhanced.optionButtons[
							(currentIndex - 1 + enhanced.optionButtons.length) %
								enhanced.optionButtons.length
						].focus();
					}

					if (event.key === "Escape") {
						event.preventDefault();
						closeEnhancedSelects();
						trigger.focus();
					}
				});

				enhanced.optionButtons.push(optionButton);
				menu.append(optionButton);
			}
		},
	};

	trigger.append(triggerLabel, triggerIcon);
	shell.append(trigger, menu);
	select.insertAdjacentElement("afterend", shell);
	select.classList.add("is-enhanced");
	select.dataset.enhanced = "true";
	enhanced.rebuildOptions();

	trigger.addEventListener("click", () => {
		const willOpen = !shell.classList.contains("open");
		closeEnhancedSelects(willOpen ? select.id : null);
		if (willOpen) {
			const selectedButton = enhanced.optionButtons.find(
				(optionButton) => optionButton.dataset.value === select.value,
			);
			window.setTimeout(() => selectedButton?.focus(), 0);
		}
	});

	trigger.addEventListener("keydown", (event) => {
		if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
			event.preventDefault();
			if (!shell.classList.contains("open")) {
				closeEnhancedSelects(select.id);
			}
			const selectedButton = enhanced.optionButtons.find(
				(optionButton) => optionButton.dataset.value === select.value,
			);
			window.setTimeout(() => selectedButton?.focus(), 0);
		}

		if (event.key === "Escape") {
			closeEnhancedSelects();
		}
	});

	select.addEventListener("change", enhanced.syncFromSelect);
	enhanced.syncFromSelect();
	enhancedSelects.set(select.id, enhanced);
	return enhanced;
}

function setupEnhancedSelects() {
	enhanceSelect(elements.sortSelect);
	enhanceSelect(elements.visibilitySelect);
	enhanceSelect(elements.languageSelect);
	enhanceSelect(elements.licenseSelect);

	if (!enhancedSelectEventsBound) {
		document.addEventListener("click", (event) => {
			if (
				Array.from(enhancedSelects.values()).some(({ shell }) =>
					shell.contains(event.target),
				)
			) {
				return;
			}

			closeEnhancedSelects();
		});

		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				closeEnhancedSelects();
			}
		});

		enhancedSelectEventsBound = true;
	}
}

function updateSeo(manifest) {
	document.title = `${manifest.title} Atlas`;

	const description = `${manifest.description} Explore ${formatNumber(manifest.total)} repositories across ${manifest.categories.length} categories.`;
	document
		.querySelector('meta[name="description"]')
		.setAttribute("content", description);
	document
		.querySelector('meta[property="og:title"]')
		.setAttribute("content", `${manifest.title} Atlas`);
	document
		.querySelector('meta[property="og:description"]')
		.setAttribute("content", description);
	document
		.querySelector('meta[name="twitter:title"]')
		.setAttribute("content", `${manifest.title} Atlas`);
	document
		.querySelector('meta[name="twitter:description"]')
		.setAttribute("content", description);
	document
		.querySelector('meta[property="og:url"]')
		.setAttribute("content", window.location.href);
}

function setStatus(message, tone = "idle") {
	if (!elements.statusBanner) {
		return;
	}

	elements.statusBanner.textContent = message;
	elements.statusBanner.classList.remove("busy", "error");

	if (tone === "busy") {
		elements.statusBanner.classList.add("busy");
	}

	if (tone === "error") {
		elements.statusBanner.classList.add("error");
	}
}

function updateHeaderStats() {
	const manifest = state.manifest;
	if (!manifest) {
		return;
	}

	if (elements.pageTitle) {
		elements.pageTitle.textContent = `${manifest.title} Atlas`;
	}

	if (elements.pageDescription) {
		elements.pageDescription.textContent = manifest.description;
	}

	if (elements.loadedCount) {
		elements.loadedCount.textContent = formatNumber(state.records.length);
	}

	if (elements.totalCount) {
		elements.totalCount.textContent = formatNumber(manifest.total);
	}

	if (elements.generatedAt) {
		elements.generatedAt.textContent = formatDateTime(manifest.generatedAt);
	}
}

function getFilteredRecords(excludedFilters = []) {
	return state.records.filter((record) =>
		matchesRecordFilters(record, excludedFilters),
	);
}

function renderDynamicFilters() {
	const languageOptions = preserveSelectedOption(
		buildCountedOptions(
			state.records.filter((record) =>
				matchesRecordFilters(record, ["language"]),
			),
			(record) => getFilterValue(record.language, NO_LANGUAGE),
			(value) => (value === NO_LANGUAGE ? "No language" : value),
			ALL_LANGUAGE,
			"All languages",
		),
		state.filters.language,
		ALL_LANGUAGE,
		(value) => (value === NO_LANGUAGE ? "No language" : value),
	);

	const licenseOptions = preserveSelectedOption(
		buildCountedOptions(
			state.records.filter((record) =>
				matchesRecordFilters(record, ["license"]),
			),
			(record) => getFilterValue(record.license, NO_LICENSE),
			(value) => (value === NO_LICENSE ? "No license" : value),
			ALL_LICENSE,
			"All licenses",
		),
		state.filters.license,
		ALL_LICENSE,
		(value) => (value === NO_LICENSE ? "No license" : value),
	);

	state.filters.language = updateSelectOptions(
		elements.languageSelect,
		languageOptions,
		state.filters.language,
	);
	state.filters.license = updateSelectOptions(
		elements.licenseSelect,
		licenseOptions,
		state.filters.license,
	);
}

function sortRecords(records) {
	const sorted = [...records];

	sorted.sort((left, right) => {
		switch (state.filters.sort) {
			case "stars-desc":
				return (
					right.stargazersCount - left.stargazersCount ||
					left.fullName.localeCompare(right.fullName)
				);
			case "updated-desc":
				return (
					(right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") ||
					left.fullName.localeCompare(right.fullName)
				);
			case "name-asc":
				return left.fullName.localeCompare(right.fullName);
			default:
				return (
					(right.starredAt ?? "").localeCompare(left.starredAt ?? "") ||
					left.fullName.localeCompare(right.fullName)
				);
		}
	});

	return sorted;
}

function groupByCategory(records) {
	const manifest = state.manifest;
	const groups = new Map(
		manifest.categories.map((category) => [category.id, []]),
	);

	for (const record of records) {
		if (!groups.has(record.category)) {
			groups.set(record.category, []);
		}

		groups.get(record.category).push(record);
	}

	return manifest.categories
		.filter(
			(category) =>
				state.filters.category === ALL_CATEGORY ||
				state.filters.category === category.id,
		)
		.map((category) => ({
			...category,
			items: groups.get(category.id) ?? [],
		}))
		.filter((category) => category.items.length > 0);
}

function renderCategoryPills(baseRecords) {
	const manifest = state.manifest;
	const counts = new Map();

	for (const record of baseRecords) {
		counts.set(record.category, (counts.get(record.category) ?? 0) + 1);
	}

	const totalVisible = baseRecords.length;
	const pills = [
		{
			id: ALL_CATEGORY,
			title: "All categories",
			count: totalVisible,
		},
		...manifest.categories.map((category) => ({
			id: category.id,
			title: category.title,
			count: counts.get(category.id) ?? 0,
		})),
	];

	elements.categoryPills.innerHTML = pills
		.map(
			(category) => `
        <button
          class="category-pill ${state.filters.category === category.id ? "active" : ""}"
          type="button"
          data-category="${escapeHtml(category.id)}"
        >
          <span>${escapeHtml(category.title)}</span>
          <span class="count-pill">${formatNumber(category.count)}</span>
        </button>
      `,
		)
		.join("");
}

function renderRepoCard(record) {
	const topics = record.topics.slice(0, 4);
	const metaBadges = [
		record.language
			? `<span class="meta-pill language">${escapeHtml(record.language)}</span>`
			: "",
		record.license
			? `<span class="meta-pill">${escapeHtml(record.license)}</span>`
			: "",
		record.fork ? '<span class="meta-pill">Fork</span>' : "",
		record.archived ? '<span class="meta-pill archived">Archived</span>' : "",
	]
		.filter(Boolean)
		.join("");

	return `
    <article class="repo-card">
      <div>
        <a class="repo-anchor" href="${escapeHtml(record.url)}" target="_blank" rel="noreferrer">
          <h4 class="repo-name">${escapeHtml(record.fullName)}</h4>
        </a>
        <p class="repo-description">${escapeHtml(record.description ?? "No description provided.")}</p>
      </div>

      <div class="repo-badges">${metaBadges}</div>

      <div class="repo-topics">
        ${topics.map((topic) => `<span class="topic-pill">${escapeHtml(topic)}</span>`).join("")}
      </div>

      <div class="repo-footer">
        <div class="repo-meta">
          <span>★ ${formatNumber(record.stargazersCount)}</span>
          <span>Starred ${escapeHtml(formatRelativeDate(record.starredAt))}</span>
          <span>Updated ${escapeHtml(formatRelativeDate(record.updatedAt))}</span>
        </div>
      </div>
    </article>
  `;
}

function renderSections() {
	if (!state.manifest) {
		return;
	}

	renderDynamicFilters();
	const baseRecords = getFilteredRecords();
	const categoryRecords = getFilteredRecords(["category"]);
	renderCategoryPills(categoryRecords);

	const displayRecords = sortRecords(baseRecords);

	const grouped = groupByCategory(displayRecords);
	const activeFilters = [];
	if (state.filters.category !== ALL_CATEGORY) {
		activeFilters.push(`category: ${state.filters.category}`);
	}
	if (state.filters.language !== ALL_LANGUAGE) {
		activeFilters.push(
			`language: ${
				state.filters.language === NO_LANGUAGE
					? "No language"
					: state.filters.language
			}`,
		);
	}
	if (state.filters.license !== ALL_LICENSE) {
		activeFilters.push(
			`license: ${
				state.filters.license === NO_LICENSE
					? "No license"
					: state.filters.license
			}`,
		);
	}
	const stillLoading =
		state.filters.query && state.loadedChunks.size < state.manifest.chunkCount;

	elements.activeSummary.textContent =
		`${formatNumber(displayRecords.length)} repositories shown${activeFilters.length ? ` with ${activeFilters.join(", ")}` : " across all categories"}. ${stillLoading ? "Background search is loading the remaining chunks." : ""}`.trim();

	if (grouped.length === 0) {
		elements.sectionsRoot.innerHTML = "";
		elements.emptyState.classList.remove("d-none");
		return;
	}

	elements.emptyState.classList.add("d-none");
	elements.sectionsRoot.innerHTML = grouped
		.map(
			(category, index) => `
        <section class="category-section" id="category-${escapeHtml(category.id)}" style="animation-delay: ${index * 40}ms">
          <div class="category-head">
            <div class="category-copy">
              <p class="eyebrow">${escapeHtml(category.id)}</p>
              <h3>${escapeHtml(category.title)}</h3>
              <p class="category-description">${escapeHtml(category.description)}</p>
            </div>
            <span class="count-pill">${formatNumber(category.items.length)} repos</span>
          </div>
          <div class="repo-grid">
            ${category.items.map((record) => renderRepoCard(record)).join("")}
          </div>
        </section>
      `,
		)
		.join("");
}

function render() {
	updateHeaderStats();
	renderSections();
}

async function fetchJson(path) {
	const response = await fetch(path, {
		headers: { Accept: "application/json" },
	});

	if (!response.ok) {
		throw new Error(
			`Request failed for ${path} with status ${response.status}.`,
		);
	}

	return response.json();
}

function getNextChunkIndex() {
	if (!state.manifest) {
		return null;
	}

	for (let index = 1; index <= state.manifest.chunkCount; index += 1) {
		if (!state.loadedChunks.has(index)) {
			return index;
		}
	}

	return null;
}

async function loadChunk(index) {
	if (state.loadedChunks.has(index)) {
		return;
	}

	state.isLoadingChunk = true;
	render();

	const chunk = await fetchJson(formatChunkFile(index));
	for (const record of chunk.items) {
		if (state.recordIds.has(record.id)) {
			continue;
		}

		state.recordIds.add(record.id);
		state.records.push(record);
	}

	state.loadedChunks.add(index);
	state.isLoadingChunk = false;
	render();
}

async function loadNextChunks(count = 1) {
	for (let step = 0; step < count; step += 1) {
		const nextIndex = getNextChunkIndex();
		if (!nextIndex) {
			break;
		}

		await loadChunk(nextIndex);
	}
}

async function loadRemainingChunksInBackground() {
	if (!state.manifest || state.isLoadingAll) {
		return;
	}

	state.isLoadingAll = true;
	setStatus(
		"Search widened the scope. Loading the remaining chunks in the background.",
		"busy",
	);
	render();

	try {
		while (getNextChunkIndex()) {
			await loadNextChunks(1);
		}

		if (!state.error) {
			setStatus("All chunks are now loaded locally in the browser cache.");
		}
	} catch (error) {
		state.error =
			error instanceof Error ? error.message : "Unknown loading error.";
		setStatus(state.error, "error");
	} finally {
		state.isLoadingAll = false;
		render();
	}
}

function scheduleBackgroundChunkLoading() {
	const run = () => {
		if (state.loadedChunks.size < state.manifest.chunkCount) {
			void loadRemainingChunksInBackground();
		}
	};

	if ("requestIdleCallback" in window) {
		window.requestIdleCallback(run, { timeout: 1200 });
		return;
	}

	window.setTimeout(run, 250);
}

function attachEvents() {
	setupEnhancedSelects();

	const applySearch = debounce((value) => {
		state.filters.query = value.trim();
		render();

		if (
			state.filters.query &&
			state.loadedChunks.size < state.manifest.chunkCount
		) {
			void loadRemainingChunksInBackground();
		}
	}, SEARCH_DEBOUNCE_MS);

	elements.searchInput.addEventListener("input", (event) => {
		applySearch(event.currentTarget.value);
	});

	elements.sortSelect.addEventListener("change", (event) => {
		state.filters.sort = event.currentTarget.value;
		render();
	});

	elements.visibilitySelect.addEventListener("change", (event) => {
		state.filters.visibility = event.currentTarget.value;
		render();
	});

	elements.languageSelect.addEventListener("change", (event) => {
		state.filters.language = event.currentTarget.value;
		render();
	});

	elements.licenseSelect.addEventListener("change", (event) => {
		state.filters.license = event.currentTarget.value;
		render();
	});

	elements.categoryPills.addEventListener("click", (event) => {
		const button = event.target.closest("[data-category]");
		if (!button) {
			return;
		}

		state.filters.category = button.dataset.category;
		render();
	});

	sentinelObserver = new IntersectionObserver(
		(entries) => {
			const shouldLoad = entries.some((entry) => entry.isIntersecting);
			if (
				!shouldLoad ||
				state.isLoadingAll ||
				state.isLoadingChunk ||
				state.filters.query
			) {
				return;
			}

			void loadNextChunks(1);
		},
		{
			rootMargin: "600px 0px 600px 0px",
		},
	);

	sentinelObserver.observe(elements.loadSentinel);
}
async function init() {
	try {
		setStatus("Loading catalog manifest.", "busy");
		state.manifest = await fetchJson("./data/catalog.json");
		updateSeo(state.manifest);
		updateHeaderStats();
		render();
		attachEvents();

		setStatus(
			`Manifest ready. Fetching the first ${Math.min(INITIAL_CHUNKS, state.manifest.chunkCount)} chunks.`,
			"busy",
		);
		await loadNextChunks(Math.min(INITIAL_CHUNKS, state.manifest.chunkCount));
		setStatus(
			"Initial chunks are loaded. Remaining chunks will continue loading in the background.",
		);
		scheduleBackgroundChunkLoading();
	} catch (error) {
		state.error =
			error instanceof Error ? error.message : "Unknown startup error.";
		setStatus(state.error, "error");
		updateHeaderStats();
	}
}

void init();
