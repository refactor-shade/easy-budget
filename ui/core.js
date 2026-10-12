/* Easy Budget — интерфейс, общая часть: состояние, сохранение, утилиты, окна, ввод трат, напоминания. */
"use strict";
var K = window.BudgetCash, E = window.BudgetEngine, S = window.BudgetShared, C = window.BudgetCharts, Store = window.BudgetStore, SU = window.BudgetStoreUtil;
var $main = document.getElementById("main");
var state = null;      // бюджет на экране (мой или партнёра)
var myState = null;    // мой бюджет
var view = { who: "me", level: "full", name: "", summary: null };
var people = [];       // чьи бюджеты я могу смотреть
var sh = null;         // общее пространство: {space, people, meId, partnerId, rows, expenses, learned}
var ui = { year: null, week: 0, recWeek: null, shared: { year: null, month: "all", cat: "all", kind: "all", limit: 20, q: "" } };

function RO() { return view.who !== "me"; }

// ---------- сохранение ----------
var saveTimer = null, saving = false, pending = false;
// «Обновить»: свежие данные, а если на сайте новая версия — перезагрузка
function refreshAll() {
  if (pending || saving) { toast("Подожди секунду — сохраняю изменения"); return; }
  setSync("обновляю…", "busy");
  fetch("index.html?nc=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) {
    var m = t.match(/app\.js\?v=(\d+)/), curSrc = Array.prototype.map.call(document.scripts, function (x) { return x.src; }).find(function (x) { return /app\.js/.test(x); }) || "", cm = curSrc.match(/v=(\d+)/);
    if (m && cm && m[1] !== cm[1]) { location.reload(); return; }
    return Promise.all([Store.loadMyBudget(), loadShared().catch(function () {}), loadPeople()]).then(function (x) {
      var b = x[0];
      if (b && !pending && !saving) { myState = migrate(b.data); if (view.who === "me") state = myState; resetUndoBase(); }
      render();
      ui.syncAt = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      setSync("обновлено " + ui.syncAt + " ↻", "ok");
    });
  }).catch(function () { setSync("нет связи ↻", "warn"); });
}
function setSync(text, cls) {
  document.querySelectorAll("[data-sync]").forEach(function (el) {
    el.classList.remove("busy", "warn", "ok");
    if (cls) el.classList.add(cls);
    var t = el.querySelector(".sync-t"); if (t) t.textContent = text;
    el.setAttribute("aria-label", text + " — нажми, чтобы обновить");
  });
}
function save() {
  pending = true;
  setSync("сохраняю…", "busy");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, Store.mode === "cloud" ? 800 : 250);
}
function flush() {
  if (saving || !pending) return;
  saving = true; pending = false;
  var snapshot = myState;
  Store.saveMyBudget(snapshot).then(function () {
    saving = false;
    if (pending) return flush();
    showOutbox();
    scheduleSheetPush();
  }).catch(function (err) {
    saving = false;
    if (err && err.code === "conflict") {
      // бюджет сохранили с другого устройства: сливаем обе версии, свои изменения на всякий случай — в резервную копию
      pending = false;
      var base = Store.base ? Store.base() : null;
      Store.saveSnapshot(snapshot, "изменения с этого устройства до объединения").catch(function () {});
      if (!base) { toast("Бюджет изменили на другом устройстве — загружаю свежую версию. Твои изменения — в резервных копиях"); return reloadMine(); }
      return Store.loadMyBudget().then(function (b) {
        if (!b) return;
        var mr = SU.merge3(base, JSON.parse(JSON.stringify(myState)), b.data);
        myState = migrate(mr.data); myState._ver = Date.now();
        if (view.who === "me") state = myState;
        resetUndoBase(); render(); save();
        toast(mr.conflicts ? "Бюджет меняли и на другом устройстве — объединила. Где правили одно и то же, оставила твоё" : "Бюджет меняли и на другом устройстве — объединила изменения");
      }).catch(function () { pending = true; setSync("нет связи — сохранено на телефоне", "warn"); });
    }
    pending = true;
    setSync("нет связи — сохранено на телефоне", "warn");
    clearTimeout(flush._retry); flush._retry = setTimeout(flush, 15000);
  });
}
// статус: всё отправлено или сколько ждёт связи
function showOutbox() {
  if (Store.mode !== "cloud") { setSync("сохранено в браузере", "ok"); return; }
  Store.outboxCount().then(function (n) {
    if (pending || saving) return;
    if (n) setSync("не отправлено: " + n + " — отправлю, когда будет связь", "warn");
    else setSync("сохранено ↻", "ok");
  });
}
Store.onOutbox(function (n, res) {
  if (res) { loadShared().then(function () { if (/shared|insights|home|us|tolog|cash|^$/.test(location.hash.slice(1))) render(); }).catch(function () {}); if (res.dropped) toast("Часть изменений не принял сервер (" + res.dropped + ") — проверь ленту общих трат"); }
  showOutbox();
});
window.addEventListener("online", function () { if (pending) flush(); Store.flushOutbox(); });
window.addEventListener("offline", function () { setSync("нет связи — изменения сохраню на устройстве", "warn"); });
window.addEventListener("beforeunload", function (e) { if (pending || saving) { flush(); e.preventDefault(); e.returnValue = ""; } });
// вернулась к вкладке — проверить, не изменили ли бюджет с другого устройства
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState !== "visible" || Store.mode !== "cloud" || pending || saving || !myState) return;
  if (checkAppUpdate()) return;
  Store.remoteVersion().then(function (v) { if (v && v !== Store.localVersion()) reloadMine(); }).catch(function () {});
});
// вернулась к приложению, а на сайте новая версия — тихо перезагрузиться (не чаще раза в 10 минут и только без несохранённого)
function checkAppUpdate() {
  if (Date.now() - (checkAppUpdate.at || 0) < 6e5) return false;
  checkAppUpdate.at = Date.now();
  fetch("index.html?nc=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) {
    var m = t.match(/app\.js\?v=(\d+)/), cur = Array.prototype.map.call(document.scripts, function (x) { return x.src; }).find(function (x) { return /app\.js/.test(x); }) || "", cm = cur.match(/v=(\d+)/);
    if (m && cm && m[1] !== cm[1] && !pending && !saving && !document.querySelector("dialog[open], .g input")) location.reload();
  }).catch(function () {});
  return false;
}
function reloadMine() {
  return Store.loadMyBudget().then(function (b) {
    if (!b) return;
    myState = migrate(b.data);
    if (view.who === "me") state = myState;
    resetUndoBase(); render();
  });
}
// Отмена: храним состояние до последнего изменения (до 20 шагов)
var undoStack = [], undoBase = null, undoTimer = null;
function snapMine() { return myState ? JSON.stringify(myState) : null; }
function resetUndoBase() { undoBase = snapMine(); }
function pushUndo(item) {
  undoStack.push(item); if (undoStack.length > 20) undoStack.shift();
  var el = document.getElementById("undoBar");
  if (!el) { el = document.createElement("div"); el.id = "undoBar"; el.className = "undo-bar"; document.body.appendChild(el); }
  // уведомление, показанное только что (до сохранения), переезжает в полоску
  var label = item.label || "Изменено";
  if ((label === "Сохранено") && toast.last && Date.now() - toast.last.at < 400) { label = toast.last.msg; document.getElementById("toast").classList.remove("on"); }
  // как в Material: текст · «Отменить» · «×» в самом конце; между кнопками черта и отступ — чтобы не промахнуться
  el.innerHTML = "<span class='ub-label'>" + esc(label) + "</span><button type='button' class='ub-undo'>Отменить</button><span class='ub-sep' aria-hidden='true'></span><button type='button' class='ub-x' aria-label='Скрыть'>×</button>";
  el.querySelector(".ub-undo").onclick = doUndo;
  el.querySelector(".ub-x").onclick = function () { el.classList.remove("on"); };
  pushUndo.at = Date.now();
  el.classList.add("on"); clearTimeout(undoTimer); undoTimer = setTimeout(function () { el.classList.remove("on"); }, 5000);
}
function doUndo() {
  var it = undoStack.pop(), el = document.getElementById("undoBar");
  if (el) el.classList.remove("on");
  if (!it) return;
  if (it.kind === "draft") {
    if (!myState.recDraft) return;
    var k = myState.recDraft.key;
    state = ui.draftState = JSON.parse(it.data); state._draftKey = k; state._ver = Date.now(); draftUndoBase = it.data;
    persistDraft(); save(); render(); toast("Отменено"); return;
  }
  if (it.kind === "budget") {
    myState = migrate(JSON.parse(it.data)); myState._ver = Date.now();
    if (view.who === "me") state = myState;
    resetUndoBase(); save(); render(); toast("Отменено");
  } else if (it.revert) Promise.resolve(it.revert()).then(function () { render(); toast("Отменено"); }).catch(function (e) { toast("Не получилось отменить: " + e.message); });
}
// label === false — сохранить тихо, без полоски «Отменить» (например, остатки на шаге 1 Сверки: полоска появится на «Завершить»)
function changed(noRender, label) {
  if (RO()) { toast("Сейчас открыт чужой бюджет (" + view.name + ") — только просмотр"); return; }
  if (inDraft()) {
    // правка внутри незаконченной сверки: своя отмена, бюджет не меняется — только черновик
    var snap = draftSnap();
    if (label !== false && draftUndoBase && draftUndoBase !== snap) pushUndo({ kind: "draft", data: draftUndoBase, label: label || "Сохранено" });
    draftUndoBase = snap;
    persistDraft(); state._ver = (state._ver || 0) + 1; save();
    if (!noRender) render();
    return;
  }
  if (label !== false && undoBase && myState && undoBase !== snapMine()) pushUndo({ kind: "budget", data: undoBase, label: label || "Сохранено" });
  resetUndoBase();
  state._ver = (state._ver || 0) + 1;
  save();
  if (!noRender) render();
}

