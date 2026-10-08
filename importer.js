/* Easy Budget — импорт таблицы (.xlsx из Excel или Google Sheets) в формате «Мой_ГГГГ».
   Раскладка читается по подписям (блоки, СЧЕТА, КАПИТАЛ, СВЕРКА), а не по номерам строк,
   поэтому подходит для любой таблицы того же формата со своими категориями.
   Нужен SheetJS (window.XLSX). Чистая функция: книга → состояние приложения. */
(function (root) {
  "use strict";
  var E = root.BudgetEngine;
  var MONTHS_GEN = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];

  function norm(s) { return String(s === null || s === undefined ? "" : s).replace(/\s+/g, " ").trim().toLowerCase().replace(/ё/g, "е"); }
  function cellAt(ws, r, c) { return ws[root.XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })]; }
  function val(ws, r, c) { var x = cellAt(ws, r, c); return x ? x.v : null; }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : null); }
  function cents(v) { var n = num(v); return n === null ? null : Math.round(n * 100); }
  function maxRow(ws) { return ws["!ref"] ? root.XLSX.utils.decode_range(ws["!ref"]).e.r + 1 : 0; }

  // Запись ячейки: исходная формула, если её можно посчитать без ссылок на другие ячейки
  function entryOf(cell) {
    if (!cell) return null;
    var c = cents(cell.v);
    if (c === null) return null;
    var f = cell.f ? String(cell.f).replace(/^=/, "") : null;
    if (f && /[A-Za-zА-Яа-я$!]/.test(f)) return { expr: String(c / 100), cents: c, note: "в Excel: =" + f };
    return { expr: f || String(c / 100), cents: c };
  }

  function blockOf(label) {
    var l = norm(label);
    if (l === "доходы") return "income";
    if (/^расходы базов/.test(l)) return "base";
    if (/^расходы период/.test(l)) return "periodic";
    if (/^подписки/.test(l) && /\bes\b|испан/.test(l)) return "subs_es";
    if (/^подписки/.test(l) && /\bru\b|рос|₽/.test(l)) return "subs_ru";
    if (/^накоплени/.test(l)) return "savings";
    return null;
  }
  function savingsLink(label) {
    var l = norm(label);
    if (/вклад/.test(l)) return "dep_rub";
    if (/инвест/.test(l) && /₽|руб/.test(l)) return "inv_rub";
    if (/накопит/.test(l)) return "sav";
    if (/инвест/.test(l)) return "inv";
    if (/налич|нал\b/.test(l)) return "cash";
    return null;
  }
  function capitalKey(label) {
    var l = norm(label);
    if (/в обращении/.test(l)) return "obr";
    if (/карта|сч[её]т ₽/.test(l)) return "card_rub";
    return savingsLink(l);
  }
  function countsFrom(label, year) {
    var m = norm(label).match(/\(с ([а-я]+)/);
    if (!m) return null;
    for (var i = 0; i < 12; i++) if (m[1].indexOf(MONTHS_GEN[i]) === 0) return year + "-" + (i < 9 ? "0" : "") + (i + 1) + "-01";
    return null;
  }

  // Лист года нового формата: A1 = год, B1 = «регулярно», D..BK — 60 недель
  function isYearSheet(ws) {
    var y = num(val(ws, 1, 1));
    return y && y > 2000 && y < 2100 && norm(val(ws, 1, 2)) === "регулярно" ? y : null;
  }

  function parseYearSheet(ws, year) {
    var rows = maxRow(ws), out = { year: year, cats: [], accounts: [], savReconRows: [], capRows: {}, labels: [] };
    for (var c = 4; c < 64; c++) out.labels.push(String(val(ws, 2, c) || ""));
    var block = null, section = "cats";
    for (var r = 3; r <= rows; r++) {
      var label = val(ws, r, 1), l = norm(label);
      if (!l) { if (section === "accounts" && out.accounts.length) section = "after"; continue; }
      if (/^итого в обращении/.test(l)) { section = "totals"; block = null; continue; }
      if (/^капитал$/.test(l)) { section = "capital"; continue; }
      if (/^сч[её]та/.test(l)) { section = "accounts"; continue; }
      if (/^сверка накоплений/.test(l)) { section = "savrecon"; continue; }
      if (/^служебное|^заметки|^№ недели/.test(l)) { section = "after"; continue; }
      if (section === "cats") {
        var b = blockOf(label);
        if (b) { block = b; continue; }
        if (!block) continue;
        out.cats.push({ row: r, name: String(label).trim(), block: block });
      } else if (section === "capital") {
        var k = capitalKey(label);
        if (k && !(k in out.capRows)) out.capRows[k] = r;
      } else if (section === "accounts") {
        out.accounts.push({ row: r, name: String(label).trim(), info: /не входит|не считать|net|информатив/.test(l), countsFrom: countsFrom(label, year) });
      } else if (section === "savrecon") {
        var sk = capitalKey(label);
        if (sk && sk !== "obr") out.savReconRows.push({ row: r, key: sk });
      }
    }
    return out;
  }

  function importWorkbook(wb) {
    var XLSX = root.XLSX, warnings = [];
    var state = { version: 1, settings: { rate: 95, myName: "", partnerName: "", defaultShare: 0.5, diffAlert: -5000, fx: { GEL: 3, USD: 1.08 } },
      categories: [], accounts: [], years: {} };
    // курс
    wb.SheetNames.forEach(function (n) {
      var ws = wb.Sheets[n];
      if (!/настрой|readme/i.test(n)) return;
      for (var r = 1; r <= Math.min(maxRow(ws), 80); r++) {
        if (/^курс/.test(norm(val(ws, r, 1))) && num(val(ws, r, 2))) { state.settings.rate = num(val(ws, r, 2)); break; }
      }
    });
    state.settings.fx.RUB = state.settings.rate;

    var yearSheets = wb.SheetNames.map(function (n) { return { n: n, ws: wb.Sheets[n], y: isYearSheet(wb.Sheets[n]) }; })
      .filter(function (x) { return x.y; }).sort(function (a, b) { return a.y - b.y; });
    if (!yearSheets.length) throw new Error("Не нашла листов года: нужен лист, где в A1 год, а в B1 «регулярно».");

    // категории: из первого листа; дальше — по имени в блоке, иначе по позиции в блоке
    var catByKey = {}, firstLayout = null, sort = 0;
    function addCat(name, block) {
      var id = "c" + (++sort);
      var cur = block === "subs_ru" || /₽/.test(name) ? "RUB" : "EUR";
      var cat = { id: id, name: name, block: block, currency: cur, mandatory: /налог|social|seguridad|соцстрах|xolo|бухгалтер/i.test(name),
        link: block === "savings" ? savingsLink(name) : null, sort: sort, archived: false };
      state.categories.push(cat);
      catByKey[block + "|" + norm(name)] = cat;
      return cat;
    }
    var accByName = {};
    yearSheets.forEach(function (ys, si) {
      var lay = parseYearSheet(ys.ws, ys.y), ws = ys.ws, year = ys.y;
      var used = {}, rowCat = {};
      var posInBlock = {};
      lay.cats.forEach(function (c) {
        var p = posInBlock[c.block] = (posInBlock[c.block] || 0) + 1;
        var cat = catByKey[c.block + "|" + norm(c.name)];
        if (!cat && firstLayout) {
          var same = firstLayout.cats.filter(function (x) { return x.block === c.block; })[p - 1];
          var cand = same && catByKey[same.block + "|" + norm(same.name)];
          if (cand && !used[cand.id] && firstLayout.cats.filter(function (x) { return x.block === c.block; }).length === lay.cats.filter(function (x) { return x.block === c.block; }).length) cat = cand;
        }
        if (!cat) cat = addCat(c.name, c.block);
        used[cat.id] = true; rowCat[c.row] = cat;
      });
      if (!firstLayout) firstLayout = lay;
      lay.accounts.forEach(function (a) {
        var key = norm(a.name).replace(/\s*\(.*\)$/, "");
        if (!accByName[key]) {
          var acc = { id: "a" + (state.accounts.length + 1), name: a.name.replace(/\s*\(с [^)]*\)/i, "").trim(), kind: a.info ? "info" : "cash_flow", sort: state.accounts.length + 1 };
          if (a.countsFrom) acc.countsFrom = a.countsFrom;
          state.accounts.push(acc); accByName[key] = acc;
        }
        a.acc = accByName[key];
      });

      var y = { year: year, labels: lay.labels, start: null, fromPrev: false, entries: {}, recurring: [], recon: {}, savRecon: {}, notes: "" };
      lay.cats.forEach(function (c) {
        var cat = rowCat[c.row], b = cellAt(ws, c.row, 2), wk = val(ws, c.row, 3);
        if (b && num(b.v) !== null && wk !== null && String(wk).trim() !== "") {
          var e = entryOf(b);
          y.recurring.push({ id: "r" + year + "_" + cat.id, catId: cat.id, expr: e.expr, cents: e.cents, weeks: String(wk).trim().toLowerCase(), from: year + "-01-01", to: null });
        }
        for (var i = 0; i < 60; i++) {
          var cell = cellAt(ws, c.row, 4 + i);
          if (!cell) continue;
          if (cell.f && /^=?IF\(\$B/i.test(cell.f)) continue; // ячейка разворачивает регулярный платёж
          var en = entryOf(cell);
          if (!en) continue;
          y.entries[cat.id] = y.entries[cat.id] || {};
          y.entries[cat.id][String(i)] = en;
        }
      });
      lay.accounts.forEach(function (a) {
        for (var i = 0; i < 60; i++) {
          var en = entryOf(cellAt(ws, a.row, 4 + i));
          if (!en) continue;
          y.recon[String(i)] = y.recon[String(i)] || {};
          y.recon[String(i)][a.acc.id] = en;
        }
      });
      lay.savReconRows.forEach(function (s) {
        for (var i = 0; i < 60; i++) {
          var c2 = cents(val(ws, s.row, 4 + i));
          if (c2 === null) continue;
          y.savRecon[String(i)] = y.savRecon[String(i)] || {};
          y.savRecon[String(i)][s.key] = c2;
        }
      });
      var obrCell = lay.capRows.obr ? cellAt(ws, lay.capRows.obr, 2) : null;
      if (si > 0 && obrCell && obrCell.f && /!/.test(obrCell.f)) y.fromPrev = true; // ссылается на прошлый год
      else {
        y.start = { obr: 0, sav: 0, inv: 0, cash: 0, card_rub: 0, dep_rub: 0, inv_rub: 0 };
        Object.keys(lay.capRows).forEach(function (k) { y.start[k] = cents(val(ws, lay.capRows[k], 2)) || 0; });
      }
      // проверка подписей недель с алгоритмом
      var gen = E.genWeeks(year).map(function (w) { return w.label; });
      var diff = gen.filter(function (g, i) { return lay.labels[i] && g !== lay.labels[i]; }).length;
      if (diff) warnings.push(year + ": подписи " + diff + " недель отличаются от правила ТЗ — суммы не меняются.");
      state.years[String(year)] = y;
    });

    // архивные годы старого формата: листы «2025_€» и т. п.
    var firstYear = yearSheets[0].y;
    wb.SheetNames.forEach(function (n) {
      var m = n.match(/^(20\d\d)\s*_?\s*€$/);
      if (!m || Number(m[1]) >= firstYear || state.years[m[1]]) return;
      var ws = wb.Sheets[n], year = Number(m[1]), rows = maxRow(ws), block = null, entries = {}, capByMonth = null;
      for (var r = 3; r <= rows; r++) {
        var label = val(ws, r, 1), l = norm(label);
        if (!l) continue;
        if (/^итого в обращении/.test(l)) block = "stop";
        if (/^капитал на конец месяца/.test(l)) {
          capByMonth = [];
          for (var mm = 0; mm < 12; mm++) capByMonth.push(cents(val(ws, r, 2 + mm)));
          continue;
        }
        var b = blockOf(label);
        if (b) { block = b; continue; }
        if (!block || block === "stop") continue;
        var cat = catByKey[block + "|" + norm(label)] || ALIASES[block + "|" + norm(label)] && catByKey[ALIASES[block + "|" + norm(label)]];
        if (!cat) {
          cat = addCat(String(label).trim() + " (" + year + ")", block);
          cat.archived = true;
        }
        for (var i = 0; i < 60; i++) {
          var v = cents(val(ws, r, 2 + i));
          if (!v) continue;
          entries[cat.id] = entries[cat.id] || {};
          var cell = entries[cat.id][String(i)] = entries[cat.id][String(i)] || { expr: null, cents: 0 };
          cell.cents += v;
        }
      }
      Object.keys(entries).forEach(function (cid) { Object.keys(entries[cid]).forEach(function (w) { entries[cid][w].expr = String(entries[cid][w].cents / 100); }); });
      state.years[String(year)] = { year: year, archived: true, labels: [], start: null, fromPrev: false, entries: entries, recurring: [], recon: {}, savRecon: {},
        capitalByMonth: capByMonth || [], notes: "Архив: импорт листа " + n + " (без сверок)." };
    });
    return { state: state, warnings: warnings, yearSheets: yearSheets.map(function (x) { return x.n; }) };
  }

  // Старые названия категорий → новые (как в листе «Анализ»)
  var ALIASES = {
    "income|зарплата": "income|зарплата €", "income|зп $": "income|зарплата €", "income|бонус": "income|бонус €",
    "income|кешбэк/процент на остаток": "income|кешбэк / процент на остаток €", "income|эйч": "income|зарплата ₽",
    "base|квартира": "base|квартира и utilities", "base|долги / кредит": "base|долги / кредит / налог",
    "periodic|медицина": "periodic|здоровье, медицина", "periodic|шоппинг": "periodic|шопинг", "periodic|уход": "periodic|уход (skin care / beauty)",
    "periodic|день рождения/подарки": "periodic|подарки другим", "periodic|серф": "periodic|хобби",
    "subs_es|phone+internet – lowi": "subs_es|phone+internet lowi",
    "savings|рублевый вклад": "savings|вклад ₽", "savings|инвестиции": "savings|инвестиции €", "savings|евро нал": "savings|отложенная наличка €",
  };

  function importArrayBuffer(buf) {
    var wb = root.XLSX.read(buf, { type: "array", cellFormula: true, cellDates: false });
    return importWorkbook(wb);
  }

  root.BudgetImporter = { importWorkbook: importWorkbook, importArrayBuffer: importArrayBuffer };
})(typeof window !== "undefined" ? window : this);
