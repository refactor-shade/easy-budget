/* Easy Budget — «Анализ» и «Выводы». */
"use strict";
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
    kpi("Доля сбережений", t.rate === null ? "—" : pct(t.rate), "(доходы − расходы) / доходы") +
    kpi("Капитал на конец года", t.cap === null || t.cap === undefined ? "—" : eur(rnd(t.cap), { dec: 0 }), t.dcap ? "за год <span class='" + sign(t.dcap) + "'>" + eur(rnd(t.dcap), { dec: 0, plus: true }) + "</span>" : "") +
    "</div>";
  html += spendCatsCard(y);
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
      if (k === "rate") return "<td class='n'>" + pct(v) + "</td>";
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
      "<td class='n'>" + (totalY ? pct(Math.max(0, x.v[yi]) / totalY, 1) : "") + "</td></tr>";
  });
  html += "</tbody></table></div></div><div id='family'></div>";
  $main.innerHTML = html;
  bindSpendCats();
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
  var curY = ui.year, res = window.BudgetInsights.personal(state, curY, insightCtx());
  // вопросы к плану следующего года — только те, что относятся к найденному
  var plan = activeYears().filter(function (y) { return Number(y) > Number(curY); })[0], q = [];
  if (plan) {
    var ids = {}; res.good.concat(res.improve, res.info).forEach(function (c) { ids[c.id] = 1; });
    q.push("Регулярные суммы (аренда, коммуналка, подписки) — актуальны?");
    if (ids.volatile) q.push("Бонус и крипта: заложить их скромнее?");
    if (ids.mandatory) q.push("Налоги и соцстрах — заложен полный год?");
    if (ids.family || ids.heavy) q.push("Праздники семьи и дорогие месяцы — откладывать заранее?");
    if (ids.coverage) q.push("Еда и развлечения — оставить или поправить?");
    if (ids.idle) q.push("Деньги в обращении — часть под процент?");
    if (ids.reserve) q.push("Запас — держать 6 месяцев?");
  }
  var after = q.length ? "<div class='card' style='margin-top:12px'><h3 style='margin:0 0 8px'>Решить для плана " + plan + "</h3><ol class='muted' style='margin:0;padding-left:20px'>" + q.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol></div>" : "";
  var html = "<div class='page-head'><div><h1>Выводы " + curY + "</h1><div class='sub'>" + (res.plan ? "По плану: год ещё не начался." : "Сначала — что получилось, потом — что можно улучшить и один шаг вперёд.") + " Считаются сами из плана, сверок и общих трат.</div></div>" + yearChips(curY, false) + "</div>";
  html += sandwichHtml(res, { after: after });
  $main.innerHTML = html;
  bindInsights($main);
  bindYearChips(function (yy) { ui.year = yy; render(); });
};