// ===== Черновик сверки (ADR-2, вариант Б) =====
// Пока сверка не завершена, шаги 1–2 работают с копией бюджета (state = черновик). Копия хранится в myState.recDraft
// (в облаке, в приватной части — партнёр не видит) только тем, что изменилось: годы, наличка, настройки.
// План, Главная, Таблица и всё остальное смотрят на myState и черновик не учитывают. «Завершить» переносит его в бюджет.
var draftUndoBase = null;
function draftSnap() { return JSON.stringify(state, function (k, v) { return k === "_ver" ? undefined : v; }); }
function draftKey(y, w) { return y + ":" + w; }
function inDraft() { return !!(state && state._draftKey && view.who === "me"); }
function draftOf(y, w) { var d = myState && myState.recDraft; return d && d.key === draftKey(y, w) ? d : null; }
function buildDraftState(d) {
  var s = JSON.parse(JSON.stringify(myState)); delete s.recDraft;
  Object.keys(d.years || {}).forEach(function (yy) { s.years[yy] = JSON.parse(JSON.stringify(d.years[yy])); });
  if (d.cash) s.cash = JSON.parse(JSON.stringify(d.cash));
  if (d.settings) Object.assign(s.settings, JSON.parse(JSON.stringify(d.settings)));
  s._draftKey = d.key; s._ver = Date.now();
  return s;
}
// включить черновик для недели (если он есть), иначе — настоящий бюджет
function useDraft(y, w) {
  if (view.who !== "me" || !myState) return;
  var d = draftOf(y, w);
  if (!d) { if (state !== myState) state = myState; return; }
  if (!ui.draftState || ui.draftState._draftKey !== d.key || ui.draftAt !== d.at) { ui.draftState = buildDraftState(d); ui.draftAt = d.at; state = ui.draftState; draftUndoBase = draftSnap(); }
  state = ui.draftState;
}
function startDraft(y, w) {
  myState.recDraft = { key: draftKey(y, w), at: new Date().toISOString(), editing: !!((myState.years[y].recon || {})[w]), years: {}, base: {} };
  myState.recDraft.base[y] = JSON.parse(JSON.stringify(myState.years[y])); // каким год был в начале сверки
  ui.draftState = buildDraftState(myState.recDraft); ui.draftAt = myState.recDraft.at;
  state = ui.draftState; draftUndoBase = draftSnap();
}
// записать в myState.recDraft то, чем черновик отличается от бюджета
function persistDraft() {
  var ds = state, d = myState.recDraft; if (!d || !ds || ds._draftKey !== d.key) return;
  var years = {}, setPatch = {};
  Object.keys(ds.years).forEach(function (yy) { if (JSON.stringify(ds.years[yy]) !== JSON.stringify(myState.years[yy])) years[yy] = ds.years[yy]; });
  Object.keys(ds.settings).forEach(function (k) { if (JSON.stringify(ds.settings[k]) !== JSON.stringify(myState.settings[k])) setPatch[k] = ds.settings[k]; });
  // база — каким год был в начале сверки: на «Завершить» сливаем, а не перезаписываем (вдруг план правили на другом устройстве)
  d.base = d.base || {};
  Object.keys(years).forEach(function (yy) { if (!d.base[yy]) d.base[yy] = JSON.parse(JSON.stringify(myState.years[yy] || {})); });
  if (d.baseCash === undefined && JSON.stringify(ds.cash) !== JSON.stringify(myState.cash)) d.baseCash = JSON.parse(JSON.stringify(myState.cash || null));
  d.years = JSON.parse(JSON.stringify(years));
  d.cash = JSON.stringify(ds.cash) !== JSON.stringify(myState.cash) ? JSON.parse(JSON.stringify(ds.cash || null)) : undefined;
  d.settings = Object.keys(setPatch).length ? JSON.parse(JSON.stringify(setPatch)) : undefined;
  d.at = new Date().toISOString(); ui.draftAt = d.at;
  resetUndoBase();
}
// «Завершить»: черновик → бюджет. «Отменить» в полоске вернёт бюджет как до сверки
function finishDraft(label) {
  var d = myState.recDraft; if (!d) return;
  var before = JSON.parse(snapMine()); delete before.recDraft;
  Object.keys(d.years || {}).forEach(function (yy) { myState.years[yy] = d.base && d.base[yy] ? SU.merge3(d.base[yy], d.years[yy], myState.years[yy]).data : d.years[yy]; });
  if (d.cash) myState.cash = d.baseCash !== undefined ? SU.merge3(d.baseCash, d.cash, myState.cash).data : d.cash;
  if (d.settings) Object.assign(myState.settings, d.settings);
  delete myState.recDraft;
  ui.draftState = null; state = myState;
  undoStack = undoStack.filter(function (it) { return it.kind !== "draft"; });
  myState._ver = (myState._ver || 0) + 1;
  pushUndo({ kind: "budget", data: JSON.stringify(before), label: label });
  resetUndoBase(); save(); render();
}
function discardDraft() {
  delete myState.recDraft; ui.draftState = null; state = myState;
  undoStack = undoStack.filter(function (it) { return it.kind !== "draft"; });
  myState._ver = (myState._ver || 0) + 1; resetUndoBase(); save(); render();
}

function fromSeed() {
  var s = JSON.parse(JSON.stringify(window.SEED));
  return s;
}
function blank() {
  var y = new Date().getFullYear();
  var s = { version: 1, settings: { rate: 95, myName: "", partnerName: "", defaultShare: 0.5, diffAlert: -5000, fx: { GEL: 3, USD: 1.08, RUB: 95 } },
    categories: [], accounts: [{ id: "a1", name: "Основная карта", kind: "cash_flow", sort: 1 }, { id: "a2", name: "Наличка €", kind: "cash_flow", sort: 2 }],
    years: {} };
  [["income", "зарплата €"], ["base", "квартира"], ["base", "продукты / расходы на неделю"], ["base", "развлечения"], ["periodic", "путешествие"],
    ["periodic", "одежда"], ["periodic", "подарки"], ["subs_es", "телефон"], ["savings", "накопительный счёт €"]].forEach(function (p, i) {
    s.categories.push({ id: "c" + (i + 1), name: p[1], block: p[0], currency: "EUR", mandatory: false, link: p[1].indexOf("накоп") === 0 ? "sav" : null, sort: i + 1, archived: false });
  });
  E.createYear(s, y, {});
  return s;
}
function migrate(s) {
  delete s.shared;
  s.settings.fx = s.settings.fx || { GEL: 3, USD: 1.08, RUB: s.settings.rate };
  if (!s.settings.coverage) {
    var find = function (re) { var c = s.categories.find(function (x) { return x.block === "base" && re.test(x.name); }); return c ? [c.id] : []; };
    s.settings.coverage = { food: find(/продукт/i), fun: find(/развлеч/i) };
  }
  // строка развлечений могла не найтись (не в «Базовых») — ищем во всех тратах: туда идут кафе, рестораны и такси из общих
  var spend = function (re) { var c = s.categories.find(function (x) { return !x.archived && x.block !== "income" && x.block !== "savings" && re.test(x.name); }); return c ? [c.id] : []; };
  if (!(s.settings.coverage.fun || []).length) s.settings.coverage.fun = spend(/развлеч|досуг|кафе|ресторан/i);
  if (!(s.settings.coverage.food || []).length) s.settings.coverage.food = spend(/продукт|еда/i);
  if (s.settings.diffAlert === undefined) s.settings.diffAlert = -5000;
  s._ver = 1;
  return s;
}

