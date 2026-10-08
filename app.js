/* Easy Budget — интерфейс. Хранение — через BudgetStore (облако Supabase или этот браузер). */
(function () {
  "use strict";
  var E = window.BudgetEngine, S = window.BudgetShared, C = window.BudgetCharts, Store = window.BudgetStore, SU = window.BudgetStoreUtil;
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
    if (RO()) { toast("Это бюджет " + view.name + " — только просмотр"); return; }
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
    $main.innerHTML = "<p class='loading'>Загружаю бюджет " + esc(p.name) + "…</p>";
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
    if (RO()) { toast("Это бюджет " + view.name + " — только просмотр"); return; }
    var r = E.compute(state, year), cell = r.cells[catId][w], c = state.categories.find(function (x) { return x.id === catId; });
    var wk = r.weeks[w], entry = (state.years[year].entries[catId] || {})[w];
    var recCell = E.yearCells(Object.assign({}, state, { years: (function () { var o = {}; o[year] = Object.assign({}, state.years[year], { entries: {} }); return o; })() }), year)[catId][w];
    modal("<form method='dialog' class='m-body' id='cellForm'><h2>" + esc(c.name) + "</h2><div class='sub'>" + E.weekTitle(Number(year), w) +
      " · " + wk.wim + "-я неделя месяца</div>" +
      (recCell ? "<div class='hint small'>Регулярный платёж: <b>" + E.fmt(recCell.cents, { cur: cur(c) }) + "</b>. Ручная запись перекрывает его в этой неделе.</div>" : "") +
      "<div class='form-grid' style='margin-top:14px'><label class='f' style='grid-column:1/-1'>Сумма или формула (минус — расход): <input type='text' name='expr' autofocus value='" +
      esc(entry ? entry.expr : (cell ? (cell.cents / 100).toString() : "")) + "' placeholder='-35-20' inputmode='decimal'></label>" +
      "<label class='f' style='grid-column:1/-1'>Заметка <input type='text' name='note' value='" + esc(entry ? entry.note : "") + "' placeholder='что это было'></label></div>" +
      "<div class='small muted' id='cellPreview' style='margin-top:8px'></div></form>" +
      "<div class='m-foot'>" + (entry ? "<button class='btn ghost danger' data-act='clear'>" + (recCell ? "Вернуть регулярный" : "Удалить") + "</button>" : "") +
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
      kpi("В обращении", eur(rnd(r.base[w]), { dec: 0 }), fact === null ? "расчёт по плану" : "по факту сверки") +
      kpi("Расхождение", diff === null ? "—" : eur(rnd(diff), { dec: 0, plus: true }), diff === null ? "<button class='btn sm primary' data-act='recon'>Внести остатки</button>" :
        (diff < alert ? "<span class='neg'>⚠ мимо плана больше " + eur(-alert, { dec: 0 }) + "</span>" : "<span class='pos'>✓ в пределах плана</span>"), diff !== null && diff < alert) +
      kpi("Капитал", eur(rnd(r.cap[w]), { dec: 0 }), "за неделю " + "<span class='" + sign(r.dweek[w]) + "'>" + eur(rnd(r.dweek[w]), { dec: 0, plus: true }) + "</span>" +
        (wk.wim === 5 ? " · за месяц <span class='" + sign(r.dmonth[w]) + "'>" + eur(rnd(r.dmonth[w]), { dec: 0, plus: true }) + "</span>" : "")) +
      kpi("Хватит до конца года?", minV < 0 ? "Нет" : "Да", "минимум " + eur(rnd(minV), { dec: 0 }) + " — " + esc(E.MONTHS_SHORT[r.weeks[minW].month - 1] + " " + r.weeks[minW].label), minV < 0) +
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
          "<span class='badge " + cell.src + "'>" + (cell.src === "rec" ? "рег." : "вручную") + "</span>" +
          "<span class='val " + sign(cell.cents) + "'>" + E.fmt(cell.cents, { cur: cur(c) }) + "</span></li>";
      });
    });
    html += "<div class='grid2'><div class='card'><div class='row'><h2 style='margin:0'>План на неделю</h2><span class='spacer'></span>" +
      "<span class='small muted'>приход <b class='pos'>" + eur(tin) + "</b> · расход <b class='neg'>" + eur(tout) + "</b></span></div>" +
      (items ? "<ul class='plan-list'>" + items + "</ul>" : "<p class='empty'>На эту неделю ничего не запланировано.</p>") + "</div>";

    // быстрое добавление
    html += "<div>" + (RO() ? "" : "<div class='card'><h2>Внести трату</h2><p class='small muted' style='margin-top:-6px'>Нашла в выписке что-то крупное — добавь в категорию, сумма прибавится к плану недели. Для расходов можно без минуса.</p>" +
      "<form id='quick' class='form-grid'><label class='f' style='grid-column:1/-1'>Категория<select name='cat'>" + catOptions("c31") + "</select></label>" +
      "<label class='f'>Сумма<input type='text' name='v' inputmode='decimal' placeholder='300' required></label>" +
      "<label class='f'>Заметка<input type='text' name='note' placeholder='шопинг'></label>" +
      "<button class='btn primary' type='submit'>Добавить</button></form></div>");

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
    if ($main.querySelector("#quick")) $main.querySelector("#quick").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target;
      try { addToCell(y, f.cat.value, w, f.v.value, f.note.value); } catch (err) { toast("Ошибка в сумме: " + err.message); return; }
      toast("Добавлено в «" + catName(f.cat.value) + "»"); changed();
    };
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
      "<span style='color:var(--manual)'>синим</span> — вписано вручную. Кликни ячейку, чтобы изменить.</div></div>" +
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
          var title = cell ? (cell.src === "manual" ? "=" + (cell.expr || "") : "регулярный") + (cell.note ? " · " + cell.note : "") : "";
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
      "<label class='row'><input type='checkbox' id='nyRec' checked> Скопировать регулярные платежи</label>" +
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
    var sel = ui.recWeek || defaultYearWeek();
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
    var html = "<div class='page-head'><div><h1>Сверка</h1><div class='sub'>Раз в 1–2 недели: внеси реальные остатки на счетах в обращении. Получится ФАКТ — дальше план считается от него.</div></div>" +
      "<div class='row'>" + yearChips(y, false) + "<select id='recW'>" + weekOpts(y, w, function (i) { return !!yr.recon[i] && r.fact[i] !== null; }) + "</select></div></div>";
    html += "<div class='grid2'><div class='card'><h2>Остатки · " + esc(E.weekTitle(Number(y), w)) + "</h2><form id='recForm' class='form-grid'>";
    accs.forEach(function (a) {
      var active = E.accountActive(a, wk), e = rec[a.id], lk = lastKnown(a.id);
      html += "<label class='f'>" + esc(a.name) + (a.kind === "info" ? " <span class='badge'>не в факте</span>" : !active ? " <span class='badge'>с " + esc(a.countsFrom) + "</span>" : "") +
        "<input type='text' inputmode='decimal' name='" + a.id + "' value='" + esc(e ? e.expr : "") + "' placeholder='" + (lk !== null ? esc(E.fmt(lk)) : "0") + "'" + (a.kind === "cash_flow" && !active ? " disabled" : "") + "></label>";
    });
    html += "</form><details style='margin-top:14px'" + (Object.keys(srec).length ? " open" : "") + "><summary>Накопления и рубли (по желанию, раз в квартал)</summary>" +
      "<p class='small muted'>Остаток целиком: заменяет расчёт, а не прибавляется. Так учитываются рост инвестиций и проценты.</p><form id='savForm' class='form-grid'>";
    E.CAPITAL_ROWS.forEach(function (cr) {
      html += "<label class='f'>" + cr.name + "<input type='text' inputmode='decimal' name='" + cr.key + "' value='" + (srec[cr.key] !== undefined ? esc(srec[cr.key] / 100) : "") +
        "' placeholder='" + esc(E.fmt(rnd(r.rows[cr.key][w]))) + "'></label>";
    });
    html += "</form></details><div class='row' style='margin-top:16px'><button class='btn primary' id='recSave'>Сохранить сверку</button>" +
      (rec && Object.keys(rec).length ? "<button class='btn ghost danger' id='recClear'>Очистить неделю</button>" : "") + "</div></div>";

    html += "<div><div class='card' id='recResult'></div>" +
      "<div class='card'><h2>Нашла трату в выписке?</h2><form id='recAdd' class='form-grid'><label class='f' style='grid-column:1/-1'>Категория<select name='cat'>" + catOptions("c31") + "</select></label>" +
      "<label class='f'>Сумма<input type='text' name='v' inputmode='decimal' placeholder='300' required></label><label class='f'>Заметка<input type='text' name='note'></label>" +
      "<button class='btn' type='submit'>Внести в эту неделю</button></form></div></div></div>";

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
        s += d < state.settings.diffAlert ? "<div class='alert'>Потрачено больше плана. Найди в выписке траты на <b>~" + eur(rnd(-d), { dec: 0 }) + "</b> и внеси их в категории справа — так станет понятно, куда ушли деньги.</div>"
          : d > 5000 ? "<div class='ok-box'>Денег больше, чем по плану, на " + eur(rnd(d), { dec: 0 }) + ". Возможно, не внесён доход или трата ещё не списалась.</div>"
            : "<div class='ok-box'>Всё сходится с планом. Следующие недели посчитаются от факта.</div>";
      } else s += "</table><p class='small muted'>Впиши остатки — расхождение посчитается сразу.</p>";
      if (err) s += "<div class='alert'>Ошибка в формуле — " + esc(err) + "</div>";
      box.innerHTML = s;
    }
    $main.querySelectorAll("#recForm input").forEach(function (i) { i.addEventListener("input", liveResult); });
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
    if (cl) cl.onclick = function () { if (!confirm("Удалить сверку этой недели?")) return; delete yr.recon[w]; delete yr.savRecon[w]; changed(); };
    $main.querySelector("#recAdd").onsubmit = function (e) {
      e.preventDefault();
      try { addToCell(y, e.target.cat.value, w, e.target.v.value, e.target.note.value); } catch (err) { toast("Ошибка: " + err.message); return; }
      ui.recWeek = { year: y, week: w }; toast("Внесено — расхождение пересчитано"); changed();
    };
    $main.querySelectorAll("[data-go]").forEach(function (tr) { tr.onclick = function () { var p = tr.dataset.go.split(":"); ui.recWeek = { year: p[0], week: Number(p[1]) }; render(); }; });
  };

  // ===== РЕГУЛЯРНЫЕ =====
  routes.recurring = function () {
    var y = ui.recYear && state.years[ui.recYear] && !state.years[ui.recYear].archived ? ui.recYear : ui.year, yr = state.years[y];
    yr.recurring = yr.recurring || [];
    var list = yr.recurring.slice().sort(function (a, b) {
      var ca = state.categories.find(function (c) { return c.id === a.catId; }) || {}, cb = state.categories.find(function (c) { return c.id === b.catId; }) || {};
      return (ca.sort - cb.sort) || (a.from < b.from ? -1 : 1);
    });
    var monthOpts = function (sel) { return E.MONTHS.map(function (m, i) { var v = y + "-" + (i < 9 ? "0" : "") + (i + 1) + "-01"; return "<option value='" + v + "'" + (v === sel ? " selected" : "") + ">с " + E.MONTHS_GEN[i].replace(/я$/, "я") + " (" + m + ")</option>"; }).join(""); };
    var html = "<div class='page-head'><div><h1>Регулярные платежи</h1><div class='sub'>Сумма разойдётся по неделям месяца: 1…5, списком (2,4) или «все». Изменение «с мая» не трогает прошлые месяцы.</div></div>" + yearChips(y, false) + "</div>";
    html += "<div class='tbl-wrap'><table class='t'><thead><tr><th>Категория</th><th class='n'>Сумма</th><th>Недели</th><th>Действует</th><th class='n'>В год</th><th></th></tr></thead><tbody>";
    var weeks = E.genWeeks(Number(y));
    list.forEach(function (ru) {
      var c = state.categories.find(function (x) { return x.id === ru.catId; }) || { name: ru.catId, currency: "EUR" };
      var n = weeks.filter(function (wk) { return E.ruleMatches(ru, wk); }).length;
      html += "<tr><td>" + esc(c.name) + "</td><td class='n " + sign(ru.cents) + "'>" + E.fmt(ru.cents, { cur: cur(c) }) + (ru.expr && ru.expr !== String(ru.cents / 100) ? " <span class='muted small'>=" + esc(ru.expr) + "</span>" : "") + "</td>" +
        "<td>" + esc(ru.weeks) + "</td><td class='small'>" + (ru.from ? "с " + esc(ru.from.slice(8, 10) + "." + ru.from.slice(5, 7)) : "") + (ru.to ? " по " + esc(ru.to.slice(8, 10) + "." + ru.to.slice(5, 7)) : " — до конца года") + "</td>" +
        "<td class='n'>" + E.fmt(ru.cents * n, { cur: cur(c), dec: 0 }) + "</td><td class='n'><button class='btn sm' data-edit='" + ru.id + "'>Изменить</button> <button class='btn sm ghost danger' data-del='" + ru.id + "' aria-label='Удалить'>✕</button></td></tr>";
    });
    if (!list.length) html += "<tr><td colspan='6' class='muted'>Регулярных платежей нет — добавь ниже.</td></tr>";
    html += "</tbody></table></div>";
    html += "<div class='card section'><h2>Добавить регулярный</h2><form id='addRule' class='form-grid'><label class='f'>Категория<select name='cat'>" + catOptions() + "</select></label>" +
      "<label class='f'>Сумма (минус — расход)<input type='text' name='expr' placeholder='-150' required inputmode='decimal'></label>" +
      "<label class='f'>Недели месяца<input type='text' name='weeks' placeholder='все · 1 · 2,4 · 5' required></label>" +
      "<label class='f'>Действует<select name='from'>" + monthOpts(y + "-01-01") + "</select></label><button class='btn primary' type='submit'>Добавить</button></form></div>";
    $main.innerHTML = html;
    bindYearChips(function (yy) { ui.recYear = yy; render(); });
    $main.querySelector("#addRule").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, c;
      try { c = E.exprCents(f.expr.value); } catch (err) { toast("Ошибка: " + err.message); return; }
      if (!/^(все|\s*[1-5](\s*,\s*[1-5])*)$/i.test(f.weeks.value.trim())) { toast("Недели: «все» или цифры 1–5 через запятую"); return; }
      yr.recurring.push({ id: E.uid("r"), catId: f.cat.value, expr: f.expr.value.trim(), cents: c, weeks: f.weeks.value.trim().toLowerCase(), from: f.from.value, to: null });
      changed(); toast("Добавлено");
    };
    $main.querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () { if (!confirm("Удалить правило? Уже вписанные вручную суммы останутся.")) return; yr.recurring = yr.recurring.filter(function (x) { return x.id !== b.dataset.del; }); changed(); };
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
      (cloud ? "<p class='muted' style='margin-top:-4px'>Партнёр подключится сам: пусть откроет этот сайт и войдёт со своим email — приложение узнает приглашение.</p>" : "") +
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
      ? "<div class='hint small'>" + esc(partner) + " ещё не входила. Пусть откроет сайт и войдёт с <b>" + esc(sh.partner.email || "") + "</b> — пространство подключится само.</div>" : "";

    var html = "<div class='page-head'><div><h1>Общие траты</h1><div class='sub'>" + esc(meName) + " и " + esc(partner) + ". Вносите оба, с любого устройства. Возвраты долга и расчёты — не траты.</div></div>" +
      "<div class='row'><label class='btn'>Импорт CSV из Splitwise<input type='file' id='swFile' accept='.csv,text/csv' hidden></label></div></div>" + invite;
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
    html += "<div class='tbl-wrap'><table class='t'><thead><tr><th>Дата</th><th>Описание</th><th>Категория / тип</th><th class='n'>Сумма</th><th class='n'>Моя доля</th><th>Платил(а)</th><th></th></tr></thead><tbody>";
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
    html += "<div class='section'><h2>Моя доля по категориям, € · " + st.year + "</h2><div class='tbl-wrap'><table class='t'><thead><tr><th>Категория</th>" +
      E.MONTHS_SHORT.map(function (m) { return "<th class='n'>" + m + "</th>"; }).join("") + "<th class='n'>Год</th></tr></thead><tbody>";
    var colTot = new Array(12).fill(0);
    catsUsed.forEach(function (c) {
      var arr = ms.byCat[c], t = 0;
      html += "<tr><td>" + esc(c) + "</td>" + arr.map(function (v, i) { t += v; colTot[i] += v; return "<td class='n'>" + (Math.abs(v) >= 50 ? E.fmt(rnd(v)) : "") + "</td>"; }).join("") + "<td class='n'><b>" + E.fmt(rnd(t)) + "</b></td></tr>";
    });
    html += "<tr class='total'><td>Итого</td>" + colTot.map(function (v) { return "<td class='n'>" + E.fmt(rnd(v)) + "</td>"; }).join("") + "<td class='n'>" + E.fmt(rnd(colTot.reduce(function (a, b) { return a + b; }, 0))) + "</td></tr></tbody></table></div></div>";

    if (myState.years[st.year]) {
      var cov = S.coverage(myState, calc, st.year);
      html += "<div class='section'><h2>Сверка с моим личным планом: еда и развлечения</h2><p class='small muted' style='margin-top:-6px'>Еда = продукты + кафе + доставка из общих трат. «Вне общего счёта» — сколько из личных сумм на продукты и развлечения ушло мимо общих трат.</p>" +
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
      b.onclick = function () { if (!confirm("Удалить запись у обоих?")) return; Store.deleteShared(b.dataset.delx).then(function () { return reloadShared("Удалено"); }); };
    });
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
      out.push({ k: minV < 0 ? "warn" : "good", ic: minV < 0 ? "!" : "✓", h: minV < 0 ? "До конца года денег в обращении не хватит" : "До конца года денег хватает",
        p: "Минимум в обращении — " + eur(rnd(minV), { dec: 0 }) + " (" + E.weekTitle(Number(curY), minW) + ")." });
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
      "<label class='f'>Порог красного расхождения, €<input type='text' name='alert' value='" + esc(-s.diffAlert / 100) + "' inputmode='decimal'></label>" +
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
    html += "<div class='section'><h2>Счета в обращении</h2><div class='tbl-wrap'><table class='t'><thead><tr><th>Название</th><th>Тип</th><th>В факте с</th><th></th></tr></thead><tbody>" +
      state.accounts.slice().sort(function (a, b) { return a.sort - b.sort; }).map(function (a) {
        return "<tr" + (a.archived ? " class='muted'" : "") + "><td><input type='text' data-acc='" + a.id + "' data-f='name' value='" + esc(a.name) + "'></td>" +
          "<td><select data-acc='" + a.id + "' data-f='kind'><option value='cash_flow'" + (a.kind === "cash_flow" ? " selected" : "") + ">в обращении</option><option value='info'" + (a.kind === "info" ? " selected" : "") + ">информативно</option></select></td>" +
          "<td><input type='date' data-acc='" + a.id + "' data-f='countsFrom' value='" + esc(a.countsFrom || "") + "'></td>" +
          "<td class='n'><button class='btn sm ghost' data-accarch='" + a.id + "'>" + (a.archived ? "вернуть" : "в архив") + "</button></td></tr>";
      }).join("") + "</tbody></table></div><div class='row' style='margin-top:8px'><button class='btn' id='addAcc'>+ счёт</button></div></div>";

    // категории
    html += "<div class='section'><h2>Категории</h2><div class='tbl-wrap'><table class='t'><thead><tr><th>Название</th><th>Блок</th><th>Валюта</th><th>Налоги и обязательные</th><th title='не видна партнёру ни в деталях, ни в итогах'>Личная</th><th>Капитал</th><th></th></tr></thead><tbody>";
    E.BLOCKS.forEach(function (b) {
      cats().filter(function (c) { return c.block === b.id; }).forEach(function (c) {
        html += "<tr" + (c.archived ? " class='muted'" : "") + "><td><input type='text' data-cat2='" + c.id + "' data-f='name' value='" + esc(c.name) + "'></td>" +
          "<td><select data-cat2='" + c.id + "' data-f='block'>" + E.BLOCKS.map(function (x) { return "<option value='" + x.id + "'" + (x.id === c.block ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></td>" +
          "<td><select data-cat2='" + c.id + "' data-f='currency'><option" + (c.currency === "EUR" ? " selected" : "") + ">EUR</option><option" + (c.currency === "RUB" ? " selected" : "") + ">RUB</option></select></td>" +
          "<td><input type='checkbox' data-cat2='" + c.id + "' data-f='mandatory'" + (c.mandatory ? " checked" : "") + " aria-label='обязательная'></td>" +
          "<td><input type='checkbox' data-cat2='" + c.id + "' data-f='private'" + (c.private ? " checked" : "") + " aria-label='личная'></td>" +
          "<td>" + (c.block === "savings" ? "<select data-cat2='" + c.id + "' data-f='link'><option value=''>—</option>" + E.CAPITAL_ROWS.filter(function (x) { return x.key !== "card_rub"; }).map(function (x) { return "<option value='" + x.key + "'" + (c.link === x.key ? " selected" : "") + ">" + x.name + "</option>"; }).join("") + "</select>" : "") + "</td>" +
          "<td class='n'><button class='btn sm ghost' data-up='" + c.id + "' aria-label='Выше'>↑</button><button class='btn sm ghost' data-catarch='" + c.id + "'>" + (c.archived ? "вернуть" : "в архив") + "</button></td></tr>";
      });
    });
    html += "</tbody></table></div><form id='addCat' class='row' style='margin-top:8px'><input type='text' name='name' placeholder='Новая категория' required><select name='block'>" +
      E.BLOCKS.map(function (x) { return "<option value='" + x.id + "'>" + esc(x.name) + "</option>"; }).join("") + "</select><select name='cur'><option>EUR</option><option>RUB</option></select><button class='btn' type='submit'>+ категория</button></form></div>";

    // данные
    html += "<div class='section card'><h2>Данные</h2><div class='row'><label class='btn primary'>Импорт из Excel / Google Sheets (.xlsx)<input type='file' id='xlsx' accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' hidden></label>" +
      "<button class='btn' id='exp'>Скачать бэкап (JSON)</button><label class='btn'>Загрузить бэкап<input type='file' id='imp' accept='.json,application/json' hidden></label>" +
      "<button class='btn' id='expCsv'>Год в CSV</button><span class='spacer'></span>" + (window.SEED && !cloud ? "<button class='btn ghost danger' id='reseed'>Заново из seed.js</button>" : "") +
      "<button class='btn ghost danger' id='wipe'>Начать с нуля</button></div><p class='small muted'>Google Sheets: Файл → Скачать → Microsoft Excel (.xlsx), затем «Импорт». Таблица должна быть в формате листов «Мой_ГГГГ».</p></div>";
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
      var data = JSON.parse(JSON.stringify(state)); delete data._ver;
      download("easy-budget-backup-" + E.todayISO() + ".json", JSON.stringify(data), "application/json");
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
    var route = (location.hash || "#week").slice(1);
    if (!routes[route]) route = "week";
    document.body.classList.remove("auth");
    $main.classList.toggle("wide", route === "year");
    document.querySelectorAll("#nav a").forEach(function (a) { a.classList.toggle("active", a.dataset.route === route); });
    profileBar();
    try {
      if (RO() && route !== "shared") {
        if (view.level === "totals" && view.summary) return partnerTotals();
        if (!state) { $main.innerHTML = "<div class='card'><h2>" + esc(view.name) + " закрыла доступ к своему бюджету</h2><p class='muted'>Она может открыть его в своих настройках.</p></div>"; return; }
        if (/^(recon|recurring|settings)$/.test(route)) {
          $main.innerHTML = "<div class='card'><h2>Это раздел для своего бюджета</h2><p class='muted'>Сейчас открыт бюджет " + esc(view.name) + " — только просмотр.</p><button class='btn primary' id='backMe'>Вернуться к своему</button></div>";
          $main.querySelector("#backMe").onclick = function () { switchTo("me"); };
          return;
        }
      }
      routes[route]();
    }
    catch (err) { console.error(err); $main.innerHTML = "<div class='alert'>Ошибка на экране: " + esc(err.message) + "</div>"; }
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
      else if (mode === "reset") Store.updatePassword(pw).then(function () { toast("Пароль обновлён"); location.hash = "#week"; start(); }).catch(fail);
    };
  }

  function showOnboarding() {
    document.body.classList.add("auth");
    var u = Store.user() || {};
    $main.innerHTML = "<div class='login card' style='max-width:620px'><h1>Добро пожаловать</h1><p class='muted'>Бюджета пока нет. С чего начнём?</p>" +
      "<form id='obName' class='form-grid'><label class='f' style='grid-column:1/-1'>Как тебя зовут<input name='name' value='" + esc(u.name || "") + "' required placeholder='Рита'></label></form>" +
      "<div class='grid2' style='margin-top:12px'><label class='card' style='cursor:pointer'><b>Импорт таблицы</b><p class='small muted'>Excel или Google Sheets (Файл → Скачать → .xlsx) в формате листов «Мой_ГГГГ».</p>" +
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
        return showOnboarding();
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
