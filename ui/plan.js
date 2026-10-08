/* Easy Budget — план: «Неделя», «Год», «Сверка», «Регулярные траты». */
"use strict";
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
  html += "<div>" + (RO() ? "" : "<div class='card'><h2>Внести трату</h2><p class='small muted' style='margin-top:-6px'>Нашла в выписке или собираешься потратить — внеси, и сумма встанет в нужную неделю.</p>" +
    "<button class='btn primary' data-act='spend'>+ Внести</button></div>");

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
  // на телефоне по умолчанию месяцы: 60 недель в узкий экран не помещаются
  var mode = ui.gridMode || (window.matchMedia("(max-width: 820px)").matches ? "months" : "weeks");
  var modeSw = "<div class='seg' role='group' aria-label='Столбцы таблицы'><button class='seg-b" + (mode === "weeks" ? " on" : "") + "' data-mode='weeks'>Недели</button>" +
    "<button class='seg-b" + (mode === "months" ? " on" : "") + "' data-mode='months'>Месяцы</button></div>";
  var html = "<div class='page-head'><div><h1>Год " + y + "</h1><div class='sub'>" + (mode === "months"
    ? "Строки — категории, столбцы — месяцы. Нажми на месяц, чтобы открыть его недели и поправить суммы."
    : "Строки — категории, столбцы — недели. <span style='color:var(--rec)'>Серым</span> — регулярные, <span style='color:var(--manual)'>синим</span> — вписано вручную. Нажми на ячейку, чтобы изменить.") + "</div></div>" +
    "<div class='row'>" + modeSw + yearChips(y, true, RO() ? "" : "<button class='chip' data-act='newyear'>+ " + (Number(years()[years().length - 1]) + 1) + "</button>") + "</div></div>";
  if (mode === "months") return yearByMonths(y, r, html);

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
    var td = e.target.closest("td");
    if (!td) return;
    if (td.dataset.recon !== undefined && !RO()) { ui.recWeek = { year: y, week: Number(td.dataset.recon) }; location.hash = "#recon"; return; }
    if (td.dataset.rules && !RO()) { ui.recYear = y; location.hash = "#recurring"; return; }
    if (ro || td.dataset.c === undefined || td.querySelector("input")) return;
    inlineEdit(td, y);
  });
};