// ---------- общее пространство ----------
function loadShared() {
  return Store.loadSpace().then(function (sp) {
    if (!sp) { sh = null; return; }
    var me = Store.user();
    // «я» в общем пространстве: по входу, иначе по email; цвета ленты (кто кому должен) считаются с этой стороны
    var myEmail = String(me.email || "").toLowerCase();
    var mine = sp.people.find(function (p) { return p.userId === me.id; }) ||
      sp.people.find(function (p) { return myEmail && String(p.email || "").toLowerCase() === myEmail; }) || sp.people[0];
    var partner = sp.people.find(function (p) { return p !== mine; }) || null;
    sp.space.settings = sp.space.settings || {};
    sp.space.settings.learned = sp.space.settings.learned || {};
    return Store.loadShared(sp.space.id).then(function (rows) {
      sh = { space: sp.space, people: sp.people, meId: mine.id, partnerId: partner ? partner.id : null, partner: partner, me: mine, rows: rows,
        learned: sp.space.settings.learned };
      sh.expenses = rows.map(function (r) { return SU.fromRow(r, mine.id); }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      if (!loadShared.subscribed) {
        loadShared.subscribed = true;
        var t = null;
        Store.subscribeShared(sp.space.id, function () { clearTimeout(t); t = setTimeout(function () { loadShared().then(function () { if (/shared|insights|other|tolog/.test(location.hash) && !$modal.open) render(); scheduleSheetPush(); }); }, 400); });
      }
    });
  });
}
function sharedForCalc() { return sh ? { expenses: sh.expenses, learned: sh.learned } : { expenses: [], learned: {} }; }
// запомнить категорию для описания (у вас обеих): в базу уходит одна запись, а не весь словарь — правки партнёра не затираются
function learn(desc, cat) {
  if (!sh) return;
  var k = S.norm(desc); if (!k) return;
  if (cat) sh.learned[k] = cat; else delete sh.learned[k];
  Store.learnWord(sh.space.id, k, cat || null).catch(function () {});
}
// имена людей пространства — чтобы узнавать переводы «Аня дала Саше»
function spaceNames() { return sh ? sh.people.map(function (p) { return p.name || ""; }) : []; }

// ---------- профили ----------
function loadPeople() {
  return Store.listPeople().then(function (p) { people = p; }).catch(function () { people = []; });
}
function switchTo(who) {
  if (who === "me") { view = { who: "me", level: "full", name: "", summary: null }; state = myState; render(); return; }
  var p = people.find(function (x) { return x.userId === who; });
  if (!p) return;
  $main.innerHTML = "<p class='loading'>Загружаю бюджет: " + esc(p.name) + "…</p>";
  var lvl = p.theirLevel;
  var job = lvl === "full" ? Store.loadBudgetOf(who) : lvl === "totals" ? Store.loadSummaryOf(who) : Promise.resolve(null);
  job.then(function (row) {
    view = { who: who, level: lvl, name: p.name, summary: null };
    if (lvl === "full" && row) { state = migrate(row.data); state._ver = 1; }
    else if (lvl === "totals" && row) { view.summary = row.data; state = null; }
    else { view.level = "hidden"; state = null; }
    var d = defaultYearWeek(); if (d) { ui.year = d.year; ui.week = d.week; }
    // «Наши итоги» в чужом бюджете не открываются (они и так про вас обеих) — открываем её Главную
    if (location.hash === "#us") { location.hash = "#home"; return; }
    render();
  }).catch(function (e) { toast("Не удалось загрузить: " + e.message); switchTo("me"); });
}
// Кого ещё можно посмотреть (партнёр открыл доступ): строки «Бюджет Ани ›»
// «Бюджет Риты»: имя в родительном падеже (простое правило для женских имён)
function nameGen(n) { n = String(n || ""); if (/[кгхжшщч]а$/i.test(n)) return n.slice(0, -1) + "и"; if (/а$/i.test(n)) return n.slice(0, -1) + "ы"; if (/я$/i.test(n)) return n.slice(0, -1) + "и"; return n; }
function viewablePeople() { return people.filter(function (p) { return p.theirLevel !== "hidden"; }); }
function profileBar() {
  var bar = document.getElementById("profiles");
  if (bar) {
    bar.innerHTML = RO() ? "<div class='ro-banner'><span class='ro-dot' aria-hidden='true'>◉</span><span>Бюджет " + esc(nameGen(view.name)) + " — только просмотр: видишь цифры, но изменить ничего нельзя.</span><button class='btn sm' id='roBack'>Вернуться к своему</button></div>" : "";
    var rb = bar.querySelector("#roBack"); if (rb) rb.onclick = function () { switchTo("me"); };
  }
  var np = document.getElementById("navPeople");
  if (np) {
    np.innerHTML = viewablePeople().map(function (p) {
      return "<button type='button' class='nav-person" + (view.who === p.userId ? " active" : "") + "' data-who='" + esc(p.userId) + "'>Бюджет " + esc(nameGen(p.name)) + " <small>" + (p.theirLevel === "totals" ? "итоги" : "просмотр") + "</small></button>";
    }).join("") + (RO() ? "<button type='button' class='nav-person' data-who='me'>‹ Мой бюджет</button>" : "");
    np.querySelectorAll("[data-who]").forEach(function (b) { b.onclick = function () { switchTo(b.dataset.who); }; });
  }
  if (Store.mode !== "cloud") setSync("только в этом браузере", "");
}

// ---------- разделы: группы, вкладки внутри раздела ----------
var GROUPS = {
  home: ["home", "cash"],
  recon: ["recon"],
  plan: ["year", "recurring", "week"],
  us: ["shared", "us", "tolog", "other"],
  analysis: ["insights", "months", "analysis"],
  settings: ["settings", "help"],
};
var SUBTABS = {
  plan: [["year", "Таблица"], ["recurring", "Регулярные"]],
  us: [["shared", "Общие траты"], ["us", "Наши итоги"]],
  analysis: [["insights", "Выводы"], ["months", "Итоги месяцев"], ["analysis", "Графики"]],
};
function routeGroup(route) { for (var g in GROUPS) if (GROUPS[g].indexOf(route) >= 0) return g; return "home"; }
var GROUP_TITLE = { plan: "План", us: "Мы", analysis: "Анализ" };
// «‹ Назад» ведёт туда, откуда пришла; если пришла по ссылке извне — в раздел по умолчанию
var ROUTE_TITLE = { home: "Главная", year: "План", recurring: "Регулярные", recon: "Сверка", cash: "Наличка", us: "Мы", shared: "Мы", tolog: "Общие и план", other: "Прочее", insights: "Анализ", months: "Анализ", analysis: "Анализ", settings: "Настройки", help: "Справка" };
var BACK_DEFAULT = { cash: "home", settings: "home", help: "settings", week: "year", tolog: "shared", other: "shared" }; // у Сверки своя ссылка в шапке
function backHref(route, dflt) {
  dflt = dflt || BACK_DEFAULT[route];
  if (!dflt) return null;
  var from = ui.cameFrom && ui.cameFrom[route];
  var to = from && from !== route && ROUTE_TITLE[from] ? from : dflt;
  return ["#" + to, ROUTE_TITLE[to]];
}
function afterRender(route) {
  var g = routeGroup(route), tabs = SUBTABS[g];
  $main.classList.toggle("in-sec", !!tabs && route !== "week");
  var href = backHref(route);
  if (href && !(route === "settings" && ui.setSec)) $main.insertAdjacentHTML("afterbegin", "<a class='back-link' href='" + href[0] + "'>‹ " + href[1] + "</a>");
  if (!tabs || route === "week" || route === "tolog" || route === "other") { $main.classList.remove("in-sec"); return; }
  // год: чипы старых экранов прячем, вместо них — список справа от заголовка
  var firstY = $main.querySelector(".chips [data-year], .chips [data-uy]"), chips = firstY ? Array.prototype.slice.call(firstY.parentNode.querySelectorAll("[data-year], [data-uy]")) : [], ysel = "";
  var yv = function (c) { return c.dataset.year || c.dataset.uy; };
  if (chips.length) {
    chips[0].parentNode.classList.add("chips-hidden");
    ysel = "<select class='year-sel' id='secYear' aria-label='Год'>" + chips.map(function (c) {
      return "<option value='" + esc(yv(c)) + "'" + (c.classList.contains("on") ? " selected" : "") + ">" + esc(c.textContent) + "</option>";
    }).join("") + "</select>";
  }
  var hasUrl = state && state.settings.sheetUrl && /^https:\/\/docs\.google\.com\//.test(state.settings.sheetUrl);
  var sheetA = g === "plan" && !RO() ? (hasUrl ? "<a class='plan-sheet' href='" + esc(state.settings.sheetUrl) + "' target='_blank' rel='noopener'>Google Таблица ↗</a>" : "<button type='button' class='linkish plan-sheet' id='sheetAsk'>Google Таблица ↗</button>") : "";
  var html = "<div class='sec-head'><h1>" + GROUP_TITLE[g] + "</h1>" + (g === "plan" ? "<span class='sh-right'>" + (route !== "year" ? ysel : "") + sheetA + "</span>" : ysel) + "</div>" +
    "<nav class='subtabs' aria-label='Раздел'>" + tabs.map(function (t) {
      return "<a href='#" + t[0] + "'" + (t[0] === route ? " class='on' aria-current='page'" : "") + ">" + t[1] + "</a>";
    }).join("") + "</nav>";
  if (route === "us" && !RO()) html += viewablePeople().map(function (p) {
    return "<button type='button' class='person-row card' data-who='" + esc(p.userId) + "'><span class='pr-ic' aria-hidden='true'>" + esc(p.name.charAt(0)) + "</span><span class='pr-tx'><b>Бюджет " + esc(nameGen(p.name)) + "</b><span>" + (p.theirLevel === "totals" ? "только итоги" : "только просмотр") + "</span></span><span class='arr'>›</span></button>";
  }).join("");
  $main.insertAdjacentHTML("afterbegin", html);
  $main.querySelectorAll(".person-row").forEach(function (b) { b.onclick = function () { switchTo(b.dataset.who); }; });
  var sa = $main.querySelector("#sheetAsk");
  if (sa) sa.onclick = function () {
    modal("<form class='m-body' id='saF'><h2>Ссылка на Google Таблицу</h2><p class='small muted' style='margin:2px 0 12px'>Вставь адрес своей таблицы — один раз. Дальше кнопка «Google Таблица ↗» будет открывать её сразу.</p>" +
      "<label class='f'>Адрес таблицы<input type='url' name='u' placeholder='https://docs.google.com/spreadsheets/…' required></label><button type='submit' hidden></button></form>" +
      "<div class='m-foot'><button class='btn ghost' data-act='x'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", function (m) {
      var f = m.querySelector("#saF");
      var ok = function (e) { if (e) e.preventDefault(); var v = f.u.value.trim(); if (!/^https:\/\/docs\.google\.com\//.test(v)) { toast("Нужна ссылка вида https://docs.google.com/…"); return; } state.settings.sheetUrl = v; closeModal(); changed(true); window.open(v, "_blank", "noopener"); };
      f.onsubmit = ok; m.querySelector("[data-act=ok]").onclick = ok; m.querySelector("[data-act=x]").onclick = closeModal;
    });
  };
  var sy = $main.querySelector("#secYear");
  if (sy) sy.onchange = function () { var c = chips.find(function (x) { return yv(x) === sy.value; }); if (c) c.click(); };
}

(function () {
  var p = document.getElementById("navPlus"); if (p) p.onclick = function () {
    // вкладка по разделу: в «Мы» — общая трата, в Наличке — наличка, иначе — трата
    var r = (location.hash || "#home").slice(1), g = routeGroup(r);
    plusSheet(g === "us" ? "shared" : r === "cash" ? "cash" : null, true);
  };
  document.querySelectorAll(".nav-sync").forEach(function (b) { b.onclick = function () { refreshAll(); }; });
})();

// ---------- утилиты ----------
function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function eur(c, o) { return E.eur(c, o); }
function rnd(c) { return c === null || c === undefined ? null : Math.round(c / 100) * 100; }
// Изменение (капитал за неделю, с начала месяца): рост — зелёным «↗», снижение — спокойным цветом «↘».
// Красный — только для того, что требует действия (расхождение больше порога, минус в остатке, выше плана)
function trendHtml(c, opts) {
  opts = opts || {};
  var t = eur(rnd(c), { dec: 0, plus: true });
  if (!rnd(c)) return "<span class='chg'>" + t + "</span>";
  return "<span class='chg " + (c > 0 ? "up" : "down") + "'>" + (c > 0 ? "↗ " : "↘ ") + t + "</span>" + (opts.after ? " " + opts.after : "");
}
function sign(c) { return c > 0 ? "pos" : c < 0 ? "neg" : ""; }
// В расходах минус можно не ставить: 50 → −50. «+50» — оставить плюсом (вернули деньги).
function signFor(catId, expr) {
  var v = String(expr || "").trim(), c = state.categories.find(function (x) { return x.id === catId; });
  if (!v || !c || c.block === "income") return v;
  if (/^\+/.test(v)) return v.replace(/^\+\s*/, "");
  if (/^[-=]/.test(v)) return v;
  var n; try { n = E.exprCents(v); } catch (e) { return v; }
  if (n === null || n <= 0) return v;
  return /[+\-*\/]/.test(v) ? "-(" + v + ")" : "-" + v;
}
// как показать сумму или формулу в поле: дробная часть через запятую, как везде в приложении («1001,6», «35+20,5»)
// склонение: plural(3, "трата", "траты", "трат") → «траты»
// Шаблон с автоэкранированием: tpl("<b>{name}</b> {!badge}", { name: …, badge: html }).
// {x} — текст, всегда экранируется (данные из базы, ввод, имена); {!x} — готовый HTML, только из своего кода.
// Новый код пишем через tpl — так правило «всё экранировать» держится само, а не на внимательности.
function tpl(s, d) {
  return s.replace(/\{(!?)([\w.]+)\}/g, function (m, raw, k) {
    var v = k.split(".").reduce(function (o, p) { return o === null || o === undefined ? o : o[p]; }, d);
    return raw ? (v === null || v === undefined ? "" : String(v)) : esc(v);
  });
}
function plural(n, one, few, many) { return window.BudgetInsights.plural(n, one, few, many); }
// курсы на сегодня (fx.js): строка для Настроек и «Поставить»
var FX_SIGN = { RUB: "₽", USD: "$", GEL: "лари" };
function fxNum(v) { return numShow(String(Math.round(v * 100) / 100)); }
function fxLiveHtml() {
  var v = window.BudgetFx && BudgetFx.live(); if (!v) return "<p class='small muted fx-live'>Курс на сегодня загрузится, когда будет сеть.</p>";
  var dr = BudgetFx.drift(state.settings, v);
  var cur = function (val, k, tag) { return tpl("<{!t} class='nw'>{n}&nbsp;{s}</{!t}>", { t: tag, n: fxNum(val), s: FX_SIGN[k] }); };
  return tpl("<div class='fx-live'><p class='small muted' style='margin:0'>Рыночный курс на {d}: {!now} за&nbsp;1&nbsp;€.</p>{!act}</div>", {
    d: v.date ? v.date.slice(8, 10) + "." + v.date.slice(5, 7) : "сегодня",
    now: ["RUB", "USD", "GEL"].filter(function (k) { return v[k] > 0; }).map(function (k) { return cur(v[k], k, "b"); }).join(" · "),
    act: dr.length ? tpl("<p class='small' style='margin:8px 0 0'>В бюджете {!mine} — разница больше {p}&nbsp;%.</p><button type='button' class='btn sm fx-btn' id='fxApply'>Поставить сегодняшний</button>", {
      mine: dr.map(function (x) { return cur(x.mine, x.cur, "span"); }).join(", "), p: Math.round(BudgetFx.DRIFT * 100) })
      : "<p class='small muted' style='margin:4px 0 0'>Курс в бюджете близок к сегодняшнему — менять не нужно.</p>",
  });
}
function applyFx() {
  if (!BudgetFx.apply(state.settings, null, E.todayISO())) return;
  changed(false, "Курс обновлён"); toast("Курс " + fxNum(state.settings.rate) + " ₽");
}
// после запуска: взять курс на сегодня; если он заметно ушёл — показать пункт на Главной
function loadFx() {
  if (!window.BudgetFx) return;
  var had = BudgetFx.live();
  BudgetFx.load(E.todayISO()).then(function (v) {
    if (!v || v === had || view.who !== "me" || document.querySelector("dialog[open]")) return;
    var r = (location.hash || "#home").slice(1) || "home";
    if (r === "home" && BudgetFx.drift(state.settings, v).length) render();
    var box = $main.querySelector(".fx-live"); if (box) { box.outerHTML = fxLiveHtml(); bindFx(); }
  });
}
function bindFx() { var b = $main.querySelector("#fxApply"); if (b) b.onclick = function () { applyFx(); if ((location.hash || "").slice(1) === "settings") render(); }; }
// «Как делите по умолчанию» у категории общих трат. Настройка общая на двоих, поэтому хранится
// не «моя / её» (у каждой это своё), а id участника: «p:<id>» — в основном платит он. «equal» — пополам.
// Старые значения «mine»/«theirs» ставил создатель пространства (spaces.created_by) — считаем от него:
// у второго участника они читаются наоборот. При следующем сохранении категория перейдёт на «p:<id>».
function catSplitOf(cat) {
  var v = ((sh && sh.space.settings.catSplit) || {})[cat];
  if (!v) return "equal";
  if (String(v).indexOf("p:") === 0) return v.slice(2) === String(sh.meId) ? "mine" : "theirs";
  var by = sh.space.created_by, iAmCreator = !by || !sh.me || !sh.me.userId || sh.me.userId === by;
  return iAmCreator ? v : v === "mine" ? "theirs" : v === "theirs" ? "mine" : v;
}
function catSplitValue(rel) { return rel === "mine" ? "p:" + sh.meId : rel === "theirs" && sh.partnerId ? "p:" + sh.partnerId : null; }
function numShow(expr) { return String(expr === null || expr === undefined ? "" : expr).replace(/(\d)\.(\d)/g, "$1,$2"); }
function absIfPlain(expr) { var v = String(expr || "").trim(); return /^-\d+([.,]\d+)?$/.test(v) ? v.slice(1) : v; }
function cats() { return state.categories.slice().sort(function (a, b) { return a.sort - b.sort; }); }
function catName(id) { var c = state.categories.find(function (x) { return x.id === id; }); return c ? c.name : id; }
function years() { return Object.keys(state.years).sort(); }
function activeYears() { return years().filter(function (y) { return !state.years[y].archived; }); }
function toast(msg) {
  // сразу после изменения сообщение идёт в полоску «Отменить», без второго уведомления
  var ub = document.getElementById("undoBar");
  if (ub && ub.classList.contains("on") && Date.now() - (pushUndo.at || 0) < 400 && !/^Отменено/.test(msg)) { ub.querySelector("span").textContent = msg; return; }
  var t = document.getElementById("toast");
  toast.last = { msg: msg, at: Date.now() };
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("on"); }, 2600);
}
function blockName(b) { var x = E.BLOCKS.find(function (k) { return k.id === b; }); return x ? x.name : b; }
function weekOpts(year, sel, mark) {
  return E.genWeeks(Number(year)).map(function (w) {
    return "<option value='" + w.idx + "'" + (w.idx === sel ? " selected" : "") + ">" + E.MONTHS_SHORT[w.month - 1] + " · " + w.label + (mark && mark(w.idx) ? " ✓" : "") + "</option>";
  }).join("");
}
function catOptions(sel, filter) {
  var out = "";
  E.BLOCKS.forEach(function (b) {
    var list = cats().filter(function (c) { return c.block === b.id && !c.archived && (!filter || filter(c)); });
    if (!list.length) return;
    out += "<optgroup label='" + esc(b.name) + "'>" + list.map(function (c) {
      return "<option value='" + c.id + "'" + (c.id === sel ? " selected" : "") + ">" + esc(c.name) + (c.currency === "RUB" ? " (₽)" : "") + "</option>";
    }).join("") + "</optgroup>";
  });
  return out;
}
function cur(c) { return c.currency === "RUB" ? "₽" : "€"; }
// Проценты по-русски: настоящий минус и запятая в дробной части. x — доля (0.123 → «12%»)
function pct(x, dec) {
  if (x === null || x === undefined || !isFinite(x)) return "—";
  var k = Math.pow(10, dec || 0), v = Math.round(x * 100 * k) / k;
  return (v < 0 ? "−" : "") + String(Math.abs(v)).replace(".", ",") + "%";
}

function defaultYearWeek() {
  if (!state) return null;
  var t = E.todayISO(), wk = E.weekOfDate(t), ys = activeYears();
  if (wk && state.years[String(wk.year)] && !state.years[String(wk.year)].archived) return { year: String(wk.year), week: wk.idx };
  return { year: ys[ys.length - 1] || years()[0], week: 0 };
}
function isNow(year, w) { var wk = E.weekOfDate(E.todayISO()); return wk && String(wk.year) === String(year) && wk.idx === w; }

// ---------- модалка ----------
var $modal = document.getElementById("modal");
// маленькое окно с одним полем вместо системного prompt()
function textModal(title, value, onOk, placeholder) {
  modal("<form class='m-body' id='tmF'><h2>" + esc(title) + "</h2><label class='f' style='margin-top:12px'><input name='v' value='" + esc(value || "") + "' placeholder='" + esc(placeholder || "") + "' required></label><button type='submit' hidden></button></form>" +
    "<div class='m-foot'><button class='btn ghost' data-act='x'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", function (m) {
    var f = m.querySelector("#tmF"), ok = function (e) { if (e) e.preventDefault(); var v = f.v.value.trim(); closeModal(); onOk(v); };
    f.onsubmit = ok; m.querySelector("[data-act=ok]").onclick = ok; m.querySelector("[data-act=x]").onclick = closeModal;
  });
}
// Любое окно: ✕ в углу (закрыть без изменений), на телефоне шторку можно смахнуть вниз — ADR-1
function modal(html, onReady) {
  $modal.className = "modal";
  // у окон со своей шапкой «Отмена · заголовок · Сохранить» ✕ не нужен — он встал бы вплотную к «Сохранить»
  var ownHead = /class='sheet-head'/.test(html);
  $modal.innerHTML = html + (ownHead ? "" : "<button type='button' class='m-x' aria-label='Закрыть' title='Закрыть'>×</button>");
  if (!ownHead) $modal.querySelector(".m-x").onclick = closeModal;
  if (!$modal.open) $modal.showModal();
  var f = $modal.querySelector("[autofocus]") || $modal.querySelector("input,select");
  if (f) setTimeout(function () { f.focus(); if (f.select) f.select(); }, 30);
  if (onReady) onReady($modal);
}
function closeModal() { if ($modal.open) $modal.close(); }
// Подтверждение в окне приложения (вместо системного confirm с «site says» и английскими кнопками).
// Вопрос — заголовком, пояснение — текстом; кнопка — действием («Удалить», «Не сохранять»). opts.danger === false — зелёная кнопка
function askConfirm(text, okLabel, onOk, opts) {
  opts = opts || {};
  var q = String(text), cut = q.indexOf("?"), title = cut > 0 ? q.slice(0, cut + 1) : q, rest = cut > 0 ? q.slice(cut + 1).trim() : "";
  var danger = opts.danger !== undefined ? opts.danger : /удал|стер|убра|не сохран|отключ|замен/i.test(okLabel);
  modal("<div class='m-body ask'><h2>" + esc(title) + "</h2>" + (rest ? "<p class='muted' style='margin:6px 0 0'>" + esc(rest) + "</p>" : "") + "</div>" +
    "<div class='m-foot'><button type='button' class='btn ghost' data-act='no'>" + esc(opts.cancel || "Отмена") + "</button><button type='button' class='btn " + (danger ? "danger-solid" : "primary") + "' data-act='yes'>" + esc(okLabel) + "</button></div>", function (m) {
    m.querySelector("[data-act=no]").onclick = closeModal;
    var yes = m.querySelector("[data-act=yes]"); yes.onclick = function () { closeModal(); onOk(); };
    setTimeout(function () { yes.focus(); }, 30);
  });
}
// Перетаскивание строк за ручку .drag-h (мышь и палец). Строка едет за пальцем, соседи расступаются; onDrop(ids по порядку)
function dragSort(root, itemSel, idAttr, onDrop) {
  root.querySelectorAll(itemSel + " .drag-h").forEach(function (h) {
    h.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); });
    h.addEventListener("pointerdown", function (e) {
      if (e.button) return;
      e.preventDefault(); e.stopPropagation();
      var it = h.closest(itemSel), box = it.parentNode, startY = e.clientY, before = sibs().map(id).join(), timer = null, lastY = e.clientY;
      function sibs() { return Array.prototype.filter.call(box.children, function (x) { return x.matches(itemSel); }); }
      function id(x) { return x.getAttribute(idAttr); }
      try { h.setPointerCapture(e.pointerId); } catch (err) { /* старые браузеры */ }
      it.classList.add("dragging"); document.body.classList.add("is-dragging");
      // двигаем соседей, а не саму строку: перенос узла в DOM сбрасывает захват пальца
      function place(y) {
        for (var guard = 0; guard < 200; guard++) {
          var list = sibs(), i = list.indexOf(it), nx = list[i + 1], pv = list[i - 1];
          if (nx && y > nx.getBoundingClientRect().top + nx.offsetHeight / 2) { box.insertBefore(nx, it); startY += nx.offsetHeight; }
          else if (pv && y < pv.getBoundingClientRect().top + pv.offsetHeight / 2) { box.insertBefore(pv, it.nextSibling); startY -= pv.offsetHeight; }
          else break;
        }
        it.style.transform = "translateY(" + (y - startY) + "px)";
      }
      // у края экрана — прокрутка
      function edge() { var vh = window.innerHeight, d = lastY < 70 ? -8 : lastY > vh - 90 ? 8 : 0; if (d) { window.scrollBy(0, d); place(lastY); } }
      timer = setInterval(edge, 16);
      function mv(ev) { lastY = ev.clientY; place(ev.clientY); }
      var ended = false;
      function up() {
        if (ended) return; ended = true;
        clearInterval(timer);
        h.removeEventListener("pointermove", mv); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up);
        window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
        it.classList.remove("dragging"); document.body.classList.remove("is-dragging"); it.style.transform = "";
        var after = sibs().map(id);
        if (after.join() !== before) onDrop(after);
      }
      h.addEventListener("pointermove", mv); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
      window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    });
  });
}
// новый порядок категорий: те же значения sort, раздаём по новому порядку
function reorderCats(ids) {
  var list = ids.map(function (i) { return state.categories.find(function (c) { return c.id === i; }); }).filter(Boolean);
  var sorts = list.map(function (c) { return c.sort; }).sort(function (a, b) { return a - b; });
  for (var k = 1; k < sorts.length; k++) if (sorts[k] <= sorts[k - 1]) sorts[k] = sorts[k - 1] + 0.001;
  list.forEach(function (c, i) { c.sort = sorts[i]; });
}
$modal.addEventListener("click", function (e) { if (e.target === $modal) closeModal(); });
// свайп вниз по верхней части шторки закрывает её
(function () {
  var y0 = null, dy = 0;
  $modal.addEventListener("touchstart", function (e) {
    var r = $modal.getBoundingClientRect(), t = e.touches[0];
    y0 = $modal.scrollTop <= 0 && t.clientY - r.top < 72 && !e.target.closest("input,select,textarea") ? t.clientY : null; dy = 0;
  }, { passive: true });
  $modal.addEventListener("touchmove", function (e) { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); $modal.style.transform = dy ? "translateY(" + dy + "px)" : ""; }, { passive: true });
  $modal.addEventListener("touchend", function () { if (y0 === null) return; $modal.style.transform = ""; if (dy > 90) closeModal(); y0 = null; });
})();
// меню «⋯»: закрывается по клику мимо и после выбора пункта
document.addEventListener("click", function (e) {
  document.querySelectorAll("details.menu-more[open]").forEach(function (d) { if (!d.contains(e.target) || e.target.closest("button.menu-item")) d.open = false; });
});

