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
  if (heavy.length) out.push({ k: "", ic: "▲", h: "Месяцы с расходами выше обычного: " + heavy.map(function (m) { return E.MONTHS[m.month - 1]; }).join(", "),
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
    if (grow.length) out.push({ k: "", ic: "↗", h: "Что выросло по сравнению с " + prevY, p: grow.map(function (x) { return x.c.name + ": " + eur(rnd(x.b), { dec: 0 }) + " → " + eur(rnd(x.a), { dec: 0 }); }).join(" · ") });
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
  if (Math.abs(bal) > 50000) out.push({ k: "", ic: "€", h: (bal > 0 ? partnerName() + " должна тебе " : "Ты должна " + partnerName() + " ") + eur(Math.abs(bal), { dec: 0 }), p: "Большой долг удобнее закрывать регулярно — кнопка «Рассчитаться» на экране «Общие»." });
  // хорошее: доля сбережений, статьи, которые подешевели, лёгкие месяцы
  if (t.income > 0 && t.rate !== null && t.rate >= 0.1) out.push({ k: "good", ic: "↑", h: "Доля сбережений — " + Math.round(t.rate * 100) + "%", p: "За " + curY + " доходы больше расходов на " + eur(rnd(t.net), { dec: 0 }) + ". Обычно советуют откладывать 10–20% доходов." });
  if (state.years[prevY]) {
    var a2 = E.categoryTotals(state, curY), b2 = E.categoryTotals(state, prevY);
    var down = state.categories.filter(function (c) { return c.block !== "income" && c.block !== "savings"; })
      .map(function (c) { return { c: c, d: (b2[c.id] || 0) - (a2[c.id] || 0), a: a2[c.id] || 0, b: b2[c.id] || 0 }; })
      .filter(function (x) { return x.d > 20000 && x.b > 0; }).sort(function (x, y) { return y.d - x.d; }).slice(0, 3);
    if (down.length) out.push({ k: "good", ic: "↘", h: "Что уменьшилось по сравнению с " + prevY, p: down.map(function (x) { return x.c.name + ": " + eur(rnd(x.b), { dec: 0 }) + " → " + eur(rnd(x.a), { dec: 0 }); }).join(" · ") });
  }
  var light = mon.months.filter(function (m) { return m.total > 0 && m.total < avg * 0.8; });
  if (light.length) out.push({ k: "good", ic: "◌", h: "Месяцы с расходами ниже обычного: " + light.map(function (m) { return E.MONTHS[m.month - 1]; }).join(", "), p: "Минимум на 20% меньше среднего — в такие месяцы удобно откладывать." });
  // 7. капитал
  if (t.dcap) out.push({ k: t.dcap > 0 ? "good" : "warn", ic: "◆", h: "Капитал за " + curY + ": " + eur(rnd(t.dcap), { dec: 0, plus: true }), p: "На конец года " + eur(rnd(t.cap), { dec: 0 }) + "." });

  out.sort(function (a, b) { var o = { good: 0, "": 1, warn: 2 }; return o[a.k] - o[b.k]; });
  var html = "<div class='page-head'><div><h1>Выводы " + curY + "</h1><div class='sub'>Короткие наблюдения по году. Считаются сами — из плана, сверок и общих трат.</div></div>" + yearChips(curY, false) + "</div><div class='grid2'>";
  html += out.map(function (o) { return "<div class='card insight " + o.k + "'><div class='ic'>" + o.ic + "</div><div><b>" + esc(o.h) + "</b><p>" + esc(o.p) + "</p></div></div>"; }).join("");
  html += "</div>";
  if (ay.length) {
    var plan = activeYears().filter(function (y) { return Number(y) > Number(curY); })[0];
    if (plan) html += "<div class='section card'><h2>Что решить для плана " + plan + "</h2><ol class='muted' style='margin:0;padding-left:20px'><li>Регулярные суммы (аренда, коммуналка, подписки) — актуальны?</li><li>Бонус и крипта: заложить осторожный сценарий?</li><li>Налоги и соцстрах — хватает ли заложенного?</li><li>Праздники семьи — откладывать заранее?</li><li>Еда и развлечения — оставить или снизить?</li><li>Деньги в обращении — часть на счёт с процентом?</li></ol></div>";
  }
  $main.innerHTML = html;
  bindYearChips(function (yy) { ui.year = yy; render(); });
};