function bindYearHead() {
  bindYearChips(function (yy) { ui.gridYear = yy; if (!state.years[yy].archived) ui.year = yy; render(); });
  var ny = $main.querySelector("[data-act=newyear]");
  if (ny) ny.onclick = newYearDialog;
  $main.querySelectorAll("[data-mode]").forEach(function (b) { b.onclick = function () { ui.gridMode = b.dataset.mode; ui.gridScroll = null; render(); }; });
}
// «Год» по месяцам: суммы недель месяца; нажатие на месяц открывает его недели
function yearByMonths(y, r, html) {
  var nowM = (function () { var t = E.weekOfDate(E.todayISO()); return t && String(t.year) === String(y) ? Math.floor(t.idx / 5) : -1; })();
  var mon = E.monthly(state, y).months;
  function mth(m) { return (m === nowM ? " now" : ""); }
  var head = "<tr><th class='sticky'>" + y + "</th>" + E.MONTHS_SHORT.map(function (n, m) { return "<th class='mhead" + mth(m) + "' data-m='" + m + "'>" + n + "</th>"; }).join("") + "<th>Год</th></tr>";
  var body = "";
  E.BLOCKS.forEach(function (b) {
    var list = cats().filter(function (c) { return c.block === b.id && r.cells[c.id].some(Boolean); });
    if (!list.length) return;
    body += "<tr class='blk'><td class='sticky'>" + esc(b.name) + "</td><td colspan='13'></td></tr>";
    list.forEach(function (c) {
      var tot = 0, tds = "";
      for (var m = 0; m < 12; m++) {
        var sum = 0, any = false;
        for (var w = m * 5; w < m * 5 + 5; w++) { var cell = r.cells[c.id][w]; if (cell) { sum += cell.cents; any = true; } }
        tot += sum;
        tds += "<td class='v ro" + mth(m) + "' data-m='" + m + "'>" + (any ? E.fmt(rnd(sum)) : "") + "</td>";
      }
      body += "<tr><td class='sticky' title='" + esc(c.name) + "'>" + esc(c.name) + (c.currency === "RUB" ? " (₽)" : "") + "</td>" + tds + "<td class='v ro'><b>" + E.fmt(rnd(tot)) + "</b></td></tr>";
    });
  });
  function totRow(label, key, cls) {
    var t = 0;
    return "<tr class='" + (cls || "tot") + "'><td class='sticky'>" + label + "</td>" + mon.map(function (row, m) { var v = row[key]; if (v !== null) t += v; return "<td class='v ro" + mth(m) + "' data-m='" + m + "'>" + (v === null ? "" : E.fmt(rnd(v))) + "</td>"; }).join("") +
      "<td class='v ro'>" + (key === "cap" ? "" : "<b>" + E.fmt(rnd(t)) + "</b>") + "</td></tr>";
  }
  body += totRow("Доходы", "income", "tot sep") + totRow("Расходы", "total") + totRow("Капитал на конец месяца", "cap");
  html += "<div class='grid-wrap' id='gridWrap'><table class='g g-months'><thead>" + head + "</thead><tbody>" + body + "</tbody></table></div>";
  $main.innerHTML = html;
  bindYearHead();
  var wrap = document.getElementById("gridWrap");
  if (nowM > 0) requestAnimationFrame(function () {
    var th = wrap.querySelectorAll("thead th")[1 + nowM], pin = wrap.querySelector("thead .sticky").offsetWidth;
    if (th) wrap.scrollLeft = Math.max(0, th.getBoundingClientRect().left - wrap.getBoundingClientRect().left - pin - th.offsetWidth);
  });
  wrap.addEventListener("click", function (e) {
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
  td.innerHTML = "<input type='text' inputmode='decimal' value='" + esc(isExp ? absIfPlain(shown) : shown) + "' aria-label='Сумма; в расходах минус ставить не нужно'>";
  var inp = td.querySelector("input"), done = false;
  inp.focus(); inp.select();
  function finish(saveIt) {
    if (done) return; done = true;
    if (!saveIt) { td.innerHTML = old; return; }
    var v = signFor(catId, inp.value.trim());
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
    unspentCard(y, w) +
    "<div class='card'><h2>Нашла в выписке то, чего не было в плане?</h2><p class='small muted' style='margin-top:-6px'>Внеси — расхождение пересчитается сразу.</p><button class='btn' id='recAdd'>+ Внести</button></div></div></div>";

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
    maybeWeeklyBackup("после сверки за " + shortWeek(y, w));
    changed(false, "Сверка сохранена"); toast("Сверка сохранена");
  };
  var cl = $main.querySelector("#recClear");
  if (cl) cl.onclick = function () { if (!confirm("Удалить сверку за " + shortWeek(y, w) + "? Остатки сотрутся, и неделя снова посчитается по плану.")) return; delete yr.recon[w]; delete yr.savRecon[w]; changed(); };
  $main.querySelector("#recAdd").onclick = function () { spendModal({ date: wk.from, after: function () { ui.recWeek = { year: y, week: w }; } }); };
  var td = $main.querySelector("#toDone"); if (td) td.onclick = function () { ui.recWeek = fwk; render(); };
  $main.querySelectorAll("[data-unsp]").forEach(function (b) { b.onclick = function () { moveSkipModal(y, b.dataset.unsp, w, function () { ui.recWeek = { year: y, week: w }; }); }; });
  $main.querySelectorAll("[data-go]").forEach(function (tr) { tr.onclick = function () { var p = tr.dataset.go.split(":"); ui.recWeek = { year: p[0], week: Number(p[1]) }; render(); }; });
};


// На сверке: плановые траты недели, которые могли не случиться
function unspentCard(y, w) {
  var r = E.compute(state, y), items = cats().filter(function (c) {
    var x = r.cells[c.id][w]; return x && x.cents < 0 && c.block !== "income" && c.block !== "savings" && c.currency !== "RUB" && !/из общих|перенесено на|не было/.test(x.note || "");
  }).map(function (c) { return { c: c, v: r.cells[c.id][w].cents }; }).sort(function (a, b) {
    var pr = { periodic: 0, base: 1, subs_es: 2, subs_ru: 3 }; return (pr[a.c.block] - pr[b.c.block]) || (a.v - b.v);
  }).slice(0, 8);
  if (!items.length) return "";
  return "<div class='card'><h2>Что из плана не потратила?</h2><p class='small muted' style='margin-top:-6px'>Если покупка не случилась, перенеси её на потом или убери — расхождение пересчитается.</p><ul class='plan-list'>" +
    items.map(function (x) { return "<li data-unsp='" + x.c.id + "'><span class='name'>" + esc(x.c.name) + "</span><span class='val neg'>" + E.fmt(x.v, { cur: cur(x.c) }) + "</span><span class='small muted'>перенести ›</span></li>"; }).join("") + "</ul></div>";
}

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
    "<label class='f'>Сумма<input type='text' name='expr' placeholder='150' required inputmode='decimal'></label>" +
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
    var exprV = signFor(f.cat.value, f.expr.value);
    try { c = E.exprCents(exprV); } catch (err) { toast("Ошибка: " + err.message); return; }
    if (!/^(все|\s*[1-5](\s*,\s*[1-5])*)$/i.test(f.weeks.value.trim())) { toast("Недели месяца: «все» или цифры от 1 до 5 через запятую, например 2,4"); return; }
    yr.recurring.push({ id: E.uid("r"), catId: f.cat.value, expr: exprV.trim(), cents: c, weeks: f.weeks.value.trim().toLowerCase(), from: f.from.value, to: null });
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
          var ex = signFor(ru.catId, m.querySelector("#ruE").value), c;
          try { c = E.exprCents(ex); } catch (err) { toast("Ошибка: " + err.message); return; }
          E.changeRuleFrom(state, y, ru.id, { expr: ex.trim(), cents: c, weeks: m.querySelector("#ruW").value.trim().toLowerCase() }, m.querySelector("#ruF").value);
          closeModal(); changed(); toast("Сохранено");
        };
      });
    };
  });
};