// Редактирование ячейки категория × неделя
function editCell(year, catId, w) {
  if (RO()) { toast("Сейчас открыт чужой бюджет (" + view.name + ") — только просмотр"); return; }
  var r = E.compute(state, year), cell = r.cells[catId][w], c = state.categories.find(function (x) { return x.id === catId; });
  var wk = r.weeks[w], entry = (state.years[year].entries[catId] || {})[w];
  var recCell = E.yearCells(Object.assign({}, state, { years: (function () { var o = {}; o[year] = Object.assign({}, state.years[year], { entries: {} }); return o; })() }), year)[catId][w];
  modal("<form method='dialog' class='m-body' id='cellForm'><h2>" + esc(c.name) + "</h2><div class='sub'>" + E.weekTitle(Number(year), w) +
    " · " + wk.wim + "-я неделя месяца</div>" +
    (recCell ? "<div class='hint small'>Регулярная трата: <b>" + E.fmt(recCell.cents, { cur: cur(c) }) + "</b>. Сумма, вписанная вручную, заменит её в этой неделе.</div>" : "") +
    "<div class='form-grid' style='margin-top:14px'><label class='f' style='grid-column:1/-1'>Сумма или формула" + (c.block === "income" ? "" : " — минус ставить не нужно, «+» — если вернули деньги") + "<input type='text' name='expr' autofocus value='" +
    esc(numShow(c.block === "income" ? (entry ? entry.expr : (cell ? (cell.cents / 100).toString() : "")) : absIfPlain(entry ? entry.expr : (cell ? (cell.cents / 100).toString() : "")))) + "' placeholder='35+20' inputmode='decimal'></label>" +
    "<label class='f' style='grid-column:1/-1'>Заметка <input type='text' name='note' value='" + esc(entry ? entry.note : "") + "' placeholder='что это было'></label></div>" +
    "<div class='small muted' id='cellPreview' style='margin-top:8px'></div></form>" +
    (cell && cell.cents < 0 && c.block !== "savings" ? "<div class='row' style='margin:0 22px 12px'><button class='btn sm' data-act='move'>Не потратила — перенести или убрать</button></div>" : "") +
    "<div class='m-foot'>" + (entry ? "<button class='btn ghost danger' data-act='clear'>" + (recCell ? "Вернуть регулярную" : "Удалить") + "</button>" : "") +
    "<span class='spacer'></span><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='save'>Сохранить</button></div>",
  function (m) {
    var inp = m.querySelector("[name=expr]"), pv = m.querySelector("#cellPreview");
    function preview() {
      try { var v = E.exprCents(signFor(catId, inp.value)); pv.textContent = v === null ? "" : "= " + E.fmt(v, { cur: cur(c) }); pv.className = "small muted"; }
      catch (err) { pv.textContent = "Ошибка в формуле: " + err.message; pv.className = "small neg"; }
    }
    inp.addEventListener("input", preview); preview();
    function doSave() {
      var val = signFor(catId, inp.value);
      try { E.exprCents(val); } catch (err) { return; }
      E.setEntry(state, year, catId, String(w), val, m.querySelector("[name=note]").value);
      closeModal(); changed();
    }
    m.querySelector("#cellForm").addEventListener("submit", function (e) { e.preventDefault(); doSave(); });
    m.querySelector("[data-act=save]").onclick = doSave;
    m.querySelector("[data-act=cancel]").onclick = closeModal;
    var cl = m.querySelector("[data-act=clear]");
    if (cl) cl.onclick = function () { E.setEntry(state, year, catId, String(w), ""); closeModal(); changed(); };
    var mv = m.querySelector("[data-act=move]");
    if (mv) mv.onclick = function () { moveSkipModal(year, catId, w); };
  });
}


