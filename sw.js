/* Easy Budget — офлайн-кэш оболочки приложения. Данные идут в облако напрямую, не кэшируются здесь. */
var CACHE = "easy-budget-v3";
var SHELL = ["./", "index.html", "styles.css", "config.js", "engine.js", "shared.js", "cash.js", "importer.js", "charts.js", "store.js", "app.js",
  "vendor/supabase.min.js", "vendor/xlsx.full.min.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
// сначала сеть (чтобы обновления приходили сразу), без сети — кэш
self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r;
  }).catch(function () { return caches.match(e.request).then(function (m) { return m || caches.match("index.html"); }); }));
});