// ===== ИТОГИ МЕСЯЦЕВ: последний закрытый месяц подробно, остальные — строками =====
function monthSummaryHtml(ms, open) {
  var nb = ms.numbers, li = function (z, mk, h, p) { return "<li class='" + z + "'><span class='mk' aria-hidden='true'>" + mk + "</span><span><b>" + esc(h) + "</b>" + (p ? " " + esc(p) : "") + "</span></li>"; };
  return "<div class='ms-nums4'><div><span>доходы</span><b class='pos'>" + eur(rnd(nb.income), { dec: 0 }) + "</b></div><div><span>расходы</span><b>" + eur(rnd(nb.total), { dec: 0 }) + "</b></div>" +
    "<div><span>осталось</span><b class='" + sign(nb.net) + "'>" + eur(rnd(nb.net), { dec: 0, plus: true }) + "</b></div><div><span>капитал</span><b class='" + sign(nb.dcap || 0) + "'>" + (nb.dcap === null ? "—" : eur(rnd(nb.dcap), { dec: 0, plus: true })) + "</b></div></div>" +
    "<ul class='ms-list'>" + ms.good.map(function (c) { return li("good", "✓", c.h, c.p); }).join("") + ms.improve.map(function (c) { return li("improve", "↗", c.h, c.p); }).join("") + (ms.next ? li("next", "→", ms.next, "") : "") + "</ul>";
}
routes.months = function () {
  var INS = window.BudgetInsights, ys = years().filter(function (y) { return !state.years[y].archived || true; });
  var y = ui.monthsYear && state.years[ui.monthsYear] ? ui.monthsYear : ui.year;
  var t = E.todayISO(), curY = t.slice(0, 4), curM = Number(t.slice(5, 7)) - 1;
  var lastM = String(y) === curY ? curM - 1 : String(y) < curY ? 11 : -1;
  var html = "<div class='page-head'><div class='chips'>" + ys.map(function (yy) { return "<button class='chip" + (yy === y ? " on" : "") + "' data-year='" + yy + "'>" + yy + "</button>"; }).join("") + "</div></div>";
  if (lastM < 0) { $main.innerHTML = html + "<p class='empty'>Здесь появятся итоги, когда закончится первый месяц " + esc(y) + " года.</p>"; bindYearChips(function (yy) { ui.monthsYear = yy; render(); }); return; }
  var first = INS.month(state, y, lastM, insightCtx());
  html += "<section class='card ms-open'><div class='row'><h2 style='margin:0'>" + E.MONTHS[lastM][0].toUpperCase() + E.MONTHS[lastM].slice(1) + "</h2><span class='spacer'></span></div>" + monthSummaryHtml(first) + "</section>";
  if (lastM > 0) {
    html += "<section class='card ms-rows'>";
    for (var m = lastM - 1; m >= 0; m--) {
      var nb = INS.month(state, y, m, insightCtx()).numbers;
      html += "<button type='button' class='ms-row' data-mm='" + m + "'><span class='ms-tx'><b>" + E.MONTHS[m][0].toUpperCase() + E.MONTHS[m].slice(1) + "</b><small>расходы " + eur(rnd(nb.total), { dec: 0 }) + " · осталось " + eur(rnd(nb.net), { dec: 0, plus: true }) + "</small></span>" +
        "<span class='ms-cap " + sign(nb.dcap || 0) + "'>" + (nb.dcap === null ? "" : eur(rnd(nb.dcap), { dec: 0, plus: true })) + "</span><span class='arr'>›</span></button>";
    }
    html += "</section>";
  }
  $main.innerHTML = html;
  bindYearChips(function (yy) { ui.monthsYear = yy; render(); });
  $main.querySelectorAll("[data-mm]").forEach(function (b) {
    b.onclick = function () {
      var m = Number(b.dataset.mm), ms = INS.month(state, y, m, insightCtx());
      modal("<div class='m-body month-sum'><h2>Итог месяца: " + E.MONTHS[m] + "</h2>" + monthSummaryHtml(ms) + "</div><div class='m-foot'><span class='spacer'></span><button class='btn primary' data-act='ok'>Понятно</button></div>", function (md) { md.querySelector("[data-act=ok]").onclick = closeModal; });
    };
  });
};