// Плановую трату не совершила: перенести на другую неделю или убрать
function skipCell(y, catId, w, note) { E.setEntry(state, y, catId, String(w), "0", note || "не было"); }
function moveCell(y, catId, w, toISO) {
  var r = E.compute(state, y), cell = r.cells[catId][w];
  if (!cell || !cell.cents) return null;
  var wk = E.weekOfDate(toISO); if (!wk) return null;
  var ty = String(wk.year);
  if (!state.years[ty] || state.years[ty].archived) return { err: "Плана на " + ty + " год нет — сначала создай его на экране «Год»." };
  if (ty === String(y) && wk.idx === w) return { err: "Это та же неделя" };
  skipCell(y, catId, w, "перенесено на " + shortWeek(ty, wk.idx));
  addToCell(ty, catId, wk.idx, String(Math.abs(cell.cents) / 100), "перенесено с " + shortWeek(y, w));
  return { year: ty, week: wk.idx };
}
function moveSkipModal(y, catId, w, after) {
  var r = E.compute(state, y), cell = r.cells[catId][w], wk = r.weeks[w];
  if (!cell) return;
  var next = E.addDays(wk.to, 1), monthNext = E.addDays(wk.from, 28);
  modal("<div class='m-body'><h2>" + esc(catName(catId)) + " · " + E.fmt(cell.cents, { cur: cur(state.categories.find(function (c) { return c.id === catId; })) }) + "</h2>" +
    "<p class='small muted' style='margin:2px 0 12px'>В плане на " + esc(shortWeek(y, w)) + ". Не потратила — перенеси на потом или убери.</p>" +
    "<div class='chips'><button class='chip' data-to='" + next + "'>На следующую неделю</button><button class='chip' data-to='" + monthNext + "'>Через месяц</button></div>" +
    "<div class='form-grid' style='margin-top:10px'><label class='f'>Или на дату<input type='date' id='mvD' value='" + next + "'></label><button class='btn' id='mvGo'>Перенести</button></div></div>" +
    "<div class='m-foot'><button class='btn ghost danger' data-act='skip'>Не было — убрать</button><span class='spacer'></span><button class='btn ghost' data-act='x'>Отмена</button></div>", function (m) {
    function go(iso) {
      var res = moveCell(y, catId, w, iso);
      if (!res) return; if (res.err) { toast(res.err); return; }
      closeModal(); if (after) after(); changed(); toast("Перенесено на " + shortWeek(res.year, res.week));
    }
    m.querySelectorAll("[data-to]").forEach(function (b) { b.onclick = function () { go(b.dataset.to); }; });
    m.querySelector("#mvGo").onclick = function () { go(m.querySelector("#mvD").value); };
    m.querySelector("[data-act=skip]").onclick = function () { skipCell(y, catId, w); closeModal(); if (after) after(); changed(); toast("Убрано из " + shortWeek(y, w)); };
    m.querySelector("[data-act=x]").onclick = closeModal;
  });
}

