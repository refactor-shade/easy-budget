/* Easy Budget — курсы валют на сегодня (рыночные, раз в день).
   Источник — открытый currency-api (fawazahmed0), без ключа; у ЕЦБ рубля нет с 2022 года.
   Курс в бюджете сам не меняется: он один на весь год и пересчитывает рублёвые счета и строки плана,
   поэтому приложение только предлагает «Поставить», когда сегодняшний курс заметно ушёл. */
(function () {
  "use strict";
  var URLS = [
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.min.json",
    "https://latest.currency-api.pages.dev/v1/currencies/eur.min.json",
  ];
  var KEY = "eb:fx", DRIFT = 0.03; // сдвиг больше 3 % — стоит обновить
  var live = null, pending = null;

  function round(v, d) { var k = Math.pow(10, d); return Math.round(v * k) / k; }
  // ответ источника → { date, RUB, USD, GEL }; null, если ответ странный
  function parse(j) {
    var e = j && j.eur;
    if (!e || !(e.rub > 0) || !(e.usd > 0)) return null;
    return { date: String(j.date || ""), RUB: round(e.rub, 2), USD: round(e.usd, 4), GEL: e.gel > 0 ? round(e.gel, 4) : null };
  }
  function readCache() { try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function writeCache(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* без хранилища — просто не кэшируем */ } }

  // сегодняшний курс: из кэша, если брали сегодня, иначе из сети (по очереди два адреса)
  function load(today) {
    var c = readCache();
    if (c && c.fetched === today) { live = c; return Promise.resolve(c); }
    if (pending) return pending;
    var i = 0;
    var next = function () {
      if (i >= URLS.length) return Promise.reject(new Error("fx"));
      return fetch(URLS[i++], { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("fx")); })
        .then(function (j) { var v = parse(j); return v || Promise.reject(new Error("fx")); })
        .catch(next);
    };
    pending = next().then(function (v) { v.fetched = today; live = v; writeCache(v); pending = null; return v; })
      .catch(function () { pending = null; live = c; return c; }); // нет сети — последний известный
    return pending;
  }

  // что заметно разошлось с курсом в бюджете: [{ cur, mine, now, pct }]
  function drift(settings, v) {
    v = v || live; if (!v || !settings) return [];
    var fx = settings.fx || {}, mine = { RUB: settings.rate, USD: fx.USD, GEL: fx.GEL }, out = [];
    ["RUB", "USD", "GEL"].forEach(function (k) {
      if (!(mine[k] > 0) || !(v[k] > 0)) return;
      var p = (v[k] - mine[k]) / mine[k];
      if (Math.abs(p) >= DRIFT) out.push({ cur: k, mine: mine[k], now: v[k], pct: p });
    });
    return out;
  }

  // поставить сегодняшний курс в настройки; рубль — с записью в историю, как при ручной правке
  function apply(settings, v, today) {
    v = v || live; if (!v) return false;
    settings.fx = settings.fx || {};
    if (v.RUB > 0 && v.RUB !== settings.rate) {
      var hist = settings.rateHistory = settings.rateHistory || [], last = hist[hist.length - 1];
      if (last && last.date === today) { last.rate = v.RUB; last.src = "auto"; } // один день — одна запись
      else hist.push({ date: today, rate: v.RUB, prev: settings.rate, src: "auto" });
      settings.rate = v.RUB; settings.fx.RUB = v.RUB;
    }
    if (v.USD > 0) settings.fx.USD = v.USD;
    if (v.GEL > 0) settings.fx.GEL = v.GEL;
    return true;
  }

  window.BudgetFx = { load: load, live: function () { return live; }, drift: drift, apply: apply, parse: parse, DRIFT: DRIFT };
})();
