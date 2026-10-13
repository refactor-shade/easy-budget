/* Easy Budget — план: «Неделя», «Год», «Сверка», «Регулярные траты». */
(function () {
  "use strict";
  // ===== НЕДЕЛЯ ===== старый адрес #week: открывает План по неделям на нужном месяце
  routes.week = function () {
    ui.gridMode = "weeks"; ui.gridYear = ui.year; ui.gridFocusMonth = Math.floor((ui.week || 0) / 5); ui.gridScroll = null;
    location.replace("#year");
  };
  // label и value — текст; foot — HTML из своего кода (стрелки trendHtml и т. п.)
  function kpi(label, value, foot, flag) {
    return tpl("<div class='kpi{f}'><div class='kpi-label'>{l}</div><div class='kpi-value'>{v}</div><div class='kpi-foot'>{!foot}</div></div>", { f: flag ? " flag" : "", l: label, v: value, foot: foot || "" });
  }

  // ===== ГОД =====
  function yearChips(sel, includeArchived, extra) {
    return tpl("<div class='chips'>{!chips}{!extra}</div>", { extra: extra || "", chips: years().filter(function (y) { return includeArchived || !state.years[y].archived; }).map(function (y) {
      return tpl("<button class='chip{on}' data-year='{y}'>{y}{a}</button>", { on: y === sel ? " on" : "", y: y, a: state.years[y].archived ? " · архив" : "" });
    }).join("") });
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
    // на телефоне по умолчанию месяцы: 60 недель в узкий экран не помещаются
    var mode = ui.gridMode || (window.matchMedia("(max-width: 820px)").matches ? "months" : "weeks");
    var modeSw = tpl("<div class='seg' role='group' aria-label='Столбцы таблицы'><button class='seg-b{m}' data-mode='months'>Месяцы</button><button class='seg-b{w}' data-mode='weeks'>Недели</button></div>",
      { m: mode === "months" ? " on" : "", w: mode === "weeks" ? " on" : "" });
    var ys = years(), last = Number(ys[ys.length - 1]);
    var yearSel = tpl("<select class='year-sel' id='yearSel' aria-label='Год'>{!o}{!nw}</select>", {
      o: ys.map(function (yy) { return tpl("<option value='{y}'{!s}>{y}{a}</option>", { y: yy, s: yy === y ? " selected" : "", a: state.years[yy].archived ? " · архив" : "" }); }).join(""),
      nw: RO() ? "" : tpl("<option value='new'>+ план на {n}</option>", { n: last + 1 }) });
    var html = tpl("<div class='plan-head'><h1>План</h1></div><div class='plan-tools'>{!sw}<span class='spacer'></span>{!sel}</div>", { sw: modeSw, sel: yearSel }) +
      (mode === "weeks" && !ro ? "<p class='small muted plan-hint'>Нажми на ячейку, чтобы изменить: Enter — вниз, Tab — вправо. С клавиатуры: стрелки — по ячейкам, Enter — изменить. На название строки — переименовать. <span style='color:var(--rec)'>Серым</span> — регулярные, <span style='color:var(--manual)'>синим</span> — вписано вручную.</p>" : "");
    if (mode === "months") return yearByMonths(y, r, html);

    var head1 = tpl("<tr><th class='sticky'>{y}</th><th class='sticky2'>регулярно</th>", { y: y }), head2 = "<tr><th class='sticky'></th><th class='sticky2'>сумма · недели</th>";
    for (var m = 0; m < 12; m++) head1 += tpl("<th colspan='5' class='mstart' style='text-align:left'>{m}</th>", { m: E.MONTHS[m] });
    weeks.forEach(function (wk) { head2 += tpl("<th class='{a}{b}'>{l}</th>", { a: wk.wim === 1 ? "mstart " : "", b: wk.idx === nowIdx ? "now" : "", l: wk.label }); });
    var body = "";
    function tds(arr, cls, opts) {
      opts = opts || {};
      var s = "";
      weeks.forEach(function (wk) {
        var v = arr[wk.idx], c = (wk.wim === 1 ? "mstart " : "") + (wk.idx === nowIdx ? "now " : "") + (cls ? cls(v, wk) : "");
        s += tpl("<td class='v ro {c}'{!attr}>{v}</td>", { c: c, attr: opts.attr ? opts.attr(wk) : "", v: v === null || v === undefined ? "" : (opts.fmt ? opts.fmt(v, wk) : E.fmt(rnd(v))) });
      });
      return s;
    }
    E.BLOCKS.forEach(function (b) {
      var list = cats().filter(function (c) { return c.block === b.id && (!c.archived || r.cells[c.id].some(Boolean)); });
      if (!list.length) return;
      var openW = ui.planOpen || (ui.planOpen = { income: true, base: true }), isOpenW = !!openW[b.id];
      // строка блока: сумма по неделе (как в «Месяцах», без рублёвых статей) — видна и в свёрнутом виде
      var bw = weeks.map(function (wk) { var t = 0, any = false; list.forEach(function (c) { var x = r.cells[c.id][wk.idx]; if (x && c.currency !== "RUB") { t += x.cents; any = true; } }); return any ? t : null; });
      body += tpl("<tr class='blk tog' data-blk='{id}'><td class='sticky'>{arr}{n}</td><td class='sticky2'></td>{!tds}</tr>", { id: b.id, arr: isOpenW ? "▾ " : "▸ ", n: b.name, tds: tds(bw, function () { return ""; }, { fmt: function (v) { return E.fmt(rnd(v), { dec: 0 }); } }) });
      list.forEach(function (c) {
        if (!isOpenW) return;
        body += tpl("<tr><td class='sticky{cn}' title='{t}'{!dc}>{n}{!b}</td><td class='sticky2' data-rules='{id}'>{r}</td>", {
          cn: ro ? "" : " cname", t: ro ? c.name : c.name + " — нажми, чтобы переименовать", dc: ro ? "" : tpl(" data-cname='{id}'", { id: c.id }), n: c.name,
          b: c.mandatory ? " <span class='badge'>обяз.</span>" : "", id: c.id, r: rules[c.id] || "" });
        weeks.forEach(function (wk) {
          var cell = r.cells[c.id][wk.idx];
          var cls = "v " + (wk.wim === 1 ? "mstart " : "") + (wk.idx === nowIdx ? "now " : "") + (cell ? cell.src + " " : "") + (cell && cell.note ? "note " : "") + (ro ? "ro" : "");
          var title = cell ? (cell.src === "manual" ? "=" + numShow(cell.expr || "") : "регулярная") + (cell.note ? " · " + cell.note : "") : "";
          body += tpl("<td class='{cls}' data-c='{id}' data-w='{w}' title='{t}'>{v}</td>", { cls: cls, id: c.id, w: wk.idx, t: title, v: cell ? E.fmt(cell.cents, { dec: Math.abs(cell.cents) < 10000 && cell.cents % 100 ? 2 : 0 }) : "" });
        });
        body += "</tr>";
      });
      if (isOpenW && !ro) body += tpl("<tr class='add-row'><td class='sticky'><button type='button' class='linkish' data-cadd='{id}'>+ строка</button></td><td class='sticky2'></td><td colspan='60'></td></tr>", { id: b.id });

    });
    // итоговая строка таблицы: подпись, «старт», ячейки недель (HTML из tds)
    var trow = function (cls, label, start, cells) { return tpl("<tr class='{c}'><td class='sticky'>{l}</td><td class='sticky2'>{s}</td>{!cells}</tr>", { c: cls, l: label, s: start, cells: cells }); };
    var grp = function (label, start) { return tpl("<tr class='blk'><td class='sticky'>{l}</td><td class='sticky2'>{s}</td><td colspan='60'></td></tr>", { l: label, s: start || "" }); };
    var plusFmt = { fmt: function (v) { return E.fmt(rnd(v), { plus: true }); } };
    if (!yr.archived) {
      var alert = state.settings.diffAlert;
      body += trow("tot sep", "В обращении (расчёт)", "старт " + E.fmt(rnd(r.start.obr)), tds(r.obr));
      body += trow("tot", "Факт (сумма счетов)", "", tds(r.fact, function () { return RO() ? "" : "click"; }, { attr: function (wk) { return tpl(" data-recon='{w}'", { w: wk.idx }); } }));
      body += trow("tot", "Расхождение", "", tds(r.diff, function (v) { return v !== null && v < alert ? "bad" : v > 0 ? "good" : ""; }, plusFmt));
      body += grp("Капитал", "старт");
      body += trow("minor", "в обращении € (факт, если внесён)", E.fmt(rnd(r.start.obr)), tds(r.base));
      E.CAPITAL_ROWS.forEach(function (cr) {
        body += trow("minor", "\u00A0\u00A0" + cr.name, E.fmt(rnd(r.start[cr.key])), tds(r.rows[cr.key]));
        // как в Google Таблице: после трёх строк накоплений — их итог
        if (cr.key === "cash") body += trow("tot", "накопления € итого", E.fmt(rnd((r.start.sav || 0) + (r.start.inv || 0) + (r.start.cash || 0))), tds(savTotal(r)));
      });
      body += trow("minor", "рубли в €", "", tds(r.rubEur));
      body += trow("tot", "Капитал €", E.fmt(rnd(r.startCap)), tds(r.cap.map(function (v, i) { return weeks[i].wim === 5 ? v : null; })));
      body += trow("minor", "изменение за неделю", "", tds(r.dweek, function (v) { return v > 0 ? "good" : ""; }, plusFmt));
      body += trow("tot", "изменение за месяц", "", tds(r.dmonth, function (v) { return v === null ? "" : v > 0 ? "good" : ""; }, plusFmt));
      // СЧЕТА и СВЕРКА НАКОПЛЕНИЙ — как в таблице: остатки по неделям, правятся прямо в ячейке
      var accs = state.accounts.slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); }).filter(function (a) { return !a.archived || Object.keys(yr.recon || {}).some(function (k) { return yr.recon[k][a.id]; }); });
      body += grp("Счета — остатки (сверка)");
      accs.forEach(function (a) {
        body += tpl("<tr class='acc'><td class='sticky' title='{n}'>{n}{!cur}{!info}</td><td class='sticky2'>{from}</td>", {
          n: a.name, cur: E.accCur(a) !== "EUR" ? tpl(" <span class='badge'>{c}</span>", { c: E.accCur(a) === "RUB" ? "₽" : "$" }) : "", info: a.kind === "info" ? " <span class='badge'>справка</span>" : "",
          from: a.countsFrom ? "с " + a.countsFrom.slice(8, 10) + "." + a.countsFrom.slice(5, 7) : "" });
        weeks.forEach(function (wk) {
          var e = ((yr.recon || {})[wk.idx] || {})[a.id], on = E.accountActive(a, wk);
          body += tpl("<td class='v manual {m}{n}{o}' data-acc='{id}' data-w='{w}' title='{t}'>{v}</td>", {
            m: wk.wim === 1 ? "mstart " : "", n: wk.idx === nowIdx ? "now " : "", o: on ? "" : "off ", id: a.id, w: wk.idx,
            t: e && e.expr && /[+\-*\/]/.test(String(e.expr).replace(/^-/, "")) ? "=" + numShow(e.expr) : "", v: e && e.cents !== null && e.cents !== undefined ? E.fmt(e.cents, { dec: 0 }) : "" });
        });
        body += "</tr>";
      });
      body += grp("Сверка накоплений", "остаток целиком");
      E.CAPITAL_ROWS.forEach(function (cr) {
        body += tpl("<tr class='minor'><td class='sticky'>{n}</td><td class='sticky2'></td>", { n: cr.name });
        weeks.forEach(function (wk) {
          var v = ((yr.savRecon || {})[wk.idx] || {})[cr.key];
          body += tpl("<td class='v manual {m}{n}' data-sr='{k}' data-w='{w}'>{v}</td>", { m: wk.wim === 1 ? "mstart " : "", n: wk.idx === nowIdx ? "now " : "", k: cr.key, w: wk.idx, v: v === undefined || v === null ? "" : E.fmt(v, { dec: 0 }) });
        });
        body += "</tr>";
      });
    } else {
      body += trow("tot sep", "Капитал на конец месяца", "", tds(weeks.map(function (wk) { return wk.wim === 5 ? r.capMonth[wk.month - 1] : null; })));
    }
    html += tpl("<div class='grid-wrap' id='gridWrap'><table class='g'><thead>{!h1}</tr>{!h2}</tr></thead><tbody>{!body}</tbody></table></div>", { h1: head1, h2: head2, body: body });
    $main.innerHTML = html;

    bindYearHead();
    var wrap = document.getElementById("gridWrap");
    var focusM = ui.gridFocusMonth; ui.gridFocusMonth = null;
    if (focusM === null || focusM === undefined) { if (ui.gridScroll && ui.gridScroll.y === y) { wrap.scrollLeft = ui.gridScroll.left; wrap.scrollTop = ui.gridScroll.top; focusM = -1; } else if (nowIdx >= 0) focusM = Math.floor(nowIdx / 5); }
    if (focusM >= 0) {
      // показать месяц целиком, сразу за закреплёнными столбцами
      var first = wrap.querySelectorAll("thead tr:nth-child(2) th")[2 + focusM * 5];
      var pinned = wrap.querySelector("thead .sticky").offsetWidth + (wrap.querySelector("thead .sticky2").offsetWidth || 0);
      if (first) wrap.scrollLeft = Math.max(0, first.getBoundingClientRect().left - wrap.getBoundingClientRect().left - pinned);
    }
    wrap.addEventListener("scroll", function () { ui.gridScroll = { y: y, left: wrap.scrollLeft, top: wrap.scrollTop }; });
    wrap.addEventListener("click", function (e) {
      var ad = e.target.closest("[data-cadd]");
      if (ad) { addPlanRow(ad.dataset.cadd); return; }
      var tg = e.target.closest("[data-blk]");
      if (tg) { ui.planOpen[tg.dataset.blk] = !ui.planOpen[tg.dataset.blk]; render(); return; }
      var td = e.target.closest("td");
      if (!td) return;
      if (td.dataset.cname && !ro) { Settings.catEditSheet(td.dataset.cname); return; }
      if (td.dataset.recon !== undefined && !RO()) { ui.recWeek = { year: y, week: Number(td.dataset.recon) }; location.hash = "#recon"; return; }
      if (td.dataset.rules && !RO()) { ui.recYear = y; location.hash = "#recurring"; return; }
      if (ro || td.querySelector("input")) return;
      if (td.dataset.c !== undefined || td.dataset.acc !== undefined || td.dataset.sr !== undefined) ui.gridCursor = cellSel(td);
      if (td.dataset.c !== undefined) inlineEdit(td, y);
      else if (td.dataset.acc !== undefined || td.dataset.sr !== undefined) inlineEditRecon(td, y);
    });
    // клавиатура: одна остановка Tab на всю таблицу, дальше стрелки; Enter или F2 — изменить ячейку, Escape — выйти из правки
    if (!ro) {
      var gcells = wrap.querySelectorAll("td[data-c],td[data-acc],td[data-sr]");
      gcells.forEach(function (c) { c.tabIndex = -1; });
      var gstart = (ui.gridCursor && wrap.querySelector(ui.gridCursor)) || wrap.querySelector("td.now[data-c],td.now[data-acc],td.now[data-sr]") || gcells[0];
      if (gstart) { gstart.tabIndex = 0; if (ui.gridCursor && !ui.gridFocus) gstart.focus({ preventScroll: true }); }
      ui.gridCursor = null;
      wrap.addEventListener("keydown", function (e) {
        var td = e.target; if (!td.matches || !td.matches("td[data-c],td[data-acc],td[data-sr]")) return;
        var nx = null;
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") nx = gridNext(td, "Tab", e.key === "ArrowLeft");
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") nx = gridNext(td, "Enter", e.key === "ArrowUp");
        else if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); ui.gridCursor = cellSel(td); if (td.dataset.c !== undefined) inlineEdit(td, y); else inlineEditRecon(td, y); return; }
        else return;
        e.preventDefault();
        if (!nx) return;
        td.tabIndex = -1; nx.tabIndex = 0; nx.focus(); nx.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    }
    // переход клавишами: после сохранения открыть следующую ячейку
    var fc = ui.gridFocus; ui.gridFocus = null;
    if (fc && !ro) { var t = wrap.querySelector(fc); if (t) { if (t.dataset.c !== undefined) inlineEdit(t, y); else inlineEditRecon(t, y); } }
  };

  // соседняя редактируемая ячейка: Enter — вниз, Tab — вправо, Shift+Tab — влево, Shift+Enter — вверх
  function gridNext(td, key, shift) {
    var w = Number(td.dataset.w), tr = td.parentElement, editable = function (x) { return x && (x.dataset.c !== undefined || x.dataset.acc !== undefined || x.dataset.sr !== undefined); };
    if (key === "Tab") {
      var sib = shift ? td.previousElementSibling : td.nextElementSibling;
      return editable(sib) ? sib : null;
    }
    var row = shift ? tr.previousElementSibling : tr.nextElementSibling;
    while (row) {
      var cand = row.querySelector("td[data-w='" + w + "']");
      if (editable(cand)) return cand;
      row = shift ? row.previousElementSibling : row.nextElementSibling;
    }
    return null;
  }
  function cellSel(td) {
    var a = td.dataset.c !== undefined ? "data-c='" + td.dataset.c + "'" : td.dataset.acc !== undefined ? "data-acc='" + td.dataset.acc + "'" : "data-sr='" + td.dataset.sr + "'"; // esc-ok: CSS-селектор, id из своих данных
    return "td[" + a + "][data-w='" + td.dataset.w + "']"; // esc-ok: CSS-селектор
  }
  // общая логика клавиш для ячейки; save() → true, если данные поменялись (тогда таблица перерисуется)
  function bindCellKeys(td, inp, y, finish) {
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        var nx = gridNext(td, e.key, e.shiftKey);
        if (nx) ui.gridFocus = cellSel(nx);
        var changedIt = finish(true);
        if (!changedIt && nx) { ui.gridFocus = null; if (nx.dataset.c !== undefined) inlineEdit(nx, y); else inlineEditRecon(nx, y); }
      } else if (e.key === "Escape") { ui.gridFocus = null; finish(false); td.focus(); }
    });
  }
  // остаток счёта или сверка накоплений прямо в таблице
  function inlineEditRecon(td, y) {
    var yr = state.years[y], w = Number(td.dataset.w), isAcc = td.dataset.acc !== undefined, id = isAcc ? td.dataset.acc : td.dataset.sr;
    var cur = isAcc ? ((yr.recon || {})[w] || {})[id] : ((yr.savRecon || {})[w] || {})[id];
    var shown = numShow(isAcc ? (cur ? cur.expr || String(cur.cents / 100) : "") : (cur === undefined || cur === null ? "" : String(cur / 100)));
    var old = td.innerHTML;
    td.innerHTML = tpl("<input type='text' inputmode='decimal' value='{v}' aria-label='Остаток на счёте'>", { v: shown });
    var inp = td.querySelector("input"), done = false;
    inp.focus(); inp.select();
    function finish(saveIt) {
      if (done) return false; done = true;
      var v = inp.value.trim();
      if (!saveIt || v === shown) { td.innerHTML = old; return false; }
      var cents = null;
      if (v !== "") { try { cents = E.exprCents(v); } catch (err) { toast("Ошибка в формуле: " + err.message); td.innerHTML = old; return false; } }
      if (isAcc) {
        yr.recon = yr.recon || {};
        if (cents === null) { if (yr.recon[w]) { delete yr.recon[w][id]; if (!Object.keys(yr.recon[w]).length) delete yr.recon[w]; } }
        else { yr.recon[w] = yr.recon[w] || {}; yr.recon[w][id] = { expr: v, cents: cents }; }
      } else {
        yr.savRecon = yr.savRecon || {};
        if (cents === null) { if (yr.savRecon[w]) { delete yr.savRecon[w][id]; if (!Object.keys(yr.savRecon[w]).length) delete yr.savRecon[w]; } }
        else { yr.savRecon[w] = yr.savRecon[w] || {}; yr.savRecon[w][id] = cents; }
      }
      changed(false, isAcc ? "Остаток сохранён" : "Сверка накоплений сохранена");
      return true;
    }
    bindCellKeys(td, inp, y, finish);
    inp.addEventListener("blur", function () { setTimeout(function () { finish(true); }, 0); });
  }

  // накопления € итого по неделям: накопительный счёт + инвестиции + отложенная наличка
  function savTotal(r) { return r.rows.sav.map(function (v, i) { return v === null || v === undefined ? null : (v || 0) + (r.rows.inv[i] || 0) + (r.rows.cash[i] || 0); }); }
  function bindYearHead() {
    bindYearChips(function (yy) { ui.gridYear = yy; if (!state.years[yy].archived) ui.year = yy; render(); });
    var ysel = $main.querySelector("#yearSel");
    if (ysel) ysel.onchange = function () { var v = ysel.value; if (v === "new") { ysel.value = ui.gridYear || ui.year; return newYearDialog(); } ui.gridYear = v; if (!state.years[v].archived) ui.year = v; render(); };
    var ny = $main.querySelector("[data-act=newyear]");
    if (ny) ny.onclick = newYearDialog;
    $main.querySelectorAll("[data-mode]").forEach(function (b) { b.onclick = function () { ui.gridMode = b.dataset.mode; ui.gridScroll = null; render(); }; });
  }
  // «Год» по месяцам: суммы недель месяца; нажатие на месяц открывает его недели
  function yearByMonths(y, r, html) {
    var nowM = (function () { var t = E.weekOfDate(E.todayISO()); return t && String(t.year) === String(y) ? Math.floor(t.idx / 5) : -1; })();
    var mon = E.monthly(state, y).months;
    function mth(m) { return (m === nowM ? " now" : ""); }
    // ячейка месяца: dm — с data-m (нажатие открывает недели этого месяца)
    var mc = function (m, v, dm) { return tpl("<td class='v ro{n}'{!dm}>{v}</td>", { n: mth(m), dm: dm ? tpl(" data-m='{m}'", { m: m }) : "", v: v }); };
    var head = tpl("<tr><th class='sticky'><span class='gm-arrows'><button type='button' class='gm-a' data-gs='-1' aria-label='Раньше'>‹</button><button type='button' class='gm-a' data-gs='1' aria-label='Позже'>›</button></span></th>{!ths}<th>Год</th></tr>",
      { ths: E.MONTHS_SHORT.map(function (n, m) { return tpl("<th class='mhead{now}' data-m='{m}'>{n}</th>", { now: mth(m), m: m, n: n }); }).join("") });
    var body = "", openB = ui.planOpen || (ui.planOpen = { income: true, base: true });
    E.BLOCKS.forEach(function (b) {
      var list = cats().filter(function (c) { return c.block === b.id && (!c.archived || r.cells[c.id].some(Boolean)); });
      if (!list.length) return;
      var rowsHtml = "", bsum = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], btot = 0;
      list.forEach(function (c) {
        var tot = 0, tds = "";
        for (var m = 0; m < 12; m++) {
          var sum = 0, any = false;
          for (var w = m * 5; w < m * 5 + 5; w++) { var cell = r.cells[c.id][w]; if (cell) { sum += cell.cents; any = true; } }
          tot += sum; if (c.currency !== "RUB") bsum[m] += sum;
          tds += mc(m, any ? E.fmt(rnd(sum)) : "", true);
        }
        if (c.currency !== "RUB") btot += tot;
        rowsHtml += tpl("<tr><td class='sticky{cn}' title='{n}'{!dc}>{n}{rub}</td>{!tds}<td class='v ro'><b>{tot}</b></td></tr>", {
          cn: RO() ? "" : " cname", n: c.name, dc: RO() ? "" : tpl(" data-cname='{id}'", { id: c.id }), rub: c.currency === "RUB" && c.name.indexOf("₽") < 0 ? " (₽)" : "", tds: tds, tot: E.fmt(rnd(tot)) });
      });
      var isOpen = !!openB[b.id];
      body += tpl("<tr class='blk tog' data-blk='{id}'><td class='sticky'>{arr}{n}</td>{!cells}<td class='v ro'>{tot}</td></tr>", {
        id: b.id, arr: isOpen ? "▾ " : "▸ ", n: b.name, cells: bsum.map(function (v, m) { return mc(m, v ? E.fmt(rnd(v)) : ""); }).join(""), tot: btot ? E.fmt(rnd(btot)) : "" });
      if (isOpen) body += rowsHtml + (RO() ? "" : tpl("<tr class='add-row'><td class='sticky'><button type='button' class='linkish' data-cadd='{id}'>+ строка</button></td><td colspan='13'></td></tr>", { id: b.id }));
    });
    function totRow(label, key, cls) {
      var t = 0, cells = mon.map(function (row, m) { var v = row[key]; if (v !== null) t += v; return mc(m, v === null ? "" : E.fmt(rnd(v)), true); }).join("");
      return tpl("<tr class='{c}'><td class='sticky'>{l}</td>{!cells}<td class='v ro'>{!tot}</td></tr>", { c: cls || "tot", l: label, cells: cells, tot: key === "cap" ? "" : tpl("<b>{t}</b>", { t: E.fmt(rnd(t)) }) });
    }
    body += totRow("Доходы", "income", "tot sep") + totRow("Расходы", "total");
    var lastFact = function (m) { for (var w3 = m * 5 + 4; w3 >= m * 5; w3--) if (r.fact[w3] !== null && r.fact[w3] !== undefined) return r.fact[w3]; return null; };
    // строка подвала: подпись (HTML своего кода) и значение месяца
    var frow = function (label, val) { return tpl("<tr><td class='sticky'>{!l}</td>{!cells}<td></td></tr>", { l: label, cells: mon.map(function (row, m) { return mc(m, val(row, m)); }).join("") }); };
    var num = function (v) { return v === null || v === undefined ? "" : E.fmt(rnd(v)); };
    body += tpl("<tr class='tot'><td class='sticky'>По сверке</td>{!cells}<td></td></tr>", { cells: mon.map(function (row, m) { return mc(m, num(lastFact(m))); }).join("") });
    var savT = savTotal(r);
    var foot = frow("В обращении <button type='button' class='q-btn qd' data-explain='obr' aria-label='Что такое «в обращении»'>?</button><small class='foot-sub'>на конец месяца</small>", function (row, m) { return num(r.base[m * 5 + 4]); }) +
      // как в Google Таблице: капитал = в обращении + накопления + рубли по курсу
      frow("Накопления", function (row, m) { return num(savT[m * 5 + 4]); }) +
      (r.rubEur.some(function (v) { return v; }) ? frow("Рубли в €", function (row, m) { var v = r.rubEur[m * 5 + 4]; return v ? E.fmt(rnd(v)) : ""; }) : "") +
      frow("Капитал<small class='foot-sub'>на конец месяца</small>", function (row) { return num(row.cap); });
    html += tpl("<div class='grid-wrap' id='gridWrap'><table class='g g-months'><thead>{!head}</thead><tbody>{!body}</tbody><tfoot class='plan-foot'>{!foot}</tfoot></table></div>", { head: head, body: body, foot: foot });
    $main.innerHTML = html;
    bindYearHead();
    var wrap = document.getElementById("gridWrap");
    if (nowM > 0) requestAnimationFrame(function () {
      var th = wrap.querySelectorAll("thead th")[1 + nowM], pin = wrap.querySelector("thead .sticky").offsetWidth;
      if (th) wrap.scrollLeft = Math.max(0, th.getBoundingClientRect().left - wrap.getBoundingClientRect().left - pin - th.offsetWidth);
    });
    wrap.addEventListener("click", function (e) {
      var gs = e.target.closest("[data-gs]");
      if (gs) { var th1 = wrap.querySelector("thead th.mhead"); wrap.scrollBy({ left: Number(gs.dataset.gs) * 3 * (th1 ? th1.offsetWidth : 70), behavior: "smooth" }); return; }
      var qx = e.target.closest("[data-explain]"); if (qx) { Help.explain(qx.dataset.explain); return; }
      var tg = e.target.closest("[data-blk]");
      if (tg) { ui.planOpen[tg.dataset.blk] = !ui.planOpen[tg.dataset.blk]; render(); return; }
      var cn = e.target.closest("[data-cname]"); if (cn) { Settings.catEditSheet(cn.dataset.cname); return; }
      var ad = e.target.closest("[data-cadd]"); if (ad) { addPlanRow(ad.dataset.cadd); return; }
      var el = e.target.closest("[data-m]");
      if (!el) return;
      ui.gridMode = "weeks"; ui.gridFocusMonth = Number(el.dataset.m); ui.gridScroll = null; render();
    });
  }

  function inlineEdit(td, y) {
    var catId = td.dataset.c, w = Number(td.dataset.w);
    var entry = (state.years[y].entries[catId] || {})[w];
    var cell = E.compute(state, y).cells[catId][w];
    var old = td.innerHTML;
    var catObj = state.categories.find(function (x) { return x.id === catId; }) || {}, isExp = catObj.block !== "income";
    var shown = entry ? entry.expr : cell ? String(cell.cents / 100) : "";
    var initial = numShow(isExp ? absIfPlain(shown) : shown);
    td.innerHTML = tpl("<input type='text' inputmode='decimal' value='{v}' aria-label='Сумма; в расходах минус ставить не нужно'>", { v: initial });
    var inp = td.querySelector("input"), done = false;
    inp.focus(); inp.select();
    function finish(saveIt) {
      if (done) return false; done = true;
      if (!saveIt) { td.innerHTML = old; return false; }
      var v = signFor(catId, inp.value.trim());
      var prev = entry ? entry.expr : cell ? String(cell.cents / 100) : "";
      if (inp.value.trim() === initial.trim() || v === prev) { td.innerHTML = old; return false; }
      try { E.exprCents(v); } catch (err) { toast("Ошибка в формуле: " + err.message); td.innerHTML = old; return false; }
      if (v === "" && !entry) { td.innerHTML = old; return false; }
      E.setEntry(state, y, catId, String(w), v);
      changed();
      return true;
    }
    // быстрые действия под ячейкой: перенести на следующую неделю, «не было», полное окно
    var acts = null;
    if (cell && cell.cents) {
      var wrapEl = td.closest(".grid-wrap"), tr0 = td.getBoundingClientRect(), wr0 = wrapEl.getBoundingClientRect();
      acts = document.createElement("div"); acts.className = "cell-acts";
      acts.innerHTML = "<button type='button' data-ca='next'>→ след. неделя</button><button type='button' data-ca='skip'>Не было</button><button type='button' data-ca='more'>Ещё…</button>";
      acts.style.left = Math.max(0, tr0.left - wr0.left + wrapEl.scrollLeft) + "px"; acts.style.top = (tr0.bottom - wr0.top + wrapEl.scrollTop + 2) + "px";
      wrapEl.appendChild(acts);
      acts.querySelectorAll("button").forEach(function (b) {
        b.onmousedown = function (e) { e.preventDefault(); };
        b.onclick = function (e) {
          e.stopPropagation(); finish(false);
          var a = b.dataset.ca;
          if (a === "more") { editCell(y, catId, w); return; }
          if (a === "skip") { skipCell(y, catId, w); changed(); toast("«" + catName(catId) + "»: не было, " + shortWeek(y, w)); return; }
          var res = moveCell(y, catId, w, E.addDays(E.genWeeks(Number(y))[w].to, 1));
          if (!res || res.err) { toast(res && res.err ? res.err : "Не получилось перенести"); return; }
          changed(); toast("«" + catName(catId) + "» → " + shortWeek(res.year, res.week));
        };
      });
    }
    var finish0 = finish;
    finish = function (s) { if (acts && acts.parentNode) acts.parentNode.removeChild(acts); return finish0(s); };
    bindCellKeys(td, inp, y, finish);
    inp.addEventListener("blur", function () { setTimeout(function () { finish(true); }, 0); });
    inp.addEventListener("dblclick", function () { finish(false); editCell(y, catId, w); });
  }

  function newYearDialog() {
    var last = Number(activeYears()[activeYears().length - 1] || new Date().getFullYear() - 1), ny = last + 1;
    modal(tpl("<div class='m-body'><h2>Новый год: {ny}</h2><p class='muted'>Старт года — остатки на 31.12.{last} по каждой строке капитала (считаются сами).</p>" +
      "<label class='row'><input type='checkbox' id='nyRec' checked> Перенести регулярные траты</label>" +
      "<label class='row' style='margin-top:6px'><input type='checkbox' id='nyOne'> Скопировать разовые траты «как в прошлом году» в те же недели</label></div>" +
      "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Создать {ny}</button></div>", { ny: ny, last: last }), function (m) {
      m.querySelector("[data-act=cancel]").onclick = closeModal;
      m.querySelector("[data-act=ok]").onclick = function () {
        E.createYear(state, ny, { copyRecurring: m.querySelector("#nyRec").checked, copyOneOff: m.querySelector("#nyOne").checked });
        ui.gridYear = String(ny); closeModal(); changed(); toast("Год " + ny + " создан");
      };
    });
  }

  // ===== СВЕРКА: один экран, три шага — 1 Остатки · 2 Проверка · 3 Итог =====
  // ui.recStep: 1 | 2 | 3; пусто — сам решает: неделя уже сверена → итог, нет → остатки.
  // Входы: квадратики на Главной и «История сверок» → 3; «+ → Сверка», «Что сделать» → по правилу выше.
  routes.recon = function () {
    var sel = ui.recWeek || finishedWeek() || defaultYearWeek();
    if (state.years[sel.year].archived) sel = defaultYearWeek();
    // незаконченная сверка этой недели: работаем с черновиком (ADR-2)
    useDraft(sel.year, sel.week);
    var draft = inDraft(), editing = draft && myState.recDraft.editing;
    var y = sel.year, w = sel.week, yr = state.years[y], r = E.compute(state, y), wk = r.weeks[w];
    yr.recon = yr.recon || {}; yr.savRecon = yr.savRecon || {};
    var rec = yr.recon[w] || {}, srec = yr.savRecon[w] || {}, hasRec = Object.keys(rec).length > 0;
    var step = ui.recStep || (draft ? 2 : hasRec ? 3 : 1);
    if (step === 2 && !hasRec) step = 1;
    if (draft && step === 3) step = 2; // итог — только после «Завершить»
    ui.recStep = step; ui.recWeek = { year: y, week: w };
    var lim = state.settings.diffAlert || -5000, fwk = finishedWeek();
    // последний известный остаток по счёту — только подпись «было …», в поле не подставляется
    function lastKnown(accId) {
      for (var i = w - 1; i >= 0; i--) if (yr.recon[i] && yr.recon[i][accId]) return yr.recon[i][accId].cents;
      return null;
    }
    var accs = state.accounts.filter(function (a) { return !a.archived; }).sort(function (a, b) { return a.sort - b.sort; });
    var flow = accs.filter(function (a) { return a.kind !== "info"; }), info = accs.filter(function (a) { return a.kind === "info"; });
    function nums(f, calc, d) {
      return tpl("<div class='rc-nums'><div><span>на счетах</span><b>{f}</b></div><div><span>по плану</span><b>{c}</b></div>" +
        "<div><span>разница<button type='button' class='q-btn' data-explain='diff' aria-label='Что такое разница'>?</button></span><b class='{cls}'>{d}</b></div></div>", {
          f: f === null ? "—" : eur(rnd(f), { dec: 0 }), c: eur(rnd(calc), { dec: 0 }), cls: d === null ? "" : d < lim ? "neg" : d >= 0 ? "pos" : "", d: d === null ? "—" : eur(rnd(d), { dec: 0, plus: true }) });
    }
    // остатки по счетам выбранной недели: было (прошлая сверка) → стало
    function balancesHtml() {
      var rows = "", tot = 0, totWas = 0, wasOk = true;
      flow.concat(info).forEach(function (a) {
        var e = rec[a.id]; if (!e) return;
        var was = lastKnown(a.id), cf = a.kind === "cash_flow" && E.accountActive(a, wk), ac = E.accCur(a) === "RUB" ? "₽" : E.accCur(a) === "USD" ? "$" : undefined;
        if (cf) { tot += E.accToEur(state, a, e.cents); if (was === null) wasOk = false; else totWas += E.accToEur(state, a, was); }
        rows += tpl("<tr{!m}><td>{n}</td><td class='n'>{was}</td><td class='n'><b>{now}</b></td><td class='n {c}'>{d}</td></tr>", {
          m: cf ? "" : " class='muted'", n: a.name.replace(/\s*\((?:NET|в ФАКТ)[^)]*\)/i, ""), was: was === null ? "—" : E.fmt(was, { dec: 0, cur: ac }), now: E.fmt(e.cents, { dec: 0, cur: ac }),
          c: was === null ? "" : tone(e.cents - was), d: was === null ? "" : E.fmt(e.cents - was, { dec: 0, plus: true, cur: ac }) });
      });
      rows += tpl("<tr class='rs-tot'><td>в обращении, €</td><td class='n'>{was}</td><td class='n'><b>{now}</b></td><td class='n {c}'>{d}</td></tr>", {
        was: wasOk ? E.fmt(rnd(totWas), { dec: 0 }) : "—", now: E.fmt(rnd(tot), { dec: 0 }), c: wasOk ? tone(rnd(tot - totWas)) : "", d: wasOk ? E.fmt(rnd(tot - totWas), { dec: 0, plus: true }) : "" });
      // накопления и инвестиции: «было» — расчёт на конец прошлой недели (прошлая сверка + переводы по плану)
      var savKeys = E.CAPITAL_ROWS.filter(function (cr) { return srec[cr.key] !== undefined; });
      if (savKeys.length) rows += "<tr class='rs-grp'><td colspan='4'>Накопления и инвестиции</td></tr>";
      savKeys.forEach(function (cr) {
        var was = w > 0 ? r.rows[cr.key][w - 1] : (r.start ? r.start[cr.key] : null), now = srec[cr.key];
        was = was === undefined ? null : Math.round(was);
        rows += tpl("<tr><td>{n}</td><td class='n'>{was}</td><td class='n'><b>{now}</b></td><td class='n {c}'>{d}</td></tr>", {
          n: cr.name, was: was === null ? "—" : E.fmt(was, { dec: 0 }), now: E.fmt(now, { dec: 0 }), c: was === null ? "" : tone(now - was), d: was === null ? "" : E.fmt(now - was, { dec: 0, plus: true }) });
      });
      return tpl("<details class='rs-bal'{!o}><summary>Остатки по счетам</summary><div class='tbl-wrap'><table class='t'><thead><tr><th>Счёт</th><th class='n'>было</th><th class='n'>стало</th><th class='n'>±</th></tr></thead><tbody>{!rows}</tbody></table></div></details>", { o: ui.recBalOpen ? " open" : "", rows: rows });
    }
    var back = backHref("recon", "home"), realY = myState.years[y] || {}, realR = inDraft() ? E.compute(myState, y) : r;
    var html = tpl("<div class='rs'><div class='rc-top'><a class='back-link' href='{href}'>‹ {label}</a>{!hist}</div>" +
      "<div class='rc-title'><h1>Сверка за {wk}</h1><select id='recW' class='rc-wsel' aria-label='Другая неделя'>{!wopts}</select></div><ol class='rs-steps'>{!steps}</ol>{!draft}", {
        href: back[0], label: back[1], wk: shortWeek(y, w),
        hist: step !== 3 && !draft ? "<button type='button' class='linkish' data-step='3'>История сверок ›</button>" : "",
        // ✓ — только сверки, которые уже в бюджете; внутри сверки state — черновик, поэтому смотрим в myState
        wopts: weekOpts(y, w, function (i) { return draftOf(y, i) ? "· черновик" : !!((realY.recon || {})[i]) && realR.fact[i] !== null; }),
        steps: [[1, "Остатки"], [2, "Проверка"], [3, "Итог"]].map(function (s) {
          var can = (s[0] !== 2 || hasRec) && !(draft && s[0] === 3);
          return tpl("<li><button type='button' class='rs-step{c}' data-step='{n}'{!dis}{!cur}><span class='rs-n'>{n}</span>{l}</button></li>", {
            c: s[0] === step ? " on" : s[0] < step ? " done" : "", n: s[0], l: s[1], dis: can ? "" : " disabled", cur: s[0] === step ? " aria-current='step'" : "" });
        }).join(""),
        draft: draft ? tpl("<div class='rc-draft small'><span>{t} после «Завершить».</span><button type='button' class='linkish' id='recDrop'>{b}</button></div>", {
          t: editing ? "Правка сверки — сохранится" : "Черновик — в бюджет попадёт", b: editing ? "Не сохранять правку" : "Удалить черновик" }) : "" });

    // ---- шаг 1: остатки ----
    if (step === 1) {
      var accRow = function (a) {
        var active = E.accountActive(a, wk), e = rec[a.id], lk = lastKnown(a.id);
        var isCash = /налич/i.test(a.name) && Cash.cashEurTotal() !== null && !/₽|руб/i.test(a.name) && E.accCur(a) === "EUR";
        var acur = E.accCur(a) === "RUB" ? "₽" : E.accCur(a) === "USD" ? "$" : "";
        var from = a.countsFrom ? "считается с " + (E.MONTHS_GEN[Number(a.countsFrom.slice(5, 7)) - 1] || a.countsFrom) : "";
        var lkT = lk !== null ? E.fmt(lk, { dec: 0, cur: acur || undefined }) : null;
        var sub = a.kind === "info" ? "для справки" + (lkT ? " · было " + lkT : "") : !active ? from : (lkT ? "было " + lkT : "") + (acur ? (lkT ? " · " : "") + "в " + acur + ", по курсу" : "");
        var dis = a.kind === "cash_flow" && !active ? " disabled" : "";
        // R02: «было 3 570» — кнопка «вписать как было». Значение видно в поле, подтверждает сама кнопкой «Дальше»
        var wasBtn = lkT && active && a.kind !== "info" && !RO() ? tpl("<button type='button' class='linkish rc-was' data-wasfill='{id}' data-v='{v}' aria-label='Вписать как было: {t}'>было {t}</button>", { id: a.id, v: String(lk / 100).replace(".", ","), t: lkT }) : "";
        if (wasBtn) sub = acur ? " · в " + acur + ", по курсу" : "";
        return tpl("<div class='rcl-row{info}'><label for='rf_{id}' class='rc-name'><b>{n}{cur}</b><small>{!was}{sub}{!cash}</small></label>" +
          "<span class='rc-inp'><span class='rc-ops'><button type='button' class='rc-sign' data-op='-' aria-label='Вставить «−» в сумму'{!dis}>−</button><button type='button' class='rc-sign' data-op='+' aria-label='Вставить «+» в сумму'{!dis}>+</button></span>" +
          "<input id='rf_{id}' type='text' inputmode='decimal' name='{id}' value='{v}' placeholder=''{!dis}></span></div>", {
            info: a.kind === "info" ? " info" : "", id: a.id, n: a.name.replace(/\s*\((?:NET|в ФАКТ)[^)]*\)/i, ""), cur: acur && a.name.indexOf(acur) < 0 ? " " + acur : "", sub: sub, dis: dis, v: e ? numShow(e.expr) : "",
            was: wasBtn,
            cash: isCash ? tpl("{sep}<button type='button' class='linkish' data-cashfill='{id}'>в «Наличке» {sum}</button>", { sep: sub || wasBtn ? " · " : "", id: a.id, sum: E.fmt(Cash.cashEurTotal(), { dec: 0 }) }) : "" });
      };
      html += "<p class='small muted rc-hint'>Впиши остатки на счетах. Можно формулой: 2000+200</p>";
      if (!weekDone(y, w)) html += "<div class='hint' style='margin:0 0 12px'>Неделя ещё идёт — траты могут прийти до её конца." +
        (fwk && !(fwk.year === y && fwk.week === w) ? tpl(" <button class='btn sm' id='toDone'>К неделе {w}</button>", { w: shortWeek(fwk.year, fwk.week) }) : "") + "</div>";
      // «Прочее (по таблице)» — служебный счёт из импорта: только в неделях, где в нём уже есть сумма
      html += tpl("<form id='recForm' class='card rc-list'>{!rows}</form>", { rows: flow.filter(function (a) { return !/\(по таблице\)/i.test(a.name) || rec[a.id]; }).map(accRow).join("") });
      var savOpen = Object.keys(srec).length > 0;
      html += tpl("<details class='rc-sav'{!o}><summary>Накопления, инвестиции, рубли — по желанию</summary><p class='small muted'>Весь остаток, не изменение — он заменит расчёт.</p>{!info}<form id='savForm' class='form-grid'>", {
        o: savOpen ? " open" : "", info: info.length ? tpl("<form id='recInfo' class='card rc-list'>{!rows}</form>", { rows: info.map(accRow).join("") }) : "" });
      E.CAPITAL_ROWS.forEach(function (cr) {
        if ((cr.key === "card_rub" && r.rubInObr && r.rubInObr[w]) || (cr.key === "usd" && r.usdInObr && r.usdInObr[w])) return; // уже в обращении
        html += tpl("<label class='f'><span>{n} <small class='muted'>по расчёту {calc}</small></span><input type='text' inputmode='decimal' name='{k}' value='{v}' placeholder=''></label>", {
          n: cr.name, calc: E.fmt(rnd(r.rows[cr.key][w]), { dec: 0 }), k: cr.key, v: srec[cr.key] !== undefined ? srec[cr.key] / 100 : "" });
      });
      html += "</form></details>" + (hasRec ? "<button class='linkish rc-clear' id='recClear'>Очистить неделю</button>" : "") +
        "<div class='rc-bar'><div id='recResult'></div><button class='btn primary rc-save' id='recNext'>Дальше</button></div>";
    }

    // ---- шаг 2: проверка — ветка по разнице ----
    if (step === 2) {
      var d = r.diff[w], before = ui.recBefore && ui.recBefore.key === y + ":" + w ? ui.recBefore.diff : null;
      html += tpl("<div class='card rs-sum'>{!nums}{!was}</div>", { nums: nums(r.fact[w], r.obr[w], d),
        was: before !== null && before !== d ? tpl("<p class='small muted rs-was'>до правок {v}</p>", { v: eur(rnd(before), { dec: 0, plus: true }) }) : "" });
      if (d >= lim && d <= -lim) {
        html += tpl("<div class='card rs-ok'><h2>Всё сходится</h2><p class='small muted'>Разница {d} — в пределах {lim}.</p></div>", { d: eur(rnd(d), { dec: 0, plus: true }), lim: eur(rnd(-lim), { dec: 0 }) });
        // список плановых трат остаётся: после переноса одной можно проверить остальные
        var uc = unspentCard(y, w, "Что из плана не потратила?");
        if (uc) html += tpl("<details class='rs-more'{!o}><summary>Проверить траты плана этой недели</summary>{!uc}</details>", { o: ui.recUnspOpen ? " open" : "", uc: uc });
      } else if (d > 0) {
        html += tpl("<p class='rs-lead'>Больше плана на {d}. Что-то не потратила или пришёл доход?</p>{!a}{!b}", { d: eur(rnd(d), { dec: 0 }), a: unspentCard(y, w, "Что из плана не потратила?"), b: phraseCard("income") });
      } else {
        html += tpl("<p class='rs-lead'>Меньше плана на {d}. Проверь выписку за неделю.</p>{!a}{!b}{!c}", { d: eur(rnd(-d), { dec: 0 }), a: cashNotInPlanCard(y, w), b: phraseCard("spend"), c: unspentCard(y, w, "А что из плана не потратила?") });
      }
      html += "<div class='rs-foot'><button type='button' class='btn ghost' data-step='1'>‹ к остаткам</button><button type='button' class='btn primary' id='recDone'>Завершить</button></div>";
    }

    // ---- шаг 3: итог, карта сверок за год, последние сверки ----
    if (step === 3) {
      var left = "", right = "";
      if (hasRec) {
        var d3 = r.diff[w], b3 = ui.recBefore && ui.recBefore.key === y + ":" + w ? ui.recBefore.diff : null;
        left += tpl("<div class='card rs-sum'><div class='rs-sumh'><h2>Итог недели</h2><span class='small muted'>{st}</span></div>{!nums}{!was}" +
          "<button type='button' class='rs-cap' data-capb='1'><span>Капитал на {to}</span><b>{cap}</b><small>{!dw} за неделю</small><span class='rs-cap-arr' aria-hidden='true'>›</span></button>{!why}{!bal}<button type='button' class='btn sm rs-fix' data-step='1'>Поправить остатки</button></div>", {
            st: Home.RS_TEXT[Home.reconStatus(y, w, r)], to: dayGen(r.weeks[w].to),
            // «+223 € к плану», а капитал «−261 €» — не противоречие: план предполагал траты (F18)
            why: d3 !== null && d3 > 0 && r.dweek[w] < 0 ? "<p class='small muted rs-why'>Денег больше плана, а капитал за неделю меньше — это траты по плану, а не потеря.</p>" : "", nums: nums(r.fact[w], r.obr[w], d3), cap: eur(rnd(r.cap[w]), { dec: 0 }), dw: trendHtml(r.dweek[w]), bal: balancesHtml(),
            was: b3 !== null && b3 !== d3 ? tpl("<p class='small muted rs-was'>до правок {a} → после {b}</p>", { a: eur(rnd(b3), { dec: 0, plus: true }), b: eur(rnd(d3), { dec: 0, plus: true }) }) : "" });
      } else if (weekDone(y, w)) {
        left += "<div class='card rs-sum'><h2>Сверки за эту неделю нет</h2><button type='button' class='btn primary' data-step='1'>Сделать сверку</button></div>";
      } else {
        left += "<div class='card rs-sum'><h2>Неделя ещё идёт</h2><div class='row'><button type='button' class='btn primary' data-step='1'>Сверить сейчас</button>" +
          (fwk && !(fwk.year === y && fwk.week === w) ? tpl("<button type='button' class='btn' id='toDone'>К неделе {w}</button>", { w: shortWeek(fwk.year, fwk.week) }) : "") + "</div></div>";
      }
      left += tpl("<div class='card rs-cal'><h2>Сверки {y}</h2>{!cal}</div>", { y: y, cal: Home.reconCalendar(y, false, w) });
      var reps = RO() ? [] : repeatsFor(y);
      if (reps.length) left += tpl("<div class='card rc-help repeat-card'><button type='button' class='rp-x' id='rcRepNo' aria-label='Не предлагать' title='Не предлагать'>×</button><h2>Нашла {n} {w}</h2><p class='small muted' style='margin-top:-6px'>Если сделать их регулярными, план следующего года заполнится сам.</p><a class='btn' href='#recurring'>Посмотреть в «Регулярных» ›</a></div>",
        { n: reps.length, w: plural(reps.length, "повторяющуюся трату", "повторяющиеся траты", "повторяющихся трат") });
      var hist = [];
      activeYears().forEach(function (yy) {
        var rr = E.compute(state, yy);
        rr.fact.forEach(function (f, i) { if (f !== null) hist.push({ y: yy, i: i, f: f, o: rr.obr[i], d: rr.diff[i] }); });
      });
      hist = hist.reverse().slice(0, 12);
      right += tpl("<div class='rc-histwrap'><h2>Последние сверки</h2><div class='tbl-wrap'><table class='t'><thead><tr><th>Неделя</th><th class='n'>Расчёт</th><th class='n'>Факт</th><th class='n'>Разница</th></tr></thead><tbody>{!rows}</tbody></table></div></div>", {
        rows: hist.length ? hist.map(function (h) {
          return tpl("<tr data-go='{y}:{i}' class='{on}' style='cursor:pointer'><td>{wk}</td><td class='n'>{o}</td><td class='n'>{f}</td><td class='n {c}'>{d}</td></tr>", {
            y: h.y, i: h.i, on: h.y === y && h.i === w ? "on" : "", wk: shortWeek(h.y, h.i), o: eur(rnd(h.o), { dec: 0 }), f: eur(rnd(h.f), { dec: 0 }), c: h.d < lim ? "neg" : "", d: eur(rnd(h.d), { dec: 0, plus: true }) });
        }).join("") : "<tr><td colspan='4' class='muted'>Сверок пока нет.</td></tr>" });
      html += tpl("<div class='rs-grid'><div class='rs-col'>{!l}</div><div class='rs-col'>{!r}</div></div>", { l: left, r: right });
    }
    html += "</div>";
    $main.innerHTML = html;

    // ---- общее ----
    $main.querySelectorAll("[data-step]").forEach(function (b) { b.onclick = function () { ui.recStep = Number(b.dataset.step); render(); window.scrollTo(0, 0); }; });
    $main.querySelector("#recW").onchange = function (e) { ui.recWeek = { year: y, week: Number(e.target.value) }; ui.recStep = step === 3 ? 3 : null; render(); };
    $main.querySelector(".rs").addEventListener("click", function (e) { var q = e.target.closest("[data-explain]"); if (q) Help.explain(q.dataset.explain); });
    var td = $main.querySelector("#toDone"); if (td) td.onclick = function () { ui.recWeek = fwk; ui.recStep = null; render(); };
    var rdp = $main.querySelector("#recDrop"); if (rdp) rdp.onclick = function () {
      askConfirm(editing ? "Не сохранять правку? Останется сверка, как была до неё." : "Удалить черновик сверки за " + shortWeek(y, w) + "? В бюджете ничего не поменяется.", editing ? "Не сохранять" : "Удалить черновик", function () {
        ui.recStep = null; discardDraft(); toast(editing ? "Правка не сохранена" : "Черновик удалён");
      });
    };
    var rrn = $main.querySelector("#rcRepNo"); if (rrn) rrn.onclick = function () { repeatsNo(y, repeatsFor(y)); changed(); toast("Больше не предлагаю"); };

    if (step === 1) {
      var liveResult = function () {
        var f = null, err = null;
        flow.forEach(function (a) {
          var inp = $main.querySelector("#recForm [name=" + a.id + "]");
          if (!inp || inp.disabled || a.kind !== "cash_flow" || !inp.value.trim()) return;
          if (/[-+−–*/(]\s*$/.test(inp.value)) return; // формулу ещё дописывают — не ругаемся
          try { f = (f || 0) + E.accToEur(state, a, E.exprCents(inp.value)); } catch (e) { err = a.name + ": " + e.message; }
        });
        var calc = r.obr[w], dd = f === null ? null : f - calc;
        $main.querySelector("#recResult").innerHTML = nums(f, calc, dd) + (err ? tpl("<div class='alert'>Ошибка в формуле — {e}</div>", { e: err }) : "");
      };
      $main.querySelectorAll("#recForm input").forEach(function (i) { i.addEventListener("input", liveResult); });
      // «−» и «+»: на цифровой клавиатуре телефона их нет — дописываем кнопкой (долг: −500, формула: 2000+200)
      $main.querySelectorAll("[data-op]").forEach(function (b) {
        b.onmousedown = function (e) { e.preventDefault(); }; // поле не теряет фокус, клавиатура не прячется
        b.onclick = function () {
          var inp = b.closest(".rc-inp").querySelector("input"), v = inp.value.replace(/\s+$/, "");
          inp.value = /[-+]$/.test(v) ? v.slice(0, -1) + b.dataset.op : v + b.dataset.op;
          inp.dispatchEvent(new Event("input")); inp.focus();
          try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* ок */ }
        };
      });
      $main.querySelectorAll("[data-wasfill]").forEach(function (b) { b.onclick = function () { var i = $main.querySelector("#recForm [name=" + b.dataset.wasfill + "]"); i.value = b.dataset.v; liveResult(); i.focus(); }; });
      $main.querySelectorAll("[data-cashfill]").forEach(function (b) { b.onclick = function () { var i = $main.querySelector("#recForm [name=" + b.dataset.cashfill + "]"); i.value = String(Cash.cashEurTotal() / 100).replace(".", ","); liveResult(); }; });
      liveResult();
      $main.querySelector("#recNext").onclick = function () {
        var nr = {}, ns = {};
        try {
          accs.forEach(function (a) {
            var inp = $main.querySelector("#recForm [name=" + a.id + "], #recInfo [name=" + a.id + "]");
            if (!inp || !inp.value.trim()) return;
            nr[a.id] = { expr: inp.value.trim(), cents: E.exprCents(inp.value) };
          });
          E.CAPITAL_ROWS.forEach(function (cr) {
            var inp = $main.querySelector("#savForm [name=" + cr.key + "]");
            if (inp && inp.value.trim()) ns[cr.key] = E.exprCents(inp.value);
          });
        } catch (e) { toast("Ошибка в формуле: " + e.message); return; }
        if (!flow.some(function (a) { return nr[a.id]; })) { toast("Впиши хотя бы один остаток"); return; }
        // первое «Дальше» начинает черновик: в бюджет сверка попадёт только по «Завершить»
        if (!inDraft()) { startDraft(y, w); yr = state.years[y]; yr.recon = yr.recon || {}; yr.savRecon = yr.savRecon || {}; }
        yr.recon[w] = nr;
        if (Object.keys(ns).length) yr.savRecon[w] = ns; else delete yr.savRecon[w];
        var fsum = 0; flow.forEach(function (a) { if (a.kind === "cash_flow" && E.accountActive(a, wk) && nr[a.id]) fsum += E.accToEur(state, a, nr[a.id].cents); });
        ui.recBefore = { key: y + ":" + w, diff: fsum - r.obr[w] }; // разница до правок на шаге 2 — как в панели внизу
        ui.recStep = 2; ui.recWeek = { year: y, week: w };
        Settings.maybeWeeklyBackup("после сверки за " + shortWeek(y, w));
        changed(false, false); window.scrollTo(0, 0); // в черновик, без полоски: «Сверка сохранена» — на «Завершить»
      };
      var cl = $main.querySelector("#recClear");
      if (cl) cl.onclick = function () {
        askConfirm("Удалить сверку за " + shortWeek(y, w) + "? Остатки сотрутся, и неделя снова посчитается по плану.", "Удалить сверку", function () {
          if (myState.recDraft) { delete myState.recDraft; ui.draftState = null; } state = myState;
          var ry = myState.years[y]; delete (ry.recon || {})[w]; delete (ry.savRecon || {})[w]; ui.recBefore = null; ui.recStep = 1; changed();
        });
      };
    }

    if (step === 2) {
      $main.querySelectorAll(".rs-phrase").forEach(function (fm) {
        fm.onsubmit = function (e) {
          e.preventDefault();
          var t = fm.q.value.trim(); if (!t) return;
          var inc = fm.dataset.kind === "income", ph = Plus.phParse(t), ci = Plus.phCat(ph.words, inc);
          if (!ph.cents) { toast("Не вижу сумму — допиши число"); return; }
          var firstInc = cats().find(function (c) { return c.block === "income" && !c.archived; });
          var cat = ci ? ci.id : inc ? (firstInc && firstInc.id) : defaultCat();
          if (!cat) { toast("Нет категории для доходов — добавь её в «Настройках»"); return; }
          var note = ph.words.filter(function (x, i) { return !ci || i !== ci.used; }).join(" ");
          var dd = ph.date && E.weekOfDate(ph.date) && E.weekOfDate(ph.date).idx === w ? ph.date : wk.from, wk2 = E.weekOfDate(dd);
          addToCell(String(wk2.year), cat, wk2.idx, String(ph.cents / 100), note, { src: "recon", date: dd });
          toast((inc ? "+" : "") + E.fmt(ph.cents, { cur: "€" }) + " → «" + catName(cat) + "», " + shortWeek(String(wk2.year), wk2.idx)); changed();
        };
      });
      var ra = $main.querySelector("#recAdd"); if (ra) ra.onclick = function () { spendModal({ date: wk.from, after: function () { ui.recWeek = { year: y, week: w }; ui.recStep = 2; } }); };
      Cash.bindCashPlanRows(function () { ui.recStep = 2; });
      $main.querySelectorAll("[data-unsp]").forEach(function (b) { b.onclick = function () { moveSkipModal(y, b.dataset.unsp, w, function () { ui.recWeek = { year: y, week: w }; ui.recStep = 2; ui.recUnspOpen = true; }); }; });
      var rm = $main.querySelector(".rs-more"); if (rm) rm.ontoggle = function () { ui.recUnspOpen = rm.open; };
      $main.querySelector("#recDone").onclick = function () {
        ui.recStep = 3; window.scrollTo(0, 0);
        if (inDraft()) finishDraft("Сверка за " + shortWeek(y, w) + (myState.recDraft.editing ? " обновлена" : " сохранена"));
        else render();
      };
    }

    if (step === 3) {
      bindRecTips();
      var cb = $main.querySelector("[data-capb]"); if (cb) cb.onclick = function () { Us.capBreakdown(y, w); };
      var rb = $main.querySelector(".rs-bal"); if (rb) rb.ontoggle = function () { ui.recBalOpen = rb.open; };
      $main.querySelectorAll("[data-go]").forEach(function (tr) { tr.onclick = function () { var p = tr.dataset.go.split(":"); ui.recWeek = { year: p[0], week: Number(p[1]) }; ui.recStep = 3; render(); }; });
    }
  };

  // Шаг 2: траты наличными за неделю от порога, которых нет в плане
  function cashNotInPlanCard(y, w) {
    var wk = E.compute(state, y).weeks[w], list = Cash.cashNotInPlan(wk.from, wk.to);
    return list.length ? Cash.cashPlanCardHtml(list) : "";
  }

  // Шаг 2: внести фразой — трату, которой не было в плане, или доход
  function phraseCard(kind) {
    var inc = kind === "income";
    return tpl("<div class='card rc-help'><h2>{h}</h2><p class='small muted' style='margin-top:-6px'>Одной фразой — разница пересчитается сразу.</p>" +
      "<form class='rc-phrase rs-phrase' data-kind='{k}' autocomplete='off'><input name='q' aria-label='{al}' placeholder='{ph}'><button class='btn primary' type='submit'>Внести</button></form>{!more}</div>", {
        h: inc ? "Может, пришёл доход, которого нет в плане?" : "Нашла в выписке то, чего не было в плане?", k: kind, al: inc ? "Доход одной фразой" : "Трата одной фразой",
        ph: inc ? "например: возврат налога 120" : "например: аптека 45", more: inc ? "" : "<button type='button' class='linkish small' id='recAdd'>заполнить по полям</button>" });
  }

  // Шаг 3: квадратик — подсказка при наведении (компьютер) или плашка по нажатию (телефон); в неделю не уводит
  function bindRecTips() {
    var wrap = $main.querySelector(".rs-cal .rc-wrap"); if (!wrap) return;
    var tip = document.createElement("div"), pinned = null;
    tip.className = "rs-tip"; tip.setAttribute("role", "status"); wrap.appendChild(tip);
    function show(b) {
      tip.textContent = b.dataset.cap; tip.classList.add("on");
      var wb = wrap.getBoundingClientRect(), bb = b.getBoundingClientRect(), tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(wb.width - tw, bb.left - wb.left + bb.width / 2 - tw / 2)) + "px";
      tip.style.top = (bb.top - wb.top - 6) + "px";
    }
    function hide() { tip.classList.remove("on"); }
    wrap.querySelectorAll("[data-rw]").forEach(function (b) {
      b.removeAttribute("data-tip"); // своя подсказка вместо общей
      b.addEventListener("mouseenter", function () { if (!pinned) show(b); });
      b.addEventListener("mouseleave", function () { if (!pinned) hide(); });
      // нажатие — открыть эту неделю (итог и остатки); подсказка — при наведении
      b.onclick = function (e) { e.preventDefault(); if (b.classList.contains("future")) return; ui.recWeek = { year: String(wrap.dataset.y || ui.recWeek.year), week: Number(b.dataset.rw) }; ui.recStep = 3; render(); };
    });
  }

  // Сверка: плановые траты недели, которые могли не случиться
  function unspentCard(y, w, title) {
    var r = E.compute(state, y), items = cats().filter(function (c) {
      var x = r.cells[c.id][w]; return x && x.cents < 0 && c.block !== "income" && c.block !== "savings" && c.currency !== "RUB" && !/из общих|перенесено на|не было/.test(x.note || "");
    }).map(function (c) { return { c: c, v: r.cells[c.id][w].cents }; }).sort(function (a, b) {
      var pr = { periodic: 0, base: 1, subs_es: 2, subs_ru: 3 }; return (pr[a.c.block] - pr[b.c.block]) || (a.v - b.v);
    }).slice(0, 8);
    if (!items.length) return "";
    return tpl("<div class='card'><h2>{t}</h2><p class='small muted' style='margin-top:-6px'>Не было — убери или перенеси на потом.</p><ul class='plan-list'>{!li}</ul></div>", { t: title || "Что из плана не потратила?",
      li: items.map(function (x) { return tpl("<li data-unsp='{id}'><span class='name'>{n}</span><span class='val'>{v}</span><span class='small muted rs-act'><span class='rs-act-t'>убрать / перенести </span>›</span></li>", { id: x.c.id, n: x.c.name, v: E.fmt(x.v, { cur: cur(x.c) }) }); }).join("") });
  }

  // ===== РЕГУЛЯРНЫЕ ТРАТЫ =====
  // предложения «сделать регулярными», от которых отказалась, больше не показываем
  function repeatKey(c) { return [c.catId, c.cents, c.weeks, c.fromM, c.toM].join("|"); }
  function repeatsFor(y) { var no = state.settings.repeatsNo || {}; return E.findRepeats(state, y).filter(function (c) { return !no[y + ":" + repeatKey(c)]; }); }
  function repeatsNo(y, list) { var no = state.settings.repeatsNo = state.settings.repeatsNo || {}; list.forEach(function (c) { no[y + ":" + repeatKey(c)] = 1; }); }
  // период правила словами: «янв – мар», «с 15 мар», «весь год»
  function rulePeriod(ru, y) {
    var d = function (x, end) { var m = Number(x.slice(5, 7)) - 1, dd = Number(x.slice(8, 10)); return (end ? dd !== E.daysInMonth(Number(y), m + 1) : dd !== 1) ? dd + " " + E.MONTHS_SHORT[m] : E.MONTHS_SHORT[m]; };
    var f = ru.from && ru.from > y + "-01-01" ? ru.from : null, t = ru.to && ru.to < y + "-12-31" ? ru.to : null;
    if (!f && !t) return "весь год";
    if (!t) { var fm = Number(f.slice(5, 7)) - 1, fd = Number(f.slice(8, 10)); return "с " + (fd !== 1 ? fd + " " : "") + E.MONTHS_GEN[fm] + " до конца года"; }
    if (!f) return "янв–" + d(t, true);
    return d(f) === d(t, true) ? "только " + E.MONTHS[Number(f.slice(5, 7)) - 1] : d(f) + "–" + d(t, true);
  }
  function ruleWeeksText(ws) { ws = String(ws || ""); return ws === "все" ? "каждую неделю" : ws.split(",").map(function (x) { return x.trim() + "-я"; }).join(", ") + (ws.indexOf(",") > 0 ? " недели" : " неделя"); }

  // «История записей»: свои траты и доходы из «+», «Заполнить по полям» и фразы в сверке — с датой, можно убрать (запись снимается и из Плана)
  routes.log = function () {
    var ro = RO(), all = [];
    years().forEach(function (yy) { ((state.years[yy] || {}).log || []).forEach(function (e) { all.push({ y: yy, e: e }); }); });
    all.sort(function (a, b) { return a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : (b.e.ts || 0) - (a.e.ts || 0); });
    var html = "<div class='page-head'><div><h1>История записей</h1><div class='sub'>Траты и доходы, внесённые через «+», «Внести» и в сверке. Правки прямо в таблице План сюда не попадают. История общих трат — в «Мы», история трат в наличке — в «Наличке».</div></div></div>";
    if (!all.length) {
      $main.innerHTML = html + "<div class='card'><p class='empty flush'>Пока пусто. Здесь появится всё, что ты вносишь через «+» и «Внести», — с датой, и любую запись можно будет изменить или убрать. Предыдущие записи отражены в суммах Плана: поправить их можно в таблице.</p></div>";
      return;
    }
    var today = E.todayISO(), lastD = null;
    var dayT = function (d) { return d === today ? "Сегодня" : d === E.addDays(today, -1) ? "Вчера" : new Date(d + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); };
    html += "<ul class='card lg-log'>" + all.slice(0, ui.logLimit || 100).map(function (x) {
      var e = x.e, head = e.date !== lastD ? tpl("<li class='ch-day'>{d}</li>", { d: dayT(e.date) }) : ""; lastD = e.date;
      var what = e.note ? e.note.charAt(0).toUpperCase() + e.note.slice(1) : catName(e.cat);
      var sub = (e.note ? catName(e.cat) + " · " : "") + shortWeek(x.y, e.w) + (e.rule ? " · " + (e.rep === "week" ? "каждую неделю" : "каждый месяц") : "") + (e.src === "recon" ? " · из сверки" : "");
      // нажатие на строку — изменить (регулярную — в «Регулярных»)
      return head + tpl("<li class='ll-row'><button type='button' class='ll-edit' data-ledit='{y}:{id}'{!dis} aria-label='Изменить «{w}»'><span class='ll-tx'><b>{w}</b><small>{sub}</small></span><span class='ll-v {c}'>{v}</span></button>{!del}</li>", {
        y: x.y, id: e.id, dis: ro ? " disabled" : "", w: what, sub: sub, c: e.cents > 0 ? "pos" : "", v: E.fmt(e.cents, { cur: "€", plus: e.cents > 0 }),
        del: ro ? "" : tpl("<button type='button' class='ch-del' data-ldel='{y}:{id}' aria-label='Убрать «{w}»'>✕</button>", { y: x.y, id: e.id, w: what }) });
    }).join("") + "</ul>" + (all.length > (ui.logLimit || 100) ? "<button class='btn ghost sm' id='logMore'>Показать ещё</button>" : "");
    $main.innerHTML = html;
    var lm = $main.querySelector("#logMore"); if (lm) lm.onclick = function () { ui.logLimit = (ui.logLimit || 100) + 200; render(); };
    $main.querySelectorAll("[data-ledit]").forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.ledit.split(":"), e = (state.years[k[0]].log || []).find(function (z) { return z.id === k[1]; }); if (!e) return;
        if (e.rule) { toast("Регулярная — сумму и срок меняют в «Регулярных»"); location.hash = "#recurring"; return; }
        var cat = state.categories.find(function (c) { return c.id === e.cat; }) || {};
        spendModal({ edit: { year: k[0], id: e.id }, income: cat.block === "income", cat: e.cat, date: e.date, note: e.note, amount: String(Math.abs(e.cents) / 100).replace(".", ","), after: function () { render(); } });
      };
    });
    $main.querySelectorAll("[data-ldel]").forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.ldel.split(":"), yy = k[0], e = (state.years[yy].log || []).find(function (z) { return z.id === k[1]; }); if (!e) return;
        var what = e.note || catName(e.cat), amt = E.fmt(Math.abs(e.cents), { cur: "€" });
        askConfirm(e.rule ? "Убрать регулярную «" + what + "»? Сумма " + amt + " уйдёт из всех недель, где она стояла." :
          "Убрать «" + what + "» " + amt + "? В Плане «" + catName(e.cat) + "», " + shortWeek(yy, e.w) + " станет на " + amt + (e.cents < 0 ? " меньше трат." : " меньше дохода."), "Убрать", function () {
          if (removeLogged(yy, e.id)) { changed(false, "Запись убрана"); toast("Убрано из Плана"); }
        });
      };
    });
  };

  routes.recurring = function () {
    var y = ui.recYear && state.years[ui.recYear] && !state.years[ui.recYear].archived ? ui.recYear : ui.year, yr = state.years[y];
    yr.recurring = yr.recurring || [];
    var weeks = E.genWeeks(Number(y)), ro = RO();
    var html = tpl("<div class='page-head'><div><h1>Регулярные траты</h1><div class='sub'>То, что повторяется: аренда, подписки, телефон, зарплата. Задаёшь один раз — сумма сама встаёт в нужные недели. Нажми на строку, чтобы поменять сумму или срок.</div></div>{!chips}</div>", { chips: yearChips(y, false) });
    var cands = ro ? [] : repeatsFor(y);
    var mText = function (c) { return c.toM === 11 ? (c.fromM === 0 ? "весь год" : "с " + E.MONTHS_GEN[c.fromM] + " до конца года") : E.MONTHS_SHORT[c.fromM] + "–" + E.MONTHS_SHORT[c.toM]; };
    if (cands.length) html += tpl("<div class='card repeat-card'><button type='button' class='rp-x' id='rpNo' aria-label='Не предлагать' title='Не предлагать'>×</button><h2>Нашла {n} {w}, но вписаны вручную</h2>", { n: cands.length, w: plural(cands.length, "трату, которая повторяется", "траты, которые повторяются", "трат, которые повторяются") }) +
      "<p class='small muted' style='margin-top:-4px'>Одна и та же сумма в одни и те же недели, месяц за месяцем. Если сделать их регулярными, менять сумму придётся в одном месте, и в план следующего года они перенесутся сами. " +
      "<b>Цифры в плане не изменятся:</b> перед сохранением проверяю каждую клетку года, а записи с заметками оставляю как есть.</p><ul class='repeat-list'>" +
      cands.map(function (c, i) {
        var cat = state.categories.find(function (x) { return x.id === c.catId; }) || { name: c.catId, currency: "EUR" };
        return tpl("<li><label><input type='checkbox' checked data-rp='{i}'><span class='name'>{n}</span><span class='muted small'>{wk} · {m}</span><span class='val {c}'>{v}</span></label><button type='button' class='rp-x sm' data-rpno='{i}' aria-label='Не предлагать эту'>×</button></li>", {
          i: i, n: cat.name, wk: ruleWeeksText(c.weeks), m: mText(c), c: tone(c.cents), v: E.fmt(c.cents, { cur: cur(cat) }) });
      }).join("") + "</ul><div class='row' style='margin-top:12px'><button class='btn primary' id='rpGo'>Сделать регулярными</button><button class='btn ghost' id='rpBackup'>Сначала скачать бэкап</button><button class='btn ghost' id='rpNo2'>Не предлагать</button></div></div>";
    // по категориям, периоды по порядку
    var byCat = {};
    yr.recurring.forEach(function (ru) { (byCat[ru.catId] = byCat[ru.catId] || []).push(ru); });
    var catList = cats().filter(function (c) { return byCat[c.id]; });
    Object.keys(byCat).forEach(function (id) { if (!catList.some(function (c) { return c.id === id; })) catList.push({ id: id, name: id, currency: "EUR", block: "" }); });
    if (!ro) html += "<div class='row rg-top'><button class='btn primary' id='rgAdd'>+ Регулярная трата или доход</button></div>";
    var lastBlock = null;
    html += catList.length ? catList.map(function (c) {
      var list = byCat[c.id].slice().sort(function (a, b) { return (a.from || "") < (b.from || "") ? -1 : 1; });
      var yearSum = 0;
      list.forEach(function (ru) { yearSum += ru.cents * weeks.filter(function (wk) { return E.ruleMatches(ru, wk); }).length; });
      var bh = c.block !== lastBlock ? tpl("<h2 class='rg-blk'>{b}</h2>", { b: blockName(c.block) }) : ""; lastBlock = c.block;
      return bh + tpl("<div class='card rg-cat'><div class='rg-h'><b>{n}</b><span class='small muted'>за год {sum}</span>{!add}</div>{!rows}</div>", {
        n: c.name, sum: E.fmt(yearSum, { cur: cur(c), dec: 0 }), add: ro ? "" : tpl("<button type='button' class='linkish small' data-rgadd='{id}'>+ период</button>", { id: c.id }),
        rows: list.map(function (ru) {
          var n = weeks.filter(function (wk) { return E.ruleMatches(ru, wk); }).length;
          return tpl("<button type='button' class='rg-p' data-edit='{id}'{!dis}><span class='rg-when'>{when}</span><span class='rg-wk small muted'>{wk}{!none}</span><span class='rg-v {c}'>{v}</span>{!arr}</button>", {
            id: ru.id, dis: ro ? " disabled" : "", when: rulePeriod(ru, y), wk: ruleWeeksText(ru.weeks), none: n ? "" : " · <span class='neg'>ни одной недели — поправь недели или период</span>",
            c: tone(ru.cents), v: E.fmt(ru.cents, { cur: cur(c) }), arr: ro ? "" : "<span class='arr'>›</span>" });
        }).join("") });
    }).join("") : "<p class='empty'>Регулярных трат пока нет — добавь первую: например, аренду.</p>";
    html += tpl("<p class='small muted rg-foot'>Когда создашь план на {y}, регулярные перенесутся туда сами.</p>", { y: Number(y) + 1 });
    $main.innerHTML = html;
    bindYearChips(function (yy) { ui.recYear = yy; render(); });
    if (ro) return;
    if (cands.length) {
      $main.querySelector("#rpBackup").onclick = Settings.backupDownload;
      var noAll = function () { repeatsNo(y, cands); changed(); toast("Больше не предлагаю — в плане ничего не поменялось"); };
      $main.querySelector("#rpNo").onclick = noAll; $main.querySelector("#rpNo2").onclick = noAll;
      $main.querySelectorAll("[data-rpno]").forEach(function (b) { b.onclick = function () { repeatsNo(y, [cands[Number(b.dataset.rpno)]]); changed(); }; });
      $main.querySelector("#rpGo").onclick = function () {
        var picked = cands.filter(function (_, i) { return $main.querySelector("[data-rp='" + i + "']").checked; });
        if (!picked.length) { toast("Отметь хотя бы одну"); return; }
        var done = 0, skipped = 0;
        picked.forEach(function (c) { if (E.applyRepeat(state, y, c)) done++; else skipped++; });
        changed(); toast("Готово: " + done + " теперь регулярные, план не изменился" + (skipped ? ". Пропущено " + skipped + " — суммы бы сдвинулись" : ""));
      };
    }
    $main.querySelector("#rgAdd").onclick = function () { ruleSheet(y, null, null); };
    $main.querySelectorAll("[data-rgadd]").forEach(function (b) { b.onclick = function () { ruleSheet(y, null, b.dataset.rgadd); }; });
    $main.querySelectorAll("[data-edit]").forEach(function (b) { b.onclick = function () { ruleSheet(y, yr.recurring.find(function (x) { return x.id === b.dataset.edit; }), null); }; });
  };

  // Панель регулярной траты: новая или правка периода (сумма, недели, с, по) + «сумма меняется с месяца»
  function ruleSheet(y, ru, catId) {
    var yr = state.years[y], isNew = !ru;
    var d = ru ? { catId: ru.catId, expr: numShow(absIfPlain(ru.expr || String(ru.cents / 100))), weeks: ru.weeks || "все", from: ru.from && ru.from > y + "-01-01" ? ru.from : y + "-01-01", to: ru.to && ru.to < y + "-12-31" ? ru.to : "" }
      : { catId: catId || state.settings.lastCat || (cats().find(function (c) { return !c.archived && c.block !== "income"; }) || {}).id, expr: "", weeks: "1", from: E.todayISO().slice(0, 4) === y ? y + "-" + E.todayISO().slice(5, 7) + "-01" : y + "-01-01", to: "" };
    var mode = "fix";
    var o = function (v, l, s) { return tpl("<option value='{v}'{!s}>{l}</option>", { v: v, l: l, s: s ? " selected" : "" }); };
    var mFrom = function (sel) { return E.MONTHS.map(function (m, i) { var v = y + "-" + (i < 9 ? "0" : "") + (i + 1) + "-01"; return o(v, m, v === sel || (sel && sel.slice(5, 7) === v.slice(5, 7))); }).join(""); };
    var mTo = function (sel) { return o("", "до конца года", !sel) + E.MONTHS.map(function (m, i) { var v = y + "-" + (i < 9 ? "0" : "") + (i + 1) + "-" + E.daysInMonth(Number(y), i + 1); return o(v, m, sel && sel.slice(5, 7) === v.slice(5, 7)); }).join(""); };
    var multi = ru && Number((d.to || y + "-12-31").slice(5, 7)) > Number(d.from.slice(5, 7));
    function wkChips() {
      var set = d.weeks === "все" ? [] : d.weeks.split(",").map(function (x) { return x.trim(); });
      return tpl("<div class='wk-chips' role='group' aria-label='Недели месяца'><button type='button' class='tg{on}' data-wk='все'>каждую</button>{!n}</div>", { on: d.weeks === "все" ? " on" : "",
        n: [1, 2, 3, 4, 5].map(function (n) { return tpl("<button type='button' class='tg{on}' data-wk='{n}' aria-label='{n}-я неделя'>{n}</button>", { on: set.indexOf(String(n)) >= 0 ? " on" : "", n: n }); }).join("") });
    }
    function draw(m) {
      var body = tpl("<h2>{h}</h2>", { h: isNew ? "Регулярная трата или доход" : catName(d.catId) });
      if (multi) body += tpl("<div class='seg rg-seg'><button type='button' class='{a}' data-mode='fix'>Изменить период</button><button type='button' class='{b}' data-mode='split'>Сумма поменялась</button></div>", { a: mode === "fix" ? "on" : "", b: mode === "split" ? "on" : "" });
      if (mode === "split") {
        var opts = E.MONTHS.map(function (mm, i) { var v = y + "-" + (i < 9 ? "0" : "") + (i + 1) + "-01"; return v > d.from && (!d.to || v <= d.to) ? o(v, "с " + E.MONTHS_GEN[i], v === y + "-" + E.todayISO().slice(5, 7) + "-01") : ""; }).join("");
        body += tpl("<p class='small muted' style='margin:0 0 10px'>Сейчас {now} · {per}. До выбранного месяца останется старая сумма, дальше — новая.</p>" +
          "<div class='form-grid'><label class='f'>Новая сумма<input type='text' id='rsNew' inputmode='decimal' value='{e}'></label><label class='f'>Действует<select id='rsFrom'>{!opts}</select></label></div>", {
            now: E.fmt(ru.cents, { cur: cur(state.categories.find(function (c) { return c.id === d.catId; }) || {}) }), per: rulePeriod(ru, y), e: d.expr, opts: opts });
      } else {
        body += tpl("<div class='form-grid'>{!cat}<label class='f' style='grid-column:1/-1'>Сумма<input type='text' id='rsE' inputmode='decimal' value='{e}' placeholder='150'></label>" +
          "<label class='f'>С<select id='rsF'>{!from}</select></label><label class='f'>По<select id='rsT'>{!to}</select></label></div>" +
          "<div class='small muted' style='margin-top:12px'>Какие недели месяца</div>{!wk}<div id='rsWarn' class='small rs-warn'></div>", {
            cat: isNew ? tpl("<label class='f' style='grid-column:1/-1'>Категория<select id='rsCat'>{!o}</select></label>", { o: catOptions(d.catId) }) : "", e: d.expr, from: mFrom(d.from), to: mTo(d.to), wk: wkChips() });
      }
      m.querySelector(".m-body").innerHTML = body;
      m.querySelector("[data-act=del]").hidden = isNew || mode === "split";
      m.querySelectorAll("[data-mode]").forEach(function (b) { b.onclick = function () { read(m); mode = b.dataset.mode; draw(m); }; });
      m.querySelectorAll("[data-wk]").forEach(function (b) {
        b.onclick = function () {
          var v = b.dataset.wk, set = d.weeks === "все" ? [] : d.weeks.split(",").filter(Boolean);
          if (v === "все") d.weeks = "все";
          else { var i = set.indexOf(v); if (i >= 0) set.splice(i, 1); else set.push(v); set.sort(); d.weeks = set.length ? set.join(",") : "все"; }
          read(m); draw(m);
        };
      });
      ["#rsF", "#rsT", "#rsCat"].forEach(function (s) { var el = m.querySelector(s); if (el) el.onchange = function () { read(m); warn(m); }; });
      warn(m);
    }
    function read(m) {
      var g = function (s) { var el = m.querySelector(s); return el ? el.value : null; };
      if (g("#rsE") !== null) d.expr = g("#rsE");
      if (g("#rsNew") !== null) d.expr = g("#rsNew");
      // тот же месяц — сохраняем исходную дату (правило могло начинаться с середины месяца)
      if (g("#rsF") !== null) d.from = ru && ru.from && ru.from.slice(0, 7) === g("#rsF").slice(0, 7) ? ru.from : g("#rsF");
      if (g("#rsT") !== null) d.to = ru && ru.to && g("#rsT") && ru.to.slice(0, 7) === g("#rsT").slice(0, 7) ? ru.to : g("#rsT");
      if (g("#rsCat") !== null) d.catId = g("#rsCat");
    }
    function warn(m) {
      var el = m.querySelector("#rsWarn"); if (!el) return;
      if (d.to && d.to < d.from) { el.innerHTML = "<span class='neg'>Период заканчивается раньше, чем начинается — поправь «По»</span>"; return; }
      var ov = E.overlaps(state, y, { id: ru ? ru.id : null, catId: d.catId, from: d.from, to: d.to || null });
      el.textContent = ov.length ? "В эти месяцы уже есть " + ov.map(function (x) { return E.fmt(x.cents, { cur: cur(state.categories.find(function (c) { return c.id === x.catId; }) || {}) }) + " (" + rulePeriod(x, y) + ")"; }).join(", ") + " — тот период обрежу, чтобы суммы не сложились." : "";
    }
    modal("<div class='m-body'></div><div class='m-foot'><button class='btn ghost danger' data-act='del'>Удалить</button><span class='spacer'></span><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", function (m) {
      draw(m);
      m.querySelector("[data-act=cancel]").onclick = closeModal;
      m.querySelector("[data-act=del]").onclick = function () {
        askConfirm("Удалить «" + catName(ru.catId) + "» " + rulePeriod(ru, y) + "? Суммы этого периода пропадут из плана " + y + " года. Вписанное вручную останется.", "Удалить", function () {
          yr.recurring = yr.recurring.filter(function (x) { return x.id !== ru.id; }); closeModal(); changed(); toast("Удалено");
        });
      };
      m.querySelector("[data-act=ok]").onclick = function () {
        read(m);
        var ex = signFor(d.catId, d.expr), c;
        if (!String(d.expr).trim()) { toast("Впиши сумму"); return; }
        try { c = E.exprCents(ex); } catch (err) { toast("Ошибка: " + err.message); return; }
        if (mode === "split") {
          var fromISO = m.querySelector("#rsFrom").value;
          if (!fromISO) { toast("Выбери, с какого месяца"); return; }
          if (!E.changeRuleFrom(state, y, ru.id, { expr: ex.trim(), cents: c }, fromISO)) { toast("Выбери месяц внутри периода"); return; }
          closeModal(); changed(); toast("С " + E.MONTHS_GEN[Number(fromISO.slice(5, 7)) - 1] + " — " + E.fmt(c)); return;
        }
        if (d.to && d.to < d.from) { toast("Период заканчивается раньше, чем начинается — поправь «По»"); return; }
        var patch = { catId: d.catId, expr: ex.trim(), cents: c, weeks: d.weeks, from: d.from, to: d.to || null };
        var rule = ru || { id: E.uid("r") };
        Object.assign(rule, patch);
        if (isNew) yr.recurring.push(rule);
        E.trimOverlaps(state, y, rule);
        if (isNew) state.settings.lastCat = d.catId;
        closeModal(); changed(); toast(isNew ? "«" + catName(d.catId) + "» добавлена" : "Сохранено");
      };
    });
  }

  // Новая строка (категория) прямо в Плане — в конец блока
  function addPlanRow(bl) {
    var bName = (E.BLOCKS.find(function (b) { return b.id === bl; }) || {}).name || "";
    textModal("Новая строка · " + bName, "", function (n) {
      if (!n) return;
      var inBlock = state.categories.filter(function (c) { return c.block === bl; });
      state.categories.push({ id: E.uid("c"), name: n, block: bl, currency: "EUR", mandatory: false, link: null, sort: inBlock.length ? Math.max.apply(null, inBlock.map(function (c) { return c.sort; })) + 0.01 : 999, archived: false });
      ui.planOpen = ui.planOpen || {}; ui.planOpen[bl] = true; changed(); toast("Строка «" + n + "» добавлена");
    }, "например, Подарки");
  }

  // для других экранов — только это; остальное внутри модуля
  window.Plan = { kpi: kpi, yearChips: yearChips, bindYearChips: bindYearChips };
})();