// Добавить трату к ячейке (складывается с тем, что уже стоит)
function addToCell(year, catId, w, valueExpr, note) {
  var c = state.categories.find(function (x) { return x.id === catId; });
  var v = E.exprCents(valueExpr);
  if (v === null) return;
  if (c.block !== "income" && v > 0) v = -v;
  var r = E.compute(state, year), cell = r.cells[catId][w];
  var entry = (state.years[year].entries[catId] || {})[w];
  var baseExpr = entry ? entry.expr : (cell ? String(cell.cents / 100) : "");
  var add = (v < 0 ? "-" : "+") + String(Math.abs(v) / 100);
  var expr = baseExpr ? baseExpr + add : add.replace(/^\+/, "");
  var n = entry && entry.note ? entry.note + (note ? "; " + note : "") : (note || "");
  E.setEntry(state, year, catId, String(w), expr, n);
}

// ---------- экраны ----------
var routes = {};


// Сверку делают, когда неделя закончилась: вечером её последнего дня или позже
// Неделя считается законченной в её последний день (обычно воскресенье) — сверку можно делать с утра
function weekDone(y, w) { var wk = E.genWeeks(Number(y))[w], t = E.todayISO(); return wk.to <= t; }
function finishedWeek() {
  var t = E.todayISO(), yN = Number(t.slice(0, 4));
  for (var yy = yN; yy >= yN - 1; yy--) {
    var ys = String(yy); if (!state.years[ys] || state.years[ys].archived) continue;
    for (var i = 59; i >= 0; i--) if (weekDone(ys, i)) return { year: ys, week: i };
  }
  return null;
}
function shortWeek(y, w) { return E.weekTitle(Number(y), w).replace(/ \d{4}$/, ""); }

