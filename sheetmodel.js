/* Easy Budget — книга «как твоя таблица» для Google Sheets (и .xlsx).
   Чистые функции без DOM. Результат — описание листов: значения, формулы (синтаксис en-US, «=» в начале),
   оформление диапазонами, закрепление, объединения. Рисует его скрипт в Google Таблице (gsheet/EasyBudget.gs).
   Лист «Мой_ГГГГ» повторяет раскладку исходного Excel: регулярно B:C, недели D:BK, СЧЕТА, КАПИТАЛ, СВЕРКА НАКОПЛЕНИЙ —
   и приложение умеет прочитать его обратно (importer.js). */
(function (root) {
  "use strict";
  var E = root.BudgetEngine;
  var SETTINGS = "ReadMe и Настройки", RATE = "'" + SETTINGS + "'!$B$5", USD = "'" + SETTINGS + "'!$B$6";
  var C = { manual: "#1f5fbf", rec: "#555555", block: "#eeede8", total: "#f4f3ef", now: "#e3f1e8", neg: "#c0392b", pos: "#2b7a4b", head: "#2f6f4f", headInk: "#ffffff", muted: "#8f8e87", warn: "#fbf1dc" };

  function col(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; } // 1 → A
  function eurs(c) { return c === null || c === undefined ? "" : Math.round(c) / 100; }
  function safeText(s) { s = String(s === null || s === undefined ? "" : s); return /^[=+\-@]/.test(s) ? "'" + s : s; }
  // запись ячейки: формула, если есть арифметика, иначе число
  function exprCell(expr, cents) {
    var e = String(expr || "").trim().replace(/^=/, "");
    if (e && /[+\-*\/()]/.test(e.replace(/^-/, "")) && /^[0-9+\-*\/().,\s]+$/.test(e)) return "=" + e.replace(/,/g, ".").replace(/\s+/g, "");
    return eurs(cents);
  }

  function Sheet(name) {
    this.name = name; this.rows = []; this.styles = []; this.merges = []; this.frozen = { rows: 0, cols: 0 }; this.widths = {}; this.notes = [];
  }
  Sheet.prototype.row = function (arr) { this.rows.push(arr || []); return this.rows.length; }; // → номер строки (1-based)
  Sheet.prototype.style = function (r, c, h, w, s) { s.r = r; s.c = c; s.h = h || 1; s.w = w || 1; this.styles.push(s); };
  Sheet.prototype.set = function (r, c, v) { var row = this.rows[r - 1]; while (row.length < c) row.push(""); row[c - 1] = v; };
  Sheet.prototype.out = function () {
    var width = this.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
    return { name: this.name, rows: this.rows.map(function (r) { var x = r.slice(); while (x.length < width) x.push(""); return x; }), width: width,
      styles: this.styles, merges: this.merges, frozen: this.frozen, widths: this.widths, notes: this.notes };
  };

  // ---------------------------------------------------------------------
  // Лист года «Мой_ГГГГ»
  // ---------------------------------------------------------------------
  function yearSheet(state, year, opts) {
    var Y = String(year), yr = state.years[Y], r = E.compute(state, Y), weeks = r.weeks, sh = new Sheet("Мой_" + Y);
    var W0 = 4, WN = W0 + 59; // D … BK
    var wc = function (w) { return col(W0 + w); };
    var cats = state.categories.slice().sort(function (a, b) { return a.sort - b.sort; });
    var nowW = (function () { var t = E.weekOfDate(opts.today || E.todayISO()); return t && String(t.year) === Y ? t.idx : -1; })();
    var alert = state.settings.diffAlert || -5000;

    // шапка: месяцы и подписи недель
    var r1 = [Number(Y), "регулярно", ""], r2 = ["", "сумма", "недели"];
    weeks.forEach(function (wk) { r1.push(wk.wim === 1 ? E.MONTHS[wk.month - 1] : ""); r2.push(wk.label); });
    sh.row(r1); sh.row(r2);
    for (var m = 0; m < 12; m++) sh.merges.push([1, W0 + m * 5, 1, 5]);
    sh.style(1, 1, 2, WN, { bold: true, bg: C.total });
    sh.style(1, W0, 1, 60, { align: "center" });
    sh.style(2, W0, 1, 60, { align: "center", color: C.muted });
    sh.frozen = { rows: 2, cols: 3 };
    sh.widths = { 1: 240, 2: 80, 3: 60 }; for (var w0 = 0; w0 < 60; w0++) sh.widths[W0 + w0] = 72;

    // регулярные правила: формула B:C только если правило одно и на весь год
    var rules = {};
    (yr.recurring || []).forEach(function (ru) { (rules[ru.catId] = rules[ru.catId] || []).push(ru); });
    var wimRowRef = null; // строка «№ недели в месяце» — номер узнаем в конце, формулы допишем потом
    var pendingRegular = [];

    var eurRows = [], rubRows = [], linkRows = { sav: [], inv: [], cash: [], dep_rub: [], inv_rub: [], usd: [] }, catRowById = {};
    E.BLOCKS.forEach(function (b) {
      var list = cats.filter(function (c) { return c.block === b.id && (!c.archived || r.cells[c.id].some(Boolean)); });
      if (!list.length) return;
      var hr = sh.row([b.name.toLowerCase()]);
      sh.style(hr, 1, 1, WN, { bold: true, bg: C.block });
      list.forEach(function (c) {
        var rs = rules[c.id] || [], one = rs.length === 1 && (!rs[0].from || rs[0].from <= Y + "-01-01") && !rs[0].to ? rs[0] : null;
        var rowArr = [safeText(c.name) + (c.mandatory ? "" : ""), one ? exprCell(one.expr, one.cents) : "", one ? one.weeks : (rs.length ? "см. «Регулярные траты»" : "")];
        var cells = r.cells[c.id];
        for (var w = 0; w < 60; w++) {
          var x = cells[w];
          if (!x) { rowArr.push(""); continue; }
          if (x.src === "manual") rowArr.push(exprCell(x.expr, x.cents));
          else rowArr.push(one ? { regular: true } : eurs(x.cents));
        }
        var rn = sh.row(rowArr);
        catRowById[c.id] = rn;
        if (c.currency === "RUB") rubRows.push(rn); else eurRows.push(rn);
        if (c.link && linkRows[c.link]) linkRows[c.link].push(rn);
        if (one) pendingRegular.push(rn);
        // оформление: ручное — синим, регулярное — серым
        for (var w2 = 0; w2 < 60; w2++) { var x2 = cells[w2]; if (x2) sh.style(rn, W0 + w2, 1, 1, { color: x2.src === "manual" ? C.manual : C.rec }); }
        if (rs.length) sh.style(rn, 2, 1, 2, { color: C.rec });
        if (c.currency === "RUB") sh.notes.push([rn, 1, "Сумма в рублях"]);
        var noteW = []; for (var w3 = 0; w3 < 60; w3++) { var x3 = cells[w3]; if (x3 && x3.note) noteW.push([rn, W0 + w3, x3.note]); }
        sh.notes = sh.notes.concat(noteW);
      });
    });
    var firstData = 3, lastCat = sh.rows.length;
    sh.style(firstData, 2, Math.max(1, lastCat - 2), 1, { nf: "#,##0.00" });
    sh.style(firstData, W0, Math.max(1, lastCat - 2), 60, { nf: "#,##0.00" });

    // блоки ниже: сначала строим номера строк, потом формулы
    sh.row([]);
    var R = {};
    R.obr = sh.row(["ИТОГО В ОБРАЩЕНИИ € (расчёт)"]);
    R.fact = sh.row(["ФАКТ € (сумма счетов)"]);
    R.diff = sh.row(["расхождение (факт − расчёт)"]);
    sh.row([]);
    R.capHead = sh.row(["КАПИТАЛ", "старт"]);
    R.base = sh.row(["в обращении € (факт, если внесён)"]);
    R.sav = sh.row(["   накопительный счёт €"]); R.inv = sh.row(["   инвестиции €"]); R.cash = sh.row(["   отложенная наличка €"]);
    R.savT = sh.row(["накопления € итого"]);
    R.card_rub = sh.row(["   карта / счёт ₽"]); R.dep_rub = sh.row(["   вклад ₽"]); R.inv_rub = sh.row(["   инвестиции ₽"]);
    R.rubT = sh.row(["рублёвые средства ₽ итого"]); R.rubE = sh.row(["рублёвые средства в €"]);
    R.usd = sh.row(["   доллары $"]);
    R.cap = sh.row(["ИТОГО КАПИТАЛ €"]);
    R.dweek = sh.row(["изменение за неделю €"]);
    R.dmonth = sh.row(["изменение капитала за месяц €"]);
    sh.row([]);
    R.accHead = sh.row(["СЧЕТА (остатки — получится ФАКТ)"]);
    var accRows = [];
    var accs = state.accounts.slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); }).filter(function (a) { return !a.archived || Object.keys(yr.recon || {}).some(function (w) { return yr.recon[w][a.id]; }); });
    accs.forEach(function (a) {
      var label = safeText(a.name) + (a.kind === "info" ? " (для справки, в ФАКТ не входит)" : a.countsFrom ? " (с " + a.countsFrom.slice(8, 10) + "." + a.countsFrom.slice(5, 7) + ")" : "");
      var arr = [label, "", ""];
      for (var w = 0; w < 60; w++) { var e = (yr.recon && yr.recon[w] || {})[a.id]; arr.push(e && e.cents !== null && e.cents !== undefined ? exprCell(e.expr, e.cents) : ""); }
      accRows.push({ a: a, r: sh.row(arr) });
    });
    sh.row([]);
    R.srHead = sh.row(["СВЕРКА НАКОПЛЕНИЙ (остаток целиком, заменяет расчёт)"]);
    var srRow = {};
    E.CAPITAL_ROWS.forEach(function (cr) {
      var arr = [cr.name, "", ""];
      for (var w = 0; w < 60; w++) { var s = (yr.savRecon && yr.savRecon[w] || {})[cr.key]; arr.push(s === undefined || s === null ? "" : eurs(s)); }
      srRow[cr.key] = sh.row(arr);
    });
    sh.row([]);
    R.svc = sh.row(["служебное"]);
    R.wim = sh.row(["№ недели в месяце", "", ""].concat(weeks.map(function (wk) { return wk.wim; })));
    R.from = sh.row(["начало недели", "", ""].concat(weeks.map(function (wk) { return wk.from; })));
    R.to = sh.row(["конец недели", "", ""].concat(weeks.map(function (wk) { return wk.to; })));
    if (yr.notes) { sh.row([]); sh.row(["ЗАМЕТКИ"]); String(yr.notes).split(/\n/).forEach(function (l) { sh.row([safeText(l)]); }); }

    // регулярные: формула, как в исходной таблице
    pendingRegular.forEach(function (rn) {
      for (var w = 0; w < 60; w++) {
        if (sh.rows[rn - 1][W0 + w - 1] && sh.rows[rn - 1][W0 + w - 1].regular) {
          var cl = wc(w);
          sh.set(rn, W0 + w, "=IF(OR(LOWER($C" + rn + ")=\"все\",ISNUMBER(SEARCH(" + cl + "$" + R.wim + ",$C" + rn + "))),$B" + rn + ",\"\")");
        }
      }
    });

    // формулы итогов
    var st = r.start || {};
    function ranges(rowsList, cl) { // «D4:D7,D9:D20» для смежных строк
      if (!rowsList.length) return "0";
      var out = [], a = rowsList[0], p = a;
      for (var i = 1; i <= rowsList.length; i++) {
        var x = rowsList[i];
        if (x === p + 1) { p = x; continue; }
        out.push(a === p ? cl + a : cl + a + ":" + cl + p); a = p = x;
      }
      return out.join(",");
    }
    function sumOf(rowsList, cl) { return rowsList.length ? "SUM(" + ranges(rowsList, cl) + ")" : "0"; }
    sh.set(R.capHead, 2, "старт");
    sh.set(R.base, 2, eurs(st.obr)); E.CAPITAL_ROWS.forEach(function (cr) { sh.set(R[cr.key], 2, eurs(st[cr.key] || 0)); });
    for (var w = 0; w < 60; w++) {
      var cl = wc(w), pv = w === 0 ? null : wc(w - 1);
      var prevBase = w === 0 ? "$B$" + R.base : pv + R.base;
      sh.set(R.obr, W0 + w, "=" + prevBase + "+" + sumOf(eurRows, cl));
      var active = accRows.filter(function (x) { return E.accountActive(x.a, weeks[w]); }).map(function (x) { return cl + x.r; });
      sh.set(R.fact, W0 + w, active.length ? "=IF(COUNT(" + active.join(",") + ")=0,\"\",SUM(" + active.join(",") + "))" : "");
      sh.set(R.diff, W0 + w, "=IF(" + cl + R.fact + "=\"\",\"\"," + cl + R.fact + "-" + cl + R.obr + ")");
      sh.set(R.base, W0 + w, "=IF(" + cl + R.fact + "<>\"\"," + cl + R.fact + "," + cl + R.obr + ")");
      ["sav", "inv", "cash", "dep_rub", "inv_rub", "usd"].forEach(function (k) {
        var prev = w === 0 ? "$B$" + R[k] : pv + R[k];
        sh.set(R[k], W0 + w, "=IF(ISNUMBER(" + cl + srRow[k] + ")," + cl + srRow[k] + "," + prev + "-" + sumOf(linkRows[k], cl) + ")");
      });
      var prevCard = w === 0 ? "$B$" + R.card_rub : pv + R.card_rub;
      sh.set(R.card_rub, W0 + w, "=IF(ISNUMBER(" + cl + srRow.card_rub + ")," + cl + srRow.card_rub + "," + prevCard + "+" + sumOf(rubRows, cl) + ")");
      sh.set(R.savT, W0 + w, "=SUM(" + cl + R.sav + ":" + cl + R.cash + ")");
      sh.set(R.rubT, W0 + w, "=SUM(" + cl + R.card_rub + ":" + cl + R.inv_rub + ")");
      sh.set(R.rubE, W0 + w, "=" + cl + R.rubT + "/" + RATE);
      sh.set(R.cap, W0 + w, "=" + cl + R.base + "+" + cl + R.savT + "+" + cl + R.rubE + "+" + cl + R.usd + "/" + USD);
      var prevCap = w === 0 ? "($B$" + R.base + "+SUM($B$" + R.sav + ":$B$" + R.cash + ")+SUM($B$" + R.card_rub + ":$B$" + R.inv_rub + ")/" + RATE + "+$B$" + R.usd + "/" + USD + ")" : pv + R.cap;
      sh.set(R.dweek, W0 + w, "=" + cl + R.cap + "-" + prevCap);
      if (weeks[w].wim === 5) {
        var prevM = w < 5 ? prevCap.replace(pv + R.cap, "") : wc(w - 5) + R.cap;
        if (w < 5) prevM = "($B$" + R.base + "+SUM($B$" + R.sav + ":$B$" + R.cash + ")+SUM($B$" + R.card_rub + ":$B$" + R.inv_rub + ")/" + RATE + "+$B$" + R.usd + "/" + USD + ")";
        sh.set(R.dmonth, W0 + w, "=" + cl + R.cap + "-" + prevM);
      }
    }
    sh.set(R.savT, 2, "=SUM(B" + R.sav + ":B" + R.cash + ")");
    sh.set(R.rubT, 2, "=SUM(B" + R.card_rub + ":B" + R.inv_rub + ")");
    sh.set(R.rubE, 2, "=B" + R.rubT + "/" + RATE);
    sh.set(R.cap, 2, "=B" + R.base + "+B" + R.savT + "+B" + R.rubE + "+B" + R.usd + "/" + USD);

    // оформление нижних блоков
    [R.obr, R.fact, R.diff].forEach(function (rn) { sh.style(rn, 1, 1, WN, { bold: true, bg: C.total, nf: "#,##0" }); });
    sh.style(R.capHead, 1, 1, WN, { bold: true, bg: C.block });
    sh.style(R.base, 1, R.usd - R.base + 1, WN, { nf: "#,##0" });
    [R.savT, R.rubT].forEach(function (rn) { sh.style(rn, 1, 1, WN, { italic: true }); });
    sh.style(R.cap, 1, 1, WN, { bold: true, bg: C.total, nf: "#,##0" });
    sh.style(R.dweek, 1, 2, WN, { nf: "+#,##0;−#,##0;0", color: C.muted });
    [R.accHead, R.srHead, R.svc].forEach(function (rn) { sh.style(rn, 1, 1, WN, { bold: true, bg: C.block }); });
    if (accRows.length) sh.style(accRows[0].r, W0, accRows.length, 60, { nf: "#,##0.00", color: C.manual });
    sh.style(srRow.sav, W0, E.CAPITAL_ROWS.length, 60, { nf: "#,##0", color: C.manual });
    sh.style(R.svc, 1, R.to - R.svc + 1, WN, { color: C.muted });
    // расхождение и итоги месяца — цветом по значению (как условное форматирование в Excel)
    for (var w4 = 0; w4 < 60; w4++) {
      var d = r.diff[w4];
      if (d !== null && d !== undefined) sh.style(R.diff, W0 + w4, 1, 1, { color: d < alert ? C.neg : d > 0 ? C.pos : null, bold: true });
      if (weeks[w4].wim === 5) {
        var dm = r.dmonth[w4];
        sh.style(R.dmonth, W0 + w4, 1, 1, { nf: "+#,##0;−#,##0;0", bold: true, color: dm < 0 ? C.neg : C.pos });
        sh.style(R.cap, W0 + w4, 1, 1, { bg: "#e9e7df" });
      }
      if (r.base[w4] < 0) sh.style(R.base, W0 + w4, 1, 1, { color: C.neg, bold: true });
    }
    // текущая неделя и границы месяцев
    if (nowW >= 0) sh.style(1, W0 + nowW, sh.rows.length, 1, { bg: C.now, keepBg: true });
    for (var m2 = 1; m2 < 12; m2++) sh.style(1, W0 + m2 * 5, sh.rows.length, 1, { borderLeft: true });
    return sh.out();
  }

  // архивный год (старый формат): значения по неделям и капитал на конец месяца
  function archiveSheet(state, year) {
    var Y = String(year), r = E.compute(state, Y), sh = new Sheet(Y + "_€"), cats = state.categories.slice().sort(function (a, b) { return a.sort - b.sort; });
    var head = [Number(Y), ""]; for (var w = 0; w < 60; w++) head.push(w % 5 === 0 ? E.MONTHS_SHORT[Math.floor(w / 5)] : "");
    sh.row(head); sh.style(1, 1, 1, 62, { bold: true, bg: C.total }); sh.frozen = { rows: 1, cols: 1 }; sh.widths = { 1: 240 };
    E.BLOCKS.forEach(function (b) {
      var list = cats.filter(function (c) { return c.block === b.id && r.cells[c.id].some(Boolean); });
      if (!list.length) return;
      var hr = sh.row([b.name.toLowerCase()]); sh.style(hr, 1, 1, 62, { bold: true, bg: C.block });
      list.forEach(function (c) { sh.row([safeText(c.name), ""].concat(r.cells[c.id].map(function (x) { return x ? eurs(x.cents) : ""; }))); });
    });
    sh.style(2, 3, sh.rows.length, 60, { nf: "#,##0" });
    var cm = (r.capMonth || []);
    if (cm.some(function (v) { return v !== null && v !== undefined; })) {
      sh.row([]); var cr = sh.row(["Капитал на конец месяца", ""].concat(cm.map(eurs)));
      sh.style(cr, 1, 1, 14, { bold: true, nf: "#,##0" });
    }
    return sh.out();
  }

  // «Анализ»: по месяцам за каждый год + категории год к году
  function analysisSheet(state) {
    var sh = new Sheet("Анализ"), ys = Object.keys(state.years).sort();
    sh.widths = { 1: 260 }; sh.frozen = { rows: 0, cols: 1 };
    var defs = [["Доходы", "income"], ["Базовые расходы", "base"], ["Периодические", "periodic"], ["Подписки ES", "subs_es"], ["Подписки RU (в €)", "subs_ru"],
      ["Расходы итого", "total", 1], ["   на жизнь (без налогов)", "living"], ["Доходы − расходы", "net", 1], ["Отложено в накопления", "saved"], ["Капитал на конец месяца", "cap", 1], ["Изменение капитала", "dcap"], ["Доля сбережений", "rate"]];
    ys.forEach(function (y) {
      var mon; try { mon = E.monthly(state, y); } catch (e) { return; }
      var hr = sh.row([y + (state.years[y].archived ? " · архив" : "")].concat(E.MONTHS_SHORT, ["Год"]));
      sh.style(hr, 1, 1, 14, { bold: true, bg: C.block });
      defs.forEach(function (d) {
        var k = d[1], arr = mon.months.map(function (m) { var v = m[k]; return v === null || v === undefined ? "" : k === "rate" ? Math.round(v * 1000) / 1000 : eurs(v); });
        var t = mon.total[k]; arr.push(t === null || t === undefined ? "" : k === "rate" ? Math.round(t * 1000) / 1000 : eurs(t));
        var rn = sh.row([d[0]].concat(arr));
        sh.style(rn, 2, 1, 13, { nf: k === "rate" ? "0%" : "#,##0", bold: !!d[2] });
        if (d[2]) sh.style(rn, 1, 1, 1, { bold: true });
      });
      sh.row([]);
    });
    // категории год к году
    var act = ys.filter(function (y) { try { E.compute(state, y); return true; } catch (e) { return false; } });
    var hr2 = sh.row(["Категории год к году"].concat(act)); sh.style(hr2, 1, 1, act.length + 1, { bold: true, bg: C.block });
    var tots = act.map(function (y) { return E.categoryTotals(state, y); });
    state.categories.slice().sort(function (a, b) { return a.sort - b.sort; }).filter(function (c) { return c.block !== "income" && c.block !== "savings"; }).forEach(function (c) {
      var vals = tots.map(function (t) { return t[c.id] ? eurs(t[c.id]) : ""; });
      if (vals.some(function (v) { return v !== "" && v !== 0; })) { var rn = sh.row([safeText(c.name)].concat(vals)); sh.style(rn, 2, 1, act.length, { nf: "#,##0" }); }
    });
    return sh.out();
  }

  // «Выводы»: тот же бутерброд, что в приложении
  function insightsSheet(state, opts) {
    var I = root.BudgetInsights, sh = new Sheet("Выводы"); sh.widths = { 1: 200, 2: 520, 3: 600 };
    if (!I) return null;
    var y = String((opts.today || E.todayISO()).slice(0, 4)); if (!state.years[y]) y = Object.keys(state.years).sort().pop();
    var res = I.personal(state, y, { today: opts.today, shared: opts.shared, toLog: 0 });
    var t = sh.row(["Выводы " + y, "Обновлено: " + (opts.generatedAt || "").slice(0, 16).replace("T", " ")]); sh.style(t, 1, 1, 3, { bold: true, bg: C.total });
    function block(title, list, color) {
      if (!list.length) return;
      var hr = sh.row([title]); sh.style(hr, 1, 1, 3, { bold: true, bg: C.block });
      list.forEach(function (c) { var rn = sh.row(["", safeText(c.h), safeText(c.p)]); sh.style(rn, 2, 1, 1, { bold: true, color: color }); sh.style(rn, 3, 1, 1, { wrap: true }); });
    }
    block("Что получилось", res.good.length ? res.good : res.neutral ? [res.neutral] : [], C.pos);
    block("Что можно улучшить", res.improve, "#a87a1f");
    if (res.next) { var hr = sh.row(["Шаг вперёд"]); sh.style(hr, 1, 1, 3, { bold: true, bg: C.block }); var rn = sh.row(["", safeText(res.next)]); sh.style(rn, 2, 1, 2, { wrap: true }); }
    block("Для справки", res.info, null);
    if (opts.expenses && opts.expenses.length) {
      var tg = I.together(opts.expenses, { today: opts.today, learned: opts.learned, partnerName: opts.partnerName });
      sh.row([]); var h2 = sh.row(["Мы — общие траты"]); sh.style(h2, 1, 1, 3, { bold: true, bg: C.total });
      block("Что получилось", tg.good, C.pos); block("Что можно улучшить", tg.improve, "#a87a1f");
      if (tg.next) { var h3 = sh.row(["Шаг вперёд"]); sh.style(h3, 1, 1, 3, { bold: true, bg: C.block }); sh.row(["", safeText(tg.next)]); }
    }
    return sh.out();
  }

  // «Общие траты»: лента с долями и баланс
  function sharedSheet(opts) {
    var S = root.BudgetShared, ex = opts.expenses || [], sh = new Sheet("Общие траты");
    if (!ex.length || !S) return null;
    var partner = opts.partnerName || "партнёр", bal = S.balance(ex);
    var b = bal.EUR || 0;
    var t = sh.row(["Баланс", b > 0 ? partner + " должна тебе" : b < 0 ? "ты должна " + partner : "вы в расчёте", Math.abs(eurs(b))]);
    sh.style(t, 1, 1, 3, { bold: true, bg: C.total }); sh.style(t, 3, 1, 1, { nf: "#,##0.00" });
    sh.row([]);
    var hr = sh.row(["Дата", "Описание", "Категория", "Сумма", "Валюта", "Кто платил", "Моя доля", "Мне должны (+) / я должна (−)", "Тип", "Заметка"]);
    sh.style(hr, 1, 1, 10, { bold: true, bg: C.block });
    sh.frozen = { rows: hr, cols: 0 };
    sh.widths = { 1: 90, 2: 260, 3: 170, 4: 80, 5: 60, 6: 90, 7: 80, 8: 120, 9: 80, 10: 220 };
    ex.slice().sort(function (a, b2) { return a.date < b2.date ? 1 : a.date > b2.date ? -1 : 0; }).forEach(function (e) {
      var cat = e.kind === "settlement" || e.kind === "refund" ? "перевод между вами" : e.kind === "batch" && !e.cat ? "Сводные суммы" : S.catOf(e, opts.learned || {});
      sh.row([e.date, safeText(e.desc || ""), cat, eurs(e.cost), e.currency || "EUR", e.paidByMe ? "я" : partner, eurs(e.share), eurs(e.net),
        { expense: "трата", batch: "сводная", settlement: "расчёт", refund: "возврат" }[e.kind] || e.kind, safeText(e.note || "")]);
    });
    var n = sh.rows.length - hr;
    if (n > 0) { sh.style(hr + 1, 4, n, 1, { nf: "#,##0.00" }); sh.style(hr + 1, 7, n, 2, { nf: "+#,##0.00;−#,##0.00;0" }); }
    return sh.out();
  }

  // «Регулярные траты»: все правила, включая смену суммы с середины года
  function recurringSheet(state) {
    var sh = new Sheet("Регулярные траты"), cats = {}; state.categories.forEach(function (c) { cats[c.id] = c; });
    sh.widths = { 1: 60, 2: 240, 3: 90, 4: 80, 5: 100, 6: 100 };
    var hr = sh.row(["Год", "Категория", "Сумма", "Недели", "С", "По"]); sh.style(hr, 1, 1, 6, { bold: true, bg: C.block }); sh.frozen = { rows: 1, cols: 0 };
    Object.keys(state.years).sort().forEach(function (y) {
      (state.years[y].recurring || []).slice().sort(function (a, b) { return ((cats[a.catId] || {}).sort || 0) - ((cats[b.catId] || {}).sort || 0); }).forEach(function (ru) {
        var c = cats[ru.catId]; if (!c) return;
        sh.row([Number(y), safeText(c.name) + (c.currency === "RUB" ? " (₽)" : ""), eurs(ru.cents), ru.weeks, ru.from || "", ru.to || ""]);
      });
    });
    if (sh.rows.length > 1) sh.style(2, 3, sh.rows.length - 1, 1, { nf: "#,##0.00" });
    return sh.out();
  }

  // «Наличка»: карманы и движения
  function cashSheet(state) {
    var c = state.cash, K = root.BudgetCash;
    if (!c || !c.pockets || !c.pockets.length || !K) return null;
    var sh = new Sheet("Наличка"), bal = K.balances(c, []);
    sh.widths = { 1: 100, 2: 160, 3: 160, 4: 90, 5: 260 };
    var h = sh.row(["Карман", "Остаток"]); sh.style(h, 1, 1, 2, { bold: true, bg: C.block });
    c.pockets.forEach(function (p) { var rn = sh.row([safeText(p.name), eurs(bal[p.id])]); sh.style(rn, 2, 1, 1, { nf: "#,##0.00" }); });
    sh.row([]);
    var name = function (id) { if (id === "bank") return "карта"; var p = c.pockets.find(function (x) { return x.id === id; }); return p ? p.name : ""; };
    var h2 = sh.row(["Дата", "Откуда", "Куда", "Сумма", "Заметка"]); sh.style(h2, 1, 1, 5, { bold: true, bg: C.block });
    (c.tx || []).slice().sort(function (a, b) { return (a.date || "") < (b.date || "") ? 1 : -1; }).forEach(function (t) {
      var rn = sh.row([t.date || "", safeText(name(t.from)), safeText(name(t.to)), eurs(t.cents), safeText(t.note || "")]); sh.style(rn, 4, 1, 1, { nf: "#,##0.00" });
    });
    return sh.out();
  }

  function settingsSheet(state, opts) {
    var s = state.settings || {}, sh = new Sheet(SETTINGS); sh.widths = { 1: 300, 2: 160 };
    var t = sh.row(["Easy Budget — копия бюджета"]); sh.style(t, 1, 1, 2, { bold: true, bg: C.total });
    sh.row(["Обновлено", (opts.generatedAt || "").slice(0, 16).replace("T", " ")]);
    sh.row(["Эта таблица обновляется сама из приложения. Правки здесь перезапишутся при следующем обновлении — вноси их в приложении."]);
    sh.row(["Настройки"]);
    sh.row(["Курс: ₽ за 1 €", s.rate || 95]);
    sh.row(["Курс: $ за 1 €", (s.fx && s.fx.USD) || 1.08]);
    sh.row(["Порог тревоги по расхождению, €", Math.abs((s.diffAlert || -5000) / 100)]);
    sh.row([]);
    sh.row(["Как устроены листы «Мой_ГГГГ»"]);
    [["В обращении", "деньги на счетах, с которых тратишь каждый день"], ["Накопления", "накопительный счёт, инвестиции, отложенная наличка, вклад"], ["Капитал", "всё вместе в €"],
      ["Недели", "с понедельника по воскресенье, в месяце всегда 5 столбцов"], ["Цвета", "синий — вписано вручную · серый — регулярное · зелёный столбец — текущая неделя · красное расхождение — больше порога"],
      ["Регулярно (B:C)", "сумма и недели месяца (1…5 через запятую или «все»); если сумма менялась в течение года — см. лист «Регулярные траты»"]].forEach(function (x) { sh.row(x); });
    sh.style(4, 1, 1, 2, { bold: true, bg: C.block }); sh.style(9, 1, 1, 2, { bold: true, bg: C.block });
    sh.style(5, 2, 2, 1, { color: C.manual }); sh.style(3, 1, 1, 2, { italic: true, color: C.muted });
    return sh.out();
  }

  // ---------------------------------------------------------------------
  // Вся книга
  // ---------------------------------------------------------------------
  function workbook(state, opts) {
    opts = opts || {};
    opts.today = opts.today || E.todayISO();
    opts.generatedAt = opts.generatedAt || new Date().toISOString();
    var sheets = [settingsSheet(state, opts)];
    var ys = Object.keys(state.years).sort();
    ys.filter(function (y) { return !state.years[y].archived; }).reverse().forEach(function (y) { sheets.push(yearSheet(state, y, opts)); });
    sheets.push(insightsSheet(state, opts));
    sheets.push(sharedSheet(opts));
    sheets.push(analysisSheet(state));
    sheets.push(recurringSheet(state));
    sheets.push(cashSheet(state));
    ys.filter(function (y) { return state.years[y].archived; }).reverse().forEach(function (y) { sheets.push(archiveSheet(state, y)); });
    return { app: "easy-budget", version: 1, generatedAt: opts.generatedAt, sheets: sheets.filter(Boolean) };
  }

  root.BudgetSheet = { workbook: workbook, yearSheet: yearSheet, col: col, exprCell: exprCell };
})(typeof window !== "undefined" ? window : this);
