/* Easy Budget — офлайн-кэш оболочки приложения. Данные идут в облако напрямую, не кэшируются здесь. */
var CACHE = "easy-budget-v5";
var SHELL = ["./", "index.html", "styles.css", "config.js", "engine.js", "shared.js", "cash.js", "importer.js", "backup.js", "charts.js", "store.js", "push.js", "ui/core.js", "ui/home.js", "ui/cash.js", "ui/shared.js", "ui/help.js", "ui/plan.js", "ui/analysis.js", "ui/settings.js", "app.js",
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

// напоминание о сверке: показать уведомление и открыть приложение по нажатию
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Easy Budget", {
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: "easy-budget-recon", data: { url: d.url || "./#recon" },
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || "./#recon", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { var c = list[i]; if (c.url.indexOf(self.registration.scope) === 0 && "focus" in c) return c.focus().then(function (w) { return w && w.navigate ? w.navigate(url).catch(function () { return w; }) : w; }); }
    return self.clients.openWindow(url);
  }));
});