// Внести трату в любую дату: прошлую или будущую
function defaultCat() {
  var c = state.categories.find(function (x) { return x.id === state.settings.lastCat && !x.archived; }) ||
    state.categories.find(function (x) { return x.block === "base" && !x.archived && /продукт/i.test(x.name); }) ||
    cats().find(function (x) { return x.block !== "income" && x.block !== "savings" && !x.archived; });
  return c ? c.id : null;
}
// недавние категории первыми, дальше — частые по умолчанию
function recentCats() {
  var ok = function (c) { return c && !c.archived && c.block !== "income" && c.block !== "savings"; }, out = [];
  (state.settings.recentCats || []).forEach(function (id) { var c = state.categories.find(function (x) { return x.id === id; }); if (ok(c)) out.push(c); });
  [/продукт/i, /развлеч/i, /одежд/i, /подар/i, /кафе|ресторан/i, /такси|транспорт|проезд/i].forEach(function (re) {
    var c = state.categories.find(function (x) { return ok(x) && re.test(x.name); });
    if (c && out.indexOf(c) < 0 && out.length < 6) out.push(c);
  });
  return out.slice(0, 6);
}
function spendModal(o) {
  if (RO()) { toast("Сейчас открыт чужой бюджет (" + view.name + ") — только просмотр"); return; }
  o = o || {};
  var date = o.date || E.todayISO();
  var incCat = o.income ? (state.categories.find(function (x) { return x.block === "income" && !x.archived; }) || {}).id : null, dc = o.cat || incCat || defaultCat();
  var chipCats = o.income ? cats().filter(function (c) { return c.block === "income" && !c.archived; }).slice(0, 6) : recentCats();
  modal("<form class='m-body' id='spForm'><h2>" + (o.income ? "Внести доход" : "Внести трату") + "</h2><p class='small muted' style='margin:2px 0 0'>Сумма прибавится к неделе, в которую попадает дата, — прошлой или будущей.</p>" +
    "<div class='form-grid' style='margin-top:14px'><label class='f'>Сумма<input type='text' name='v' inputmode='decimal' placeholder='300' required autofocus></label>" +
    "<label class='f'>Дата<input type='date' name='d' value='" + date + "' required></label>" +
    "<div class='chips sp-days' style='grid-column:1/-1'>" + [["Сегодня", 0], ["Вчера", -1], ["Неделю назад", -7]].map(function (x) { return "<button type='button' class='chip' data-dd='" + x[1] + "'>" + x[0] + "</button>"; }).join("") + "</div>" +
    "<div class='f' style='grid-column:1/-1'>Категория<div class='chips cat-chips'>" + chipCats.map(function (c) { return "<button type='button' class='chip" + (c.id === dc ? " on" : "") + "' data-cc='" + c.id + "'>" + esc(c.name) + "</button>"; }).join("") +
    "<label class='chip chip-sel" + (chipCats.some(function (c) { return c.id === dc; }) ? "" : " on") + "'><span class='cs-t'>" + (chipCats.some(function (c) { return c.id === dc; }) ? "другая ▾" : esc(catName(dc)) + " ▾") + "</span><select name='cat' aria-label='Все категории'>" + catOptions(dc, o.income ? function (c) { return c.block === "income"; } : function (c) { return c.block !== "income" && c.block !== "savings"; }) + "</select></label></div></div>" +
    "<label class='f' style='grid-column:1/-1'>Заметка<input type='text' name='note' value='" + esc(o.note || "") + "' placeholder='" + (o.income ? "например, бонус за квартал" : "например, шопинг") + "'></label></div>" +
    "<div class='sp-week small' id='spWeek'></div><button type='submit' hidden></button></form>" +
    "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Добавить</button></div>", function (m) {
    var f = m.querySelector("#spForm"), hint = m.querySelector("#spWeek");
    function target() {
      var wk = f.d.value && E.weekOfDate(f.d.value);
      if (!wk) return { err: "Укажи дату" };
      var ys = String(wk.year);
      if (!state.years[ys]) return { err: "Плана на " + ys + " год пока нет — его можно создать на экране «Год»." };
      if (state.years[ys].archived) return { err: ys + " — архивный год, в него не вносятся траты." };
      return { year: ys, week: wk.idx };
    }
    function upd() {
      var t = target();
      hint.className = "sp-week small " + (t.err ? "neg" : "muted");
      hint.innerHTML = t.err ? esc(t.err) : "Попадёт в неделю <b>" + esc(E.weekTitle(Number(t.year), t.week)) + "</b>" + (isNow(t.year, t.week) ? " · текущая" : weekDone(t.year, t.week) ? " · прошедшая" : " · будущая");
    }
    f.d.addEventListener("input", upd); upd();
    function syncChips() {
      var inChips = false;
      m.querySelectorAll("[data-cc]").forEach(function (b) { var on = b.dataset.cc === f.cat.value; b.classList.toggle("on", on); if (on) inChips = true; });
      var cs = m.querySelector(".chip-sel"); if (cs) { cs.classList.toggle("on", !inChips); cs.querySelector(".cs-t").textContent = inChips ? "другая ▾" : catName(f.cat.value) + " ▾"; }
    }
    m.querySelectorAll("[data-cc]").forEach(function (b) { b.onclick = function () { f.cat.value = b.dataset.cc; syncChips(); }; });
    f.cat.addEventListener("change", syncChips);
    m.querySelectorAll("[data-dd]").forEach(function (b) { b.onclick = function () { f.d.value = E.addDays(E.todayISO(), Number(b.dataset.dd)); upd(); }; });
    function ok() {
      var t = target(); if (t.err) { toast(t.err); return; }
      if (!f.v.value.trim()) { f.v.focus(); return; }
      try { addToCell(t.year, f.cat.value, t.week, f.v.value, f.note.value); } catch (err) { toast("Ошибка в сумме: " + err.message); return; }
      state.settings.lastCat = f.cat.value;
      state.settings.recentCats = [f.cat.value].concat((state.settings.recentCats || []).filter(function (x) { return x !== f.cat.value; })).slice(0, 6);
      closeModal(); if (o.after) o.after(t);
      toast("Добавлено в «" + catName(f.cat.value) + "» · " + shortWeek(t.year, t.week)); changed();
    }
    f.onsubmit = function (e) { e.preventDefault(); ok(); };
    m.querySelector("[data-act=ok]").onclick = ok;
    m.querySelector("[data-act=cancel]").onclick = closeModal;
  });
}

// Напоминание о сверке — событием в календаре (повтор каждую неделю)
function reminderModal() {
  var cur = Object.assign({ day: "MO", time: "09:00" }, state.settings.reminder || {});
  var P = window.BudgetPush, canPush = Store.mode === "cloud" && P && (P.supported() || P.needsInstall());
  modal("<div class='m-body'><h2>Напоминание о сверке</h2><p class='small muted' style='margin:2px 0 0'>" + (canPush ? "Уведомление на телефон или событие в календаре — раз в неделю, со ссылкой на сверку." : "Добавлю в календарь событие на каждую неделю со ссылкой на сверку.") + "</p>" +
    "<div class='rem-opts'>" + [["MO", "Понедельник утром", "все траты недели уже в выписке"], ["SU", "Воскресенье вечером", "подвести итог перед новой неделей"]].map(function (x) {
      return "<label class='rem-opt'><input type='radio' name='rd' value='" + x[0] + "'" + (cur.day === x[0] ? " checked" : "") + "><span><b>" + x[1] + "</b><small>" + x[2] + "</small></span></label>";
    }).join("") + "</div><label class='f' style='max-width:160px'>Время<input type='time' id='rt' value='" + esc(cur.time) + "'></label>" +
    (canPush ? "<div class='push-box' id='pushBox'><span class='small muted'>Проверяю уведомления…</span></div>" : "") + "</div>" +
    "<div class='m-foot'><button class='btn ghost' data-act='off'>Не нужно</button><span class='spacer'></span>" + (canPush ? "<span class='small muted'>или в календарь:</span>" : "") +
    "<button class='btn' data-act='google'>Google</button><button class='btn" + (canPush ? "" : " primary") + "' data-act='ics'>Apple / Outlook</button></div>", function (m) {
    if (canPush) drawPushBox(m, cur);
    m.querySelector("[data-act=off]").onclick = function () { state.settings.reminder = { off: true, day: cur.day, time: cur.time }; closeModal(); changed(); toast("Хорошо, без напоминания. Включить можно в «Настройках»"); };
    m.querySelectorAll("[name=rd]").forEach(function (r) { r.onchange = function () { m.querySelector("#rt").value = r.value === "MO" ? "09:00" : "19:00"; }; });
    function pick() {
      var day = m.querySelector("[name=rd]:checked").value, time = m.querySelector("#rt").value || "09:00";
      var d = new Date(), want = day === "MO" ? 1 : 0;
      d.setDate(d.getDate() + ((want - d.getDay() + 7) % 7 || 7));
      var p2 = function (n) { return (n < 10 ? "0" : "") + n; }, hm = time.split(":");
      var start = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "T" + p2(+hm[0]) + p2(+hm[1]) + "00";
      var endD = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +hm[0], +hm[1] + 15);
      var end = endD.getFullYear() + p2(endD.getMonth() + 1) + p2(endD.getDate()) + "T" + p2(endD.getHours()) + p2(endD.getMinutes()) + "00";
      var url = location.origin + location.pathname + "#recon";
      state.settings.reminder = { day: day, time: time };
      return { day: day, start: start, end: end, url: url };
    }
    var title = "Сверка бюджета", text = "Впиши остатки на картах и в наличке.";
    m.querySelector("[data-act=ics]").onclick = function () {
      var x = pick(), stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
      var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Easy Budget//RU", "BEGIN:VEVENT", "UID:easy-budget-recon-" + Date.now() + "@easy-budget", "DTSTAMP:" + stamp,
        "DTSTART:" + x.start, "DTEND:" + x.end, "RRULE:FREQ=WEEKLY;BYDAY=" + x.day, "SUMMARY:" + title, "DESCRIPTION:" + text + "\\n" + x.url, "URL:" + x.url,
        "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:PT0M", "DESCRIPTION:" + title, "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) location.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
      else download("easy-budget-sverka.ics", ics, "text/calendar");
      closeModal(); changed(); toast("Открой файл — событие добавится в календарь");
    };
    m.querySelector("[data-act=google]").onclick = function () {
      var x = pick(), tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      window.open("https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) + "&details=" + encodeURIComponent(text + "\n" + x.url) +
        "&dates=" + x.start + "/" + x.end + "&recur=" + encodeURIComponent("RRULE:FREQ=WEEKLY;BYDAY=" + x.day) + (tz ? "&ctz=" + encodeURIComponent(tz) : ""), "_blank", "noopener");
      closeModal(); changed(); toast("Сохрани событие в Google Календаре");
    };
  });
}

