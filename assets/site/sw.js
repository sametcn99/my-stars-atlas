const SHELL_CACHE = "stars-shell-v3";
const DATA_CACHE = "stars-data-v3";
const SHELL_ASSETS = [
	"./",
	"./index.html",
	"./styles.css",
	"./app.js",
	"./manifest.json",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
	);
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => ![SHELL_CACHE, DATA_CACHE].includes(key))
						.map((key) => caches.delete(key)),
				),
			),
	);
	self.clients.claim();
});

async function staleWhileRevalidate(request, cacheName) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	const networkPromise = fetch(request)
		.then((response) => {
			if (response.ok) {
				cache.put(request, response.clone());
			}

			return response;
		})
		.catch(() => cached);

	return cached ?? networkPromise;
}

async function networkFirst(request, cacheName, fallbackUrl) {
	const cache = await caches.open(cacheName);

	try {
		const response = await fetch(request);
		if (response.ok) {
			cache.put(request, response.clone());
		}

		return response;
	} catch {
		return (await cache.match(request)) ?? caches.match(fallbackUrl);
	}
}

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") {
		return;
	}

	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) {
		return;
	}

	if (event.request.mode === "navigate") {
		event.respondWith(networkFirst(event.request, SHELL_CACHE, "./index.html"));
		return;
	}

	if (url.pathname.includes("/data/")) {
		event.respondWith(staleWhileRevalidate(event.request, DATA_CACHE));
		return;
	}

	event.respondWith(networkFirst(event.request, SHELL_CACHE, "./index.html"));
});