// «На что уходят деньги» — личные траты по категориям за неделю, месяц или год; ↑↓ — к тому же периоду прошлого года
function spendCatsCard(y) {
  var per = ui.anPer || "month", nowWk = E.weekOfDate(E.todayISO()), cur = nowWk && String(nowWk.year) === y;
  var max = per === "week" ? 59 : per === "month" ? 11 : 0;
  var idx = ui.anIdx !== undefined && ui.anIdxFor === y + per ? ui.anIdx : per === "week" ? (cur ? nowWk.idx : 59) : per === "month" ? (cur ? Math.floor(nowWk.idx / 5) : 11) : 0;
  idx = Math.max(0, Math.min(max, idx));
  var weeks = per === "week" ? [idx] : per === "month" ? [idx * 5, idx * 5 + 1, idx * 5 + 2, idx * 5 + 3, idx * 5 + 4] : Array.apply(null, Array(60)).map(function (_, i) { return i; });
  var rate = state.settings.rate || 1, prevY = String(Number(y) - 1);
  function sums(yy) {
    if (!state.years[yy]) return null;
    var r = E.compute(state, yy), out = {};
    state.categories.forEach(function (c) {
      if (c.block === "income" || c.block === "savings" || !r.cells[c.id]) return;
      var t = 0; weeks.forEach(function (w) { var x = r.cells[c.id][w]; if (x && x.cents < 0) t -= x.cents; });
      if (c.currency === "RUB") t = Math.round(t / rate);
      if (t > 0) out[c.id] = t;
    });
    return out;
  }
  var a = sums(y), b = sums(prevY), ids = Object.keys(a).sort(function (p, q) { return a[q] - a[p]; });
  var tot = ids.reduce(function (s2, k) { return s2 + a[k]; }, 0), mx = a[ids[0]] || 1, all = !!ui.anAll, shown = all ? ids : ids.slice(0, 8);
  var label = per === "week" ? shortWeek(y, idx) + " " + y : per === "month" ? E.MONTHS[idx][0].toUpperCase() + E.MONTHS[idx].slice(1) + " " + y : "Весь " + y;
  var cname = function (id) { var c = state.categories.find(function (x) { return x.id === id; }); return c ? c.name : id; };
  var html = "<div class='card section an-cats'><div class='an-head'><h2>На что уходят деньги</h2><div class='seg an-seg' role='tablist'>" +
    [["week", "Неделя"], ["month", "Месяц"], ["year", "Год"]].map(function (x) { return "<button type='button' role='tab' data-anper='" + x[0] + "' class='" + (x[0] === per ? "on" : "") + "' aria-selected='" + (x[0] === per) + "'>" + x[1] + "</button>"; }).join("") + "</div></div>" +
    "<div class='an-nav'>" + (per === "year" ? "" : "<button type='button' class='round-btn' data-anstep='-1' aria-label='Назад'" + (idx <= 0 ? " disabled" : "") + ">‹</button>") +
    "<div><b>" + esc(label) + "</b><span class='small muted'>всего " + eur(rnd(tot), { dec: 0 }) + " · по плану и внесённым тратам</span></div>" +
    (per === "year" ? "" : "<button type='button' class='round-btn' data-anstep='1' aria-label='Вперёд'" + (idx >= max ? " disabled" : "") + ">›</button>") + "</div>";
  html += ids.length ? "<div class='ut-cats'>" + shown.map(function (id) {
    var v = a[id], pv = b && b[id], tr = pv ? (v > pv * 1.15 ? "↑" : v < pv * 0.85 ? "↓" : "") : "";
    return "<div class='uc-row'><span class='uc-n'>" + catIcon(cname(id)) + "<span>" + esc(cname(id)) + "</span></span><span class='uc-v'>" + eur(rnd(v), { dec: 0 }) + "</span>" +
      "<span class='uc-tr " + (tr === "↑" ? "up" : tr ? "down" : "") + "'" + (tr ? " title='" + (tr === "↑" ? "больше" : "меньше") + ", чем в " + prevY + "'" : "") + ">" + tr + "</span>" +
      "<span class='uc-track'><i style='width:" + Math.max(3, Math.round(v / mx * 100)) + "%'></i></span></div>";
  }).join("") + "</div>" + (ids.length > 8 ? "<button type='button' class='btn ghost sm more' id='anAll'>" + (all ? "Свернуть" : "Все категории · ещё " + (ids.length - 8)) + "</button>" : "")
    : "<p class='muted' style='margin:8px 0 0'>За этот период трат нет.</p>";
  html += "<details class='ut-how'><summary>Как считается</summary><ul class='small muted'><li>Расходы из плана за период: то, что запланировано, и то, что уже внесено фактом. Доходы и накопления не входят.</li>" +
    "<li>Рубли — по курсу " + String(rate).replace(".", ",") + " ₽/€.</li><li>↑ / ↓ — больше или меньше, чем за тот же период " + prevY + ", если разница больше 15%.</li></ul></details></div>";
  return html;
}
function bindSpendCats() {
  var y = ui.anYear || ui.year;
  $main.querySelectorAll("[data-anper]").forEach(function (b) { b.onclick = function () { ui.anPer = b.dataset.anper; ui.anIdx = undefined; ui.anAll = false; render(); }; });
  $main.querySelectorAll("[data-anstep]").forEach(function (b) {
    b.onclick = function () {
      var per = ui.anPer || "month", cur = $main.querySelector(".an-cats");
      var nowWk = E.weekOfDate(E.todayISO()), isCur = nowWk && String(nowWk.year) === y;
      var base = ui.anIdx !== undefined && ui.anIdxFor === y + per ? ui.anIdx : per === "week" ? (isCur ? nowWk.idx : 59) : (isCur ? Math.floor(nowWk.idx / 5) : 11);
      ui.anIdx = base + Number(b.dataset.anstep); ui.anIdxFor = y + per; render();
      var c2 = $main.querySelector(".an-cats"); if (cur && c2) c2.scrollIntoView({ block: "nearest" });
    };
  });
  var al = $main.querySelector("#anAll"); if (al) al.onclick = function () { ui.anAll = !ui.anAll; render(); };
}