// уведомление на телефон: состояние на этом устройстве и кнопки
function drawPushBox(m, cur) {
  var box = m.querySelector("#pushBox"), P = window.BudgetPush;
  function val() { return { day: m.querySelector("[name=rd]:checked").value, time: m.querySelector("#rt").value || "09:00" }; }
  if (P.needsInstall()) {
    box.innerHTML = "<b>Уведомление на телефон</b><p class='small' style='margin:4px 0 0'>На iPhone уведомления приходят только приложению с экрана «Домой»: в Safari нажми <b>Поделиться</b> → <b>На экран «Домой»</b>, открой Easy Budget с иконки и вернись сюда.</p>";
    return;
  }
  P.status().then(function (st) {
    if (st.on) {
      var r = st.row || {};
      box.innerHTML = "<b>Уведомления включены</b> <span class='small muted'>· " + (r.day === "SU" ? "воскресенье" : "понедельник") + " " + esc(r.time || "") + "</span>" +
        "<div class='row' style='margin-top:8px'><button class='btn sm primary' data-p='save'>Сохранить день и время</button><button class='btn sm' data-p='test'>Прислать тестовое</button><button class='btn sm ghost danger' data-p='off'>Выключить</button></div>";
    } else if (st.permission === "denied") {
      box.innerHTML = "<b>Уведомления запрещены</b><p class='small' style='margin:4px 0 0'>Разреши их для Easy Budget в настройках телефона (Настройки → Уведомления), потом вернись сюда.</p>";
    } else {
      box.innerHTML = "<b>Уведомление на телефон</b><p class='small muted' style='margin:2px 0 8px'>Придёт в выбранный день и время, даже если приложение закрыто.</p><button class='btn primary' data-p='on'>Присылать уведомление</button>";
    }
    function act(p, label, after) {
      var b = box.querySelector("[data-p=" + p + "]"); if (!b) return;
      b.onclick = function () {
        b.disabled = true; b.textContent = label;
        after().catch(function (e) { toast(e.message || "Не получилось"); }).then(function () { if (box.isConnected) drawPushBox(m, cur); });
      };
    }
    var turnOn = function () { var v = val(); return P.enable(v.day, v.time).then(function () { state.settings.reminder = { day: v.day, time: v.time, push: true }; changed(true); toast("Готово — напомню в " + (v.day === "SU" ? "воскресенье" : "понедельник") + " в " + v.time); }); };
    act("on", "Включаю…", turnOn);
    act("save", "Сохраняю…", turnOn);
    act("test", "Отправляю…", function () { return P.test().then(function (r) { toast(r && r.sent ? "Отправила — уведомление придёт через пару секунд" : "Не получилось отправить: " + ((r && r.error) || "нет устройств")); }); });
    act("off", "Выключаю…", function () { return P.disable().then(function () { if (state.settings.reminder) { delete state.settings.reminder.push; changed(true); } toast("Уведомления на этом устройстве выключены"); }); });
  });
}
// «На экран Домой»: на iPhone — инструкция, на Android/компьютере — системная кнопка установки
var installEvt = null;
window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvt = e; });
function reminderPushAsked() { try { return localStorage.getItem("eb:pushAsked") === "1"; } catch (e) { return false; } }
function installHintNeeded() {
  if (window.BudgetPush && window.BudgetPush.standalone()) return false;
  try { if (localStorage.getItem("eb:installHint") === "done") return false; } catch (e) { /* без хранилища — показываем */ }
  return !!installEvt || (window.BudgetPush && window.BudgetPush.isIOS());
}
function installModal() {
  var done = function () { try { localStorage.setItem("eb:installHint", "done"); } catch (e) { /* ок */ } };
  if (installEvt) { installEvt.prompt(); installEvt.userChoice.then(function () { installEvt = null; done(); render(); }); return; }
  modal("<div class='m-body'><h2>Easy Budget на экран «Домой»</h2><ol class='install-steps'><li>Открой сайт в <b>Safari</b>.</li><li>Нажми <b>Поделиться</b> <span aria-hidden='true'>⎋</span> внизу экрана.</li><li>Выбери <b>На экран «Домой»</b> → <b>Добавить</b>.</li></ol>" +
    "<p class='small muted'>Приложение откроется на весь экран, без адресной строки, и сможет присылать напоминания о сверке.</p></div>" +
    "<div class='m-foot'><button class='btn ghost' data-act='done'>Уже добавила</button><span class='spacer'></span><button class='btn primary' data-act='ok'>Понятно</button></div>", function (m) {
    m.querySelector("[data-act=ok]").onclick = closeModal;
    m.querySelector("[data-act=done]").onclick = function () { done(); closeModal(); render(); };
  });
}

// ---------- выводы: карточки и «бутерброд» (метод — ANALYSIS_METHOD.md) ----------
function insightCard(c, zone) {
  return "<div class='card insight " + zone + "'><div class='ic' aria-hidden='true'>" + esc(c.ic || "·") + "</div><div><b>" + esc(c.h) + "</b>" +
    (c.gloss && GLOSSARY[c.gloss] ? " <button class='gloss-q' data-gloss='" + c.gloss + "' aria-label='Что это: " + esc(GLOSSARY[c.gloss][0]) + "'>?</button>" : "") +
    "<p>" + esc(c.p) + "</p>" + (c.act ? "<button class='btn sm' data-iact='" + c.act + "'>" + esc(c.actLabel || "Открыть") + "</button>" : "") + "</div></div>";
}
// res — результат BudgetInsights.personal / together; opts.after — html под «Шагом вперёд»
function sandwichHtml(res, opts) {
  opts = opts || {};
  var html = "<div class='section'><h2>Что получилось</h2><div class='grid2'>" +
    (res.good.length ? res.good.map(function (c) { return insightCard(c, "good"); }).join("") : res.neutral ? insightCard(res.neutral, "") : "<p class='muted'>Пока мало данных — появится после первых сверок.</p>") + "</div></div>";
  if (res.improve.length) html += "<div class='section'><h2>Что можно улучшить</h2><div class='grid2'>" + res.improve.map(function (c) { return insightCard(c, "improve"); }).join("") + "</div></div>";
  if (res.next) html += "<div class='section'><h2>Шаг вперёд</h2><div class='card insight next'><div class='ic' aria-hidden='true'>→</div><div><p style='margin:0'>" + esc(res.next) + "</p></div></div>" + (opts.after || "") + "</div>";
  else if (opts.after) html += "<div class='section'>" + opts.after + "</div>";
  if (res.info.length) html += "<details class='section sh-more'><summary><h2>Для справки</h2><span class='small muted'>" + res.info.length + " " + (res.info.length === 1 ? "наблюдение" : res.info.length < 5 ? "наблюдения" : "наблюдений") + "</span></summary><div class='grid2'>" +
    res.info.map(function (c) { return insightCard(c, ""); }).join("") + "</div></details>";
  return html;
}
function bindInsights(rootEl) {
  rootEl.querySelectorAll("[data-gloss]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); explain(b.dataset.gloss); }; });
  rootEl.querySelectorAll("[data-iact]").forEach(function (b) {
    b.onclick = function () {
      var a = b.dataset.iact;
      if (a === "settle") return go("#shared", function () { var s = document.getElementById("settle"); if (s) s.click(); });
      go("#" + a);
    };
  });
}
function insightCtx() {
  return { today: E.todayISO(), shared: !RO() && sh ? sharedForCalc() : null, toLog: !RO() && sh ? toLogCount() : 0, partnerName: partnerName() };
}

// ---------- Google Таблица: после изменений книга уходит в облако, скрипт в таблице забирает её сам ----------
var sheetLink = null, sheetPushT = null, sheetLastKey = null;
function sheetModel() {
  var exps = sh ? sh.expenses : [];
  return window.BudgetSheet.workbook(myState, { expenses: exps, partnerName: sh && sh.partner ? sh.partner.name : "", learned: sh ? sh.learned : {}, shared: sh ? sharedForCalc() : null });
}
function sheetKey() { // меняется, только если поменялись данные (или наступил новый день — текущая неделя в таблице)
  var str = JSON.stringify(myState) + "|" + (sh ? sh.rows.length + ":" + sh.rows.reduce(function (m, r) { var t = r.updated_at || r.created_at || ""; return t > m ? t : m; }, "") : "") + "|" + E.todayISO();
  var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ":" + str.length;
}
function scheduleSheetPush(now) {
  if (Store.mode !== "cloud" || !sheetLink || !myState || RO()) return;
  clearTimeout(sheetPushT);
  sheetPushT = setTimeout(function () {
    var key = sheetKey();
    if (key === sheetLastKey && !now) return;
    var model; try { model = sheetModel(); } catch (e) { console.warn("sheet model", e); return; }
    Store.sheetPush(model).then(function () { sheetLastKey = key; sheetLink.updated_at = new Date().toISOString(); }).catch(function () { /* нет связи — отправится после следующего сохранения */ });
  }, now ? 0 : 15000);
}
function loadSheetLink() {
  if (Store.mode !== "cloud") return Promise.resolve(null);
  return Store.sheetStatus().then(function (row) { sheetLink = row; if (row) scheduleSheetPush(); return row; }).catch(function () { return null; });
}

// линия под полосой статус-бара появляется, только когда страница прокручена
window.addEventListener("scroll", function () { document.body.classList.toggle("scrolled", window.scrollY > 4); }, { passive: true });
