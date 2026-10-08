/* Easy Budget — push-уведомления о сверке (только облачная версия).
   Подписка телефона хранится в push_subscriptions; присылает их функция push-reminders по расписанию. */
(function (root) {
  "use strict";
  var cfg = root.EASY_BUDGET_CONFIG || {};
  var FN = cfg.SUPABASE_URL ? cfg.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/push-reminders" : null;

  function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function standalone() { return (root.matchMedia && root.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }
  function supported() { return !!FN && "serviceWorker" in navigator && "PushManager" in root && "Notification" in root && location.protocol === "https:"; }
  // на iPhone уведомления работают только у приложения, добавленного на экран «Домой»
  function needsInstall() { return isIOS() && !standalone(); }

  function b64ToBytes(b64) {
    var pad = "=".repeat((4 - b64.length % 4) % 4), raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function client() { return root.BudgetStore && root.BudgetStore.client; }
  function headers(extra) { return Object.assign({ apikey: cfg.SUPABASE_ANON_KEY, "Content-Type": "application/json" }, extra || {}); }

  function currentSub() {
    if (!supported()) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration().then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; });
  }
  // состояние на этом устройстве: { supported, needsInstall, permission, on, row }
  function status() {
    var base = { supported: supported(), needsInstall: needsInstall(), permission: "Notification" in root ? Notification.permission : "default", on: false, row: null };
    if (!base.supported) return Promise.resolve(base);
    return currentSub().then(function (sub) {
      if (!sub) return base;
      return client().from("push_subscriptions").select("day,time,tz,enabled").eq("endpoint", sub.endpoint).maybeSingle().then(function (r) {
        base.row = r.data || null; base.on = !!(r.data && r.data.enabled); return base;
      });
    }).catch(function () { return base; });
  }

  function enable(day, time) {
    if (!supported()) return Promise.reject(new Error(needsInstall() ? "Сначала добавь приложение на экран «Домой»" : "Этот браузер не умеет уведомления"));
    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw new Error("Уведомления запрещены. Разреши их в настройках телефона для Easy Budget");
      return Promise.all([navigator.serviceWorker.ready, fetch(FN + "?action=key", { headers: headers() }).then(function (r) { return r.json(); })]);
    }).then(function (x) {
      var reg = x[0], key = x[1] && x[1].key;
      if (!key) throw new Error("Сервер уведомлений не ответил — попробуй позже");
      return reg.pushManager.getSubscription().then(function (old) {
        return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      });
    }).then(function (sub) {
      var j = sub.toJSON();
      return client().from("push_subscriptions").upsert({
        endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, day: day, time: time,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid", enabled: true, updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint" }).then(function (r) { if (r.error) throw r.error; return true; });
    });
  }

  function disable() {
    return currentSub().then(function (sub) {
      if (!sub) return true;
      var ep = sub.endpoint;
      return sub.unsubscribe().catch(function () {}).then(function () { return client().from("push_subscriptions").delete().eq("endpoint", ep); }).then(function () { return true; });
    });
  }

  function test() {
    return client().auth.getSession().then(function (r) {
      var t = r.data && r.data.session && r.data.session.access_token;
      if (!t) throw new Error("Нужно войти");
      return fetch(FN, { method: "POST", headers: headers({ Authorization: "Bearer " + t }), body: JSON.stringify({ action: "test" }) }).then(function (res) { return res.json(); });
    });
  }

  root.BudgetPush = { supported: supported, needsInstall: needsInstall, isIOS: isIOS, standalone: standalone, status: status, enable: enable, disable: disable, test: test };
})(window);
