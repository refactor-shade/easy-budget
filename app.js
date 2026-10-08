/* Easy Budget — интерфейс. Хранение — через BudgetStore (облако Supabase или этот браузер). */
(function () {
  "use strict";
  var K = window.BudgetCash, E = window.BudgetEngine, S = window.BudgetShared, C = window.BudgetCharts, Store = window.BudgetStore, SU = window.BudgetStoreUtil;
  var $main = document.getElementById("main");
  var state = null;      // бюджет на экране (мой или партнёра)
  var myState = null;    // мой бюджет
  var view = { who: "me", level: "full", name: "", summary: null };
  var people = [];       // чьи бюджеты я могу смотреть
  var sh = null;         // общее пространство: {space, people, meId, partnerId, rows, expenses, learned}
  var ui = { year: null, week: 0, recWeek: null, shared: { year: null, month: "all", cat: "all", kind: "all", limit: 80 } };

  function RO() { return view.who !== "me"; }

  // ---------- сохранение ----------
  var saveTimer = null, saving = false, pending = false;
  function setSync(text, cls) {
    var el = document.getElementById("sync");
    if (el) { el.textContent = text; el.className = "sync " + (cls || ""); }
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
      setSync(Store.mode === "cloud" ? "сохранено в облаке" : "сохранено в браузере", "ok");
      if (pending) flush();
    }).catch(function (err) {
      saving = false;
      if (err && err.code === "conflict") {
        toast("Бюджет изменили на другом устройстве — загружаю свежую версию");
        pending = false;
        return reloadMine();
      }
      pending = true;
      setSync("нет связи — сохраню позже", "warn");
      setTimeout(flush, 15000);
    });
  }
  window.addEventListener("online", function () { if (pending) flush(); });
  window.addEventListener("beforeunload", function (e) { if (pending || saving) { flush(); e.preventDefault(); e.returnValue = ""; } });
  // вернулась к вкладке — проверить, не изменили ли бюджет с другого устройства
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible" || Store.mode !== "cloud" || pending || saving || !myState) return;
    Store.remoteVersion().then(function (v) { if (v && v !== Store.localVersion()) reloadMine(); }).catch(function () {});
  });
  function reloadMine() {
    return Store.loadMyBudget().then(function (b) {
      if (!b) return;
      myState = migrate(b.data);
      if (view.who === "me") state = myState;
      render();
    });
  }
  function changed(noRender) {
    if (RO()) { toast("Сейчас открыт чужой бюджет (" + view.name + ") — только просмотр"); return; }
    state._ver = (state._ver || 0) + 1;
    save();
    if (!noRender) render();
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
    if (s.settings.diffAlert === undefined) s.settings.diffAlert = -5000;
    s._ver = 1;
    return s;
  }

  // ---------- общее пространство ----------
  function loadShared() {
    return Store.loadSpace().then(function (sp) {
      if (!sp) { sh = null; return; }
      var me = Store.user();
      var mine = sp.people.find(function (p) { return p.userId === me.id; }) || sp.people[0];
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
          Store.subscribeShared(sp.space.id, function () { clearTimeout(t); t = setTimeout(function () { loadShared().then(function () { if (/shared|insights/.test(location.hash)) render(); }); }, 400); });
        }
      });
    });
  }
  function sharedForCalc() { return sh ? { expenses: sh.expenses, learned: sh.learned } : { expenses: [], learned: {} }; }
  function saveLearned() { if (sh) Store.saveSpaceSettings(sh.space.id, sh.space.settings).catch(function () {}); }

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
      render();
    }).catch(function (e) { toast("Не удалось загрузить: " + e.message); switchTo("me"); });
  }
  function profileBar() {
    var bar = document.getElementById("profiles");
    if (!bar) return;
    var meName = (Store.user() && Store.user().name) || "Я";
    var html = "<button class='chip" + (view.who === "me" ? " on" : "") + "' data-who='me'>" + esc(meName) + " · я</button>";
    people.forEach(function (p) {
      html += "<button class='chip" + (view.who === p.userId ? " on" : "") + "' data-who='" + esc(p.userId) + "'" + (p.theirLevel === "hidden" ? " title='закрыла доступ'" : "") + ">" +
        esc(p.name) + (p.theirLevel === "totals" ? " · итоги" : p.theirLevel === "hidden" ? " · скрыто" : "") + "</button>";
    });
    bar.innerHTML = (people.length ? html : "") + "<span class='spacer'></span><span id='sync' class='sync'>" + (Store.mode === "cloud" ? "облако" : "этот браузер") + "</span>";
    bar.querySelectorAll("[data-who]").forEach(function (b) { b.onclick = function () { switchTo(b.dataset.who); }; });
  }

  // ---------- утилиты ----------
  function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function eur(c, o) { return E.eur(c, o); }
  function rnd(c) { return c === null || c === undefined ? null : Math.round(c / 100) * 100; }
  function sign(c) { return c > 0 ? "pos" : c < 0 ? "neg" : ""; }
  function cats() { return state.categories.slice().sort(function (a, b) { return a.sort - b.sort; }); }
  function catName(id) { var c = state.categories.find(function (x) { return x.id === id; }); return c ? c.name : id; }
  function years() { return Object.keys(state.years).sort(); }
  function activeYears() { return years().filter(function (y) { return !state.years[y].archived; }); }
  function toast(msg) {
    var t = document.getElementById("toast");
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

  function defaultYearWeek() {
    if (!state) return null;
    var t = E.todayISO(), wk = E.weekOfDate(t), ys = activeYears();
    if (wk && state.years[String(wk.year)] && !state.years[String(wk.year)].archived) return { year: String(wk.year), week: wk.idx };
    return { year: ys[ys.length - 1] || years()[0], week: 0 };
  }
  function isNow(year, w) { var wk = E.weekOfDate(E.todayISO()); return wk && String(wk.year) === String(year) && wk.idx === w; }

  // ---------- модалка ----------
  var $modal = document.getElementById("modal");
  function modal(html, onReady) {
    $modal.className = "modal";
    $modal.innerHTML = html;
    if (!$modal.open) $modal.showModal();
    var f = $modal.querySelector("[autofocus]") || $modal.querySelector("input,select");
    if (f) setTimeout(function () { f.focus(); if (f.select) f.select(); }, 30);
    if (onReady) onReady($modal);
  }
  function closeModal() { if ($modal.open) $modal.close(); }
  $modal.addEventListener("click", function (e) { if (e.target === $modal) closeModal(); });

  // Редактирование ячейки категория × неделя
  function editCell(year, catId, w) {
    if (RO()) { toast("Сейчас открыт чужой бюджет (" + view.name + ") — только просмотр"); return; }
    var r = E.compute(state, year), cell = r.cells[catId][w], c = state.categories.find(function (x) { return x.id === catId; });
    var wk = r.weeks[w], entry = (state.years[year].entries[catId] || {})[w];
    var recCell = E.yearCells(Object.assign({}, state, { years: (function () { var o = {}; o[year] = Object.assign({}, state.years[year], { entries: {} }); return o; })() }), year)[catId][w];
    modal("<form method='dialog' class='m-body' id='cellForm'><h2>" + esc(c.name) + "</h2><div class='sub'>" + E.weekTitle(Number(year), w) +
      " · " + wk.wim + "-я неделя месяца</div>" +
      (recCell ? "<div class='hint small'>Регулярная трата: <b>" + E.fmt(recCell.cents, { cur: cur(c) }) + "</b>. Сумма, вписанная вручную, заменит её в этой неделе.</div>" : "") +
      "<div class='form-grid' style='margin-top:14px'><label class='f' style='grid-column:1/-1'>Сумма или формула (минус — расход): <input type='text' name='expr' autofocus value='" +
      esc(entry ? entry.expr : (cell ? (cell.cents / 100).toString() : "")) + "' placeholder='-35-20' inputmode='decimal'></label>" +
      "<label class='f' style='grid-column:1/-1'>Заметка <input type='text' name='note' value='" + esc(entry ? entry.note : "") + "' placeholder='что это было'></label></div>" +
      "<div class='small muted' id='cellPreview' style='margin-top:8px'></div></form>" +
      "<div class='m-foot'>" + (entry ? "<button class='btn ghost danger' data-act='clear'>" + (recCell ? "Вернуть регулярную" : "Удалить") + "</button>" : "") +
      "<span class='spacer'></span><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='save'>Сохранить</button></div>",
    function (m) {
      var inp = m.querySelector("[name=expr]"), pv = m.querySelector("#cellPreview");
      function preview() {
        try { var v = E.exprCents(inp.value); pv.textContent = v === null ? "" : "= " + E.fmt(v, { cur: cur(c) }); pv.className = "small muted"; }
        catch (err) { pv.textContent = "Ошибка в формуле: " + err.message; pv.className = "small neg"; }
      }
      inp.addEventListener("input", preview); preview();
      function doSave() {
        try { E.exprCents(inp.value); } catch (err) { return; }
        E.setEntry(state, year, catId, String(w), inp.value, m.querySelector("[name=note]").value);
        closeModal(); changed();
      }
      m.querySelector("#cellForm").addEventListener("submit", function (e) { e.preventDefault(); doSave(); });
      m.querySelector("[data-act=save]").onclick = doSave;
      m.querySelector("[data-act=cancel]").onclick = closeModal;
      var cl = m.querySelector("[data-act=clear]");
      if (cl) cl.onclick = function () { E.setEntry(state, year, catId, String(w), ""); closeModal(); changed(); };
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
  function weekDone(y, w) { var wk = E.genWeeks(Number(y))[w], t = E.todayISO(); return wk.to < t || (wk.to === t && new Date().getHours() >= 18); }
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
    modal("<form class='m-body' id='spForm'><h2>Внести трату</h2><p class='small muted' style='margin:2px 0 0'>Сумма прибавится к плану недели, в которую попадает дата, — прошлой или будущей.</p>" +
      "<div class='form-grid' style='margin-top:14px'><label class='f'>Сумма<input type='text' name='v' inputmode='decimal' placeholder='300' required autofocus></label>" +
      "<label class='f'>Дата<input type='date' name='d' value='" + date + "' required></label>" +
      "<div class='chips sp-days' style='grid-column:1/-1'>" + [["Сегодня", 0], ["Вчера", -1], ["Неделю назад", -7]].map(function (x) { return "<button type='button' class='chip' data-dd='" + x[1] + "'>" + x[0] + "</button>"; }).join("") + "</div>" +
      "<div class='f' style='grid-column:1/-1'>Категория<div class='chips cat-chips'>" + recentCats().map(function (c) { return "<button type='button' class='chip" + (c.id === defaultCat() ? " on" : "") + "' data-cc='" + c.id + "'>" + esc(c.name) + "</button>"; }).join("") + "</div>" +
      "<select name='cat' aria-label='Все категории'>" + catOptions(defaultCat()) + "</select></div>" +
      "<label class='f' style='grid-column:1/-1'>Заметка<input type='text' name='note' placeholder='например, шопинг'></label></div>" +
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
      function syncChips() { m.querySelectorAll("[data-cc]").forEach(function (b) { b.classList.toggle("on", b.dataset.cc === f.cat.value); }); }
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
    modal("<div class='m-body'><h2>Напоминание о сверке</h2><p class='small muted' style='margin:2px 0 0'>Добавлю в календарь событие на каждую неделю со ссылкой на сверку.</p>" +
      "<div class='rem-opts'>" + [["MO", "Понедельник утром", "все траты недели уже в выписке"], ["SU", "Воскресенье вечером", "подвести итог перед новой неделей"]].map(function (x) {
        return "<label class='rem-opt'><input type='radio' name='rd' value='" + x[0] + "'" + (cur.day === x[0] ? " checked" : "") + "><span><b>" + x[1] + "</b><small>" + x[2] + "</small></span></label>";
      }).join("") + "</div><label class='f' style='max-width:160px'>Время<input type='time' id='rt' value='" + esc(cur.time) + "'></label></div>" +
      "<div class='m-foot'><button class='btn ghost' data-act='off'>Не нужно</button><span class='spacer'></span><button class='btn' data-act='google'>Google Календарь</button><button class='btn primary' data-act='ics'>Apple / Outlook</button></div>", function (m) {
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

  // ===== ГЛАВНАЯ =====
  function myName() { var n = Store.user() && Store.user().name; if (!n || n === "Я") n = state.settings.myName || ""; return n.split(" ")[0]; }
  function partnerName() { return sh && sh.partner ? sh.partner.name : "партнёр"; }
  function greeting() { var h = new Date().getHours(); return h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер"; }
  function go(hash, after) { location.hash = hash; if (after) setTimeout(after, 60); }

  routes.home = function () {
    var d = defaultYearWeek(), y = d.year, w = d.week;
    var r = E.compute(state, y), wk = r.weeks[w], mon = E.monthly(state, y).months[wk.month - 1];
    var today = new Date(), t = E.todayISO();
    var dateLine = today.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
    var minV = Infinity, minW = w;
    for (var i = w; i < 60; i++) if (r.base[i] < minV) { minV = r.base[i]; minW = i; }
    var lastRec = -1; for (i = w; i >= 0; i--) if (r.fact[i] !== null) { lastRec = i; break; }
    var prevEnd = (wk.month - 1) * 5 - 1, capFrom = prevEnd >= 0 ? r.cap[prevEnd] : r.startCap, dCap = r.cap[w] - capFrom;
    var name = myName(), ro = RO();

    // что сделать
    var todo = [];
    if (!ro) {
      var fw = finishedWeek(), fr = fw ? E.compute(state, fw.year) : null;
      if (fw && fr.fact[fw.week] === null) todo.push({ ic: "✓", h: "Сверка за " + shortWeek(fw.year, fw.week), p: "Впиши остатки на картах и в наличке — пара минут." +
        (lastRec < 0 ? "" : " Последняя сверка — " + shortWeek(y, lastRec) + "."), act: "recon", rw: fw });
      else if (fw && fr.diff[fw.week] < state.settings.diffAlert) todo.push({ k: "warn", ic: "!", h: "Расхождение " + eur(rnd(fr.diff[fw.week]), { dec: 0, plus: true }) + " за " + shortWeek(fw.year, fw.week),
        p: "Денег меньше, чем по плану. Найди в выписке крупную трату и внеси её.", act: "recon", rw: fw });
      var yrH = state.years[y], planEmpty = !(yrH.recurring || []).length && !Object.keys(yrH.entries || {}).some(function (k) { return Object.keys(yrH.entries[k]).length; });
      if (planEmpty) todo.unshift({ ic: "↻", h: "Заполнить план на " + y, p: "Начни с того, что повторяется: зарплата, аренда, подписки. Один раз — и суммы встанут во все недели.", act: "recurring" });
      var nLog = toLogCount();
      if (nLog) todo.push({ ic: "⇄", h: nLog + " " + (nLog % 10 === 1 && nLog % 100 !== 11 ? "общая трата" : nLog % 10 >= 2 && nLog % 10 <= 4 && (nLog % 100 < 10 || nLog % 100 >= 20) ? "общие траты" : "общих трат") + " не в личном плане", p: "Внеси их в свой план одной кнопкой или отметь, что уже есть.", act: "tolog" });
      if (!state.settings.reminder) todo.push({ ic: "◷", h: "Поставить напоминание о сверке", p: "Событие в календаре раз в неделю — чтобы не забывать.", act: "reminder" });
      if (minV < 0) todo.push({ k: "warn", ic: "!", h: "Самый низкий остаток — " + eur(rnd(minV), { dec: 0 }) + ", " + shortWeek(y, minW), p: "Остаток уходит в минус. Можно сдвинуть крупные траты или переложить из накоплений.", act: "year" });
      if (!sh) todo.push({ ic: "⇄", h: "Подключить общие траты", p: "Траты на двоих: кто сколько заплатил и кто кому должен, как в Splitwise.", act: "shared" });
      else {
        if (sh.partner && !sh.partner.userId && Store.mode === "cloud") todo.push({ ic: "✉", h: esc(partnerName()) + " ещё не вошла", p: "Пришли ей ссылку на сайт — пусть войдёт с " + esc(sh.partner.email || "своим email") + ", пространство подключится само.", act: "shared" });
        var bal = S.balance(sh.expenses).EUR || 0;
        if (Math.abs(bal) >= 5000) todo.push({ ic: "€", h: bal > 0 ? esc(partnerName()) + " должна тебе " + eur(bal, { dec: 0 }) : "Ты должна " + esc(partnerName()) + " " + eur(-bal, { dec: 0 }), p: "Можно рассчитаться на экране «Общие».", act: "shared" });
      }
      var ny = String(Number(y) + 1);
      if (wk.month >= 10 && !state.years[ny]) todo.push({ ic: "▦", h: "Пора набросать план на " + ny, p: "Создай его на экране «Год» — регулярные траты перенесутся сами.", act: "year" });
      if (!state.settings.tourDone) todo.push({ ic: "?", h: "Пройти знакомство — 1 минута", p: "Что такое «в обращении», зачем сверка и где что лежит.", act: "tour" });
    }

    // план недели
    var items = [], tin = 0, tout = 0;
    cats().forEach(function (c) {
      var cell = r.cells[c.id][w]; if (!cell) return;
      var v = c.currency === "RUB" ? 0 : cell.cents;
      if (c.block !== "savings") { if (v > 0) tin += v; else tout += v; }
      items.push({ c: c, cell: cell });
    });
    items.sort(function (a, b) { return Math.abs(b.cell.cents) - Math.abs(a.cell.cents); });

    var html = "<div class='home'>";
    html += "<header class='home-head'><div class='home-date'>" + esc(dateLine) + " · " + wk.wim + "-я неделя месяца</div>" +
      "<h1>" + greeting() + (name && !ro ? ", " + esc(name) : "") + "</h1>" + (ro ? "<div class='sub'>Бюджет " + esc(view.name) + " — только просмотр</div>" : "") + "</header>";

    // главный блок
    var ok = minV >= 0;
    html += "<section class='hero card'><div class='hero-main'><div class='hero-label'>В обращении сейчас</div>" +
      "<button class='hero-value' data-ob='1' title='Из чего складывается'>" + eur(rnd(r.base[w]), { dec: 0 }) + "</button>" +
      "<div class='hero-status " + (ok ? "good" : "bad") + "'><span class='dot'></span>" + "Самый низкий остаток — " + eur(rnd(minV), { dec: 0 }) + "</div>" +
      "<div class='hero-min small'>" + esc(shortWeek(y, minW)) + ", если всё пойдёт по плану</div>" +
      "<div class='hero-note small muted'>" + (r.fact[w] === null ? (lastRec >= 0 ? "Посчитано от сверки " + esc(shortWeek(y, lastRec)) : "Посчитано по плану, сверок ещё не было") : "По сверке этой недели") +
      " · <button class='linkish' data-ob='1'>из чего складывается</button></div></div>" +
      "<div class='hero-side'><div class='hero-label'>Капитал</div><div class='hero-cap'>" + eur(rnd(r.cap[w]), { dec: 0 }) + "</div>" +
      "<div class='small'><span class='" + sign(dCap) + "'>" + eur(rnd(dCap), { dec: 0, plus: true }) + "</span> <span class='muted'>с начала " + E.MONTHS_GEN[wk.month - 1] + "</span></div>" +
      "<div class='hero-chart'>" + spark(r.cap, w, y) + "</div></div></section>";

    // хорошие новости: только правдивое, до трёх
    var wins = [], ytd = r.cap[w] - (r.startCap || 0), toEnd = r.cap[59] - r.cap[w];
    if (ytd >= 10000) wins.push({ v: eur(rnd(ytd), { dec: 0, plus: true }), t: "капитал с начала года" });
    if (toEnd >= 10000 && w < 59) wins.push({ v: eur(rnd(toEnd), { dec: 0, plus: true }), t: "накопишь до конца года — капитал будет " + eur(rnd(r.cap[59]), { dec: 0 }) });
    if (mon.saved >= 5000) wins.push({ v: eur(rnd(mon.saved), { dec: 0 }), t: "отложишь в накопления в " + E.MONTHS[wk.month - 1].replace(/ь$/, "е").replace(/й$/, "е").replace(/т$/, "те") });
    var fwH = finishedWeek(), frH = fwH ? E.compute(state, fwH.year) : null;
    if (fwH && frH.diff[fwH.week] !== null && frH.diff[fwH.week] >= 1000) wins.push({ v: eur(rnd(frH.diff[fwH.week]), { dec: 0, plus: true }), t: "к плану по сверке за " + shortWeek(fwH.year, fwH.week) });
    if (fwH) { var streak = 0; for (var si = fwH.week; si >= 0 && frH.fact[si] !== null; si--) streak++; if (streak >= 3) wins.push({ v: streak + " " + (streak % 10 >= 2 && streak % 10 <= 4 && (streak % 100 < 10 || streak % 100 >= 20) ? "недели" : "недель"), t: "сверок подряд без пропусков" }); }
    if (wins.length && !ro) html += "<div class='wins'>" + wins.slice(0, 3).map(function (x) { return "<div class='win'><span class='win-ic' aria-hidden='true'>↑</span><span><b>" + x.v + "</b> " + esc(x.t) + "</span></div>"; }).join("") + "</div>";

    // быстрые действия
    if (!ro) html += "<div class='quick-row'>" +
      "<button class='qa' data-q='spend'><span class='qa-ic'>+</span><span><b>Трата</b><small>внести в личный план</small></span></button>" +
      "<button class='qa' data-q='shared'><span class='qa-ic'>⇄</span><span><b>Общая трата</b><small>поделить с " + esc(sh ? partnerName() : "партнёром") + "</small></span></button>" +
      "<button class='qa' data-q='cash'><span class='qa-ic'>₵</span><span><b>Наличка</b><small>" + (cashEurTotal() !== null ? E.eur(cashEurTotal(), { dec: 0 }) + " в кошельке и конвертах" : "кошелёк и конверты") + "</small></span></button>" +
      "<button class='qa' data-q='recon'><span class='qa-ic'>✓</span><span><b>Сверка</b><small>за прошедшую неделю</small></span></button></div>";

    html += "<div class='home-grid'>";
    // дела
    if (!ro) html += "<section class='card a-todo'><h2>Что сделать</h2>" + (todo.length ? "<ul class='todo-list'>" + todo.map(function (x, j) {
      return "<li class='" + (x.k || "") + "' data-todo='" + j + "'><span class='ic'>" + x.ic + "</span><span class='tx'><b>" + x.h + "</b><span>" + x.p + "</span></span><span class='arr'>›</span></li>";
    }).join("") + "</ul>" : "<p class='all-good'><span class='ic'>✓</span>Всё сделано. Можно ничего не трогать до следующей недели.</p>") +
      "<div class='rc-home'><span class='small muted'>Сверки за последние недели</span>" + reconCalendar(y, true) + "</div></section>";

    // неделя
    html += "<section class='card a-week'><div class='row'><h2 style='margin:0'>Эта неделя</h2><span class='spacer'></span><span class='small muted'>" + esc(E.weekTitle(Number(y), w)) + "</span></div>" +
      "<div class='mini-kpis'><div><span class='muted small'>приход</span><b class='pos'>" + eur(tin, { dec: 0 }) + "</b></div><div><span class='muted small'>расход</span><b>" + eur(-tout, { dec: 0 }) + "</b></div></div>" +
      (items.length ? "<ul class='plan-list'>" + items.slice(0, 5).map(function (x) {
        return "<li data-go='week'><span class='name'>" + esc(x.c.name) + "</span><span class='badge " + x.cell.src + "'>" + (x.cell.src === "rec" ? "регулярная" : "вручную") + "</span><span class='val " + sign(x.cell.cents) + "'>" + E.fmt(x.cell.cents, { cur: cur(x.c), dec: 0 }) + "</span></li>";
      }).join("") + "</ul>" : "<p class='empty'>На эту неделю ничего не запланировано.</p>") +
      "<button class='btn ghost sm more' data-go='week'>" + (items.length > 5 ? "Ещё " + (items.length - 5) + " · " : "") + "открыть неделю ›</button></section>";

    // месяц
    var monthName = E.MONTHS[wk.month - 1];
    html += "<section class='card a-month'><div class='row'><h2 style='margin:0'>" + monthName[0].toUpperCase() + monthName.slice(1) + "</h2><span class='spacer'></span><span class='small muted'>неделя " + wk.wim + " из 5</span></div>" +
      "<div class='month-bar' aria-hidden='true'>" + [1, 2, 3, 4, 5].map(function (n) { return "<span class='" + (n < wk.wim ? "past" : n === wk.wim ? "now" : "") + "'></span>"; }).join("") + "</div>" +
      "<table class='t'><tr><td>Доходы</td><td class='n pos'>" + eur(rnd(mon.income), { dec: 0 }) + "</td></tr>" +
      "<tr><td>Расходы</td><td class='n'>" + eur(rnd(mon.total), { dec: 0 }) + "</td></tr>" +
      "<tr><td>Отложить в накопления</td><td class='n'>" + eur(rnd(mon.saved), { dec: 0 }) + "</td></tr></table>" +
      "<button class='btn ghost sm more' data-go='year'>весь год ›</button></section>";
    html += "</div>";

    html += "<p class='home-help small muted'>Впервые здесь или что-то непонятно? <a href='#help'>Как это работает</a></p></div>";
    $main.innerHTML = html;

    $main.querySelectorAll("[data-go]").forEach(function (el) { el.onclick = function () { ui.year = y; ui.week = w; go("#" + el.dataset.go); }; });
    $main.querySelectorAll("[data-todo]").forEach(function (el) {
      el.onclick = function () {
        var td = todo[Number(el.dataset.todo)], a = td.act;
        if (a === "tour") return showTour(0);
        if (a === "reminder") return reminderModal();
        if (a === "recon") ui.recWeek = td.rw || { year: y, week: w };
        ui.year = y; ui.week = w; go("#" + a);
      };
    });
    $main.querySelectorAll("[data-q]").forEach(function (el) {
      el.onclick = function () {
        var q = el.dataset.q; ui.year = y; ui.week = w;
        if (q === "spend") spendModal();
        else if (q === "shared") go("#shared", function () { var b = document.getElementById("addExpBtn"); if (b) b.click(); });
        else if (q === "cash") go("#cash");
        else { ui.recWeek = finishedWeek() || { year: y, week: w }; go("#recon"); }
      };
    });
    $main.querySelectorAll("[data-explain]").forEach(function (el) { el.onclick = function () { explain(el.dataset.explain); }; });
    bindRecCal(y);
    $main.querySelectorAll("[data-ob]").forEach(function (b) { b.onclick = function () { obrBreakdown(y, w); }; });
    if (!ro && !state.settings.tourDone && !ui.tourShown) { ui.tourShown = true; setTimeout(function () { showTour(0); }, 350); }
  };

  // капитал за год: линия по неделям, прошлое — сплошной, план — пунктиром
  function spark(vals, now, y) {
    var W = 320, H = 84, lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || 1;
    var X = function (i) { return (i / 59) * W; }, Y = function (v) { return 6 + (H - 12) * (1 - (v - lo) / span); };
    var pts = vals.map(function (v, i) { return X(i).toFixed(1) + "," + Y(v).toFixed(1); });
    var past = "M" + pts.slice(0, now + 1).join("L"), fut = "M" + pts.slice(now).join("L");
    var area = past + "L" + X(now).toFixed(1) + "," + H + "L0," + H + "Z";
    return "<svg viewBox='0 0 " + W + " " + H + "' preserveAspectRatio='none' class='spark' role='img' aria-label='Капитал за " + y + "'>" +
      "<path d='" + area + "' fill='var(--accent)' opacity='.1'/><path d='" + fut + "' fill='none' stroke='var(--accent)' stroke-width='1.6' stroke-dasharray='3 4' opacity='.55' vector-effect='non-scaling-stroke'/>" +
      "<path d='" + past + "' fill='none' stroke='var(--accent)' stroke-width='2' vector-effect='non-scaling-stroke' stroke-linejoin='round'/></svg>" +
      "<span class='spark-dot' style='left:" + (now / 59 * 100).toFixed(2) + "%;top:" + (Y(vals[now]) / H * 100).toFixed(2) + "%'></span>" +
      "<div class='spark-axis'><span>янв</span><span>сейчас — дальше план</span><span>дек</span></div>";
  }


  // ===== КАЛЕНДАРЬ СВЕРОК =====
  // Цвет — по размеру расхождения, плавно: красный тем гуще, чем сильнее минус; зелёный — чем сильнее плюс
  function reconStatus(y, w, r) {
    if (r.fact[w] !== null) {
      var lim = Math.abs(state.settings.diffAlert || -5000) || 5000, t = r.diff[w] / lim;
      return t <= -6 ? "n4" : t <= -3 ? "n3" : t <= -1 ? "n2" : t < -0.3 ? "n1" : t <= 0.3 ? "z" : t <= 1 ? "p1" : t <= 3 ? "p2" : "p3";
    }
    if (isNow(y, w)) return "now";
    return weekDone(y, w) ? "miss" : "future";
  }
  var RS_TEXT = { n4: "сильно меньше плана", n3: "заметно меньше плана", n2: "меньше плана — за порогом", n1: "чуть меньше плана", z: "точно по плану",
    p1: "чуть больше плана", p2: "больше плана", p3: "сильно больше плана", miss: "сверки не было", now: "идёт сейчас", future: "впереди" };
  function rcCell(y, w, r, sel) {
    var st = reconStatus(y, w, r), d = r.diff[w];
    var txt = E.weekTitle(Number(y), w) + " — " + RS_TEXT[st] + (d !== null ? ": " + E.eur(rnd(d), { dec: 0, plus: true }) : "");
    return "<button class='rc " + st + (sel ? " sel" : "") + "' data-rw='" + w + "' data-tip='" + esc(txt) + "' data-cap='" + esc(txt) + "' aria-label='" + esc(txt) + "'></button>";
  }
  function reconCalendar(y, compact, selW) {
    var r = E.compute(state, y), cells = "";
    if (compact) {
      var now = (E.weekOfDate(E.todayISO()) || {}).idx, end = String(new Date().getFullYear()) === String(y) ? now : 59, from = Math.max(0, end - 15);
      for (var i = from; i <= end; i++) cells += rcCell(y, i, r, false);
      return "<div class='rc-strip'>" + cells + "</div>";
    }
    var head = E.MONTHS_SHORT.map(function (m) { return "<span>" + m + "</span>"; }).join("");
    for (var wim = 0; wim < 5; wim++) for (var m = 0; m < 12; m++) cells += rcCell(y, m * 5 + wim, r, m * 5 + wim === selW);
    var done = 0, miss = 0;
    for (var k = 0; k < 60; k++) { var t = reconStatus(y, k, r); if (t === "miss") miss++; else if (t !== "now" && t !== "future") done++; }
    return "<div class='rc-wrap'><div class='rc-head'>" + head + "</div><div class='rc-grid'>" + cells + "</div></div>" +
      "<div class='rc-cap small muted' id='rcCap'>" + (selW !== undefined ? esc(E.weekTitle(Number(y), selW) + " — " + RS_TEXT[reconStatus(y, selW, r)] + (r.diff[selW] !== null ? ": " + E.eur(rnd(r.diff[selW]), { dec: 0, plus: true }) : "")) : "") + "</div>" +
      "<div class='rc-legend small'><span class='rc-sc'><span>меньше</span><span class='rc-scale'>" + ["n4", "n3", "n2", "n1", "z", "p1", "p2", "p3"].map(function (c) { return "<i class='rc " + c + "'></i>"; }).join("") + "</span><span>больше плана</span></span>" +
      "<span class='rc-sep'><i class='rc miss'></i>пропущена</span><span class='muted'>сверок " + done + " · пропущено " + miss + "</span></div>";
  }
  function bindRecCal(y) {
    $main.querySelectorAll("[data-rw]").forEach(function (b) {
      b.addEventListener("mouseenter", function () { var c = document.getElementById("rcCap"); if (c) c.textContent = b.dataset.cap; });
      b.onclick = function () { ui.recWeek = { year: y, week: Number(b.dataset.rw) }; if (location.hash === "#recon") render(); else location.hash = "#recon"; };
    });
  }

  // ===== НАЛИЧКА =====
  function cashState() { state.cash = state.cash || { pockets: [], tx: [], sharedMap: {}, since: null, defaultPocket: null }; return state.cash; }
  function pocketName(id) { if (id === "bank") return "карта"; var p = (state.cash.pockets || []).find(function (x) { return x.id === id; }); return p ? p.name : "—"; }
  function pocketCur(id) { var p = (state.cash.pockets || []).find(function (x) { return x.id === id; }); return p && p.cur === "RUB" ? "₽" : p && p.cur === "USD" ? "$" : "€"; }
  function cashLines() { var c = state.cash; return c && c.since && sh && !RO() ? K.sharedLines(c, sh.expenses) : []; }
  function cashToEur(cents, cur) { var fx = state.settings.fx || {}; return cur === "RUB" ? cents / (fx.RUB || state.settings.rate || 95) : cur === "USD" ? cents / (fx.USD || 1.08) : cents; }
  function cashEurTotal() {
    var c = state.cash; if (!c || !c.pockets.length) return null;
    var b = K.balances(c, cashLines()), t = 0;
    c.pockets.filter(function (p) { return !p.archived; }).forEach(function (p) { t += cashToEur(b[p.id] || 0, p.cur); });
    return Math.round(t);
  }

  routes.cash = function () {
    var c = cashState(), ro = RO();
    var html = "<div class='page-head'><div><h1>Наличка</h1><div class='sub'>Сколько где лежит наличными. Пиши или диктуй своими словами — приложение поймёт.</div></div></div>";
    if (!c.pockets.length) {
      if (ro) { $main.innerHTML = html + "<p class='empty'>Учёт налички ещё не начат.</p>"; return; }
      html += "<div class='card' style='max-width:560px'><h2>С чего начнём</h2><p class='muted' style='margin-top:-4px'>Назови свои кошельки и конверты и впиши, сколько в них сейчас. Потом можно добавить ещё.</p><form id='cashSetup'>" +
        [["Кошелёк", ""], ["Конверт 1", ""], ["Конверт 2", ""]].map(function (x, i) { return "<div class='cash-row'><input name='n" + i + "' value='" + x[0] + "' placeholder='Название'><input name='v" + i + "' inputmode='decimal' placeholder='0 €'></div>"; }).join("") +
        "<div id='moreRows'></div><div class='row' style='margin-top:12px'><button type='button' class='btn ghost' id='addRow'>+ ещё один</button><span class='spacer'></span><button class='btn primary' type='submit'>Начать учёт</button></div></form></div>";
      $main.innerHTML = html;
      var n = 3;
      $main.querySelector("#addRow").onclick = function () { $main.querySelector("#moreRows").insertAdjacentHTML("beforeend", "<div class='cash-row'><input name='n" + n + "' placeholder='Название'><input name='v" + n + "' inputmode='decimal' placeholder='0 €'></div>"); n++; };
      $main.querySelector("#cashSetup").onsubmit = function (e) {
        e.preventDefault();
        var f = e.target, list = [];
        for (var i = 0; i < n; i++) {
          var nm = f["n" + i] && f["n" + i].value.trim(); if (!nm) continue;
          var v = 0; try { v = E.exprCents(f["v" + i].value || "0") || 0; } catch (err) { toast(nm + ": " + err.message); return; }
          list.push({ id: E.uid("p"), name: nm, cur: "EUR", start: v, sort: list.length + 1 });
        }
        if (!list.length) { toast("Добавь хотя бы кошелёк"); return; }
        c.pockets = list; c.since = E.todayISO(); c.defaultPocket = list[0].id;
        changed(); toast("Учёт налички начат");
      };
      return;
    }
    var lines = cashLines(), bal = K.balances(c, lines), pockets = c.pockets.filter(function (p) { return !p.archived; }).sort(function (a, b) { return a.sort - b.sort; });
    var total = cashEurTotal();
    if (!ro) html += "<div class='card cash-input'><form id='cashQ' autocomplete='off'><div class='cash-q'><input name='q' placeholder='кофе 4,5 из кошелька' aria-label='Что произошло с наличкой'>" +
      (window.SpeechRecognition || window.webkitSpeechRecognition ? "<button type='button' class='mic' id='mic' aria-label='Надиктовать'><svg width='20' height='20' viewBox='0 0 20 20' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round'><rect x='7' y='2.5' width='6' height='10' rx='3'/><path d='M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5'/></svg></button>" : "") +
      "</div><div class='chips cash-ex'>" + ["такси 12 из кошелька", "переложила 100 из конверта 1 в кошелёк", "сняла 200", "положила 300 на карту"].map(function (x) { return "<button type='button' class='chip' data-ex='" + esc(x) + "'>" + esc(x) + "</button>"; }).join("") + "</div>" +
      "<div id='cashPv'></div></form></div>";
    html += "<div class='pockets'>" + pockets.map(function (p) {
      return "<div class='pocket" + (p.id === c.defaultPocket ? " def" : "") + "'><div class='row'><b>" + esc(p.name) + "</b><span class='spacer'></span>" + (ro ? "" : "<button class='btn sm ghost' data-pk='" + p.id + "' aria-label='Настроить'>⋯</button>") + "</div>" +
        "<div class='pocket-val'>" + E.fmt(bal[p.id] || 0, { cur: pocketCur(p.id) }) + "</div>" + (p.id === c.defaultPocket ? "<div class='small muted'>по умолчанию</div>" : "") +
        (ro ? "" : "<button class='btn sm' data-recount='" + p.id + "'>Пересчитать</button>") + "</div>";
    }).join("") + (ro ? "" : "<button class='pocket add' id='addPocket'>+ конверт</button>") + "</div>";
    html += "<div class='small muted' style='margin:8px 2px 0'>Всего наличными: <b>" + E.eur(total, { dec: 0 }) + "</b> · учёт с " + esc(c.since.slice(8, 10) + "." + c.since.slice(5, 7) + "." + c.since.slice(0, 4)) + "</div>";

    // история
    var all = (c.tx || []).map(function (t) { return Object.assign({ own: true }, t); }).concat(lines).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0); });
    html += "<div class='section'><h2>История</h2>" + (all.length ? "<ul class='cash-list'>" + all.slice(0, ui.cashLimit || 60).map(function (t) {
      var flow = t.kind === "move" ? pocketName(t.from) + " → " + pocketName(t.to) : t.kind === "in" ? "карта → " + pocketName(t.to) : t.kind === "out" ? pocketName(t.from) + " → карта" :
        t.kind === "ext" ? "→ " + pocketName(t.to) : t.kind === "adjust" ? "пересчёт · " + pocketName(t.to) : pocketName(t.from);
      var sgn = t.kind === "spend" || t.kind === "out" ? -1 : t.kind === "move" ? 0 : 1, v = t.kind === "adjust" ? t.cents : sgn * t.cents;
      var title = t.shared ? esc(t.shared.desc) + " <span class='badge'>общая</span>" : esc(t.note || (K.KINDS.find(function (k) { return k.id === t.kind; }) || { name: "пересчёт" }).name);
      var right = t.shared && pockets.length > 1 && !ro ? "<select data-shp='" + esc(t.shared.id) + "' aria-label='Из какого кармана'>" + pockets.map(function (p) { return "<option value='" + p.id + "'" + (p.id === t.from ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + "</select>" : "<span class='muted small'>" + esc(flow) + "</span>";
      return "<li><span class='d small muted'>" + esc(t.date.slice(8, 10) + "." + t.date.slice(5, 7)) + "</span><span class='tt'>" + title + "<span class='fl'>" + right + "</span></span>" +
        "<span class='val " + (v > 0 ? "pos" : v < 0 ? "neg" : "") + "'>" + (v === 0 ? E.fmt(t.cents, { cur: pocketCur(t.from) }) : E.fmt(v, { cur: pocketCur(t.from || t.to), plus: v > 0 })) + "</span>" +
        (t.own && !ro ? "<button class='btn sm ghost danger' data-deltx='" + t.id + "' aria-label='Удалить'>✕</button>" : "<span></span>") + "</li>";
    }).join("") + "</ul>" + (all.length > (ui.cashLimit || 60) ? "<button class='btn ghost sm' id='cashMore'>Показать ещё</button>" : "") : "<p class='empty'>Пока пусто. Наличные траты из «Общих», которые платила ты, появятся здесь сами.</p>") + "</div>";
    $main.innerHTML = html;
    if (ro) return;

    // быстрый ввод
    var f = $main.querySelector("#cashQ"), pv = $main.querySelector("#cashPv"), cur = null;
    function pocketOpts(sel, withBank) { return (withBank ? "<option value='bank'" + (sel === "bank" ? " selected" : "") + ">карта / банк</option>" : "") + "<option value=''" + (!sel ? " selected" : "") + ">—</option>" + pockets.map(function (p) { return "<option value='" + p.id + "'" + (p.id === sel ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join(""); }
    function drawPv() {
      if (!cur) { pv.innerHTML = ""; return; }
      var k = cur.kind, needFrom = k === "spend" || k === "move" || k === "out", needTo = k === "move" || k === "in" || k === "ext";
      pv.innerHTML = "<div class='cash-pv'><div class='seg'>" + K.KINDS.map(function (x) { return "<button type='button' class='" + (x.id === k ? "on" : "") + "' data-k='" + x.id + "'>" + x.name + "</button>"; }).join("") + "</div>" +
        "<div class='form-grid'><label class='f'>Сумма<input name='pc' inputmode='decimal' value='" + (cur.cents ? String(cur.cents / 100).replace(".", ",") : "") + "' placeholder='0'></label>" +
        (needFrom ? "<label class='f'>Откуда<select name='pf'>" + pocketOpts(cur.from, false) + "</select></label>" : "") +
        (needTo ? "<label class='f'>Куда<select name='pt'>" + pocketOpts(cur.to, false) + "</select></label>" : "") +
        "<label class='f'>Дата<input type='date' name='pd' value='" + (cur.date || E.todayISO()) + "'></label>" +
        "<label class='f' style='grid-column:1/-1'>Что это<input name='pn' value='" + esc(cur.note || "") + "' placeholder='например, рынок'></label>" +
        (k === "spend" ? "<label class='row small' style='grid-column:1/-1'><input type='checkbox' name='pp'> Внести и в личный план, в категорию <select name='pcat'>" + catOptions(defaultCat()) + "</select></label>" : "") +
        "</div><div class='row' style='margin-top:10px'><span class='small muted'>" + esc(previewText()) + "</span><span class='spacer'></span><button type='button' class='btn ghost' id='pvX'>Отмена</button><button type='submit' class='btn primary'>Сохранить</button></div></div>";
      pv.querySelectorAll("[data-k]").forEach(function (b) { b.onclick = function () { readPv(); cur.kind = b.dataset.k; if (cur.kind === "in" || cur.kind === "ext") cur.to = cur.to || cur.from || c.defaultPocket; drawPv(); }; });
      pv.querySelector("#pvX").onclick = function () { cur = null; f.q.value = ""; drawPv(); };
      pv.querySelectorAll("input,select").forEach(function (el) { el.addEventListener("change", function () { readPv(); pv.querySelector(".row .muted").textContent = previewText(); }); });
    }
    function readPv() {
      if (!cur) return;
      var g = function (n) { var el = pv.querySelector("[name=" + n + "]"); return el ? el.value : undefined; };
      try { var v = E.exprCents(g("pc") || ""); cur.cents = v === null ? null : Math.abs(v); } catch (e) { cur.cents = null; }
      if (g("pf") !== undefined) cur.from = g("pf") || null;
      if (g("pt") !== undefined) cur.to = g("pt") || null;
      cur.date = g("pd") || E.todayISO(); cur.note = g("pn") || "";
    }
    function previewText() {
      if (!cur) return "";
      var a = cur.cents ? E.fmt(cur.cents, { cur: pocketCur(cur.from || cur.to) }) : "?";
      return cur.kind === "spend" ? "Трата " + a + " из «" + pocketName(cur.from) + "»" : cur.kind === "move" ? a + ": «" + pocketName(cur.from) + "» → «" + pocketName(cur.to) + "»" :
        cur.kind === "in" ? "Сняла " + a + " с карты в «" + pocketName(cur.to) + "»" : cur.kind === "out" ? a + " из «" + pocketName(cur.from) + "» на карту" : "Получила " + a + " в «" + pocketName(cur.to) + "»";
    }
    var t0 = null;
    f.q.addEventListener("input", function () { clearTimeout(t0); t0 = setTimeout(function () { if (!f.q.value.trim()) { cur = null; drawPv(); return; } cur = K.parse(f.q.value, pockets, c.defaultPocket); cur.date = E.todayISO(); drawPv(); }, 250); });
    $main.querySelectorAll("[data-ex]").forEach(function (b) { b.onclick = function () { f.q.value = b.dataset.ex; f.q.dispatchEvent(new Event("input")); f.q.focus(); }; });
    f.onsubmit = function (e) {
      e.preventDefault();
      if (!cur) { if (f.q.value.trim()) { cur = K.parse(f.q.value, pockets, c.defaultPocket); drawPv(); } return; }
      readPv();
      var k = cur.kind;
      if (!cur.cents) { toast("Укажи сумму"); return; }
      if ((k === "spend" || k === "move" || k === "out") && !cur.from) { toast("Откуда?"); return; }
      if ((k === "move" || k === "in" || k === "ext") && !cur.to) { toast("Куда?"); return; }
      if (k === "move" && cur.from === cur.to) { toast("Откуда и куда — одно и то же"); return; }
      var tx = { id: E.uid("t"), ts: Date.now(), date: cur.date, kind: k, cents: cur.cents, from: k === "in" || k === "ext" ? null : cur.from, to: k === "spend" || k === "out" ? null : cur.to, note: cur.note };
      var pp = pv.querySelector("[name=pp]");
      if (pp && pp.checked) {
        var wk = E.weekOfDate(cur.date), ys = wk && String(wk.year), cat = pv.querySelector("[name=pcat]").value;
        if (!wk || !state.years[ys] || state.years[ys].archived) { toast("Плана на эту дату нет — в личный план не вношу"); }
        else { addToCell(ys, cat, wk.idx, String(cur.cents / 100), (cur.note || "") + " (нал)"); tx.plan = { year: ys, week: wk.idx, cat: cat }; state.settings.lastCat = cat; }
      }
      var msg = previewText();
      c.tx.push(tx); cur = null; f.q.value = "";
      toast("Записано: " + msg.charAt(0).toLowerCase() + msg.slice(1)); changed();
    };
    var mic = $main.querySelector("#mic");
    if (mic) mic.onclick = function () {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition, rec = new SR();
      rec.lang = "ru-RU"; rec.interimResults = false; rec.maxAlternatives = 1;
      mic.classList.add("on");
      rec.onresult = function (ev) { f.q.value = ev.results[0][0].transcript; f.q.dispatchEvent(new Event("input")); };
      rec.onerror = function (ev) { toast(ev.error === "not-allowed" ? "Нет доступа к микрофону — можно диктовать с клавиатуры" : "Не расслышала, попробуй ещё"); };
      rec.onend = function () { mic.classList.remove("on"); };
      try { rec.start(); } catch (err) { mic.classList.remove("on"); }
    };
    $main.querySelectorAll("[data-shp]").forEach(function (sel) { sel.onchange = function () { c.sharedMap = c.sharedMap || {}; c.sharedMap[sel.dataset.shp] = sel.value; changed(); }; });
    $main.querySelectorAll("[data-deltx]").forEach(function (b) {
      b.onclick = function () {
        var t = c.tx.find(function (x) { return x.id === b.dataset.deltx; });
        if (!confirm("Удалить запись «" + ((t && t.note) || "без описания") + "»?" + (t && t.plan ? " Сумма в личном плане останется — поправь её на экране «Неделя», если нужно." : " Баланс пересчитается."))) return;
        c.tx = c.tx.filter(function (x) { return x.id !== b.dataset.deltx; }); changed();
      };
    });
    $main.querySelectorAll("[data-recount]").forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.recount, now = bal[id] || 0;
        modal("<div class='m-body'><h2>Сколько в «" + esc(pocketName(id)) + "» на самом деле?</h2><p class='small muted' style='margin:2px 0 0'>По учёту — " + E.fmt(now, { cur: pocketCur(id) }) + ". Впиши, сколько насчитала, и баланс выровняется.</p>" +
          "<div class='form-grid' style='margin-top:12px'><label class='f'>Сейчас<input id='rcV' inputmode='decimal' autofocus value='" + String(now / 100).replace(".", ",") + "'></label></div></div>" +
          "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", function (m) {
          m.querySelector("[data-act=cancel]").onclick = closeModal;
          m.querySelector("[data-act=ok]").onclick = function () {
            var v; try { v = E.exprCents(m.querySelector("#rcV").value); } catch (err) { toast(err.message); return; }
            if (v === null) return;
            if (v !== now) c.tx.push({ id: E.uid("t"), ts: Date.now(), date: E.todayISO(), kind: "adjust", to: id, cents: v - now, note: "пересчёт: " + (v > now ? "больше" : "меньше") + " на " + E.fmt(Math.abs(v - now)) });
            closeModal(); changed(); toast(v === now ? "Всё сходится" : "Баланс поправлен");
          };
        });
      };
    });
    $main.querySelectorAll("[data-pk]").forEach(function (b) {
      b.onclick = function () {
        var p = c.pockets.find(function (x) { return x.id === b.dataset.pk; });
        modal("<div class='m-body'><h2>" + esc(p.name) + "</h2><div class='form-grid' style='margin-top:12px'><label class='f'>Название<input id='pkN' value='" + esc(p.name) + "'></label>" +
          "<label class='f'>Валюта<select id='pkC'>" + ["EUR", "USD", "RUB"].map(function (x) { return "<option" + (x === (p.cur || "EUR") ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></label>" +
          "<label class='row small' style='grid-column:1/-1'><input type='checkbox' id='pkD'" + (p.id === c.defaultPocket ? " checked" : "") + "> По умолчанию: сюда идут траты, где не указано откуда, и наличные из «Общих»</label></div></div>" +
          "<div class='m-foot'><button class='btn ghost danger' data-act='del'>Убрать «" + esc(p.name) + "»</button><span class='spacer'></span><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", function (m) {
          m.querySelector("[data-act=cancel]").onclick = closeModal;
          m.querySelector("[data-act=del]").onclick = function () {
            if ((bal[p.id] || 0) !== 0 && !confirm("Тут ещё " + E.fmt(bal[p.id], { cur: pocketCur(p.id) }) + ". Всё равно убрать? История сохранится.")) return;
            p.archived = true; if (c.defaultPocket === p.id) { var o = c.pockets.find(function (x) { return !x.archived; }); c.defaultPocket = o ? o.id : null; }
            closeModal(); changed();
          };
          m.querySelector("[data-act=ok]").onclick = function () {
            p.name = m.querySelector("#pkN").value.trim() || p.name; p.cur = m.querySelector("#pkC").value;
            if (m.querySelector("#pkD").checked) c.defaultPocket = p.id;
            closeModal(); changed();
          };
        });
      };
    });
    $main.querySelector("#addPocket").onclick = function () {
      var nm = prompt("Название (например, «Конверт на отпуск»)"); if (!nm || !nm.trim()) return;
      var v = prompt("Сколько в нём сейчас, €", "0"), cents = 0;
      try { cents = E.exprCents(v || "0") || 0; } catch (err) { toast(err.message); return; }
      c.pockets.push({ id: E.uid("p"), name: nm.trim(), cur: "EUR", start: 0, sort: c.pockets.length + 1 });
      if (cents) c.tx.push({ id: E.uid("t"), ts: Date.now(), date: E.todayISO(), kind: "adjust", to: c.pockets[c.pockets.length - 1].id, cents: cents, note: "начальный остаток" });
      changed();
    };
    var cm = $main.querySelector("#cashMore"); if (cm) cm.onclick = function () { ui.cashLimit = (ui.cashLimit || 60) + 100; render(); };
  };

  // ===== ОБЩИЕ → ЛИЧНЫЙ ПЛАН =====
  function logOpts() {
    // по умолчанию — с начала прошлого месяца
    var set = state.settings, t = new Date(), pm = t.getMonth() || 12, py = t.getMonth() ? t.getFullYear() : t.getFullYear() - 1;
    var since = set.sharedLogSince || (py + "-" + (pm < 10 ? "0" : "") + pm + "-01");
    return { since: since, min: set.sharedLogMin || 4000, handled: set.sharedLog || {}, map: set.sharedMap || {}, utilCat: set.utilCat || S.utilityCat(state) };
  }
  function toLogCount() {
    if (!sh || RO()) return 0;
    var o = logOpts(), c = sharedForCalc();
    return S.toLog(state, c, o).filter(function (x) { return !x.maybe; }).length + S.coverageGaps(state, c, o).length;
  }

  // Коммуналка: план против факта из общих (свет, вода, газ)
  function utilitiesCard() {
    var set = state.settings, y = E.todayISO().slice(0, 4), yr = state.years[y];
    if (!sh || !yr || yr.archived) return { html: "", bind: function () {} };
    var ucat = set.utilCat || S.utilityCat(state), r = E.compute(state, y), nowM = Number(E.todayISO().slice(5, 7)) - 1;
    var bills = sh.expenses.filter(function (e) { return e.date.slice(0, 4) === y && S.isUtility(e, sh.learned); });
    if (!bills.length) return { html: "", bind: function () {} };
    var fact = [], paid = [], plan = [], firstM = 12;
    for (var m = 0; m < 12; m++) {
      fact[m] = 0; paid[m] = 0; plan[m] = 0;
      if (ucat) for (var w = m * 5; w < m * 5 + 5; w++) { var x = r.cells[ucat][w]; if (x) plan[m] -= x.cents; }
    }
    // счёт часто покрывает несколько месяцев: период — обычный промежуток между счетами этого вида
    var kind = function (e) { var d = (e.desc || "").toLowerCase(); return /gas|газ/.test(d) ? "gas" : /agua|water|вод/.test(d) ? "water" : /electr|luz|свет|электр/.test(d) ? "el" : "other"; };
    var allBills = sh.expenses.filter(function (e) { return S.isUtility(e, sh.learned); }), period = {};
    ["gas", "water", "el", "other"].forEach(function (k) {
      var ds = allBills.filter(function (e) { return kind(e) === k; }).map(function (e) { return new Date(e.date).getTime(); }).sort(function (a, b) { return a - b; });
      var gaps = []; for (var i = 1; i < ds.length; i++) gaps.push((ds[i] - ds[i - 1]) / 864e5);
      gaps.sort(function (a, b) { return a - b; });
      var med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : (k === "gas" || k === "water" ? 60 : 30);
      period[k] = Math.max(1, Math.min(3, Math.round(med / 30)));
    });
    bills.forEach(function (e) {
      var m = Number(e.date.slice(5, 7)) - 1, v = S.toEur(e.share, e.currency, e.date, set), p = period[kind(e)];
      paid[m] += v;
      for (var j = 0; j < p; j++) { var mm = m - j; if (mm >= 0) { fact[mm] += v / p; if (mm < firstM) firstM = mm; } }
    });
    var past = []; for (m = firstM; m < nowM; m++) past.push(m);
    var last6 = past.slice(-6), avg = last6.length ? Math.round(last6.reduce(function (t, m) { return t + fact[m]; }, 0) / last6.length / 100) * 100 : 0;
    var html = "<div class='card util-card'><h2>Коммуналка: план и факт</h2><p class='small muted' style='margin-top:-6px'>Твоя доля общих счетов за свет, воду и газ. Аренда и интернет сюда не входят.</p>" +
      (ucat ? "" : "<div class='hint small'>Не нашла категорию для коммуналки — выбери её: <select id='ucSel'><option value=''>…</option>" + catOptions(null, function (c) { return c.block !== "income" && c.block !== "savings"; }) + "</select></div>") +
      "<div class='tbl-wrap' style='margin-top:10px'><table class='t'><thead><tr><th></th>" + past.map(function (m) { return "<th class='n'>" + E.MONTHS_SHORT[m] + "</th>"; }).join("") + "<th class='n'>в среднем</th></tr></thead><tbody>" +
      "<tr><td>План</td>" + past.map(function (m) { return "<td class='n'>" + Math.round(plan[m] / 100) + "</td>"; }).join("") + "<td class='n'>" + (past.length ? Math.round(past.reduce(function (t, m) { return t + plan[m]; }, 0) / past.length / 100) : "—") + "</td></tr>" +
      "<tr><td>Факт по периодам</td>" + past.map(function (m) { return "<td class='n " + (fact[m] > plan[m] * 1.1 ? "neg" : "") + "'>" + Math.round(fact[m] / 100) + "</td>"; }).join("") + "<td class='n'><b>" + (past.length ? Math.round(past.reduce(function (t, m) { return t + fact[m]; }, 0) / past.length / 100) : "—") + "</b></td></tr>" +
      "<tr class='muted'><td>Оплачено в месяце</td>" + past.map(function (m) { return "<td class='n'>" + Math.round(paid[m] / 100) + "</td>"; }).join("") + "<td></td></tr>" +
      "</tbody></table></div><p class='small muted'>Счёт разнесён по месяцам, которые он покрывает: " + [["el", "свет"], ["water", "вода"], ["gas", "газ"]].filter(function (k) { return allBills.some(function (e) { return kind(e) === k[0]; }); }).map(function (k) { return k[1] + " — " + (period[k[0]] === 1 ? "каждый месяц" : "раз в " + period[k[0]] + " мес"); }).join(", ") +
      ". «Оплачено» — когда деньги реально ушли.</p>" +
      (ucat && past.length ? "<div class='row'><button class='btn' id='ucFact'>Заменить план фактом за " + E.MONTHS_SHORT[past[0]] + "–" + E.MONTHS_SHORT[past[past.length - 1]] + "</button>" +
        (avg ? "<button class='btn' id='ucAvg'>Поставить " + E.eur(avg, { dec: 0 }) + " в месяц на будущее</button>" : "") + "</div>" : "") + "</div>";
    function bind() {
      var sel = $main.querySelector("#ucSel"); if (sel) sel.onchange = function () { if (sel.value) { set.utilCat = sel.value; changed(); } };
      var bf = $main.querySelector("#ucFact");
      if (bf) bf.onclick = function () {
        if (!confirm("Заменить «" + catName(ucat) + "» за " + E.MONTHS_SHORT[past[0]] + "–" + E.MONTHS_SHORT[past[past.length - 1]] + " реальными счетами из «Общих»? Суммы встанут в те недели, когда счёт оплачен (так верно считаются деньги в обращении); в остальные недели этих месяцев — 0.")) return;
        set.sharedLog = set.sharedLog || {};
        past.forEach(function (m) {
          for (var w = m * 5; w < m * 5 + 5; w++) {
            var inWeek = bills.filter(function (e) { var k = E.weekOfDate(e.date); return k && k.idx === w; });
            var sum = inWeek.reduce(function (t, e) { return t + S.toEur(e.share, e.currency, e.date, set); }, 0);
            var had = r.cells[ucat][w];
            if (sum) E.setEntry(state, y, ucat, String(w), String(-Math.round(sum) / 100), "счета из общих: " + inWeek.map(function (e) { return e.desc; }).join(", "));
            else if (had) E.setEntry(state, y, ucat, String(w), "0", "счетов не было");
            inWeek.forEach(function (e) { set.sharedLog[e.id] = "added"; });
          }
        });
        changed(); toast("План коммуналки за прошедшие месяцы = факт");
      };
      var ba = $main.querySelector("#ucAvg");
      if (ba) ba.onclick = function () {
        var fromM = nowM + 1;
        if (fromM > 11) { toast("В этом году будущих месяцев не осталось — поставь сумму в плане следующего года"); return; }
        // неделя месяца, в которую коммуналка стоит в плане чаще всего
        var cnt = [0, 0, 0, 0, 0, 0];
        for (var w = 0; w < 60; w++) if (r.cells[ucat][w]) cnt[w % 5 + 1]++;
        var wim = String(cnt.indexOf(Math.max.apply(null, cnt)) || 2);
        if (!confirm("С " + E.MONTHS_GEN[fromM] + " коммуналка в плане — " + E.eur(avg, { dec: 0 }) + " в месяц (" + wim + "-я неделя), одной регулярной тратой. Суммы, вписанные вручную в будущие недели, уберу. Прошлые месяцы не тронутся.")) return;
        var fromISO = y + "-" + (fromM < 9 ? "0" : "") + (fromM + 1) + "-01";
        yr.recurring = (yr.recurring || []).map(function (ru) { if (ru.catId === ucat && (!ru.to || ru.to >= fromISO)) { if (ru.from && ru.from >= fromISO) return null; ru.to = E.addDays(fromISO, -1); } return ru; }).filter(Boolean);
        yr.recurring.push({ id: E.uid("r"), catId: ucat, expr: String(-avg / 100), cents: -avg, weeks: wim, from: fromISO, to: null });
        var en = (yr.entries || {})[ucat] || {};
        Object.keys(en).forEach(function (k) { if (Number(k) >= fromM * 5) delete en[k]; });
        changed(); toast("Коммуналка на будущее: " + E.eur(avg, { dec: 0 }) + " в месяц");
      };
    }
    return { html: html, bind: bind };
  }
  routes.tolog = function () {
    if (!sh || RO()) { location.hash = "#shared"; return; }
    var set = state.settings, o = logOpts(), calc = sharedForCalc();
    set.sharedLog = set.sharedLog || {}; set.sharedMap = set.sharedMap || {};
    var list = S.toLog(state, calc, o), gaps = S.coverageGaps(state, calc, o);
    var fresh = list.filter(function (x) { return !x.maybe; }), maybe = list.filter(function (x) { return x.maybe; });
    var html = "<div class='page-head'><div><h1>Общие → личный план</h1><div class='sub'>Заметные общие траты (твоя доля от " + E.eur(o.min, { dec: 0 }) + "), которых, похоже, нет в личном плане. Еда и развлечения сверяются отдельно — по месяцу целиком.</div></div>" +
      "<div class='row'><label class='small muted'>с <input type='date' id='lgSince' value='" + o.since + "'></label><label class='small muted'>от <input id='lgMin' inputmode='decimal' value='" + o.min / 100 + "' style='width:64px'> €</label></div></div>";
    function row(x) {
      var e = x.e;
      return "<li class='lg' data-id='" + esc(e.id) + "'><div class='lg-main'><b>" + esc(e.desc) + "</b><span class='small muted'>" + esc(e.date.slice(8, 10) + "." + e.date.slice(5, 7)) + " · " + esc(x.sharedCat) + " · всего " + E.fmt(e.cost, { cur: e.currency === "EUR" ? "€" : e.currency, dec: 0 }) +
        (x.maybe ? " · в плане уже есть " + E.eur(-x.maybe.cents, { dec: 0 }) + " в " + esc(shortWeek(x.year, x.maybe.week)) : "") + "</span></div>" +
        "<div class='lg-val'>" + E.eur(x.share) + "<span class='small muted'>твоя доля</span></div>" +
        "<div class='lg-act'><select data-lc aria-label='Категория личного плана'><option value=''>категория…</option>" + catOptions(x.catId, function (c) { return c.block !== "income" && c.block !== "savings"; }) + "</select>" +
        "<button class='btn sm primary' data-la='add'>Внести</button><button class='btn sm' data-la='had'>Уже есть</button><button class='btn sm ghost' data-la='skip'>Не нужно</button></div></li>";
    }
    var uc = utilitiesCard(); html += uc.html;
    if (!fresh.length && !maybe.length && !gaps.length) html += "<div class='card all-good'><span class='ic'>✓</span>Всё заметное из общих уже в личном плане.</div>";
    if (gaps.length) html += "<div class='card'><h2>Еда и развлечения вышли за план</h2><ul class='lg-list'>" + gaps.map(function (g) {
      return "<li class='lg' data-gap='" + g.key + "'><div class='lg-main'><b>" + E.MONTHS[g.month - 1][0].toUpperCase() + E.MONTHS[g.month - 1].slice(1) + " " + g.year + "</b><span class='small muted'>общие " + E.eur(rnd(g.shared), { dec: 0 }) + " (твоя доля) при личном плане " + E.eur(rnd(g.personal), { dec: 0 }) + "</span></div>" +
        "<div class='lg-val neg'>+" + E.eur(rnd(g.gap), { dec: 0 }) + "</div><div class='lg-act'><button class='btn sm primary' data-ga='add'>Добавить разницу в план</button><button class='btn sm ghost' data-ga='skip'>Не нужно</button></div></li>";
    }).join("") + "</ul></div>";
    if (fresh.length) html += "<div class='card'><h2>Не нашла в личном плане · " + fresh.length + "</h2><ul class='lg-list'>" + fresh.map(row).join("") + "</ul></div>";
    if (maybe.length) html += "<details class='card' style='margin-top:16px'><summary><b>Похоже, уже учтено · " + maybe.length + "</b> <span class='small muted'>в нужной категории в тот месяц есть сумма не меньше</span></summary>" +
      "<div class='row' style='margin:10px 0'><button class='btn sm' id='allHad'>Да, всё это уже учтено</button></div><ul class='lg-list'>" + maybe.map(row).join("") + "</ul></details>";
    $main.innerHTML = html;
    uc.bind();
    $main.querySelector("#lgSince").onchange = function (e) { set.sharedLogSince = e.target.value; changed(); };
    $main.querySelector("#lgMin").onchange = function (e) { var v = Number(String(e.target.value).replace(",", ".")); if (v > 0) { set.sharedLogMin = Math.round(v * 100); changed(); } };
    $main.querySelectorAll("li[data-id]").forEach(function (li) {
      var x = list.find(function (q) { return q.e.id === li.dataset.id; });
      li.querySelectorAll("[data-la]").forEach(function (b) {
        b.onclick = function () {
          var a = b.dataset.la;
          if (a === "add") {
            var cat = li.querySelector("[data-lc]").value;
            if (!cat) { toast("Выбери категорию"); li.querySelector("[data-lc]").focus(); return; }
            addToCell(x.year, cat, x.week, String(x.share / 100), x.e.desc + " (общая)");
            if (x.sharedCat !== "Прочее") set.sharedMap[x.sharedCat] = cat;
            toast("Внесено в «" + catName(cat) + "» · " + shortWeek(x.year, x.week));
          }
          set.sharedLog[x.e.id] = a; changed();
        };
      });
    });
    var ah = $main.querySelector("#allHad"); if (ah) ah.onclick = function () { maybe.forEach(function (x) { set.sharedLog[x.e.id] = "had"; }); changed(); toast("Отмечено"); };
    $main.querySelectorAll("li[data-gap]").forEach(function (li) {
      var g = gaps.find(function (q) { return q.key === li.dataset.gap; });
      li.querySelectorAll("[data-ga]").forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.ga === "add") {
            var cat = (set.coverage && set.coverage.food && set.coverage.food[0]) || defaultCat();
            addToCell(g.year, cat, (g.month - 1) * 5 + 4, String(rnd(g.gap) / 100), "общие сверх плана");
            toast("Добавлено " + E.eur(rnd(g.gap), { dec: 0 }) + " в «" + catName(cat) + "»");
          }
          set.sharedLog[g.key] = b.dataset.ga; changed();
        };
      });
    });
  };


  // ===== МЫ: общий бюджет =====
  function loadPartnerData(force) {
    var p = people.find(function (x) { return x.theirLevel === "full" || x.theirLevel === "totals"; }) || people[0];
    if (!p) return Promise.resolve(null);
    if (!force && ui.us && ui.us.id === p.userId && Date.now() - ui.us.at < 120000) return Promise.resolve(ui.us);
    var job = p.theirLevel === "full" ? Store.loadBudgetOf(p.userId).then(function (row) {
      if (!row) return null;
      var st = migrate(row.data); st._ver = 1;
      var yrs = {}; Object.keys(st.years).forEach(function (y) { try { var m = E.monthly(st, y); yrs[y] = { months: m.months, total: m.total, archived: !!st.years[y].archived }; } catch (e) { /* пропуск */ } });
      return { years: yrs };
    }) : p.theirLevel === "totals" ? Store.loadSummaryOf(p.userId).then(function (row) { return row ? row.data : null; }) : Promise.resolve(null);
    return job.then(function (d) { ui.us = { id: p.userId, name: p.name, level: p.theirLevel, data: d, at: Date.now() }; return ui.us; })
      .catch(function () { ui.us = { id: p.userId, name: p.name, level: "hidden", data: null, at: Date.now() }; return ui.us; });
  }
  routes.us = function () {
    if (RO()) { switchTo("me"); return; }
    if (!ui.usLoaded) {
      $main.innerHTML = "<p class='loading'>Собираю общий бюджет…</p>";
      ui.usLoaded = true;
      loadPartnerData(true).then(function () { if (location.hash === "#us") render(); ui.usLoaded = false; });
      return;
    }
    var pd = ui.us && ui.us.data, pName = (ui.us && ui.us.name) || (sh && sh.partner ? sh.partner.name : "партнёр"), meName = myName() || "Я";
    var ys = activeYears(), y = ui.usYear && ys.indexOf(ui.usYear) >= 0 ? ui.usYear : (ys.indexOf(E.todayISO().slice(0, 4)) >= 0 ? E.todayISO().slice(0, 4) : ys[ys.length - 1]);
    var mine = E.monthly(state, y), theirs = pd && pd.years && pd.years[y], both = !!theirs;
    var nowM = String(new Date().getFullYear()) === y ? new Date().getMonth() : 11;
    var sum = function (k, m) { var a = mine.months[m][k] || 0, b = both ? (theirs.months[m][k] || 0) : 0; return a + b; };
    var tot = function (k) { return (mine.total[k] || 0) + (both ? (theirs.total[k] || 0) : 0); };
    var capMe = mine.months[nowM].cap, capThem = both ? theirs.months[nowM].cap : null;
    var html = "<div class='page-head'><div><h1>Мы · " + y + "</h1><div class='sub'>" + esc(meName) + " и " + esc(pName) + ": общий капитал, доходы и расходы вдвоём, на что уходят общие деньги.</div></div>" +
      "<div class='chips'>" + ys.map(function (x) { return "<button class='chip" + (x === y ? " on" : "") + "' data-uy='" + x + "'>" + x + "</button>"; }).join("") + "</div></div>";
    if (!both) html += "<div class='hint' style='margin:0 0 16px'>" + (ui.us ? esc(pName) + " пока не открыла свой бюджет" + (ui.us.data ? " за " + y : "") + ". В её «Настройках → Кто что видит» можно открыть полностью или только итоги — тогда здесь появятся цифры на двоих." :
      "Здесь появятся цифры на двоих, когда партнёр войдёт в приложение и откроет доступ к своему бюджету.") + " Пока — только твои цифры и общие траты.</div>";

    // KPI
    html += "<div class='kpis'>" +
      kpi(both ? "Капитал вместе" : "Твой капитал", capMe === null ? "—" : eur(rnd(capMe + (capThem || 0)), { dec: 0 }), "на конец " + E.MONTHS_GEN[nowM] + (both && capThem !== null ? " · " + esc(meName) + " " + eur(rnd(capMe), { dec: 0 }) + " · " + esc(pName) + " " + eur(rnd(capThem), { dec: 0 }) : "")) +
      kpi("Доходы за год", eur(rnd(tot("income")), { dec: 0 }), both ? "вместе" : "твои") +
      kpi("Расходы за год", eur(rnd(tot("total")), { dec: 0 }), "на жизнь " + eur(rnd(tot("living") / 12), { dec: 0 }) + " в месяц") +
      kpi("Сберегаем", tot("income") ? Math.round((tot("income") - tot("total")) / tot("income") * 100) + "%" : "—", "доходы минус расходы, от доходов") + "</div>";

    // капитал по месяцам
    var capVals = mine.months.map(function (m, i) { return { me: m.cap, them: both ? theirs.months[i].cap : null }; });
    html += "<div class='grid2'><div class='card'><h2>" + (both ? "Капитал вместе" : "Капитал") + "</h2>" + C.bars({ labels: E.MONTHS, short: E.MONTHS_SHORT, stacked: true, title: "Капитал по месяцам",
      fmt: function (v) { return E.eur(Math.round(v) * 100, { dec: 0 }); },
      series: [{ name: meName, color: "var(--series-1)", values: capVals.map(function (c) { return c.me === null ? 0 : c.me / 100; }) }].concat(both ? [{ name: pName, color: "var(--series-2)", values: capVals.map(function (c) { return c.them === null ? 0 : c.them / 100; }) }] : []) }) + "</div>";
    html += "<div class='card'><h2>Доходы и расходы" + (both ? " вдвоём" : "") + "</h2>" + C.bars({ labels: E.MONTHS, short: E.MONTHS_SHORT, title: "Доходы и расходы по месяцам",
      fmt: function (v) { return E.eur(Math.round(v) * 100, { dec: 0 }); },
      series: [{ name: "доходы", color: "var(--series-3)", values: mine.months.map(function (_, i) { return sum("income", i) / 100; }) }, { name: "расходы", color: "var(--series-2)", values: mine.months.map(function (_, i) { return sum("total", i) / 100; }) }] }) + "</div></div>";

    // общие траты: категории и кто платит
    var ex = sh ? sh.expenses.filter(function (e) { return e.kind === "expense" && e.date.slice(0, 4) === y; }) : [];
    var prevEx = sh ? sh.expenses.filter(function (e) { return e.kind === "expense" && e.date.slice(0, 4) === String(Number(y) - 1); }) : [];
    var toE = function (e) { return S.toEur(e.cost, e.currency, e.date, state.settings); };
    var byCat = {}, prevCat = {}, paidMe = 0, paidThem = 0, sharedTot = 0;
    ex.forEach(function (e) { var v = toE(e), c = S.catOf(e, sh.learned); byCat[c] = (byCat[c] || 0) + v; sharedTot += v; if (e.paidByMe) paidMe += v; else paidThem += v; });
    prevEx.forEach(function (e) { var c = S.catOf(e, sh.learned); prevCat[c] = (prevCat[c] || 0) + toE(e); });
    var cats2 = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
    if (ex.length) {
      var months = nowM + 1;
      html += "<div class='section grid2'><div class='card'><h2>На что уходят общие деньги</h2><p class='small muted' style='margin-top:-6px'>Всего " + eur(rnd(sharedTot), { dec: 0 }) + " за " + y + " — в среднем " + eur(rnd(sharedTot / months), { dec: 0 }) + " в месяц на двоих.</p><ul class='bar-list'>" +
        cats2.slice(0, 8).map(function (c) {
          var v = byCat[c], pc = Math.round(v / sharedTot * 100), pv = prevCat[c];
          return "<li><span class='bl-name'>" + esc(c) + "</span><span class='bl-bar'><i style='width:" + Math.max(2, pc) + "%'></i></span><span class='bl-val'>" + eur(rnd(v), { dec: 0 }) + "<small>" + pc + "%" + (pv ? " · " + (v / months * 12 > pv * 1.15 ? "↑" : v / months * 12 < pv * 0.85 ? "↓" : "≈") + " к " + (Number(y) - 1) : "") + "</small></span></li>";
        }).join("") + "</ul></div>";
      var shMe = paidMe / (paidMe + paidThem || 1);
      html += "<div class='card'><h2>Кто платит за общее</h2><div class='split-bar'><i style='width:" + Math.round(shMe * 100) + "%'></i></div>" +
        "<div class='row small' style='margin-top:6px'><span><b>" + esc(meName) + "</b> " + eur(rnd(paidMe), { dec: 0 }) + " · " + Math.round(shMe * 100) + "%</span><span class='spacer'></span><span><b>" + esc(pName) + "</b> " + eur(rnd(paidThem), { dec: 0 }) + " · " + Math.round((1 - shMe) * 100) + "%</span></div>" +
        "<p class='small muted'>Это кто оплачивал, а не чья доля больше: доли делятся при вводе траты, а разницу показывает баланс в «Общих».</p></div></div>";
    }

    // выводы про нас
    var out = [];
    if (both || true) {
      var avg = tot("total") / 12, heavy = mine.months.map(function (_, i) { return { i: i, v: sum("total", i) }; }).filter(function (x) { return x.v > avg * 1.3; });
      if (heavy.length) out.push({ k: "warn", ic: "▲", h: "Тяжёлые месяцы" + (both ? " на двоих" : "") + ": " + heavy.map(function (x) { return E.MONTHS[x.i]; }).join(", "), p: "Расходы выше среднего (" + eur(rnd(avg), { dec: 0 }) + "/мес) больше чем на 30%. Откладывать на них лучше заранее, вместе." });
    }
    if (ex.length && tot("total")) out.push({ k: "", ic: "⇄", h: "Общие траты — " + Math.round(sharedTot / months / (tot("total") / 12) * 100) + "% " + (both ? "ваших" : "") + " расходов", p: both ? "Остальное — личное у каждой. Чем выше доля, тем важнее, чтобы общие траты были в личных планах — для этого есть «Общие → личный план»." : "Доля от твоих расходов. С данными партнёра посчитаю на двоих." });
    var grow = cats2.filter(function (c) { return prevCat[c] && byCat[c] / months * 12 > prevCat[c] * 1.25 && byCat[c] > 20000; }).slice(0, 3);
    if (grow.length) out.push({ k: "warn", ic: "↗", h: "Растут к " + (Number(y) - 1) + ": " + grow.join(", "), p: grow.map(function (c) { return c + ": " + eur(rnd(prevCat[c]), { dec: 0 }) + " за год → темп " + eur(rnd(byCat[c] / months * 12), { dec: 0 }); }).join(" · ") });
    if (both) {
      var dcap = (mine.total.dcap || 0) + (theirs.total.dcap || 0);
      out.push({ k: dcap >= 0 ? "good" : "warn", ic: "◆", h: "Капитал вместе за " + y + ": " + eur(rnd(dcap), { dec: 0, plus: true }), p: esc(meName) + " " + eur(rnd(mine.total.dcap || 0), { dec: 0, plus: true }) + ", " + esc(pName) + " " + eur(rnd(theirs.total.dcap || 0), { dec: 0, plus: true }) + " (по плану и сверкам)." });
    }
    var bal = sh ? S.balance(sh.expenses).EUR || 0 : 0;
    if (Math.abs(bal) >= 5000) out.push({ k: "", ic: "€", h: bal > 0 ? pName + " должна тебе " + eur(bal, { dec: 0 }) : "Ты должна " + pName + " " + eur(-bal, { dec: 0 }), p: "Рассчитаться — на экране «Общие»." });
    if (out.length) html += "<div class='section'><h2>Выводы про нас</h2><div class='grid2'>" + out.map(function (o) { return "<div class='card insight " + o.k + "'><div class='ic'>" + o.ic + "</div><div><b>" + esc(o.h) + "</b><p>" + esc(o.p) + "</p></div></div>"; }).join("") + "</div></div>";
    if (ui.us && ui.us.level === "full") html += "<div class='section row'><button class='btn' id='openPartner'>Открыть её бюджет целиком</button></div>";
    $main.innerHTML = html;
    $main.querySelectorAll("[data-uy]").forEach(function (b) { b.onclick = function () { ui.usYear = b.dataset.uy; render(); }; });
    var op = $main.querySelector("#openPartner"); if (op) op.onclick = function () { switchTo(ui.us.id); location.hash = "#home"; };
  };


  // Из чего складывается сумма «в обращении» на неделю w
  function obrBreakdown(y, w) {
    var r = E.compute(state, y), yr = state.years[y], L = -1;
    for (var i = w; i >= 0; i--) if (r.fact[i] !== null) { L = i; break; }
    var html = "<div class='m-body ob'><h2>Из чего складывается " + eur(rnd(r.base[w]), { dec: 0 }) + "</h2><p class='small muted' style='margin:2px 0 12px'>В обращении на " + esc(shortWeek(y, w)) + " — деньги на картах и в наличке, без накоплений.</p>";
    var startV;
    if (L >= 0) {
      startV = r.fact[L];
      var accRows = state.accounts.filter(function (a) { var e = (yr.recon[L] || {})[a.id]; return e && e.cents !== null && E.accountActive(a, r.weeks[L]); })
        .map(function (a) { return { n: a.name, v: yr.recon[L][a.id].cents }; }).filter(function (x) { return x.v; }).sort(function (a, b) { return b.v - a.v; });
      html += "<div class='ob-sec'><div class='ob-row head'><span>Сверка " + esc(shortWeek(y, L)) + "</span><b>" + eur(startV) + "</b></div>" +
        accRows.map(function (x) { return "<div class='ob-row sub'><span>" + esc(x.n) + "</span><span>" + eur(x.v) + "</span></div>"; }).join("") + "</div>";
    } else {
      startV = r.start ? r.start.obr : 0;
      html += "<div class='ob-sec'><div class='ob-row head'><span>Старт года</span><b>" + eur(startV) + "</b></div><div class='ob-row sub'><span>Сверок в " + y + " ещё не было — считаю от остатка на 1 января</span><span></span></div></div>";
    }
    if (w > L) {
      var from = L + 1, groups = {};
      state.categories.forEach(function (c) {
        if (c.currency === "RUB") return;
        var sum = 0;
        for (var k = from; k <= w; k++) { var x = r.cells[c.id][k]; if (x) sum += x.cents; }
        if (!sum) return;
        var g = c.block === "income" ? "income" : c.block === "savings" ? "savings" : "spend";
        (groups[g] = groups[g] || []).push({ n: c.name, v: sum });
      });
      var titles = { income: "Доходы по плану", spend: "Расходы по плану", savings: "Переводы в накопления" };
      html += "<p class='small muted' style='margin:14px 0 6px'>С тех пор по плану" + (from === w ? " (" + esc(shortWeek(y, w)) + ")" : ": " + esc(shortWeek(y, from)) + " — " + esc(shortWeek(y, w))) + "</p>";
      ["income", "spend", "savings"].forEach(function (g) {
        var list = (groups[g] || []).sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); });
        if (!list.length) return;
        var tot = list.reduce(function (t, x) { return t + x.v; }, 0), top = list.slice(0, 5), rest = list.slice(5).reduce(function (t, x) { return t + x.v; }, 0);
        html += "<div class='ob-sec'><div class='ob-row head'><span>" + titles[g] + "</span><b class='" + sign(tot) + "'>" + eur(tot, { plus: true }) + "</b></div>" +
          top.map(function (x) { return "<div class='ob-row sub'><span>" + esc(x.n) + "</span><span>" + eur(x.v, { plus: true }) + "</span></div>"; }).join("") +
          (rest ? "<div class='ob-row sub'><span>остальное (" + (list.length - 5) + ")</span><span>" + eur(rest, { plus: true }) + "</span></div>" : "") + "</div>";
      });
    }
    html += "<div class='ob-row total'><span>В обращении на " + esc(shortWeek(y, w)) + "</span><b>" + eur(r.base[w]) + "</b></div>" +
      (r.fact[w] === null ? "<p class='small muted' style='margin:10px 0 0'>Это расчёт: сверка покажет, сколько на самом деле.</p>" : "") + "</div>" +
      "<div class='m-foot'><button class='btn ghost' data-act='def'>Что такое «в обращении»</button><button class='btn primary' data-act='ok'>Понятно</button></div>";
    modal(html, function (m) { m.querySelector("[data-act=ok]").onclick = closeModal; m.querySelector("[data-act=def]").onclick = function () { explain("obr"); }; });
  }

  // ===== ЗНАКОМСТВО И СПРАВКА =====
  var GLOSSARY = {
    obr: ["В обращении", "Деньги для жизни: карты и наличка, с которых ты платишь каждый день. Накопления и инвестиции сюда не входят. Приложение считает, сколько их будет в каждую неделю, если всё пойдёт по плану."],
    diff: ["Расхождение", "Разница между тем, что реально лежит на счетах (по сверке), и тем, что должно быть по плану. Минус — потратила больше, чем записано; плюс — меньше."],
    cap: ["Капитал", "Всё вместе: деньги в обращении, накопительный счёт, инвестиции, отложенная наличка и рубли по курсу. Перевод в накопления капитал не меняет — деньги просто перекладываются."],
    recon: ["Сверка", "Раз в неделю, по её итогам, вписываешь остатки на счетах. Дальше расчёт идёт от реальных цифр, а не от плана, и сразу видно расхождение."],
    rec: ["Регулярные траты", "То, что повторяется каждый месяц: аренда, подписки, телефон, а также зарплата. Задаёшь один раз, указываешь недели месяца — и сумма сама встаёт в план."],
    weeks: ["Недели месяца", "Каждый месяц делится на 5 недель: с понедельника по воскресенье, первая и последняя могут быть короче. Короткая неделя — «неделя-сюрприз», в ней обычно получается накопить."],
  };
  function explain(key) {
    var g = GLOSSARY[key];
    modal("<div class='m-body'><h2>" + esc(g[0]) + "</h2><p style='margin:8px 0 0'>" + esc(g[1]) + "</p></div><div class='m-foot'><a class='btn ghost' href='#help'>Все термины</a><button class='btn primary' data-act='ok'>Понятно</button></div>",
      function (m) { m.querySelector("[data-act=ok]").onclick = closeModal; });
  }

  var TOUR = [
    { ic: "€", h: "Easy Budget за минуту", p: "Это план на год, разбитый по неделям, и простая проверка: совпадает ли он с жизнью. Не нужно записывать каждый кофе — только крупное и регулярное." },
    { ic: "◷", h: "Неделя — главный ритм", p: "На экране «Неделя» — что придёт и что уйдёт в эти семь дней. Нашла в выписке крупную трату — внеси её с датой: прошлой или будущей, сумма встанет в нужную неделю." },
    { ic: "↻", h: "Регулярные траты", p: "Аренда, подписки, телефон, зарплата — задай один раз, укажи, в какую неделю месяца списывается, и приложение само расставит суммы на весь год." },
    { ic: "✓", h: "Сверка раз в неделю", p: "В воскресенье вечером или в понедельник утром впиши, сколько реально на картах и в наличке. Разница с планом — «расхождение»: если оно большое, какая-то трата не внесена." },
    { ic: "⇄", h: "Общие траты", p: "Траты вдвоём — как в Splitwise: кто платил, как делим, кто кому должен. Твоя доля автоматически учитывается в личном бюджете." },
    { ic: "⌂", h: "Главная подскажет, что делать", p: "Здесь видно самый низкий остаток до конца года и короткий список дел. На телефоне добавь сайт на экран «Домой»: Safari → «Поделиться» → «На экран Домой»." },
  ];
  function finishTour() {
    if (RO() || !myState) return;
    if (!myState.settings.tourDone) { myState.settings.tourDone = true; myState._ver = (myState._ver || 0) + 1; save(); }
  }
  function showTour(n) {
    var s = TOUR[n], last = n === TOUR.length - 1;
    modal("<div class='m-body tour'><div class='tour-ic'>" + s.ic + "</div><h2>" + esc(s.h) + "</h2><p>" + esc(s.p) + "</p>" +
      "<div class='tour-dots'>" + TOUR.map(function (_, j) { return "<span class='" + (j === n ? "on" : "") + "'></span>"; }).join("") + "</div></div>" +
      "<div class='m-foot'>" + (last ? "" : "<button class='btn ghost' data-act='skip'>Пропустить</button>") + "<span class='spacer'></span>" +
      (n > 0 ? "<button class='btn' data-act='back'>Назад</button>" : "") + "<button class='btn primary' data-act='next' autofocus>" + (last ? "Начать" : "Дальше") + "</button></div>",
      function (m) {
        m.classList.add("tour-modal");
        var sk = m.querySelector("[data-act=skip]"), bk = m.querySelector("[data-act=back]");
        if (sk) sk.onclick = closeModal;
        if (bk) bk.onclick = function () { showTour(n - 1); };
        m.querySelector("[data-act=next]").onclick = function () { if (last) closeModal(); else showTour(n + 1); };
        m.onclose = function () { m.onclose = null; finishTour(); if (/^#?(home)?$/.test(location.hash)) render(); };
      });
  }

  routes.help = function () {
    var sections = [
      ["home", "⌂", "Главная", "Самый низкий остаток до конца года, капитал и список дел на сейчас."],
      ["week", "◷", "Неделя", "План на текущую неделю: приходы, расходы, быстрое добавление траты."],
      ["shared", "⇄", "Общие", "Траты вдвоём с партнёром, доли и баланс «кто кому должен». Импорт из Splitwise."],
      ["us", "♡", "Мы", "Общий бюджет: капитал вместе, доходы и расходы вдвоём, на что уходят общие деньги и кто платит. Цифры партнёра — если он открыл доступ."],
      ["cash", "₵", "Наличка", "Кошелёк и конверты: пишешь или диктуешь «кофе 4,5 из кошелька» — баланс считается сам. Наличные из «Общих» подтягиваются."],
      ["recon", "✓", "Сверка", "Остатки на счетах по итогам недели и расхождение с планом. Календарь показывает, где сверки были."],
      ["tolog", "⇄", "Общие → личный план", "Заметные общие траты, которых нет в личной таблице: внести одной кнопкой или отметить, что уже есть."],
      ["year", "▦", "Год", "Вся таблица: категории × недели. Здесь же создаётся план на следующий год."],
      ["recurring", "↻", "Регулярные траты", "Аренда, подписки, зарплата — один раз задаёшь, дальше они сами в плане."],
      ["analysis", "◔", "Анализ", "Графики: куда уходят деньги, как меняется капитал, сравнение лет."],
      ["insights", "✦", "Выводы", "Автоматические наблюдения: тяжёлые месяцы, рост статей, лишние деньги без процентов."],
      ["settings", "⚙", "Настройки", "Категории, счета, курс, доступ партнёра, импорт таблицы и бэкап."],
    ];
    var html = "<div class='page-head'><div><h1>Как это работает</h1><div class='sub'>Короткая инструкция и словарь. Знакомство можно пройти ещё раз.</div></div>" +
      "<button class='btn primary' id='tourAgain'>Показать знакомство</button></div>";
    html += "<div class='card'><h2>Ритм на неделю — 5 минут</h2><ol class='steps'>" +
      "<li><b>В понедельник утром (или в воскресенье вечером) открой «Главную».</b> В «Что сделать» будет сверка за прошедшую неделю. Пусто — значит, всё в порядке.</li>" +
      "<li><b>Внеси крупные траты</b> из выписки: кнопка «Трата в план», дата — когда списали. Мелочи не нужны — они уже заложены в «продукты / расходы на неделю».</li>" +
      "<li><b>Сделай сверку:</b> впиши остатки на картах и в наличке. Приложение покажет расхождение с планом.</li>" +
      "<li><b>Общие траты</b> вносите оба, сразу с телефона, — баланс посчитается сам.</li></ol></div>";
    html += "<div class='section'><h2>Словарь</h2><div class='grid2'>" + Object.keys(GLOSSARY).map(function (k) {
      return "<div class='card gloss'><b>" + esc(GLOSSARY[k][0]) + "</b><p>" + esc(GLOSSARY[k][1]) + "</p></div>";
    }).join("") + "</div></div>";
    html += "<div class='section'><h2>Что где лежит</h2><div class='sec-grid'>" + sections.map(function (x) {
      return "<a class='sec' href='#" + x[0] + "'><span class='ico'>" + x[1] + "</span><span><b>" + esc(x[2]) + "</b><small>" + esc(x[3]) + "</small></span></a>";
    }).join("") + "</div></div>";
    html += "<div class='section grid2'><div class='card'><h2>На телефон</h2><p class='muted' style='margin:0'>iPhone: Safari → «Поделиться» → <b>«На экран Домой»</b>. Android: Chrome → ⋮ → «Установить приложение». Откроется как обычное приложение, вход сохранится.</p></div>" +
      "<div class='card'><h2>Данные и доступ</h2><p class='muted' style='margin:0'>Бюджет хранится в облаке и виден только тебе. Что видит партнёр — полностью, только итоги или ничего — выбирается в «Настройках». Бэкап в JSON — там же.</p></div></div>";
    $main.innerHTML = html;
    $main.querySelector("#tourAgain").onclick = function () { showTour(0); };
  };

  // «Меню» в нижней панели на телефоне: разделы по смыслу
  document.getElementById("navMore").onclick = function () {
    var groups = [
      ["Каждую неделю", [["recon", "✓", "Сверка", "остатки на счетах и расхождение с планом"]]],
      ["План", [["year", "▦", "Год", "весь план по неделям в одной таблице"], ["recurring", "↻", "Регулярные траты", "аренда, подписки, зарплата"]]],
      ["Вместе", [["us", "♡", "Мы", "общий капитал, доходы и расходы вдвоём"], ["tolog", "⇄", "Общие → личный план", "общие траты, которых нет в твоём плане"]]],
      ["Обзор", [["analysis", "◔", "Анализ", "графики и сравнение лет"], ["insights", "✦", "Выводы", "тяжёлые месяцы, рост трат и другие наблюдения"]]],
      ["", [["settings", "⚙", "Настройки", "категории, счета, курс, доступ, данные"], ["help", "?", "Как это работает", "инструкция и словарь"]]],
    ];
    modal("<div class='m-body'><h2>Меню</h2>" + groups.map(function (g) {
      return "<div class='menu-g'>" + g[0] + "</div><div class='more-list'>" + g[1].map(function (x) {
        return "<a class='sec' href='#" + x[0] + "'><span class='ico'>" + x[1] + "</span><span><b>" + esc(x[2]) + "</b><small>" + esc(x[3]) + "</small></span></a>";
      }).join("") + "</div>";
    }).join("") + "</div><div class='m-foot'><button class='btn ghost' data-act='x'>Закрыть</button></div>",
      function (m) { m.classList.add("sheet-menu"); var mb = m.querySelector(".m-body"); mb.tabIndex = -1; mb.style.outline = "none"; setTimeout(function () { mb.focus(); }, 40); m.querySelector("[data-act=x]").onclick = closeModal; m.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeModal); }); });
  };


  // ===== НЕДЕЛЯ =====
  routes.week = function () {
    var y = ui.year, w = ui.week, yr = state.years[y];
    if (yr.archived) { var d = defaultYearWeek(); ui.year = y = d.year; ui.week = w = d.week; }
    var r = E.compute(state, y), wk = r.weeks[w];
    var fact = r.fact[w], diff = r.diff[w];
    var alert = state.settings.diffAlert;
    // минимум «в обращении» до конца года
    var minV = Infinity, minW = w;
    for (var i = w; i < 60; i++) if (r.base[i] < minV) { minV = r.base[i]; minW = i; }
    var lastCapW = w; while (lastCapW < 59 && r.weeks[lastCapW].wim !== 5) lastCapW++;
    var mon = E.monthly(state, y).months[wk.month - 1];

    var html = "<div class='page-head'><div><h1>Неделя " + esc(E.weekTitle(Number(y), w)) + "</h1><div class='sub'>" + wk.wim + "-я неделя месяца · " +
      wk.days + " дн." + (wk.days <= 3 ? " — неделя-сюрприз, обычно тут получается накопить" : "") + "</div></div>" +
      "<div class='week-nav'><button class='btn' data-act='prev' aria-label='Предыдущая неделя'>‹</button><button class='btn' data-act='today'>Сегодня</button>" +
      "<button class='btn' data-act='next' aria-label='Следующая неделя'>›</button></div></div>";

    html += "<div class='kpis'>" +
      kpi("В обращении", eur(rnd(r.base[w]), { dec: 0 }), (fact === null ? "расчёт по плану" : "по факту сверки") + " · <button class='linkish' data-ob='1'>из чего</button>") +
      kpi("Расхождение", diff === null ? "—" : eur(rnd(diff), { dec: 0, plus: true }), diff === null ? (weekDone(y, w) ? "<button class='btn sm primary' data-act='recon'>Сделать сверку</button>" : "сверка — когда неделя закончится") :
        (diff < alert ? "<span class='neg'>⚠ больше порога в " + eur(-alert, { dec: 0 }) + "</span>" : "<span class='pos'>✓ в пределах плана</span>"), diff !== null && diff < alert) +
      kpi("Капитал", eur(rnd(r.cap[w]), { dec: 0 }), "за неделю " + "<span class='" + sign(r.dweek[w]) + "'>" + eur(rnd(r.dweek[w]), { dec: 0, plus: true }) + "</span>" +
        (wk.wim === 5 ? " · за месяц <span class='" + sign(r.dmonth[w]) + "'>" + eur(rnd(r.dmonth[w]), { dec: 0, plus: true }) + "</span>" : "")) +
      kpi("Самый низкий остаток", eur(rnd(minV), { dec: 0 }), esc(shortWeek(y, minW)) + " · до конца года", minV < 0) +
      "</div>";

    // план недели
    var items = "", tin = 0, tout = 0;
    E.BLOCKS.forEach(function (b) {
      var list = cats().filter(function (c) { return c.block === b.id && r.cells[c.id][w]; });
      if (!list.length) return;
      items += "<li class='blk'>" + esc(b.name) + "</li>";
      list.forEach(function (c) {
        var cell = r.cells[c.id][w];
        var v = c.currency === "RUB" ? 0 : cell.cents;
        if (c.block !== "savings") { if (v > 0) tin += v; else tout += v; }
        items += "<li data-cell='" + c.id + "'><span class='name'>" + esc(c.name) + (cell.note ? " <span class='muted small'>· " + esc(cell.note) + "</span>" : "") + "</span>" +
          "<span class='badge " + cell.src + "'>" + (cell.src === "rec" ? "регулярная" : "вручную") + "</span>" +
          "<span class='val " + sign(cell.cents) + "'>" + E.fmt(cell.cents, { cur: cur(c) }) + "</span></li>";
      });
    });
    html += "<div class='grid2'><div class='card'><div class='row'><h2 style='margin:0'>План на неделю</h2><span class='spacer'></span>" +
      "<span class='small muted'>приход <b class='pos'>" + eur(tin) + "</b> · расход <b class='neg'>" + eur(tout) + "</b></span></div>" +
      (items ? "<ul class='plan-list'>" + items + "</ul>" : "<p class='empty'>На эту неделю ничего не запланировано.</p>") + "</div>";

    // быстрое добавление
    html += "<div>" + (RO() ? "" : "<div class='card'><h2>Внести трату</h2><p class='small muted' style='margin-top:-6px'>Крупная трата из выписки? Внеси её — сумма прибавится к плану нужной недели.</p>" +
      "<button class='btn primary' data-act='spend'>+ Внести трату</button></div>");

    html += "<div class='card'><h2>" + E.MONTHS[wk.month - 1][0].toUpperCase() + E.MONTHS[wk.month - 1].slice(1) + " целиком</h2><table class='t'>" +
      "<tr><td>Доходы</td><td class='n pos'>" + eur(rnd(mon.income), { dec: 0 }) + "</td></tr>" +
      "<tr><td>Расходы</td><td class='n'>" + eur(rnd(mon.total), { dec: 0 }) + "</td></tr>" +
      "<tr><td class='muted'>из них на жизнь (без налогов)</td><td class='n muted'>" + eur(rnd(mon.living), { dec: 0 }) + "</td></tr>" +
      "<tr><td>Отложено в накопления</td><td class='n'>" + eur(rnd(mon.saved), { dec: 0 }) + "</td></tr>" +
      "<tr class='total'><td>Капитал на конец месяца</td><td class='n'>" + eur(rnd(r.cap[lastCapW]), { dec: 0 }) + " <span class='small " + sign(r.dmonth[lastCapW]) + "'>" +
      eur(rnd(r.dmonth[lastCapW]), { dec: 0, plus: true }) + "</span></td></tr></table></div></div></div>";

    $main.innerHTML = html;
    $main.querySelector("[data-act=prev]").onclick = function () { if (ui.week > 0) ui.week--; else if (state.years[String(Number(y) - 1)] && !state.years[String(Number(y) - 1)].archived) { ui.year = String(Number(y) - 1); ui.week = 59; } render(); };
    $main.querySelector("[data-act=next]").onclick = function () { if (ui.week < 59) ui.week++; else if (state.years[String(Number(y) + 1)]) { ui.year = String(Number(y) + 1); ui.week = 0; } render(); };
    $main.querySelector("[data-act=today]").onclick = function () { var d = defaultYearWeek(); ui.year = d.year; ui.week = d.week; render(); };
    var rb = $main.querySelector("[data-act=recon]"); if (rb && RO()) rb.remove(); else if (rb) rb.onclick = function () { ui.recWeek = { year: y, week: w }; location.hash = "#recon"; };
    $main.querySelectorAll("[data-cell]").forEach(function (li) { li.onclick = function () { editCell(y, li.dataset.cell, w); }; });
    $main.querySelectorAll("[data-ob]").forEach(function (b) { b.onclick = function () { obrBreakdown(y, w); }; });
    var sb = $main.querySelector("[data-act=spend]");
    if (sb) sb.onclick = function () { spendModal({ date: isNow(y, w) ? E.todayISO() : wk.from, after: function (t) { ui.year = t.year; ui.week = t.week; } }); };
  };
  function kpi(label, value, foot, flag) {
    return "<div class='kpi" + (flag ? " flag" : "") + "'><div class='kpi-label'>" + label + "</div><div class='kpi-value'>" + value + "</div><div class='kpi-foot'>" + (foot || "") + "</div></div>";
  }

  // ===== ГОД =====
  function yearChips(sel, includeArchived, extra) {
    return "<div class='chips'>" + years().filter(function (y) { return includeArchived || !state.years[y].archived; }).map(function (y) {
      return "<button class='chip" + (y === sel ? " on" : "") + "' data-year='" + y + "'>" + y + (state.years[y].archived ? " · архив" : "") + "</button>";
    }).join("") + (extra || "") + "</div>";
  }
  function bindYearChips(cb) {
    $main.querySelectorAll("[data-year]").forEach(function (b) { b.onclick = function () { cb(b.dataset.year); }; });
  }

  routes.year = function () {
    $main.classList.add("wide");
    var y = ui.gridYear && state.years[ui.gridYear] ? ui.gridYear : ui.year, yr = state.years[y];
    var r = E.compute(state, y), weeks = r.weeks, ro = !!yr.archived || RO();
    var nowW = (E.weekOfDate(E.todayISO()) || {});
    var nowIdx = String(nowW.year) === String(y) ? nowW.idx : -1;
    var rules = {};
    (yr.recurring || []).forEach(function (ru) {
      if (ru.to) return;
      rules[ru.catId] = (rules[ru.catId] ? rules[ru.catId] + "; " : "") + E.fmt(ru.cents) + " · " + ru.weeks;
    });
    var html = "<div class='page-head'><div><h1>Год " + y + "</h1><div class='sub'>Строки — категории, столбцы — недели. <span style='color:var(--rec)'>Серым</span> — регулярные, " +
      "<span style='color:var(--manual)'>синим</span> — вписано вручную. Нажми на ячейку, чтобы изменить.</div></div>" +
      yearChips(y, true, RO() ? "" : "<button class='chip' data-act='newyear'>+ " + (Number(years()[years().length - 1]) + 1) + "</button>") + "</div>";

    var head1 = "<tr><th class='sticky'>" + y + "</th><th class='sticky2'>регулярно</th>", head2 = "<tr><th class='sticky'></th><th class='sticky2'>сумма · недели</th>";
    for (var m = 0; m < 12; m++) head1 += "<th colspan='5' class='mstart' style='text-align:left'>" + E.MONTHS[m] + "</th>";
    weeks.forEach(function (wk) { head2 += "<th class='" + (wk.wim === 1 ? "mstart " : "") + (wk.idx === nowIdx ? "now" : "") + "'>" + wk.label + "</th>"; });
    var body = "";
    function tds(arr, cls, opts) {
      opts = opts || {};
      var s = "";
      weeks.forEach(function (wk) {
        var v = arr[wk.idx], c = (wk.wim === 1 ? "mstart " : "") + (wk.idx === nowIdx ? "now " : "") + (cls ? cls(v, wk) : "");
        s += "<td class='v ro " + c + "'" + (opts.attr ? opts.attr(wk) : "") + ">" + (v === null || v === undefined ? "" : (opts.fmt ? opts.fmt(v, wk) : E.fmt(rnd(v)))) + "</td>";
      });
      return s;
    }
    E.BLOCKS.forEach(function (b) {
      var list = cats().filter(function (c) { return c.block === b.id && (!c.archived || r.cells[c.id].some(Boolean)); });
      if (!list.length) return;
      body += "<tr class='blk'><td class='sticky'>" + esc(b.name) + "</td><td class='sticky2'></td><td colspan='60'></td></tr>";
      list.forEach(function (c) {
        body += "<tr><td class='sticky' title='" + esc(c.name) + "'>" + esc(c.name) + (c.mandatory ? " <span class='badge'>обяз.</span>" : "") + "</td>" +
          "<td class='sticky2' data-rules='" + c.id + "'>" + esc(rules[c.id] || "") + "</td>";
        weeks.forEach(function (wk) {
          var cell = r.cells[c.id][wk.idx];
          var cls = "v " + (wk.wim === 1 ? "mstart " : "") + (wk.idx === nowIdx ? "now " : "") + (cell ? cell.src + " " : "") + (cell && cell.note ? "note " : "") + (ro ? "ro" : "");
          var title = cell ? (cell.src === "manual" ? "=" + (cell.expr || "") : "регулярная") + (cell.note ? " · " + cell.note : "") : "";
          body += "<td class='" + cls + "' data-c='" + c.id + "' data-w='" + wk.idx + "' title='" + esc(title) + "'>" + (cell ? E.fmt(cell.cents, { dec: Math.abs(cell.cents) < 10000 && cell.cents % 100 ? 2 : 0 }) : "") + "</td>";
        });
        body += "</tr>";
      });
    });
    if (!ro) {
      var alert = state.settings.diffAlert;
      body += "<tr class='tot sep'><td class='sticky'>В обращении (расчёт)</td><td class='sticky2'>старт " + E.fmt(rnd(r.start.obr)) + "</td>" + tds(r.obr) + "</tr>";
      body += "<tr class='tot'><td class='sticky'>Факт (сумма счетов)</td><td class='sticky2'></td>" +
        tds(r.fact, function () { return "click"; }, { attr: function (wk) { return " data-recon='" + wk.idx + "'"; } }) + "</tr>";
      body += "<tr class='tot'><td class='sticky'>Расхождение</td><td class='sticky2'></td>" + tds(r.diff, function (v) { return v !== null && v < alert ? "bad" : v > 0 ? "good" : ""; }, { fmt: function (v) { return E.fmt(rnd(v), { plus: true }); } }) + "</tr>";
      body += "<tr class='blk'><td class='sticky'>Капитал</td><td class='sticky2'>старт</td><td colspan='60'></td></tr>";
      body += "<tr class='minor'><td class='sticky'>в обращении € (факт, если внесён)</td><td class='sticky2'>" + E.fmt(rnd(r.start.obr)) + "</td>" + tds(r.base) + "</tr>";
      E.CAPITAL_ROWS.forEach(function (cr) {
        body += "<tr class='minor'><td class='sticky'>&nbsp;&nbsp;" + cr.name + "</td><td class='sticky2'>" + E.fmt(rnd(r.start[cr.key])) + "</td>" + tds(r.rows[cr.key]) + "</tr>";
      });
      body += "<tr class='minor'><td class='sticky'>рубли в €</td><td class='sticky2'></td>" + tds(r.rubEur) + "</tr>";
      body += "<tr class='tot'><td class='sticky'>ИТОГО КАПИТАЛ €</td><td class='sticky2'>" + E.fmt(rnd(r.startCap)) + "</td>" + tds(r.cap.map(function (v, i) { return weeks[i].wim === 5 ? v : null; })) + "</tr>";
      body += "<tr class='minor'><td class='sticky'>изменение за неделю</td><td class='sticky2'></td>" + tds(r.dweek, function (v) { return v < 0 ? "neg" : ""; }, { fmt: function (v) { return E.fmt(rnd(v), { plus: true }); } }) + "</tr>";
      body += "<tr class='tot'><td class='sticky'>изменение за месяц</td><td class='sticky2'></td>" + tds(r.dmonth, function (v) { return v === null ? "" : v < 0 ? "bad" : "good"; }, { fmt: function (v) { return E.fmt(rnd(v), { plus: true }); } }) + "</tr>";
    } else {
      body += "<tr class='tot sep'><td class='sticky'>Капитал на конец месяца</td><td class='sticky2'></td>" +
        tds(weeks.map(function (wk) { return wk.wim === 5 ? r.capMonth[wk.month - 1] : null; })) + "</tr>";
    }
    html += "<div class='grid-wrap' id='gridWrap'><table class='g'><thead>" + head1 + "</tr>" + head2 + "</tr></thead><tbody>" + body + "</tbody></table></div>";
    $main.innerHTML = html;

    bindYearChips(function (yy) { ui.gridYear = yy; if (!state.years[yy].archived) ui.year = yy; render(); });
    var ny = $main.querySelector("[data-act=newyear]");
    if (ny) ny.onclick = newYearDialog;
    var wrap = document.getElementById("gridWrap");
    if (ui.gridScroll && ui.gridScroll.y === y) { wrap.scrollLeft = ui.gridScroll.left; wrap.scrollTop = ui.gridScroll.top; }
    else if (nowIdx >= 0) {
      // показать текущий месяц целиком, сразу за закреплёнными столбцами
      var first = wrap.querySelectorAll("thead tr:nth-child(2) th")[2 + nowIdx - (nowIdx % 5)];
      var pinned = wrap.querySelector("thead .sticky").offsetWidth + (wrap.querySelector("thead .sticky2").offsetWidth || 0);
      if (first) wrap.scrollLeft = Math.max(0, first.getBoundingClientRect().left - wrap.getBoundingClientRect().left - pinned);
    }
    wrap.addEventListener("scroll", function () { ui.gridScroll = { y: y, left: wrap.scrollLeft, top: wrap.scrollTop }; });
    wrap.addEventListener("click", function (e) {
      var td = e.target.closest("td");
      if (!td) return;
      if (td.dataset.recon !== undefined && !RO()) { ui.recWeek = { year: y, week: Number(td.dataset.recon) }; location.hash = "#recon"; return; }
      if (td.dataset.rules && !RO()) { ui.recYear = y; location.hash = "#recurring"; return; }
      if (ro || td.dataset.c === undefined || td.querySelector("input")) return;
      inlineEdit(td, y);
    });
  };

  function inlineEdit(td, y) {
    var catId = td.dataset.c, w = Number(td.dataset.w);
    var entry = (state.years[y].entries[catId] || {})[w];
    var cell = E.compute(state, y).cells[catId][w];
    var old = td.innerHTML;
    td.innerHTML = "<input type='text' inputmode='decimal' value='" + esc(entry ? entry.expr : cell ? cell.cents / 100 : "") + "'>";
    var inp = td.querySelector("input"), done = false;
    inp.focus(); inp.select();
    function finish(saveIt) {
      if (done) return; done = true;
      if (!saveIt) { td.innerHTML = old; return; }
      var v = inp.value.trim();
      var prev = entry ? entry.expr : cell ? String(cell.cents / 100) : "";
      if (v === prev) { td.innerHTML = old; return; }
      try { E.exprCents(v); } catch (err) { toast("Ошибка в формуле: " + err.message); td.innerHTML = old; return; }
      if (v === "" && !entry) { td.innerHTML = old; return; }
      E.setEntry(state, y, catId, String(w), v);
      changed();
    }
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { finish(false); }
    });
    inp.addEventListener("blur", function () { finish(true); });
    inp.addEventListener("dblclick", function () { finish(false); editCell(y, catId, w); });
  }

  function newYearDialog() {
    var last = Number(activeYears()[activeYears().length - 1] || new Date().getFullYear() - 1), ny = last + 1;
    modal("<div class='m-body'><h2>Новый год: " + ny + "</h2><p class='muted'>Старт года — остатки на 31.12." + last + " по каждой строке капитала (считаются сами).</p>" +
      "<label class='row'><input type='checkbox' id='nyRec' checked> Перенести регулярные траты</label>" +
      "<label class='row' style='margin-top:6px'><input type='checkbox' id='nyOne'> Скопировать разовые траты «как в прошлом году» в те же недели</label></div>" +
      "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Создать " + ny + "</button></div>", function (m) {
      m.querySelector("[data-act=cancel]").onclick = closeModal;
      m.querySelector("[data-act=ok]").onclick = function () {
        E.createYear(state, ny, { copyRecurring: m.querySelector("#nyRec").checked, copyOneOff: m.querySelector("#nyOne").checked });
        ui.gridYear = String(ny); closeModal(); changed(); toast("Год " + ny + " создан");
      };
    });
  }

  // ===== СВЕРКА =====
  routes.recon = function () {
    var sel = ui.recWeek || finishedWeek() || defaultYearWeek();
    if (state.years[sel.year].archived) sel = defaultYearWeek();
    var y = sel.year, w = sel.week, yr = state.years[y], r = E.compute(state, y), wk = r.weeks[w];
    yr.recon = yr.recon || {}; yr.savRecon = yr.savRecon || {};
    var rec = yr.recon[w] || {}, srec = yr.savRecon[w] || {};
    // последний известный остаток по счёту — подсказка
    function lastKnown(accId) {
      for (var i = w - 1; i >= 0; i--) if (yr.recon[i] && yr.recon[i][accId]) return yr.recon[i][accId].cents;
      return null;
    }
    var accs = state.accounts.filter(function (a) { return !a.archived; }).sort(function (a, b) { return a.sort - b.sort; });
    var html = "<div class='page-head'><div><h1>Сверка</h1><div class='sub'>Впиши, сколько сейчас на счетах, — увидишь, совпало ли с планом. Дальше план считается от этих цифр.</div></div>" +
      "<div class='row'>" + yearChips(y, false) + "<select id='recW'>" + weekOpts(y, w, function (i) { return !!yr.recon[i] && r.fact[i] !== null; }) + "</select></div></div>";
    html += "<div class='card rc-card'><div class='row'><h2 style='margin:0'>Сверки " + y + "</h2><span class='spacer'></span><span class='small muted'>нажми на неделю, чтобы открыть</span></div>" + reconCalendar(y, false, w) + "</div>";
    var fwk = finishedWeek();
    if (!weekDone(y, w)) html += "<div class='hint' style='margin:0 0 16px'>Неделя " + esc(shortWeek(y, w)) + " ещё идёт: сверка будет точнее, когда в остатках окажутся все её траты." +
      (fwk ? " <button class='btn sm' id='toDone'>К неделе " + esc(shortWeek(fwk.year, fwk.week)) + "</button>" : "") + "</div>";
    html += "<div class='grid2'><div class='card'><h2>Остатки · " + esc(E.weekTitle(Number(y), w)) + "</h2><form id='recForm' class='rec-list'>";
    accs.forEach(function (a) {
      var active = E.accountActive(a, wk), e = rec[a.id], lk = lastKnown(a.id);
      html += "<div class='rec-row" + (a.kind === "info" ? " info" : "") + "'><label for='rf_" + a.id + "' class='rec-name'><span>" + esc(a.name.replace(/\s*\((?:NET|в ФАКТ)[^)]*\)/i, "")) + "</span>" +
        "<small>" + (a.kind === "info" ? "для справки, в факт не входит" : !active ? "считается с " + esc(a.countsFrom) : lk !== null ? "было " + esc(E.fmt(lk)) : "") + "</small>" +
        (/налич/i.test(a.name) && cashEurTotal() !== null && !/₽|руб/i.test(a.name) ? "<button type='button' class='linkish small' data-cashfill='" + a.id + "'>по учёту налички " + E.eur(cashEurTotal()) + " — подставить</button>" : "") + "</label>" +
        "<input id='rf_" + a.id + "' type='text' inputmode='decimal' name='" + a.id + "' value='" + esc(e ? e.expr : "") + "' placeholder='" + (lk !== null ? esc(E.fmt(lk)) : "0") + "'" + (a.kind === "cash_flow" && !active ? " disabled" : "") + "></div>";
    });
    html += "</form><details style='margin-top:14px'" + (Object.keys(srec).length ? " open" : "") + "><summary>Накопления, рубли и доллары (по желанию, раз в квартал)</summary>" +
      "<p class='small muted'>Впиши весь остаток, а не изменение: он заменит расчёт. Так учитываются рост инвестиций и проценты.</p><form id='savForm' class='form-grid'>";
    E.CAPITAL_ROWS.forEach(function (cr) {
      html += "<label class='f'>" + cr.name + "<input type='text' inputmode='decimal' name='" + cr.key + "' value='" + (srec[cr.key] !== undefined ? esc(srec[cr.key] / 100) : "") +
        "' placeholder='" + esc(E.fmt(rnd(r.rows[cr.key][w]))) + "'></label>";
    });
    html += "</form></details><div class='row' style='margin-top:16px'><button class='btn primary' id='recSave'>Сохранить сверку</button>" +
      (rec && Object.keys(rec).length ? "<button class='btn ghost danger' id='recClear'>Очистить неделю</button>" : "") + "</div></div>";

    html += "<div><div class='card' id='recResult'></div>" +
      "<div class='card'><h2>Нашла трату в выписке?</h2><p class='small muted' style='margin-top:-6px'>Внеси её — расхождение пересчитается сразу.</p><button class='btn' id='recAdd'>+ Внести трату</button></div></div></div>";

    // история сверок
    var hist = [];
    activeYears().forEach(function (yy) {
      var rr = E.compute(state, yy);
      rr.fact.forEach(function (f, i) { if (f !== null) hist.push({ y: yy, i: i, f: f, o: rr.obr[i], d: rr.diff[i], wk: rr.weeks[i] }); });
    });
    hist = hist.reverse().slice(0, 12);
    html += "<div class='section'><h2>Последние сверки</h2><div class='tbl-wrap'><table class='t'><thead><tr><th>Неделя</th><th class='n'>Расчёт</th><th class='n'>Факт</th><th class='n'>Расхождение</th></tr></thead><tbody>" +
      (hist.length ? hist.map(function (h) {
        return "<tr data-go='" + h.y + ":" + h.i + "' style='cursor:pointer'><td>" + esc(E.weekTitle(Number(h.y), h.i)) + "</td><td class='n'>" + eur(rnd(h.o), { dec: 0 }) + "</td><td class='n'>" + eur(rnd(h.f), { dec: 0 }) +
          "</td><td class='n " + (h.d < state.settings.diffAlert ? "neg" : "") + "'>" + eur(rnd(h.d), { dec: 0, plus: true }) + "</td></tr>";
      }).join("") : "<tr><td colspan='4' class='muted'>Сверок пока нет.</td></tr>") + "</tbody></table></div></div>";
    $main.innerHTML = html;

    function liveResult() {
      var f = null, err = null;
      accs.forEach(function (a) {
        var inp = $main.querySelector("#recForm [name=" + a.id + "]");
        if (!inp || inp.disabled || a.kind !== "cash_flow" || !inp.value.trim()) return;
        try { f = (f || 0) + E.exprCents(inp.value); } catch (e) { err = a.name + ": " + e.message; }
      });
      var calc = r.obr[w], box = $main.querySelector("#recResult");
      var s = "<h2>Итог</h2><table class='t'><tr><td>Расчёт по плану</td><td class='n'>" + eur(rnd(calc), { dec: 0 }) + "</td></tr>" +
        "<tr><td>Факт (сумма счетов)</td><td class='n'>" + (f === null ? "—" : eur(f)) + "</td></tr>";
      if (f !== null) {
        var d = f - calc;
        s += "<tr class='total'><td>Расхождение</td><td class='n " + (d < state.settings.diffAlert ? "neg" : d >= 0 ? "pos" : "") + "'>" + eur(d, { plus: true }) + "</td></tr></table>";
        s += d < state.settings.diffAlert ? "<div class='alert'>Потрачено больше плана. Найди в выписке траты на <b>~" + eur(rnd(-d), { dec: 0 }) + "</b> и внеси их кнопкой «Внести трату» — станет понятно, куда ушли деньги.</div>"
          : d > 5000 ? "<div class='ok-box'>Денег больше, чем по плану, на " + eur(rnd(d), { dec: 0 }) + ". Возможно, не внесён доход или трата ещё не списалась.</div>"
            : "<div class='ok-box'>Всё сходится с планом. Следующие недели посчитаются от факта.</div>";
      } else s += "</table><p class='small muted'>Впиши остатки — расхождение посчитается сразу.</p>";
      if (err) s += "<div class='alert'>Ошибка в формуле — " + esc(err) + "</div>";
      box.innerHTML = s;
    }
    $main.querySelectorAll("#recForm input").forEach(function (i) { i.addEventListener("input", liveResult); });
    $main.querySelectorAll("[data-cashfill]").forEach(function (b) { b.onclick = function () { var i = $main.querySelector("#recForm [name=" + b.dataset.cashfill + "]"); i.value = String(cashEurTotal() / 100).replace(".", ","); liveResult(); }; });
    bindRecCal(y);
    liveResult();
    bindYearChips(function (yy) { ui.recWeek = { year: yy, week: yy === sel.year ? w : 0 }; render(); });
    $main.querySelector("#recW").onchange = function (e) { ui.recWeek = { year: y, week: Number(e.target.value) }; render(); };
    $main.querySelector("#recSave").onclick = function () {
      var nr = {}, ns = {};
      try {
        accs.forEach(function (a) {
          var inp = $main.querySelector("#recForm [name=" + a.id + "]");
          if (!inp || !inp.value.trim()) return;
          nr[a.id] = { expr: inp.value.trim(), cents: E.exprCents(inp.value) };
        });
        E.CAPITAL_ROWS.forEach(function (cr) {
          var inp = $main.querySelector("#savForm [name=" + cr.key + "]");
          if (inp && inp.value.trim()) ns[cr.key] = E.exprCents(inp.value);
        });
      } catch (e) { toast("Ошибка в формуле: " + e.message); return; }
      if (Object.keys(nr).length) yr.recon[w] = nr; else delete yr.recon[w];
      if (Object.keys(ns).length) yr.savRecon[w] = ns; else delete yr.savRecon[w];
      ui.recWeek = { year: y, week: w };
      changed(); toast("Сверка сохранена");
    };
    var cl = $main.querySelector("#recClear");
    if (cl) cl.onclick = function () { if (!confirm("Удалить сверку за " + shortWeek(y, w) + "? Остатки сотрутся, и неделя снова посчитается по плану.")) return; delete yr.recon[w]; delete yr.savRecon[w]; changed(); };
    $main.querySelector("#recAdd").onclick = function () { spendModal({ date: wk.from, after: function () { ui.recWeek = { year: y, week: w }; } }); };
    var td = $main.querySelector("#toDone"); if (td) td.onclick = function () { ui.recWeek = fwk; render(); };
    $main.querySelectorAll("[data-go]").forEach(function (tr) { tr.onclick = function () { var p = tr.dataset.go.split(":"); ui.recWeek = { year: p[0], week: Number(p[1]) }; render(); }; });
  };

  // ===== РЕГУЛЯРНЫЕ ТРАТЫ =====
  routes.recurring = function () {
    var y = ui.recYear && state.years[ui.recYear] && !state.years[ui.recYear].archived ? ui.recYear : ui.year, yr = state.years[y];
    yr.recurring = yr.recurring || [];
    var list = yr.recurring.slice().sort(function (a, b) {
      var ca = state.categories.find(function (c) { return c.id === a.catId; }) || {}, cb = state.categories.find(function (c) { return c.id === b.catId; }) || {};
      return (ca.sort - cb.sort) || (a.from < b.from ? -1 : 1);
    });
    var monthOpts = function (sel) { return E.MONTHS.map(function (m, i) { var v = y + "-" + (i < 9 ? "0" : "") + (i + 1) + "-01"; return "<option value='" + v + "'" + (v === sel ? " selected" : "") + ">с " + E.MONTHS_GEN[i].replace(/я$/, "я") + " (" + m + ")</option>"; }).join(""); };
    var html = "<div class='page-head'><div><h1>Регулярные траты</h1><div class='sub'>То, что повторяется каждый месяц: аренда, подписки, телефон и зарплата (доходы — со знаком плюс). Задаёшь один раз — сумма сама встаёт в нужные недели.</div></div>" + yearChips(y, false) + "</div>";
    var cands = RO() ? [] : E.findRepeats(state, y);
    var wText = function (ws) { return ws === "все" ? "каждую неделю" : ws.split(",").map(function (x) { return x + "-я"; }).join(" и ") + (ws.indexOf(",") > 0 ? " недели" : " неделя"); };
    var mText = function (c) { return c.toM === 11 ? (c.fromM === 0 ? "весь год" : "с " + E.MONTHS_GEN[c.fromM].replace(/я$/, "я") + " до конца года") : E.MONTHS_SHORT[c.fromM] + "–" + E.MONTHS_SHORT[c.toM]; };
    if (cands.length) html += "<div class='card repeat-card'><h2>Нашла " + cands.length + " " + (cands.length % 10 === 1 && cands.length % 100 !== 11 ? "трату, которая повторяется" : "трат, которые повторяются") + ", но вписаны вручную</h2>" +
      "<p class='small muted' style='margin-top:-4px'>Одна и та же сумма в одни и те же недели, месяц за месяцем. Если сделать их регулярными, менять сумму придётся в одном месте, и в план следующего года они перенесутся сами. " +
      "<b>Цифры в плане не изменятся:</b> перед сохранением проверяю каждую клетку года, а записи с заметками оставляю как есть.</p><ul class='repeat-list'>" +
      cands.map(function (c, i) {
        var cat = state.categories.find(function (x) { return x.id === c.catId; }) || { name: c.catId, currency: "EUR" };
        return "<li><label><input type='checkbox' checked data-rp='" + i + "'><span class='name'>" + esc(cat.name) + "</span><span class='muted small'>" + esc(wText(c.weeks)) + " · " + esc(mText(c)) + "</span><span class='val " + sign(c.cents) + "'>" + E.fmt(c.cents, { cur: cur(cat) }) + "</span></label></li>";
      }).join("") + "</ul><div class='row' style='margin-top:12px'><button class='btn primary' id='rpGo'>Сделать регулярными</button><button class='btn ghost' id='rpBackup'>Сначала скачать бэкап</button></div></div>";
    html += "<div class='tbl-wrap'><table class='t mcard rec-tbl'><thead><tr><th>Категория</th><th class='n'>Сумма</th><th>Недели</th><th>Действует</th><th class='n'>В год</th><th></th></tr></thead><tbody>";
    var weeks = E.genWeeks(Number(y));
    list.forEach(function (ru) {
      var c = state.categories.find(function (x) { return x.id === ru.catId; }) || { name: ru.catId, currency: "EUR" };
      var n = weeks.filter(function (wk) { return E.ruleMatches(ru, wk); }).length;
      html += "<tr><td class='mc-title'>" + esc(c.name) + "</td><td data-l='Сумма' class='n " + sign(ru.cents) + "'>" + E.fmt(ru.cents, { cur: cur(c) }) + (ru.expr && ru.expr !== String(ru.cents / 100) ? " <span class='muted small'>=" + esc(ru.expr) + "</span>" : "") + "</td>" +
        "<td data-l='Недели месяца'>" + esc(ru.weeks) + "</td><td data-l='Действует' class='small'>" + (ru.from ? "с " + esc(ru.from.slice(8, 10) + "." + ru.from.slice(5, 7)) : "") + (ru.to ? " по " + esc(ru.to.slice(8, 10) + "." + ru.to.slice(5, 7)) : " — до конца года") + "</td>" +
        "<td data-l='В год' class='n'>" + E.fmt(ru.cents * n, { cur: cur(c), dec: 0 }) + "</td><td class='n mc-act'><button class='btn sm' data-edit='" + ru.id + "'>Изменить</button> <button class='btn sm ghost danger' data-del='" + ru.id + "' aria-label='Удалить'>✕</button></td></tr>";
    });
    if (!list.length) html += "<tr><td colspan='6' class='muted'>Регулярных трат пока нет — добавь первую ниже: например, аренду.</td></tr>";
    html += "</tbody></table></div>";
    html += "<div class='card section'><h2>Добавить регулярную трату</h2><p class='small muted' style='margin-top:-6px'>«Недели месяца» — когда списывается: <b>1</b> — первая неделя, <b>2,4</b> — вторая и четвёртая, <b>все</b> — каждую неделю (например, продукты).</p><form id='addRule' class='form-grid'><label class='f'>Категория<select name='cat'>" + catOptions() + "</select></label>" +
      "<label class='f'>Сумма (минус — расход)<input type='text' name='expr' placeholder='-150' required inputmode='decimal'></label>" +
      "<label class='f'>Недели месяца<input type='text' name='weeks' placeholder='все · 1 · 2,4 · 5' required></label>" +
      "<label class='f'>Действует<select name='from'>" + monthOpts(y + "-01-01") + "</select></label><button class='btn primary' type='submit'>Добавить</button></form></div>";
    $main.innerHTML = html;
    bindYearChips(function (yy) { ui.recYear = yy; render(); });
    if (cands.length) {
      $main.querySelector("#rpBackup").onclick = backupDownload;
      $main.querySelector("#rpGo").onclick = function () {
        var picked = cands.filter(function (_, i) { return $main.querySelector("[data-rp='" + i + "']").checked; });
        if (!picked.length) { toast("Отметь хотя бы одну"); return; }
        var done = 0, skipped = 0;
        picked.forEach(function (c) { if (E.applyRepeat(state, y, c)) done++; else skipped++; });
        changed(); toast("Готово: " + done + " теперь регулярные, план не изменился" + (skipped ? ". Пропущено " + skipped + " — суммы бы сдвинулись" : ""));
      };
    }
    $main.querySelector("#addRule").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, c;
      try { c = E.exprCents(f.expr.value); } catch (err) { toast("Ошибка: " + err.message); return; }
      if (!/^(все|\s*[1-5](\s*,\s*[1-5])*)$/i.test(f.weeks.value.trim())) { toast("Недели месяца: «все» или цифры от 1 до 5 через запятую, например 2,4"); return; }
      yr.recurring.push({ id: E.uid("r"), catId: f.cat.value, expr: f.expr.value.trim(), cents: c, weeks: f.weeks.value.trim().toLowerCase(), from: f.from.value, to: null });
      changed(); toast("Регулярная трата «" + catName(f.cat.value) + "» добавлена");
    };
    $main.querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () { if (!confirm("Удалить регулярную трату «" + catName((yr.recurring.find(function (x) { return x.id === b.dataset.del; }) || {}).catId) + "»? Она пропадёт из плана " + y + " года. Суммы, вписанные вручную, останутся.")) return; yr.recurring = yr.recurring.filter(function (x) { return x.id !== b.dataset.del; }); changed(); };
    });
    $main.querySelectorAll("[data-edit]").forEach(function (b) {
      b.onclick = function () {
        var ru = yr.recurring.find(function (x) { return x.id === b.dataset.edit; });
        var nowMonth = E.todayISO().slice(0, 4) === y ? y + "-" + E.todayISO().slice(5, 7) + "-01" : ru.from;
        modal("<div class='m-body'><h2>" + esc(catName(ru.catId)) + "</h2><div class='form-grid' style='margin-top:12px'>" +
          "<label class='f'>Сумма<input type='text' id='ruE' value='" + esc(ru.expr || ru.cents / 100) + "' autofocus></label>" +
          "<label class='f'>Недели<input type='text' id='ruW' value='" + esc(ru.weeks) + "'></label>" +
          "<label class='f' style='grid-column:1/-1'>Новая сумма действует<select id='ruF'>" + monthOpts(nowMonth < (ru.from || "") ? ru.from : nowMonth) + "</select></label></div>" +
          "<p class='small muted'>Недели до выбранного месяца сохранят старую сумму.</p></div><div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", function (m) {
          m.querySelector("[data-act=cancel]").onclick = closeModal;
          m.querySelector("[data-act=ok]").onclick = function () {
            var ex = m.querySelector("#ruE").value, c;
            try { c = E.exprCents(ex); } catch (err) { toast("Ошибка: " + err.message); return; }
            E.changeRuleFrom(state, y, ru.id, { expr: ex.trim(), cents: c, weeks: m.querySelector("#ruW").value.trim().toLowerCase() }, m.querySelector("#ruF").value);
            closeModal(); changed(); toast("Сохранено");
          };
        });
      };
    });
  };

  // ===== ОБЩИЕ ТРАТЫ =====
  function sharedSetup() {
    var cloud = Store.mode === "cloud", meName = (Store.user() && Store.user().name) || "";
    $main.innerHTML = "<div class='page-head'><div><h1>Общие траты</h1><div class='sub'>Общее пространство для двоих: траты, доли, баланс «кто кому должен».</div></div></div>" +
      "<div class='card' style='max-width:560px'><h2>Создать общее пространство</h2>" +
      (cloud ? "<p class='muted' style='margin-top:-4px'>Партнёру ничего настраивать не нужно: пусть откроет этот сайт и войдёт с email, который ты укажешь.</p>" : "") +
      "<form id='spForm' class='form-grid'><label class='f'>Моё имя<input name='me' value='" + esc(meName) + "' required></label>" +
      "<label class='f'>Имя партнёра<input name='partner' required placeholder='Рита'></label>" +
      (cloud ? "<label class='f' style='grid-column:1/-1'>Email партнёра (для входа)<input type='email' name='email' required placeholder='rita@…'></label>" : "") +
      "<button class='btn primary' type='submit'>Создать</button></form></div>";
    $main.querySelector("#spForm").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target;
      Store.createSpace("Общие траты", f.me.value.trim(), f.partner.value.trim(), f.email ? f.email.value.trim() : "")
        .then(loadShared).then(loadPeople).then(function () { profileBar(); render(); toast("Пространство создано"); })
        .catch(function (err) { toast("Не получилось: " + err.message); });
    };
  }

  routes.shared = function () {
    if (!sh) return sharedSetup();
    var st = ui.shared, set = myState.settings, learned = sh.learned;
    var partner = sh.partner ? sh.partner.name : "Партнёр", meName = sh.me.name;
    var exps = sh.expenses, calc = sharedForCalc();
    var yrs = {}; exps.forEach(function (e) { yrs[e.date.slice(0, 4)] = 1; });
    var ylist = Object.keys(yrs).sort();
    if (!st.year) st.year = ylist.indexOf(E.todayISO().slice(0, 4)) >= 0 ? E.todayISO().slice(0, 4) : (ylist[ylist.length - 1] || E.todayISO().slice(0, 4));
    if (ylist.indexOf(st.year) < 0) ylist.push(st.year);
    var bal = S.balance(exps);
    var balHtml = Object.keys(bal).filter(function (k) { return Math.abs(bal[k]) >= 1; }).map(function (k) {
      var v = bal[k];
      return "<div class='kpi-value'>" + E.fmt(Math.abs(v), { cur: k === "EUR" ? "€" : k, dec: 2 }) + "</div><div class='kpi-foot'>" + (v > 0 ? esc(partner) + " должна тебе" : "ты должна " + esc(partner)) + "</div>";
    }).join("") || "<div class='kpi-value'>0 €</div><div class='kpi-foot'>вы в расчёте</div>";
    var invite = sh.partner && !sh.partner.userId && Store.mode === "cloud"
      ? "<div class='hint small row'><span style='flex:1 1 260px'>" + esc(partner) + " ещё не входила. Пусть откроет сайт и войдёт с <b>" + esc(sh.partner.email || "") + "</b> — пространство подключится само." +
        " Её таблицу можно загрузить заранее — тогда бюджет будет ждать её готовым.</span><label class='btn sm' id='prepPartner'><span>Загрузить её таблицу</span><input type='file' id='prepFile' accept='.xlsx' hidden></label></div>" : "";

    var html = "<div class='page-head'><div><h1>Общие траты</h1><div class='sub'>" + esc(meName) + " и " + esc(partner) + ". Вносите оба, с любого устройства. Возвраты долга и расчёты — не траты.</div></div>" +
      "<div class='row'><a class='btn' href='#tolog'>В личный план" + (toLogCount() ? " · " + toLogCount() : "") + "</a><label class='btn'>Импорт CSV из Splitwise<input type='file' id='swFile' accept='.csv,text/csv' hidden></label></div></div>" + invite;
    html += "<div class='grid2'><div class='kpi'><div class='kpi-label'>Баланс</div>" + balHtml + "<div class='row' style='margin-top:10px'><button class='btn primary sm' id='settle'>Рассчитаться</button></div></div>";
    html += "<div class='card add-card'><h2>Новая трата</h2><p class='muted small' style='margin-top:-6px'>Как в Splitwise: описание, сумма, кто платил и как делим — поровну, точными суммами, процентами, долями или с поправкой.</p>" +
      "<button class='btn primary' id='addExpBtn'>+ Добавить трату</button></div></div>" +
      "<button class='fab' id='fab' aria-label='Добавить трату'>+</button>";

    var mlist = ["all"].concat(E.MONTHS_SHORT.map(function (_, i) { return String(i + 1); }));
    var filtered = exps.filter(function (e) {
      if (e.date.slice(0, 4) !== st.year) return false;
      if (st.month !== "all" && Number(e.date.slice(5, 7)) !== Number(st.month)) return false;
      if (st.kind !== "all" && e.kind !== st.kind) return false;
      if (st.cat !== "all" && (e.kind === "batch" && !e.cat ? "Сводные суммы" : S.catOf(e, learned)) !== st.cat) return false;
      return true;
    }).slice().reverse();
    html += "<div class='section'><div class='row' style='margin-bottom:10px'><h2 style='margin:0'>Лента</h2><span class='spacer'></span>" +
      "<select id='fY'>" + ylist.map(function (y) { return "<option" + (y === st.year ? " selected" : "") + ">" + y + "</option>"; }).join("") + "</select>" +
      "<select id='fM'>" + mlist.map(function (m) { return "<option value='" + m + "'" + (m === st.month ? " selected" : "") + ">" + (m === "all" ? "все месяцы" : E.MONTHS[Number(m) - 1]) + "</option>"; }).join("") + "</select>" +
      "<select id='fC'><option value='all'>все категории</option>" + S.SHARED_CATS.map(function (c) { return "<option" + (c === st.cat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>" +
      "<select id='fK'>" + [["all", "все типы"], ["expense", "траты"], ["batch", "сводные"], ["refund", "возвраты долга"], ["settlement", "расчёты"]].map(function (k) { return "<option value='" + k[0] + "'" + (k[0] === st.kind ? " selected" : "") + ">" + k[1] + "</option>"; }).join("") + "</select></div>";
    html += "<div class='tbl-wrap'><table class='t feed'><thead><tr><th>Дата</th><th>Описание</th><th>Категория / тип</th><th class='n'>Сумма</th><th class='n'>Твоя доля</th><th>Платил(а)</th><th></th></tr></thead><tbody>";
    filtered.slice(0, st.limit).forEach(function (e) {
      var k = e.kind, catSel;
      if (k === "settlement") catSel = "<span class='badge'>расчёт</span>";
      else if (k === "refund") catSel = "<span class='badge ok'>возврат долга</span> <button class='btn sm ghost' data-kind='" + esc(e.id) + "' data-to='expense'>это трата</button>";
      else {
        var cc = e.kind === "batch" && !e.cat ? "Сводные суммы" : S.catOf(e, learned);
        catSel = "<select data-cat='" + esc(e.id) + "'>" + S.SHARED_CATS.map(function (c) { return "<option" + (c === cc ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>" +
          " <button class='btn sm ghost' data-kind='" + esc(e.id) + "' data-to='refund' title='Пометить как возврат долга — не трата'>↩</button>";
      }
      var c$ = e.currency === "EUR" ? "€" : e.currency;
      html += "<tr><td class='small'>" + esc(e.date.slice(8, 10) + "." + e.date.slice(5, 7)) + "</td><td class='open' data-open='" + esc(e.id) + "' title='Открыть'>" + esc(e.desc) + (e.method === "cash" ? " <span class='badge'>нал</span>" : "") + (e.note ? " <span class='muted small'>· " + esc(e.note) + "</span>" : "") + "</td><td>" + catSel + "</td>" +
        "<td class='n'>" + E.fmt(e.cost, { cur: c$ }) + "</td><td class='n'>" + (k === "settlement" ? "" : E.fmt(e.share, { cur: c$ })) + "</td>" +
        "<td class='small'>" + (k === "settlement" ? (e.paidByMe ? "я → " + esc(partner) : esc(partner) + " → я") : e.paidByMe ? "я" : esc(partner)) + "</td>" +
        "<td class='n'><button class='btn sm ghost' data-open='" + esc(e.id) + "' aria-label='Изменить'>✎</button></td></tr>";
    });
    if (!filtered.length) html += "<tr><td colspan='7' class='muted'>Ничего не найдено.</td></tr>";
    html += "</tbody></table></div>" + (filtered.length > st.limit ? "<div class='row' style='margin-top:10px'><button class='btn' id='more'>Показать ещё (" + (filtered.length - st.limit) + ")</button></div>" : "") + "</div>";

    var ms = S.monthlyShares(calc, set, st.year);
    var catsUsed = S.SHARED_CATS.filter(function (c) { return ms.byCat[c] && ms.byCat[c].some(function (v) { return Math.abs(v) >= 50; }); });
    html += "<div class='section'><h2>Твоя доля по категориям, € · " + st.year + "</h2><div class='tbl-wrap'><table class='t'><thead><tr><th>Категория</th>" +
      E.MONTHS_SHORT.map(function (m) { return "<th class='n'>" + m + "</th>"; }).join("") + "<th class='n'>Год</th></tr></thead><tbody>";
    var colTot = new Array(12).fill(0);
    catsUsed.forEach(function (c) {
      var arr = ms.byCat[c], t = 0;
      html += "<tr><td>" + esc(c) + "</td>" + arr.map(function (v, i) { t += v; colTot[i] += v; return "<td class='n'>" + (Math.abs(v) >= 50 ? E.fmt(rnd(v)) : "") + "</td>"; }).join("") + "<td class='n'><b>" + E.fmt(rnd(t)) + "</b></td></tr>";
    });
    html += "<tr class='total'><td>Итого</td>" + colTot.map(function (v) { return "<td class='n'>" + E.fmt(rnd(v)) + "</td>"; }).join("") + "<td class='n'>" + E.fmt(rnd(colTot.reduce(function (a, b) { return a + b; }, 0))) + "</td></tr></tbody></table></div></div>";

    if (myState.years[st.year]) {
      var cov = S.coverage(myState, calc, st.year);
      html += "<div class='section'><h2>Общие и личный план: еда и развлечения</h2><p class='small muted' style='margin-top:-6px'>Еда = продукты + кафе + доставка из общих трат. «Вне общего счёта» — сколько из личных сумм на продукты и развлечения ушло мимо общих трат.</p>" +
        "<div class='tbl-wrap'><table class='t'><thead><tr><th></th>" + E.MONTHS_SHORT.map(function (m) { return "<th class='n'>" + m + "</th>"; }).join("") + "</tr></thead><tbody>" +
        covRow("Общие: еда", cov, "sharedFood") + covRow("Общие: развлечения", cov, "sharedFun") + covRow("Личный план: продукты + развлечения", cov, "personal") +
        "<tr><td>Вне общего счёта</td>" + cov.map(function (c) { return "<td class='n " + (c.personal && c.outside < 0 ? "neg" : "") + "'>" + (c.personal || c.shared ? E.fmt(rnd(c.outside)) : "") + "</td>"; }).join("") + "</tr>" +
        "<tr class='total'><td>Покрытие</td>" + cov.map(function (c) { return "<td class='n'>" + (c.coverage === null ? "" : Math.round(c.coverage * 100) + "%") + "</td>"; }).join("") + "</tr></tbody></table></div></div>";
    }
    $main.innerHTML = html;

    function reloadShared(msg) { return loadShared().then(function () { render(); if (msg) toast(msg); }).catch(function (err) { toast("Ошибка: " + err.message); }); }
    function bindF(id, key) { $main.querySelector(id).onchange = function (e) { st[key] = e.target.value; st.limit = 80; render(); }; }
    bindF("#fY", "year"); bindF("#fM", "month"); bindF("#fC", "cat"); bindF("#fK", "kind");
    var more = $main.querySelector("#more"); if (more) more.onclick = function () { st.limit += 200; render(); };
    $main.querySelector("#addExpBtn").onclick = function () { expenseSheet(null); };
    $main.querySelector("#fab").onclick = function () { expenseSheet(null); };
    $main.querySelectorAll("[data-open]").forEach(function (el) {
      el.onclick = function () { var e = exps.find(function (x) { return x.id === el.dataset.open; }); if (e) expenseSheet(e); };
    });
    $main.querySelectorAll("[data-cat]").forEach(function (s2) {
      s2.onchange = function () {
        var e = exps.find(function (x) { return x.id === s2.dataset.cat; });
        e.cat = s2.value; learned[S.norm(e.desc)] = s2.value; saveLearned();
        Store.updateShared(e.id, { category: s2.value }).then(function () { toast("Категория сохранена — похожие описания будут так же"); render(); })
          .catch(function (err) { toast("Ошибка: " + err.message); });
      };
    });
    $main.querySelectorAll("[data-kind]").forEach(function (b) {
      b.onclick = function () { Store.updateShared(b.dataset.kind, { kind: b.dataset.to }).then(function () { return reloadShared(); }); };
    });
    $main.querySelectorAll("[data-delx]").forEach(function (b) {
      b.onclick = function () { if (!confirm("Удалить трату у вас обеих? Баланс пересчитается.")) return; Store.deleteShared(b.dataset.delx).then(function () { return reloadShared("Удалено"); }); };
    });
    var pp = $main.querySelector("#prepPartner");
    if (pp) {
      $main.querySelector("#prepFile").onchange = function (e) { preparePartnerBudget(sh.partner.email, partner, e.target.files[0]); e.target.value = ""; };
      Store.pendingFor(sh.partner.email).then(function (r) { if (r && pp.isConnected) pp.querySelector("span").textContent = "Обновить её таблицу · загружена " + new Date(r.created_at).toLocaleDateString("ru-RU"); });
    }
    $main.querySelector("#settle").onclick = function () {
      var v = bal.EUR || 0;
      modal("<div class='m-body'><h2>Рассчитаться</h2><p class='muted'>Перевод между вами — не трата, только меняет баланс.</p><div class='form-grid'>" +
        "<label class='f'>Кто переводит<select id='stW'><option value='partner'" + (v > 0 ? " selected" : "") + ">" + esc(partner) + " → мне</option><option value='me'" + (v < 0 ? " selected" : "") + ">я → " + esc(partner) + "</option></select></label>" +
        "<label class='f'>Сумма, €<input type='text' id='stA' value='" + esc((Math.abs(v) / 100).toFixed(2).replace(".", ",")) + "' autofocus></label>" +
        "<label class='f'>Дата<input type='date' id='stD' value='" + E.todayISO() + "'></label></div></div>" +
        "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Записать</button></div>", function (m) {
        m.querySelector("[data-act=cancel]").onclick = closeModal;
        m.querySelector("[data-act=ok]").onclick = function () {
          var a; try { a = E.exprCents(m.querySelector("#stA").value); } catch (err) { toast("Ошибка в сумме"); return; }
          var who = m.querySelector("#stW").value;
          var stl = S.makeSettlement(m.querySelector("#stD").value, who === "partner" ? a : -a);
          closeModal();
          Store.insertShared([SU.toRow(stl, sh.meId, sh.partnerId, sh.space.id)]).then(function () { return reloadShared("Расчёт записан"); });
        };
      });
    };
    $main.querySelector("#swFile").onchange = function (e) {
      var file = e.target.files[0]; if (!file) return;
      file.text().then(function (txt) {
        var head = S.parseCSV(txt)[0] || [], cols = head.slice(5).filter(Boolean);
        if (cols.length < 2) { toast("Не похоже на выгрузку Splitwise"); return; }
        var guess = cols.find(function (c) { return S.norm(c).indexOf(S.norm(meName).split(" ")[0]) === 0; }) || cols[0];
        modal("<div class='m-body'><h2>Импорт из Splitwise</h2><p class='muted'>Какая колонка в выгрузке — ты? Повторные записи не задвоятся.</p>" +
          "<label class='f'>Я в Splitwise<select id='swMe'>" + cols.map(function (c) { return "<option" + (c === guess ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></label></div>" +
          "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Импортировать</button></div>", function (m) {
          m.querySelector("[data-act=cancel]").onclick = closeModal;
          m.querySelector("[data-act=ok]").onclick = function () {
            var res = S.importSplitwise(txt, { myName: m.querySelector("#swMe").value });
            closeModal(); toast("Загружаю " + res.expenses.length + " записей…");
            var rows = res.expenses.map(function (x) { return SU.toRow(x, sh.meId, sh.partnerId, sh.space.id); });
            Store.insertShared(rows).then(function (added) {
              return loadShared().then(function () {
                var b = S.balance(sh.expenses.filter(function (x) { return x.source === "splitwise"; }));
                var okb = Object.keys(res.control).every(function (k) { return Math.abs((b[k] || 0) - res.control[k]) < 2; });
                render(); toast("Добавлено: " + added + (okb ? " · баланс сходится со Splitwise" : " · ⚠ баланс не сходится с Total balance"));
              });
            }).catch(function (err) { toast("Ошибка импорта: " + err.message); });
          };
        });
      });
    };
  };
  // ---------- ввод общей траты как в Splitwise ----------
  function expenseSheet(existing) {
    var partner = sh.partner ? sh.partner.name : "Партнёр", meName = sh.me.name;
    var d = existing ? {
      desc: existing.desc, cost: existing.cost, currency: existing.currency, cat: existing.cat || (existing.kind === "batch" ? "Сводные суммы" : S.catOf(existing, sh.learned)),
      date: existing.date, method: existing.method || "card", note: existing.note || "", paidByMe: existing.paidByMe, kind: existing.kind,
      mode: existing.split ? existing.split.mode : (existing.share * 2 === existing.cost || Math.abs(existing.share * 2 - existing.cost) <= 1 ? "equal" : "exact"),
      values: existing.split ? existing.split.values : { me: existing.share, partner: existing.cost - existing.share },
    } : { desc: "", cost: 0, currency: "EUR", cat: "Продукты", date: E.todayISO(), method: "card", note: "", paidByMe: true, kind: "expense", mode: "equal", values: {} };
    var catTouched = !!existing, pane = "main";
    function money(c) { return E.fmt(c, { cur: d.currency === "EUR" ? "€" : d.currency, dec: 2 }); }
    function split() {
      if (d.mode === "full") return { me: d.paidByMe ? 0 : d.cost, partner: d.paidByMe ? d.cost : 0, error: null };
      return S.computeSplit(d.cost, d.mode, d.values);
    }
    function summary() {
      var sp = split(), payer = d.paidByMe ? "я" : partner;
      if (d.mode === "equal") return "Платил(а) " + payer + ", поровну";
      if (d.mode === "full") return d.paidByMe ? "Платила я, всё на " + partner : "Платила " + partner + ", всё на мне";
      var names = { exact: "точными суммами", percent: "по процентам", shares: "по долям", adjust: "с поправкой" };
      return "Платил(а) " + payer + ", " + names[d.mode] + (sp.error ? " ⚠" : "");
    }
    function owesLine(paidByMe, mode) {
      var c = d.cost || 0, sp = mode === "full" ? { me: paidByMe ? 0 : c, partner: paidByMe ? c : 0 } : S.computeSplit(c, "equal");
      return paidByMe ? "<span class='pos'>" + esc(partner) + " должна тебе " + money(sp.partner) + "</span>" : "<span class='neg'>Ты должна " + esc(partner) + " " + money(sp.me) + "</span>";
    }
    function draw() {
      var html;
      if (pane === "main") {
        html = "<div class='sheet-head'><button class='btn ghost' data-act='cancel'>Отмена</button><b>" + (existing ? "Трата" : "Новая трата") + "</b><button class='btn ghost save' data-act='save'>Сохранить</button></div>" +
          "<div class='m-body sheet-body'><div class='with'>С тобой: <span class='chip on'>" + esc(partner) + "</span></div>" +
          "<label class='big-field'><span class='ic'>✎</span><input id='exDesc' placeholder='Описание' value='" + esc(d.desc) + "' autocomplete='off'></label>" +
          "<label class='big-field amount'><select id='exCur' aria-label='Валюта'>" + ["EUR", "RUB", "USD", "GEL"].map(function (c) { return "<option" + (c === d.currency ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select>" +
          "<input id='exCost' inputmode='decimal' placeholder='0,00' value='" + (d.cost ? esc(String(d.cost / 100).replace(".", ",")) : "") + "'></label>" +
          "<div class='center'><button class='btn split-pill' data-act='split'>" + esc(summary()) + "</button></div>" +
          "<div class='sheet-meta'><label class='f'>Дата<input type='date' id='exDate' value='" + esc(d.date) + "'></label>" +
          "<label class='f'>Категория<select id='exCat'>" + S.SHARED_CATS.map(function (c) { return "<option" + (c === d.cat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></label>" +
          "<label class='f'>Способ<select id='exMethod'><option value='card'" + (d.method !== "cash" ? " selected" : "") + ">карта</option><option value='cash'" + (d.method === "cash" ? " selected" : "") + ">наличные</option></select></label>" +
          "<label class='f' style='grid-column:1/-1'>Заметка<input id='exNote' value='" + esc(d.note) + "' placeholder='необязательно'></label></div>" +
          (existing ? "<div class='row' style='margin-top:14px'><label class='row small'><input type='checkbox' id='exRefund'" + (d.kind === "refund" ? " checked" : "") + "> возврат долга — не трата</label><span class='spacer'></span><button class='btn ghost danger' data-act='delete'>Удалить</button></div>" : "") +
          "</div>";
      } else if (pane === "quick") {
        var opts = [["me", "equal", "Платила я, поровну"], ["me", "full", "Платила я, всё на " + partner], ["partner", "equal", "Платила " + partner + ", поровну"], ["partner", "full", "Платила " + partner + ", всё на мне"]];
        html = "<div class='sheet-head'><button class='btn ghost' data-act='back'>‹ Назад</button><b>Как делим?</b><span style='width:70px'></span></div><div class='sheet-body'>" +
          opts.map(function (o, i) {
            var on = (o[0] === "me") === d.paidByMe && d.mode === o[1];
            return "<button class='opt" + (on ? " on" : "") + "' data-q='" + i + "'><span><b>" + esc(o[2]) + "</b><br>" + owesLine(o[0] === "me", o[1]) + "</span>" + (on ? "<span class='check'>✓</span>" : "") + "</button>";
          }).join("") + "<div class='center' style='padding:16px'><button class='btn' data-act='more'>Больше вариантов</button></div></div>";
        pane_opts = opts;
      } else {
        var modes = [["equal", "=", "Поровну"], ["exact", "1,23", "Точные суммы"], ["percent", "%", "Проценты"], ["shares", "▥", "Доли"], ["adjust", "+/−", "Поправка"]];
        var m = d.mode === "full" ? "exact" : d.mode;
        if (d.mode === "full") { d.mode = "exact"; var f0 = split(); d.values = { me: d.paidByMe ? 0 : d.cost, partner: d.paidByMe ? d.cost : 0 }; }
        var sp = split(), unit = { exact: "€", percent: "%", shares: "доли", adjust: "+ €" }[m];
        var hint = { equal: "Сумма делится пополам.", exact: "Укажи, сколько точно должен каждый.", percent: "Проценты в сумме — 100%.", shares: "Например, 2 ночи → 2 доли.", adjust: "Укажи, кто должен больше; остальное — поровну." }[m];
        function inVal(who) {
          var v = (d.values || {})[who];
          if (v === undefined || v === null || v === "") return "";
          return (m === "exact" || m === "adjust") ? String(v / 100).replace(".", ",") : String(v).replace(".", ",");
        }
        html = "<div class='sheet-head'><button class='btn ghost' data-act='quick'>‹ Назад</button><b>Деление</b><button class='btn ghost save' data-act='done'>Готово</button></div><div class='sheet-body'>" +
          "<div class='row' style='justify-content:center;margin-bottom:12px'>Платил(а): <div class='seg'><button data-payer='me' class='" + (d.paidByMe ? "on" : "") + "'>" + esc(meName) + "</button><button data-payer='partner' class='" + (!d.paidByMe ? "on" : "") + "'>" + esc(partner) + "</button></div></div>" +
          "<div class='modes'>" + modes.map(function (x) { return "<button data-mode='" + x[0] + "' class='" + (x[0] === m ? "on" : "") + "' title='" + x[2] + "'>" + x[1] + "</button>"; }).join("") + "</div>" +
          "<p class='center small muted'><b>" + modes.find(function (x) { return x[0] === m; })[2] + "</b><br>" + hint + "</p>" +
          [["me", meName], ["partner", partner]].map(function (p) {
            return "<div class='person'><div><b>" + esc(p[1]) + "</b><div class='small muted'>" + money(sp[p[0]]) + "</div></div>" +
              (m === "equal" ? "" : "<label class='row'>" + (m === "adjust" ? "+" : "") + "<input class='pv' data-who='" + p[0] + "' inputmode='decimal' placeholder='0' value='" + esc(inVal(p[0])) + "'><span class='small muted'>" + unit + "</span></label>") + "</div>";
          }).join("") +
          "<div class='split-foot " + (sp.error ? "neg" : "") + "'>" + (sp.error ? esc(sp.error) : "✓ " + money(d.cost) + " распределено") + "</div></div>";
      }
      modal(html, bind);
    }
    var pane_opts = null;
    function readMain(m) {
      if (!m.querySelector("#exDesc")) return true;
      d.desc = m.querySelector("#exDesc").value.trim();
      try { d.cost = E.exprCents(m.querySelector("#exCost").value) || 0; } catch (err) { toast("Ошибка в сумме"); return false; }
      d.currency = m.querySelector("#exCur").value; d.date = m.querySelector("#exDate").value; d.cat = m.querySelector("#exCat").value;
      d.method = m.querySelector("#exMethod").value; d.note = m.querySelector("#exNote").value.trim();
      var rf = m.querySelector("#exRefund"); if (rf) d.kind = rf.checked ? "refund" : (d.kind === "refund" ? "expense" : d.kind);
      return true;
    }
    function bind(m) {
      m.classList.add("sheet");
      var q = function (sel) { return m.querySelector(sel); };
      if (q("[data-act=cancel]")) q("[data-act=cancel]").onclick = closeModal;
      var desc = q("#exDesc");
      if (desc) {
        if (!existing) setTimeout(function () { desc.focus(); }, 40);
        desc.addEventListener("input", function () { if (!catTouched) q("#exCat").value = S.guessCategory(desc.value, null, sh.learned); });
        q("#exCat").addEventListener("change", function () { catTouched = true; });
        q("#exCost").addEventListener("input", function () { try { d.cost = E.exprCents(q("#exCost").value) || 0; q("[data-act=split]").textContent = summary(); } catch (err) {} });
      }
      if (q("[data-act=split]")) q("[data-act=split]").onclick = function () { if (!readMain(m)) return; pane = "quick"; draw(); };
      if (q("[data-act=back]")) q("[data-act=back]").onclick = function () { pane = "main"; draw(); };
      if (q("[data-act=quick]")) q("[data-act=quick]").onclick = function () { pane = "quick"; draw(); };
      if (q("[data-act=more]")) q("[data-act=more]").onclick = function () { pane = "more"; draw(); };
      m.querySelectorAll("[data-q]").forEach(function (b) {
        b.onclick = function () { var o = pane_opts[Number(b.dataset.q)]; d.paidByMe = o[0] === "me"; d.mode = o[1]; d.values = {}; pane = "main"; draw(); };
      });
      m.querySelectorAll("[data-payer]").forEach(function (b) { b.onclick = function () { d.paidByMe = b.dataset.payer === "me"; draw(); }; });
      m.querySelectorAll("[data-mode]").forEach(function (b) {
        b.onclick = function () {
          d.mode = b.dataset.mode;
          d.values = d.mode === "percent" ? { me: 50, partner: 50 } : d.mode === "shares" ? { me: 1, partner: 1 } : d.mode === "exact" ? { me: Math.round(d.cost / 2), partner: d.cost - Math.round(d.cost / 2) } : {};
          draw();
        };
      });
      m.querySelectorAll(".pv").forEach(function (inp) {
        inp.addEventListener("change", function () {
          var raw = inp.value.trim(), v;
          try { v = raw === "" ? 0 : E.evalExpr(raw); } catch (err) { toast("Ошибка: " + err.message); return; }
          d.values = d.values || {};
          d.values[inp.dataset.who] = (d.mode === "exact" || d.mode === "adjust") ? Math.round(v * 100) : v;
          // точные суммы: второй получает остаток автоматически, если его ещё не трогали
          if (d.mode === "exact") { var other = inp.dataset.who === "me" ? "partner" : "me"; if (!inp.dataset.both) d.values[other] = d.cost - d.values[inp.dataset.who]; }
          if (d.mode === "percent") { var o2 = inp.dataset.who === "me" ? "partner" : "me"; d.values[o2] = Math.round((100 - v) * 100) / 100; }
          draw();
        });
      });
      if (q("[data-act=done]")) q("[data-act=done]").onclick = function () {
        var sp = split(); if (sp.error) { toast(sp.error); return; }
        pane = "main"; draw();
      };
      if (q("[data-act=delete]")) q("[data-act=delete]").onclick = function () {
        if (!confirm("Удалить «" + existing.desc + "» у обоих?")) return;
        closeModal(); Store.deleteShared(existing.id).then(loadShared).then(function () { render(); toast("Удалено"); });
      };
      if (q("[data-act=save]")) q("[data-act=save]").onclick = function () {
        if (!readMain(m)) return;
        if (!d.desc) { toast("Добавь описание"); q("#exDesc").focus(); return; }
        if (!d.cost) { toast("Укажи сумму"); q("#exCost").focus(); return; }
        var sp = split(); if (sp.error) { toast("Деление: " + sp.error); return; }
        var ex = S.makeExpense({ date: d.date, desc: d.desc, cost: d.cost, currency: d.currency, paidByMe: d.paidByMe, myShare: sp.me, cat: d.cat, method: d.method,
          note: d.note, kind: d.kind === "batch" ? "batch" : d.kind, split: { mode: d.mode, values: d.values || {} } });
        sh.learned[S.norm(ex.desc)] = d.cat; saveLearned();
        var row = SU.toRow(ex, sh.meId, sh.partnerId, sh.space.id);
        var btn = q("[data-act=save]"); btn.disabled = true;
        var job;
        if (existing) { delete row.space_id; delete row.source; delete row.ext_id; job = Store.updateShared(existing.id, row); }
        else job = Store.insertShared([row]);
        job.then(function () { closeModal(); ui.shared.year = d.date.slice(0, 4); return loadShared(); })
          .then(function () { render(); toast(existing ? "Сохранено" : "Трата добавлена"); })
          .catch(function (err) { btn.disabled = false; toast("Не сохранилось: " + err.message); });
      };
    }
    draw();
  }

  function covRow(label, cov, k) { return "<tr><td>" + label + "</td>" + cov.map(function (c) { return "<td class='n'>" + (c[k] ? E.fmt(rnd(c[k])) : "") + "</td>"; }).join("") + "</tr>"; }

  // ===== АНАЛИЗ =====
  routes.analysis = function () {
    var y = ui.anYear || ui.year;
    var a = E.monthly(state, y), t = a.total, ms = a.months;
    var prevY = String(Number(y) - 1), prev = state.years[prevY] ? E.monthly(state, prevY) : null;
    var html = "<div class='page-head'><div><h1>Анализ " + y + "</h1><div class='sub'>Все суммы в €, расходы — плюсом. Рубли — по курсу " + String(state.settings.rate).replace(".", ",") + " ₽/€.</div></div>" + yearChips(y, true) + "</div>";
    function delta(cur, pr, invert) {
      if (!prev || !pr) return "";
      var d = (cur - pr) / Math.abs(pr);
      var good = invert ? d < 0 : d > 0;
      return "<span class='" + (Math.abs(d) < 0.02 ? "" : good ? "pos" : "neg") + "'>" + (d > 0 ? "+" : "−") + Math.abs(Math.round(d * 100)) + "% к " + prevY + "</span>";
    }
    html += "<div class='kpis'>" +
      kpi("Доходы за год", eur(rnd(t.income), { dec: 0 }), delta(t.income, prev && prev.total.income)) +
      kpi("Расходы за год", eur(rnd(t.total), { dec: 0 }), delta(t.total, prev && prev.total.total, true)) +
      kpi("На жизнь в месяц", eur(rnd(t.living / 12), { dec: 0 }), "без налогов, соцстраха, бухгалтерии") +
      kpi("Доля сбережений", t.rate === null ? "—" : Math.round(t.rate * 100) + "%", "(доходы − расходы) / доходы") +
      kpi("Капитал на конец года", t.cap === null || t.cap === undefined ? "—" : eur(rnd(t.cap), { dec: 0 }), t.dcap ? "за год <span class='" + sign(t.dcap) + "'>" + eur(rnd(t.dcap), { dec: 0, plus: true }) + "</span>" : "") +
      "</div>";
    var e100 = function (arr) { return arr.map(function (v) { return v / 100; }); };
    var fmtE = function (v) { return E.eur(Math.round(v * 100), { dec: 0 }); };
    html += "<div class='card'><h2>Доходы и расходы</h2>" + C.bars({ labels: E.MONTHS, short: E.MONTHS_SHORT, fmt: fmtE, title: "Доходы и расходы по месяцам",
      series: [{ name: "Доходы", color: "var(--series-1)", values: e100(ms.map(function (m) { return m.income; })) }, { name: "Расходы", color: "var(--series-2)", values: e100(ms.map(function (m) { return m.total; })) }] }) + "</div>";
    html += "<div class='card section'><h2>Расходы по блокам</h2>" + C.bars({ labels: E.MONTHS, short: E.MONTHS_SHORT, fmt: fmtE, stacked: true, title: "Расходы по блокам",
      series: [{ name: "Базовые", color: "var(--series-1)", values: e100(ms.map(function (m) { return m.base; })) },
        { name: "Периодические", color: "var(--series-2)", values: e100(ms.map(function (m) { return m.periodic; })) },
        { name: "Подписки ES", color: "var(--series-3)", values: e100(ms.map(function (m) { return m.subs_es; })) },
        { name: "Подписки RU", color: "var(--series-4)", values: e100(ms.map(function (m) { return m.subs_ru; })) }] }) + "</div>";
    // капитал за все годы
    var capLabels = [], capVals = [], capShort = [], marks = [];
    years().forEach(function (yy) {
      var r = E.compute(state, yy);
      marks.push({ i: capLabels.length, label: yy });
      for (var m = 0; m < 12; m++) {
        capLabels.push(E.MONTHS[m] + " " + yy + (state.years[yy].archived ? "" : Number(yy) > new Date().getFullYear() || (Number(yy) === new Date().getFullYear() && m > new Date().getMonth()) ? " (план)" : ""));
        capShort.push(E.MONTHS_SHORT[m]);
        var v = r.capMonth[m]; capVals.push(v === null || v === undefined ? null : v / 100);
      }
    });
    html += "<div class='card section'><h2>Капитал на конец месяца</h2>" + C.line({ labels: capLabels, short: capShort, values: capVals, marks: marks, fmt: fmtE, title: "Капитал по месяцам" }) + "</div>";

    // таблица по месяцам
    var rowsDef = [["Доходы", "income"], ["Базовые расходы", "base"], ["Периодические", "periodic"], ["Подписки ES", "subs_es"], ["Подписки RU (в €)", "subs_ru"],
      ["Расходы итого", "total", 1], ["  на жизнь (без налогов)", "living"], ["Доходы − расходы", "net", 1], ["Отложено в накопления", "saved"], ["Капитал на конец месяца", "cap", 1], ["Изменение капитала", "dcap"], ["Доля сбережений", "rate"]];
    html += "<div class='section'><h2>По месяцам</h2><div class='tbl-wrap'><table class='t'><thead><tr><th></th>" + E.MONTHS_SHORT.map(function (m) { return "<th class='n'>" + m + "</th>"; }).join("") + "<th class='n'>Год</th></tr></thead><tbody>";
    rowsDef.forEach(function (d) {
      var k = d[1];
      var cell = function (v) {
        if (v === null || v === undefined) return "<td class='n'></td>";
        if (k === "rate") return "<td class='n'>" + Math.round(v * 100) + "%</td>";
        return "<td class='n " + ((k === "net" || k === "dcap") ? sign(v) : "") + "'>" + E.fmt(rnd(v)) + "</td>";
      };
      html += "<tr class='" + (d[2] ? "total" : "") + "'><td>" + d[0] + "</td>" + ms.map(function (m) { return cell(m[k]); }).join("") + cell(t[k]) + "</tr>";
    });
    html += "</tbody></table></div></div>";

    // категории год к году
    var ys = years().filter(function (yy) { return Math.abs(Number(yy) - Number(y)) <= 2; });
    var tots = {}; ys.forEach(function (yy) { tots[yy] = E.categoryTotals(state, yy); });
    var list = state.categories.filter(function (c) { return c.block !== "income" && c.block !== "savings"; })
      .map(function (c) { return { c: c, v: ys.map(function (yy) { return tots[yy][c.id] || 0; }) }; })
      .filter(function (x) { return x.v.some(function (v) { return Math.abs(v) >= 100; }); });
    var yi = ys.indexOf(y);
    list.sort(function (a, b) { return b.v[yi] - a.v[yi]; });
    var totalY = list.reduce(function (s, x) { return s + Math.max(0, x.v[yi]); }, 0);
    html += "<div class='section'><h2>Категории год к году</h2><div class='tbl-wrap'><table class='t'><thead><tr><th>Категория</th>" + ys.map(function (yy) { return "<th class='n'>" + yy + "</th>"; }).join("") +
      (yi > 0 ? "<th class='n'>" + y + " − " + ys[yi - 1] + "</th>" : "") + "<th class='n'>Доля " + y + "</th></tr></thead><tbody>";
    list.forEach(function (x) {
      var d = yi > 0 ? x.v[yi] - x.v[yi - 1] : null;
      html += "<tr><td>" + esc(x.c.name) + (x.c.mandatory ? " <span class='badge'>обяз.</span>" : "") + "</td>" + x.v.map(function (v) { return "<td class='n'>" + (Math.abs(v) >= 100 ? E.fmt(rnd(v)) : "") + "</td>"; }).join("") +
        (yi > 0 ? "<td class='n " + (d > 10000 ? "neg" : d < -10000 ? "pos" : "") + "'>" + (Math.abs(d) >= 100 ? E.fmt(rnd(d), { plus: true }) : "") + "</td>" : "") +
        "<td class='n'>" + (totalY ? Math.round(Math.max(0, x.v[yi]) / totalY * 1000) / 10 + "%" : "") + "</td></tr>";
    });
    html += "</tbody></table></div></div><div id='family'></div>";
    $main.innerHTML = html;
    bindYearChips(function (yy) { ui.anYear = yy; render(); });
    if (!RO() && people.some(function (p) { return p.theirLevel !== "hidden"; })) familyOverview(y);
  };

  // Семейный обзор: мои цифры + итоги партнёра (если она их открыла)
  function familyOverview(y) {
    var vis = people.filter(function (p) { return p.theirLevel !== "hidden"; });
    Promise.all(vis.map(function (p) { return Store.loadSummaryOf(p.userId).then(function (r) { return { p: p, s: r && r.data }; }).catch(function () { return { p: p, s: null }; }); }))
      .then(function (list) {
        var box = document.getElementById("family");
        if (!box) return;
        var mine = E.monthly(myState, y).total;
        var cols = [{ name: (Store.user() && Store.user().name) || "Я", t: mine }];
        list.forEach(function (x) { if (x.s && x.s.years && x.s.years[y]) cols.push({ name: x.p.name, t: x.s.years[y].total, hidden: x.s.hasPrivate }); });
        if (cols.length < 2) return;
        var rows = [["Доходы", "income"], ["Расходы", "total"], ["На жизнь (без налогов)", "living"], ["Отложено в накопления", "saved"], ["Капитал на конец года", "cap"], ["Изменение капитала", "dcap"]];
        var html = "<div class='section'><h2>Наши финансы · " + y + "</h2><div class='tbl-wrap'><table class='t'><thead><tr><th></th>" +
          cols.map(function (c) { return "<th class='n'>" + esc(c.name) + (c.hidden ? " *" : "") + "</th>"; }).join("") + "<th class='n'>Вместе</th></tr></thead><tbody>";
        rows.forEach(function (r) {
          var sum = 0, any = false;
          html += "<tr><td>" + r[0] + "</td>" + cols.map(function (c) { var v = c.t[r[1]]; if (v !== null && v !== undefined) { sum += v; any = true; } return "<td class='n'>" + (v === null || v === undefined ? "—" : E.fmt(rnd(v))) + "</td>"; }).join("") +
            "<td class='n'><b>" + (any ? E.fmt(rnd(sum)) : "—") + "</b></td></tr>";
        });
        html += "</tbody></table></div>" + (cols.some(function (c) { return c.hidden; }) ? "<p class='small muted'>* есть скрытые личные категории — в итоги не входят.</p>" : "") + "</div>";
        box.innerHTML = html;
      });
  }

  // ===== ВЫВОДЫ =====
  routes.insights = function () {
    var out = [];
    var ay = activeYears();
    var curY = ui.year;
    var mon = E.monthly(state, curY), t = mon.total;
    // 1. зависимость от источника дохода
    var inc = state.categories.filter(function (c) { return c.block === "income"; }).map(function (c) { return { c: c, v: E.categoryTotals(state, curY)[c.id] || 0 }; })
      .filter(function (x) { return x.v > 0; }).sort(function (a, b) { return b.v - a.v; });
    if (inc.length && t.income > 0) {
      var top = inc[0], share = top.v / t.income;
      var volatile = inc.filter(function (x) { return /бонус|крипт|фриланс/i.test(x.c.name); }).reduce(function (s, x) { return s + x.v; }, 0);
      out.push({ k: share > 0.75 ? "warn" : "", ic: "◑", h: "Доходы " + curY + ": " + Math.round(share * 100) + "% — «" + top.c.name + "»",
        p: "Всего " + eur(rnd(t.income), { dec: 0 }) + ". " + (volatile ? "Нестабильные источники (бонус, крипта, фриланс): " + eur(rnd(volatile), { dec: 0 }) + " — " + Math.round(volatile / t.income * 100) + "% доходов. Для плана стоит посчитать осторожный сценарий без них." : "") });
    }
    // 2. тяжёлые месяцы
    var avg = t.total / 12;
    var heavy = mon.months.filter(function (m) { return m.total > avg * 1.3; });
    if (heavy.length) out.push({ k: "warn", ic: "▲", h: "Тяжёлые месяцы: " + heavy.map(function (m) { return E.MONTHS[m.month - 1]; }).join(", "),
      p: "Расходы выше среднего (" + eur(rnd(avg), { dec: 0 }) + "/мес) больше чем на 30%: " + heavy.map(function (m) { return E.MONTHS_SHORT[m.month - 1] + " " + eur(rnd(m.total), { dec: 0 }); }).join(" · ") + ". Деньги на них лучше откладывать заранее." });
    // 3. праздники семьи
    var fam = state.categories.find(function (c) { return /праздники и подарки семьи/i.test(c.name); });
    if (fam) {
      var r = E.compute(state, curY), byM = new Array(12).fill(0);
      r.cells[fam.id].forEach(function (x, w) { if (x) byM[Math.floor(w / 5)] -= x.cents; });
      var famT = byM.reduce(function (a, b) { return a + b; }, 0);
      if (famT > 0) {
        var peaks = byM.map(function (v, i) { return { v: v, i: i }; }).filter(function (x) { return x.v > famT / 6; });
        out.push({ k: "", ic: "❀", h: "Праздники семьи: " + eur(rnd(famT), { dec: 0 }) + " за год", p: "Пики — " + peaks.map(function (x) { return E.MONTHS[x.i] + " (" + eur(rnd(x.v), { dec: 0 }) + ")"; }).join(", ") +
          ". Если откладывать по " + eur(rnd(famT / 12), { dec: 0 }) + " в месяц, пики не будут бить по бюджету." });
      }
    }
    // 4. рост статей
    var prevY = String(Number(curY) - 1);
    if (state.years[prevY]) {
      var a = E.categoryTotals(state, curY), b = E.categoryTotals(state, prevY);
      var grow = state.categories.filter(function (c) { return c.block !== "income" && c.block !== "savings"; })
        .map(function (c) { return { c: c, d: (a[c.id] || 0) - (b[c.id] || 0), a: a[c.id] || 0, b: b[c.id] || 0 }; })
        .filter(function (x) { return x.d > 30000 && x.b > 0; }).sort(function (x, y) { return y.d - x.d; }).slice(0, 4);
      if (grow.length) out.push({ k: "", ic: "↗", h: "Статьи с ростом к " + prevY, p: grow.map(function (x) { return x.c.name + ": " + eur(rnd(x.b), { dec: 0 }) + " → " + eur(rnd(x.a), { dec: 0 }); }).join(" · ") });
      var pm = E.monthly(state, prevY).total;
      out.push({ k: "", ic: "≈", h: "На жизнь: " + eur(rnd(t.living / 12), { dec: 0 }) + " в месяц", p: prevY + ": " + eur(rnd(pm.living / 12), { dec: 0 }) + " в месяц. Налоги, соцстрах и бухгалтерия в расчёт не входят (" + eur(rnd(t.mandatory), { dec: 0 }) + " за " + curY + ")." });
    }
    // 5. деньги без процентов
    var rr = E.compute(state, curY), wNow = (E.weekOfDate(E.todayISO()) || {}).idx || 0;
    if (!rr.archived) {
      var obrNow = rr.base[Math.min(wNow, 59)], monthly = t.total / 12;
      if (obrNow > monthly * 3) out.push({ k: "warn", ic: "%", h: "В обращении " + eur(rnd(obrNow), { dec: 0 }) + " — это " + (obrNow / monthly).toFixed(1).replace(".", ",") + " месяца расходов",
        p: "Подушки на 2–3 месяца хватает в обращении; остальное (~" + eur(rnd(obrNow - monthly * 2), { dec: 0 }) + ") можно положить на счёт с процентом — перевод в накопления капитал не уменьшит." });
      var minV = Infinity, minW = 0;
      for (var i = wNow; i < 60; i++) if (rr.base[i] < minV) { minV = rr.base[i]; minW = i; }
      out.push({ k: minV < 0 ? "warn" : "good", ic: minV < 0 ? "!" : "✓", h: "Самый низкий остаток — " + eur(rnd(minV), { dec: 0 }) + ", " + shortWeek(curY, minW),
        p: minV < 0 ? "Деньги в обращении уходят в минус. Стоит сдвинуть крупные траты или переложить из накоплений." : "Это самая низкая точка денег в обращении до конца года, если всё пойдёт по плану." });
    }
    // 6. общие траты
    var cov = RO() || !sh ? [] : S.coverage(state, sharedForCalc(), curY).filter(function (c) { return c.personal > 0 && c.shared > 0; });
    if (cov.length) {
      var sS = cov.reduce(function (a, c) { return a + c.shared; }, 0), sP = cov.reduce(function (a, c) { return a + c.personal; }, 0);
      out.push({ k: sS > sP ? "warn" : "good", ic: "⇄", h: "Еда и развлечения: общий счёт покрывает " + Math.round(sS / sP * 100) + "% личного плана",
        p: "За " + cov.length + " мес.: общие " + eur(rnd(sS), { dec: 0 }) + " при плане " + eur(rnd(sP), { dec: 0 }) + ". " + (sS > sP ? "Общих трат больше, чем заложено в личный план — план на продукты/развлечения стоит поднять." : "План с запасом — разница уходит на свои кафе, кофе и мелочи.") });
    }
    var bal = sh && !RO() ? S.balance(sh.expenses).EUR || 0 : 0;
    if (Math.abs(bal) > 50000) out.push({ k: "", ic: "€", h: (bal > 0 ? "Партнёр должен тебе " : "Ты должна партнёру ") + eur(Math.abs(bal), { dec: 0 }), p: "Большой долг удобнее закрывать регулярно — кнопка «Рассчитаться» на экране «Общие»." });
    // 7. капитал
    if (t.dcap) out.push({ k: t.dcap > 0 ? "good" : "warn", ic: "◆", h: "Капитал за " + curY + ": " + eur(rnd(t.dcap), { dec: 0, plus: true }), p: "На конец года " + eur(rnd(t.cap), { dec: 0 }) + "." });

    var html = "<div class='page-head'><div><h1>Выводы " + curY + "</h1><div class='sub'>Считаются автоматически из плана, сверок и общих трат.</div></div>" + yearChips(curY, false) + "</div><div class='grid2'>";
    html += out.map(function (o) { return "<div class='card insight " + o.k + "'><div class='ic'>" + o.ic + "</div><div><b>" + esc(o.h) + "</b><p>" + esc(o.p) + "</p></div></div>"; }).join("");
    html += "</div>";
    if (ay.length) {
      var plan = activeYears().filter(function (y) { return Number(y) > Number(curY); })[0];
      if (plan) html += "<div class='section card'><h2>Что решить для плана " + plan + "</h2><ol class='muted' style='margin:0;padding-left:20px'><li>Регулярные суммы (аренда, коммуналка, подписки) — актуальны?</li><li>Бонус и крипта: заложить осторожный сценарий?</li><li>Налоги и соцстрах — хватает ли заложенного?</li><li>Праздники семьи — откладывать заранее?</li><li>Еда и развлечения — оставить или снизить?</li><li>Деньги в обращении — часть на счёт с процентом?</li></ol></div>";
    }
    $main.innerHTML = html;
    bindYearChips(function (yy) { ui.year = yy; render(); });
  };

  // ===== НАСТРОЙКИ =====
  routes.settings = function () {
    var s = state.settings;
    var cloud = Store.mode === "cloud", u = Store.user() || {};
    var html = "<div class='page-head'><div><h1>Настройки</h1><div class='sub'>" + (cloud ? "Данные в облаке: " + esc(u.email || "") + ". Бэкап в файл — по желанию." : "Данные хранятся только в этом браузере. Делай бэкап в файл время от времени.") + "</div></div>" +
      (cloud ? "<button class='btn ghost' id='signOut'>Выйти</button>" : "") + "</div>";
    // профиль и доступ
    html += "<div class='grid2'><div class='card'><h2>Профиль</h2><form id='setProfile' class='form-grid'><label class='f'>Моё имя<input name='name' value='" + esc(u.name || "") + "' placeholder='Катя' required></label>" +
      "<button class='btn' type='submit'>Сохранить</button></form>";
    if (cloud) {
      html += "<h3 style='margin-top:16px'>Кто что видит в моём бюджете</h3>";
      if (!people.length) html += "<p class='small muted'>Когда партнёр войдёт в общее пространство (экран «Общие»), здесь можно будет выбрать, что ей видно.</p>";
      people.forEach(function (p) {
        html += "<label class='f' style='margin-top:6px'>" + esc(p.name) + "<select data-vis='" + esc(p.userId) + "'>" +
          [["full", "видит полностью"], ["totals", "видит только итоги за месяц"], ["hidden", "не видит"]].map(function (o) { return "<option value='" + o[0] + "'" + (p.myLevel === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>";
      });
      html += "<p class='small muted'>Личные категории (галочка «личная» ниже) не видны никому, даже при полном доступе.</p>";
    }
    html += "</div>";
    html += "<div class='card'><h2>Основное</h2><form id='setMain' class='form-grid'>" +
      "<label class='f'>Курс: ₽ за 1 €<input type='text' name='rate' value='" + esc(s.rate) + "' inputmode='decimal'></label>" +
      "<label class='f'>Расхождение, после которого тревожиться, €<input type='text' name='alert' value='" + esc(-s.diffAlert / 100) + "' inputmode='decimal'></label>" +
      "<label class='f'>Курс GEL за 1 €<input type='text' name='gel' value='" + esc(s.fx.GEL) + "'></label>" +
      "<label class='f'>Курс USD за 1 €<input type='text' name='usd' value='" + esc(s.fx.USD) + "'></label>" +
      "<button class='btn primary' type='submit'>Сохранить</button></form>" +
      (s.rateHistory && s.rateHistory.length ? "<p class='small muted'>История курса: " + s.rateHistory.slice(-5).map(function (h) { return esc(h.date) + " — " + esc(h.rate); }).join(" · ") + "</p>" : "") + "</div></div>";

    // старт годов
    html += "<div class='card section'><h2>Старт года</h2>";
    activeYears().forEach(function (y) {
      var yr = state.years[y], st = E.startOf(state, y);
      html += "<h3 style='margin-top:10px'>" + y + "</h3>";
      if (yr.fromPrev) html += "<p class='small muted' style='margin:0 0 6px'>Считается из остатков 31.12." + (Number(y) - 1) + ": в обращении " + eur(rnd(st.obr), { dec: 0 }) + ", накопления " + eur(rnd(st.sav + st.inv + st.cash), { dec: 0 }) +
        ". <button class='btn sm ghost' data-manual='" + y + "'>Задать вручную</button></p>";
      else {
        html += "<form class='form-grid' data-start='" + y + "'><label class='f'>в обращении €<input name='obr' value='" + esc(st.obr / 100) + "'></label>";
        E.CAPITAL_ROWS.forEach(function (cr) { html += "<label class='f'>" + cr.name + "<input name='" + cr.key + "' value='" + esc(st[cr.key] / 100) + "'></label>"; });
        html += "<button class='btn' type='submit'>Сохранить</button>" + (state.years[String(Number(y) - 1)] && !state.years[String(Number(y) - 1)].archived ? "<button class='btn ghost' type='button' data-auto='" + y + "'>Из прошлого года</button>" : "") + "</form>";
      }
    });
    html += "</div>";

    // счета
    html += "<div class='section'><h2>Счета в обращении</h2><div class='tbl-wrap'><table class='t mcard'><thead><tr><th>Название</th><th>Тип</th><th>Считать в факте с</th><th></th></tr></thead><tbody>" +
      state.accounts.slice().sort(function (a, b) { return a.sort - b.sort; }).map(function (a) {
        return "<tr" + (a.archived ? " class='muted'" : "") + "><td class='mc-title'><input type='text' data-acc='" + a.id + "' data-f='name' value='" + esc(a.name) + "' aria-label='Название счёта'></td>" +
          "<td data-l='Тип'><select data-acc='" + a.id + "' data-f='kind'><option value='cash_flow'" + (a.kind === "cash_flow" ? " selected" : "") + ">в обращении</option><option value='info'" + (a.kind === "info" ? " selected" : "") + ">для справки</option></select></td>" +
          "<td data-l='Считать в факте с'><input type='date' data-acc='" + a.id + "' data-f='countsFrom' value='" + esc(a.countsFrom || "") + "'></td>" +
          "<td class='n mc-act'><button class='btn sm ghost' data-accarch='" + a.id + "'>" + (a.archived ? "вернуть" : "в архив") + "</button></td></tr>";
      }).join("") + "</tbody></table></div><div class='row' style='margin-top:8px'><button class='btn' id='addAcc'>+ счёт</button></div></div>";

    // категории
    html += "<div class='section'><h2>Категории</h2><div class='tbl-wrap'><table class='t mcard'><thead><tr><th>Название</th><th>Блок</th><th>Валюта</th><th>Налоги и обязательные</th><th title='не видна партнёру ни в деталях, ни в итогах'>Личная</th><th>Счёт в капитале</th><th></th></tr></thead><tbody>";
    E.BLOCKS.forEach(function (b) {
      var inBlock = cats().filter(function (c) { return c.block === b.id; });
      if (inBlock.length) html += "<tr class='mc-group'><td colspan='7'>" + esc(b.name) + "</td></tr>";
      inBlock.forEach(function (c) {
        html += "<tr" + (c.archived ? " class='muted'" : "") + "><td class='mc-title'><input type='text' data-cat2='" + c.id + "' data-f='name' value='" + esc(c.name) + "' aria-label='Название категории'></td>" +
          "<td data-l='Блок'><select data-cat2='" + c.id + "' data-f='block'>" + E.BLOCKS.map(function (x) { return "<option value='" + x.id + "'" + (x.id === c.block ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></td>" +
          "<td data-l='Валюта'><select data-cat2='" + c.id + "' data-f='currency'><option" + (c.currency === "EUR" ? " selected" : "") + ">EUR</option><option" + (c.currency === "RUB" ? " selected" : "") + ">RUB</option></select></td>" +
          "<td class='mc-chk'><label class='chk'><input type='checkbox' data-cat2='" + c.id + "' data-f='mandatory'" + (c.mandatory ? " checked" : "") + "><span>налоги и обязательные траты</span></label></td>" +
          "<td class='mc-chk'><label class='chk'><input type='checkbox' data-cat2='" + c.id + "' data-f='private'" + (c.private ? " checked" : "") + "><span>личная — не видна партнёру</span></label></td>" +
          "<td" + (c.block === "savings" ? " data-l='Счёт в капитале'" : " class='mc-empty'") + ">" + (c.block === "savings" ? "<select data-cat2='" + c.id + "' data-f='link'><option value=''>—</option>" + E.CAPITAL_ROWS.filter(function (x) { return x.key !== "card_rub"; }).map(function (x) { return "<option value='" + x.key + "'" + (c.link === x.key ? " selected" : "") + ">" + x.name + "</option>"; }).join("") + "</select>" : "") + "</td>" +
          "<td class='n mc-act'><button class='btn sm ghost' data-up='" + c.id + "' aria-label='Поднять выше' title='Поднять выше'>↑</button><button class='btn sm ghost' data-catarch='" + c.id + "'>" + (c.archived ? "вернуть" : "в архив") + "</button></td></tr>";
      });
    });
    html += "</tbody></table></div><form id='addCat' class='row' style='margin-top:8px'><input type='text' name='name' placeholder='Новая категория' required><select name='block'>" +
      E.BLOCKS.map(function (x) { return "<option value='" + x.id + "'>" + esc(x.name) + "</option>"; }).join("") + "</select><select name='cur'><option>EUR</option><option>RUB</option></select><button class='btn' type='submit'>+ категория</button></form></div>";

    var rm = state.settings.reminder;
    html += "<div class='section card'><h2>Напоминание о сверке</h2><p class='muted' style='margin-top:-4px'>" + (rm && rm.off ? "Выключено." : rm ? "Настроено: " + (rm.day === "MO" ? "по понедельникам" : "по воскресеньям") + " в " + esc(rm.time) + ". Если удалила событие из календаря — добавь заново." :
      "Событие в календаре каждую неделю, со ссылкой на сверку.") + "</p><button class='btn' id='remBtn'>" + (rm ? "Изменить" : "Настроить") + "</button></div>";
    // данные
    html += "<div class='section card'><h2>Данные</h2><div class='row'><label class='btn primary'>Импорт из Excel / Google Sheets (.xlsx)<input type='file' id='xlsx' accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' hidden></label>" +
      "<button class='btn' id='exp'>Скачать бэкап (JSON)</button><label class='btn'>Загрузить бэкап<input type='file' id='imp' accept='.json,application/json' hidden></label>" +
      "<button class='btn' id='expCsv'>Год в CSV</button><span class='spacer'></span>" + (window.SEED && !cloud ? "<button class='btn ghost danger' id='reseed'>Заново из seed.js</button>" : "") +
      "<button class='btn ghost danger' id='wipe'>Начать с нуля</button></div><p class='small muted'>Google Sheets: Файл → Скачать → Microsoft Excel (.xlsx), затем «Импорт». Подходят листы «Мой_ГГГГ» и «ГГГГ_€ REAL».</p></div>";
    $main.innerHTML = html;

    $main.querySelector("#setMain").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, rate = Number(String(f.rate.value).replace(",", "."));
      if (!(rate > 0)) { toast("Курс должен быть числом"); return; }
      if (rate !== s.rate) { s.rateHistory = s.rateHistory || []; s.rateHistory.push({ date: E.todayISO(), rate: rate, prev: s.rate }); s.rate = rate; s.fx.RUB = rate; }
      s.diffAlert = -Math.abs(Math.round(Number(String(f.alert.value).replace(",", ".")) * 100)) || -5000;
      s.fx.GEL = Number(String(f.gel.value).replace(",", ".")) || s.fx.GEL; s.fx.USD = Number(String(f.usd.value).replace(",", ".")) || s.fx.USD;
      changed(); toast("Сохранено");
    };
    $main.querySelectorAll("[data-start]").forEach(function (f) {
      f.onsubmit = function (e) {
        e.preventDefault();
        var y = f.dataset.start, st = {};
        try { ["obr"].concat(E.CAPITAL_ROWS.map(function (x) { return x.key; })).forEach(function (k) { st[k] = E.exprCents(f[k].value) || 0; }); } catch (err) { toast("Ошибка: " + err.message); return; }
        state.years[y].start = st; state.years[y].fromPrev = false; changed(); toast("Старт " + y + " сохранён");
      };
    });
    $main.querySelectorAll("[data-manual]").forEach(function (b) { b.onclick = function () { var y = b.dataset.manual; state.years[y].start = E.startOf(state, y); state.years[y].fromPrev = false; changed(); }; });
    $main.querySelectorAll("[data-auto]").forEach(function (b) { b.onclick = function () { state.years[b.dataset.auto].fromPrev = true; changed(); }; });
    $main.querySelectorAll("[data-acc]").forEach(function (el) {
      el.onchange = function () { var a = state.accounts.find(function (x) { return x.id === el.dataset.acc; }); a[el.dataset.f] = el.value || null; changed(true); toast("Сохранено"); };
    });
    $main.querySelectorAll("[data-accarch]").forEach(function (b) { b.onclick = function () { var a = state.accounts.find(function (x) { return x.id === b.dataset.accarch; }); a.archived = !a.archived; changed(); }; });
    $main.querySelector("#addAcc").onclick = function () {
      var n = prompt("Название счёта"); if (!n) return;
      state.accounts.push({ id: E.uid("a"), name: n.trim(), kind: "cash_flow", sort: Math.max.apply(null, state.accounts.map(function (a) { return a.sort; }).concat([0])) + 1 });
      changed();
    };
    $main.querySelectorAll("[data-cat2]").forEach(function (el) {
      el.onchange = function () {
        var c = state.categories.find(function (x) { return x.id === el.dataset.cat2; });
        c[el.dataset.f] = el.type === "checkbox" ? el.checked : (el.value || null);
        changed(el.dataset.f === "name"); toast("Сохранено");
      };
    });
    $main.querySelectorAll("[data-catarch]").forEach(function (b) { b.onclick = function () { var c = state.categories.find(function (x) { return x.id === b.dataset.catarch; }); c.archived = !c.archived; changed(); }; });
    $main.querySelectorAll("[data-up]").forEach(function (b) {
      b.onclick = function () {
        var c = state.categories.find(function (x) { return x.id === b.dataset.up; });
        var same = cats().filter(function (x) { return x.block === c.block; }), i = same.indexOf(c);
        if (i > 0) { var t = same[i - 1].sort; same[i - 1].sort = c.sort; c.sort = t; changed(); }
      };
    });
    $main.querySelector("#addCat").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, inBlock = state.categories.filter(function (c) { return c.block === f.block.value; });
      var sort = inBlock.length ? Math.max.apply(null, inBlock.map(function (c) { return c.sort; })) + 0.01 : 999;
      state.categories.push({ id: E.uid("c"), name: f.name.value.trim(), block: f.block.value, currency: f.cur.value, mandatory: false, link: null, sort: sort, archived: false });
      changed(); toast("Категория добавлена");
    };
    $main.querySelector("#exp").onclick = function () {
      backupDownload();
    };
    $main.querySelector("#imp").onchange = function (e) {
      var file = e.target.files[0]; if (!file) return;
      file.text().then(function (t) {
        try { var d = JSON.parse(t); if (!d.years || !d.categories) throw new Error("не похоже на бэкап"); if (!confirm("Заменить мой бюджет бэкапом?")) return; replaceMine(d); toast("Бэкап загружен"); }
        catch (err) { toast("Не получилось: " + err.message); }
      });
    };
    $main.querySelector("#expCsv").onclick = function () {
      var y = ui.year, r = E.compute(state, y), rows = [["категория", "блок"].concat(r.weeks.map(function (w) { return E.MONTHS_SHORT[w.month - 1] + " " + w.label; }))];
      cats().forEach(function (c) { rows.push([c.name, c.block].concat(r.cells[c.id].map(function (x) { return x ? (x.cents / 100).toFixed(2).replace(".", ",") : ""; }))); });
      rows.push(["В обращении", ""].concat(r.obr.map(function (v) { return (v / 100).toFixed(2).replace(".", ","); })));
      rows.push(["Факт", ""].concat(r.fact.map(function (v) { return v === null ? "" : (v / 100).toFixed(2).replace(".", ","); })));
      rows.push(["Капитал", ""].concat(r.cap.map(function (v) { return (v / 100).toFixed(2).replace(".", ","); })));
      download("easy-budget-" + y + ".csv", "﻿" + rows.map(function (r) { return r.map(function (x) { return /[;"\n]/.test(x) ? '"' + String(x).replace(/"/g, '""') + '"' : x; }).join(";"); }).join("\n"), "text/csv");
    };
    var rs = $main.querySelector("#reseed");
    if (rs) rs.onclick = function () { if (!confirm("Заменить бюджет данными из seed.js?")) return; replaceMine(fromSeed()); };
    $main.querySelector("#wipe").onclick = function () { if (!confirm("Стереть мой бюджет и начать с пустого года? Общие траты не тронутся.")) return; replaceMine(blank()); };
    $main.querySelector("#xlsx").onchange = function (e) { var f = e.target.files[0]; if (f) importXlsxFile(f); };
    $main.querySelector("#remBtn").onclick = reminderModal;
    // оглавление: настройки длинные
    var heads = $main.querySelectorAll("h2"), toc = "";
    heads.forEach(function (h, i) { h.id = "set-" + i; h.style.scrollMarginTop = "16px"; toc += "<button type='button' class='chip' data-goto='set-" + i + "'>" + esc(h.textContent.replace(/\s*\(.*$/, "")) + "</button>"; });
    $main.querySelector(".page-head").insertAdjacentHTML("afterend", "<nav class='chips set-toc' aria-label='Разделы настроек'>" + toc + "</nav>");
    $main.querySelectorAll("[data-goto]").forEach(function (b) { b.onclick = function () { document.getElementById(b.dataset.goto).scrollIntoView({ behavior: "smooth", block: "start" }); }; });
    $main.querySelector("#setProfile").onsubmit = function (e) {
      e.preventDefault();
      var n = e.target.name.value.trim();
      Store.updateProfileName(n).then(function () { profileBar(); toast("Имя сохранено"); }).catch(function (err) { toast("Ошибка: " + err.message); });
    };
    $main.querySelectorAll("[data-vis]").forEach(function (el) {
      el.onchange = function () {
        Store.setVisibility(el.dataset.vis, el.value).then(function () { return loadPeople(); }).then(function () { toast("Доступ обновлён"); })
          .catch(function (err) { toast("Ошибка: " + err.message); });
      };
    });
    var so = $main.querySelector("#signOut");
    if (so) so.onclick = function () {
      if (pending || saving) { toast("Подожди, сохраняю…"); return; }
      Store.signOut().then(function () { location.hash = ""; location.reload(); });
    };
  };

  function replaceMine(data) {
    myState = migrate(JSON.parse(JSON.stringify(data)));
    state = myState; view = { who: "me", level: "full", name: "", summary: null };
    var d = defaultYearWeek(); ui.year = d.year; ui.week = d.week; ui.gridYear = null;
    changed();
  }

  // Импорт .xlsx (Excel или Google Sheets): предпросмотр → заменить бюджет
  function importXlsxFile(file) {
    toast("Читаю таблицу…");
    file.arrayBuffer().then(function (buf) {
      var res;
      try { res = window.BudgetImporter.importArrayBuffer(buf); } catch (err) { toast("Не получилось: " + err.message); return; }
      var st = res.state, ys = Object.keys(st.years).sort();
      var nEntries = 0; ys.forEach(function (y) { Object.keys(st.years[y].entries).forEach(function (c) { nEntries += Object.keys(st.years[y].entries[c]).length; }); });
      modal("<div class='m-body'><h2>Импорт таблицы</h2><p class='muted'>Нашла: годы " + ys.map(function (y) { return y + (st.years[y].archived ? " (архив)" : ""); }).join(", ") +
        "; категорий " + st.categories.filter(function (c) { return !c.archived; }).length + "; счетов " + st.accounts.length + "; записей " + nEntries + "; курс " + String(st.settings.rate).replace(".", ",") + " ₽/€.</p>" +
        (res.warnings.length ? "<div class='hint small'>" + res.warnings.map(esc).join("<br>") + "</div>" : "") +
        "<div class='alert small'>Мой бюджет будет заменён данными из таблицы. Общие траты не тронутся.</div></div>" +
        "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Заменить мой бюджет</button></div>", function (m) {
        m.querySelector("[data-act=cancel]").onclick = closeModal;
        m.querySelector("[data-act=ok]").onclick = function () {
          var keep = myState && myState.settings;
          if (keep) { st.settings.diffAlert = keep.diffAlert; st.settings.fx = Object.assign({}, keep.fx, { RUB: st.settings.rate }); }
          closeModal();
          if (view.who !== "me") switchTo("me");
          replaceMine(st); toast("Таблица импортирована");
        };
      });
    });
  }
  function backupDownload() {
    var data = JSON.parse(JSON.stringify(myState)); delete data._ver;
    download("easy-budget-backup-" + E.todayISO() + ".json", JSON.stringify(data), "application/json");
  }
  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- профиль партнёра: только итоги / скрыто ----------
  function partnerTotals() {
    var sm = view.summary, ys = Object.keys(sm.years || {}).sort();
    var y = ui.anYear && sm.years[ui.anYear] ? ui.anYear : (ys.filter(function (x) { return x <= String(new Date().getFullYear()); }).pop() || ys[ys.length - 1]);
    var html = "<div class='page-head'><div><h1>" + esc(view.name) + ": итоги " + esc(y || "") + "</h1><div class='sub'>" + esc(view.name) + " открыла только итоги по месяцам" +
      (sm.hasPrivate ? " · есть скрытые личные категории" : "") + ". Обновлено " + esc(new Date(sm.updatedAt).toLocaleString("ru-RU")) + ".</div></div>" +
      "<div class='chips'>" + ys.map(function (x) { return "<button class='chip" + (x === y ? " on" : "") + "' data-y='" + x + "'>" + x + "</button>"; }).join("") + "</div></div>";
    if (!y) { $main.innerHTML = html + "<p class='empty'>Пока нет данных.</p>"; return; }
    var d = sm.years[y], t = d.total, ms = d.months;
    html += "<div class='kpis'>" + kpi("Доходы за год", eur(rnd(t.income), { dec: 0 })) + kpi("Расходы за год", eur(rnd(t.total), { dec: 0 })) +
      kpi("На жизнь в месяц", eur(rnd(t.living / 12), { dec: 0 })) + kpi("Капитал на конец года", t.cap === null || t.cap === undefined ? "—" : eur(rnd(t.cap), { dec: 0 })) + "</div>";
    html += monthTable(ms, t);
    $main.innerHTML = html;
    $main.querySelectorAll("[data-y]").forEach(function (b2) { b2.onclick = function () { ui.anYear = b2.dataset.y; render(); }; });
  }
  function monthTable(ms, t) {
    var rowsDef = [["Доходы", "income"], ["Базовые расходы", "base"], ["Периодические", "periodic"], ["Подписки ES", "subs_es"], ["Подписки RU (в €)", "subs_ru"],
      ["Расходы итого", "total", 1], ["  на жизнь (без налогов)", "living"], ["Доходы − расходы", "net", 1], ["Отложено в накопления", "saved"], ["Капитал на конец месяца", "cap", 1], ["Изменение капитала", "dcap"], ["Доля сбережений", "rate"]];
    var html = "<div class='section'><h2>По месяцам</h2><div class='tbl-wrap'><table class='t'><thead><tr><th></th>" + E.MONTHS_SHORT.map(function (m) { return "<th class='n'>" + m + "</th>"; }).join("") + "<th class='n'>Год</th></tr></thead><tbody>";
    rowsDef.forEach(function (d) {
      var k = d[1];
      var cell = function (v) {
        if (v === null || v === undefined) return "<td class='n'></td>";
        if (k === "rate") return "<td class='n'>" + Math.round(v * 100) + "%</td>";
        return "<td class='n " + ((k === "net" || k === "dcap") ? sign(v) : "") + "'>" + E.fmt(rnd(v)) + "</td>";
      };
      html += "<tr class='" + (d[2] ? "total" : "") + "'><td>" + d[0] + "</td>" + ms.map(function (m) { return cell(m[k]); }).join("") + cell(t[k]) + "</tr>";
    });
    return html + "</tbody></table></div></div>";
  }

  // ---------- роутер ----------
  function render() {
    var route = (location.hash || "#home").slice(1);
    if (!routes[route]) route = "home";
    document.body.classList.remove("auth");
    $main.classList.toggle("wide", route === "year");
    document.querySelectorAll("#nav a").forEach(function (a) { a.classList.toggle("active", a.dataset.route === route); });
    var extra = document.querySelector("#nav a.x[data-route='" + route + "']");
    document.getElementById("navMore").classList.toggle("active", !!extra);
    profileBar();
    try {
      if (RO() && route !== "shared" && route !== "help" && route !== "tolog") {
        if (view.level === "totals" && view.summary) return partnerTotals();
        if (!state) { $main.innerHTML = "<div class='card'><h2>" + esc(view.name) + " закрыла доступ к своему бюджету</h2><p class='muted'>Она может открыть его в своих настройках.</p></div>"; return; }
        if (/^(recon|recurring|settings)$/.test(route)) {
          $main.innerHTML = "<div class='card'><h2>Это раздел для своего бюджета</h2><p class='muted'>Сейчас открыт чужой бюджет (" + esc(view.name) + ") — только просмотр.</p><button class='btn primary' id='backMe'>Вернуться к своему</button></div>";
          $main.querySelector("#backMe").onclick = function () { switchTo("me"); };
          return;
        }
      }
      routes[route]();
    }
    catch (err) { console.error(err); $main.innerHTML = "<div class='alert'>Этот экран не открылся: " + esc(err.message) + ". Обнови страницу — данные не пропали.</div>"; }
  }
  window.addEventListener("hashchange", function () { closeModal(); if (myState) render(); window.scrollTo(0, 0); });

  // ---------- вход и первый запуск ----------
  function showLogin(msg, mode) {
    mode = mode || "in";
    document.body.classList.add("auth");
    var titles = { "in": "Вход", up: "Регистрация", reset: "Новый пароль", forgot: "Забыла пароль" };
    var html = "<div class='login card'><div class='brand'><span class='brand-mark'>€</span><span class='brand-name'>Easy Budget</span></div><h1>" + titles[mode] + "</h1>" +
      (msg ? "<div class='" + (/^✓/.test(msg) ? "ok-box" : "alert") + " small'>" + esc(msg) + "</div>" : "");
    if (mode === "reset") {
      html += "<form id='lf' class='form-grid' style='margin-top:12px'><label class='f' style='grid-column:1/-1'>Новый пароль (от 8 символов)<input type='password' name='pw' autocomplete='new-password' minlength='8' required autofocus></label>" +
        "<button class='btn primary' type='submit'>Сохранить пароль</button></form>";
    } else {
      html += (mode === "up" ? "<p class='muted'>После регистрации придёт письмо — подтверди адрес один раз, потом входи с паролем на любом устройстве.</p>" : "") +
        (mode === "forgot" ? "<p class='muted'>Пришлю письмо со ссылкой для нового пароля.</p>" : "") +
        "<form id='lf' class='form-grid' style='margin-top:12px'><label class='f' style='grid-column:1/-1'>Email<input type='email' name='email' autocomplete='email' required autofocus></label>" +
        (mode !== "forgot" ? "<label class='f' style='grid-column:1/-1'>Пароль" + (mode === "up" ? " (от 8 символов)" : "") + "<input type='password' name='pw' autocomplete='" + (mode === "up" ? "new-password" : "current-password") + "' minlength='" + (mode === "up" ? 8 : 6) + "' required></label>" : "") +
        "<button class='btn primary' type='submit'>" + (mode === "in" ? "Войти" : mode === "up" ? "Зарегистрироваться" : "Отправить письмо") + "</button></form>" +
        "<div class='row small' style='margin-top:14px'>" +
        (mode === "in" ? "<button class='btn ghost sm' data-m='up'>Впервые здесь? Регистрация</button><span class='spacer'></span><button class='btn ghost sm' data-m='forgot'>Забыла пароль</button>"
          : "<button class='btn ghost sm' data-m='in'>‹ Ко входу</button>") + "</div>";
    }
    $main.innerHTML = html + "</div>";
    $main.querySelectorAll("[data-m]").forEach(function (b2) { b2.onclick = function () { showLogin("", b2.dataset.m); }; });
    var f = $main.querySelector("#lf");
    f.onsubmit = function (e) {
      e.preventDefault();
      var btn = f.querySelector("button[type=submit]"), label = btn.textContent;
      btn.disabled = true; btn.textContent = "Секунду…";
      var email = f.email ? f.email.value.trim().toLowerCase() : "", pw = f.pw ? f.pw.value : "";
      var fail = function (err) {
        btn.disabled = false; btn.textContent = label;
        var m = err && err.message || String(err);
        if (/invalid login/i.test(m)) m = "Неверный email или пароль";
        else if (/not confirmed/i.test(m)) m = "Email ещё не подтверждён — найди письмо от Supabase и нажми ссылку";
        else if (/already registered/i.test(m)) m = "Такой email уже зарегистрирован — войди или восстанови пароль";
        else if (/rate limit/i.test(m)) m = "Слишком много писем за час — попробуй позже";
        toast(m);
      };
      if (mode === "in") Store.signIn(email, pw).then(start).catch(fail);
      else if (mode === "up") Store.signUp(email, pw).then(function (r) {
        if (r.needsConfirm) showLogin("✓ Письмо отправлено на " + email + ". Подтверди адрес и возвращайся ко входу.", "in");
        else start();
      }).catch(fail);
      else if (mode === "forgot") Store.resetPassword(email).then(function () { showLogin("✓ Письмо со ссылкой отправлено на " + email + ".", "in"); }).catch(fail);
      else if (mode === "reset") Store.updatePassword(pw).then(function () { toast("Пароль обновлён"); location.hash = "#home"; start(); }).catch(fail);
    };
  }

  // Партнёр заранее загрузил мою таблицу — предложить начать с неё
  function showPending(p) {
    document.body.classList.add("auth");
    var d = p.data, ys = Object.keys(d.years || {}).sort();
    $main.innerHTML = "<div class='login card' style='max-width:560px'><div class='brand'><span class='brand-mark'>€</span><span class='brand-name'>Easy Budget</span></div>" +
      "<h1>Твой бюджет уже здесь</h1><p class='muted'>Таблицу загрузили заранее: " + (ys.length ? "годы " + ys.join(", ") + ", " : "") + d.categories.filter(function (c) { return !c.archived; }).length + " категорий, " +
      d.accounts.length + " счетов. Проверь цифры на «Главной» — если что-то не так, таблицу можно загрузить заново в «Настройках».</p>" +
      "<form id='pnF' class='form-grid' style='margin-top:12px'><label class='f' style='grid-column:1/-1'>Как тебя зовут<input name='name' value='" + esc((Store.user() || {}).name || "") + "' required></label>" +
      "<button class='btn primary' type='submit'>Начать с этим бюджетом</button></form>" +
      "<div class='row small' style='margin-top:12px'><button class='btn ghost sm' id='pnOther'>Начать по-другому</button></div></div>";
    $main.querySelector("#pnF").onsubmit = function (e) {
      e.preventDefault();
      var n = e.target.name.value.trim(); if (!n) return;
      if (n !== (Store.user() || {}).name) Store.updateProfileName(n).catch(function () {});
      myState = state = migrate(JSON.parse(JSON.stringify(d)));
      boot(); save();
      Store.deletePending().catch(function () {});
      toast("Бюджет на месте");
    };
    $main.querySelector("#pnOther").onclick = showOnboarding;
  }
  // Загрузить таблицу партнёра заранее: она заберёт её при первом входе
  function preparePartnerBudget(email, name, file) {
    (function () {
      if (!file) return;
      toast("Читаю таблицу…");
      file.arrayBuffer().then(function (buf) {
        var res;
        try { res = window.BudgetImporter.importArrayBuffer(buf); } catch (err) { toast("Не получилось прочитать: " + err.message); return; }
        var st = res.state, ys = Object.keys(st.years).sort();
        modal("<div class='m-body'><h2>Бюджет партнёра: " + esc(name) + "</h2><p class='muted'>Нашла: годы " + ys.join(", ") + "; категорий " + st.categories.filter(function (c) { return !c.archived; }).length + "; счетов " + st.accounts.length + "; курс " + String(st.settings.rate).replace(".", ",") + " ₽/€.</p>" +
          (res.warnings.length ? "<div class='hint small'>" + res.warnings.map(esc).join("<br>") + "</div>" : "") +
          "<p class='small muted'>Когда " + esc(name) + " войдёт с <b>" + esc(email) + "</b>, приложение предложит начать с этим бюджетом. До этого его видишь только ты.</p></div>" +
          "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить бюджет</button></div>", function (m) {
          m.querySelector("[data-act=cancel]").onclick = closeModal;
          m.querySelector("[data-act=ok]").onclick = function () {
            st.settings.myName = name; st.settings.tourDone = false;
            Store.savePendingFor(email, st).then(function () { closeModal(); toast("Готово: " + name + " увидит бюджет при первом входе"); render(); })
              .catch(function (err) { toast(/pending_budgets|relation|schema/i.test(err.message) ? "Сначала добавь таблицу в базу: SQL из файла supabase/pending_budget.sql" : "Не сохранилось: " + err.message); });
          };
        });
      });
    })();
  }

  function showOnboarding() {
    document.body.classList.add("auth");
    var u = Store.user() || {};
    $main.innerHTML = "<div class='login card' style='max-width:620px'><h1>Добро пожаловать</h1><p class='muted'>Бюджета пока нет. С чего начнём?</p>" +
      "<form id='obName' class='form-grid'><label class='f' style='grid-column:1/-1'>Как тебя зовут<input name='name' value='" + esc(u.name || "") + "' required placeholder='Рита'></label></form>" +
      "<div class='grid2' style='margin-top:12px'><label class='card' style='cursor:pointer'><b>Импорт таблицы</b><p class='small muted'>Excel или Google Sheets (Файл → Скачать → .xlsx). Подходят листы «Мой_ГГГГ» и «ГГГГ_€ REAL».</p>" +
      "<span class='btn primary'>Выбрать .xlsx</span><input type='file' id='obX' accept='.xlsx' hidden></label>" +
      "<div class='card'><b>С чистого листа</b><p class='small muted'>Пустой год с базовыми категориями — настроишь под себя.</p><button class='btn' id='obBlank'>Начать</button>" +
      "<label class='btn ghost' style='margin-top:6px'>Из бэкапа (JSON)<input type='file' id='obJ' accept='.json' hidden></label></div></div></div>";
    function withName() {
      var n = $main.querySelector("#obName").name.value.trim();
      if (!n) { toast("Напиши имя"); $main.querySelector("#obName").name.focus(); return false; }
      if (Store.mode === "cloud" && n !== u.name) Store.updateProfileName(n).catch(function () {});
      return true;
    }
    $main.querySelector("#obBlank").onclick = function () { if (withName()) { myState = state = migrate(blank()); boot(); save(); } };
    $main.querySelector("#obX").onchange = function (e) {
      if (!withName()) return;
      var file = e.target.files[0]; if (!file) return;
      file.arrayBuffer().then(function (buf) {
        try { var res = window.BudgetImporter.importArrayBuffer(buf); myState = state = migrate(res.state); boot(); save(); toast("Таблица импортирована: " + Object.keys(res.state.years).join(", ")); }
        catch (err) { toast("Не получилось: " + err.message); }
      });
    };
    $main.querySelector("#obJ").onchange = function (e) {
      if (!withName()) return;
      e.target.files[0].text().then(function (t) {
        try { var d = JSON.parse(t); if (!d.years) throw new Error("не похоже на бэкап"); myState = state = migrate(d); boot(); save(); } catch (err) { toast("Не получилось: " + err.message); }
      });
    };
  }

  function boot() {
    state = myState; view = { who: "me", level: "full", name: "", summary: null };
    var d = defaultYearWeek(); ui.year = d.year; ui.week = d.week;
    render();
  }

  function start() {
    $main.innerHTML = "<p class='loading'>Загружаю…</p>";
    return Promise.all([
      Store.loadMyBudget(),
      loadShared().catch(function (e) { console.warn(e); }),
      loadPeople(),
    ]).then(function (x) {
      var b = x[0];
      if (!b) {
        if (Store.mode === "local" && window.SEED) return seedLocal();
        return Store.loadPending().then(function (p) { return p ? showPending(p) : showOnboarding(); }, function () { return showOnboarding(); });
      }
      myState = migrate(b.data);
      boot();
      if (b.offline) toast("Нет связи — показываю копию с этого устройства");
    }).catch(function (err) {
      $main.innerHTML = "<div class='alert'>Не удалось загрузить: " + esc(err.message) + "</div>";
    });
  }

  // Локальный режим разработки: данные из data/seed.js + выгрузка Splitwise
  function seedLocal() {
    myState = migrate(fromSeed());
    boot(); save();
    if (sh || !window.SEED_SPLITWISE_CSV) return;
    var set = window.SEED.settings;
    Store.createSpace("Общие траты", set.myName, (set.partnerName || "").split(" ")[0]).then(function (sp) {
      var meP = sp.people[0].id, pP = sp.people[1].id;
      var rows = S.importSplitwise(window.SEED_SPLITWISE_CSV, { myName: set.myName }).expenses.map(function (e) { return SU.toRow(e, meP, pP, sp.space.id); });
      return Store.insertShared(rows);
    }).then(loadShared).then(function () { toast("Данные импортированы из Excel и Splitwise"); render(); });
  }

  // подсказки графиков
  var $tip = document.getElementById("tip");
  document.addEventListener("mouseover", function (e) {
    var el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) { $tip.classList.remove("on"); return; }
    $tip.textContent = el.getAttribute("data-tip"); $tip.classList.add("on");
  });
  document.addEventListener("mousemove", function (e) {
    if (!$tip.classList.contains("on")) return;
    var x = e.clientX + 14, y = e.clientY + 14, w = $tip.offsetWidth, h = $tip.offsetHeight;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    $tip.style.left = x + "px"; $tip.style.top = y + "px";
  });

  Store.init().then(function (r) {
    if (!r.user) return showLogin();
    return start();
  }).catch(function (err) { showLogin("Ошибка подключения: " + err.message); });
  if (Store.onAuthChange) Store.onAuthChange(function (ev) {
    if (ev === "PASSWORD_RECOVERY") { setTimeout(function () { showLogin("", "reset"); }, 0); return; }
    if (ev === "SIGNED_IN" && !myState && document.body.classList.contains("auth") && !$main.querySelector("#obName") && !$main.querySelector("#lf input[name=pw][autocomplete=new-password]")) setTimeout(start, 0);
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});
})();
