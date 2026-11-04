const CACHE = "zhi-resident-shell-v1";
const SHELL = [
  "./zhi-resident.html",
  "./zhi-resident.js",
  "./zhi-universe-client.js",
  "./zhi-resident.webmanifest",
  "./zhi-resident-icon.svg"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("zhi-resident-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Never cache Supabase/API traffic, authenticated chat data, or cross-origin requests.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/functions/") || url.pathname.includes("/rest/") || url.pathname.includes("/auth/")) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && (request.mode === "navigate" || SHELL.some(path => url.pathname.endsWith(path.replace("./", ""))))) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") return (await caches.match("./zhi-resident.html")) || Response.error();
    return Response.error();
  }));
});
