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
    if (!yearSheets.length) {
      var real = wb.SheetNames.filter(function (n) { return realYear(n); });
      if (real.length) return importReal(wb, real, state, warnings);
      throw new Error("Не нашла листов года: нужен лист «Мой_ГГГГ» (A1 = год, B1 = «регулярно») или «ГГГГ_€ REAL».");
    }

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


  // ---------- формат «ГГГГ_€ REAL» (таблица Риты): недели с колонки B, подписи месяцев в строке 1 ----------
  function realYear(n) { var m = String(n).match(/^(20\d\d)\s*_?\s*€\s*real\s*$/i); return m ? Number(m[1]) : null; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function curOf(cell) { var w = String(cell && (cell.w || "") || "") + " " + String(cell && cell.z || ""); return /р\.|₽|руб|RUB/i.test(w) ? "RUB" : /\$/.test(w) ? "USD" : /€|EUR/i.test(w) ? "EUR" : "?"; }
  function monthOf(h) { var l = norm(h); if (!l) return null; for (var i = 0; i < 12; i++) if (l.indexOf(MONTHS_GEN[i]) === 0) return i + 1; return null; }
  // колонка → индекс недели приложения (по дате конца недели)
  // в каком столбце подписи строк: обычно A, в старых листах — B
  function labelCol(ws) {
    var a = 0, b = 0;
    for (var r = 3; r <= 30; r++) { if (norm(val(ws, r, 1))) a++; if (norm(val(ws, r, 2)) && typeof val(ws, r, 2) === "string") b++; }
    return b > a ? 2 : 1;
  }
  function realColumns(ws, year, from) {
    var maxC = ws["!ref"] ? root.XLSX.utils.decode_range(ws["!ref"]).e.c + 1 : 0, month = null, out = [];
    for (var c = from || 2; c <= maxC; c++) {
      // месяц из заголовка; подпись с опечаткой («нобярь») — следующий по порядку
      var hv = val(ws, 1, c), m = monthOf(hv);
      if (!m && norm(hv) && month && month < 12 && /^[а-я]+$/.test(norm(hv))) m = month + 1;
      if (m) month = m;
      // подпись могла сохраниться как дата («1-4» → 4 января): тогда берём день из даты
      var lc = cellAt(ws, 2, c), lab = lc ? String(lc.t === "n" && lc.v > 30000 ? "" : (lc.w || lc.v)).trim() : "", mm = lab.match(/^(\d{1,2})(?:\s*[-–\/.]\s*(\d{1,2}))?$/);
      if (lc && lc.t === "n" && lc.v > 30000 && month) { var dd = root.XLSX.SSF.parse_date_code(lc.v); if (dd) mm = [null, String(dd.d)]; }
      if (!month || !mm) continue;
      var day = Number(mm[2] || mm[1]);
      if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) continue;
      var wk = E.weekOfDate(year + "-" + pad2(month) + "-" + pad2(day));
      if (wk) out.push({ c: c, w: wk.idx });
    }
    return out;
  }
  function importReal(wb, names, state, warnings) {
    var sheets = names.map(function (n) { return { n: n, y: realYear(n), ws: wb.Sheets[n] }; }).sort(function (a, b) { return a.y - b.y; });
    var catByKey = {}, sort = 0, accByName = {}, rate = null;
    // курс: «ИТОГО КАПИТАЛ» в рублях и под ним то же в евро
    sheets.slice().reverse().forEach(function (sh) {
      if (rate) return;
      var ws = sh.ws, rows = maxRow(ws);
      for (var r = 3; r <= rows && !rate; r++) {
        if (!/^итого капитал/.test(norm(val(ws, r, labelCol(ws))))) continue;
        realColumns(ws, sh.y, labelCol(ws) + 1).forEach(function (x) {
          var a = cellAt(ws, r, x.c), b = cellAt(ws, r + 1, x.c);
          if (!rate && a && b && curOf(a) === "RUB" && curOf(b) === "EUR" && num(a.v) > 0 && num(b.v) > 0) rate = Math.round(num(a.v) / num(b.v) * 100) / 100;
        });
      }
    });
    if (rate) { state.settings.rate = rate; state.settings.fx.RUB = rate; }
    rate = state.settings.rate;
    var usdNote = 0;
    sheets.forEach(function (sh) {
      var ws = sh.ws, year = sh.y, rows = maxRow(ws), LC = labelCol(ws), cols = realColumns(ws, year, LC + 1), rowCat = {}, conv = [];
      if (!cols.length) { warnings.push(sh.n + ": не нашла недель — пропускаю."); return; }
      var y = { year: year, labels: E.genWeeks(year).map(function (w) { return w.label; }), start: null, fromPrev: false, entries: {}, recurring: [], recon: {}, savRecon: {}, notes: "Импорт листа " + sh.n };
      var block = null, sawEs = false, section = "cats", rowsOf = {}, accRows = [];
      for (var r = 3; r <= rows; r++) {
        var label = val(ws, r, LC), l = norm(label);
        if (!l) continue;
        if (/^итого в обращении/.test(l)) { section = "totals"; rowsOf.obr = r; continue; }
        if (section === "cats") {
          var b = blockOf(label);
          if (!b && /^подписки/.test(l)) b = sawEs ? "subs_ru" : "subs_es";
          if (b) { block = b; if (b === "subs_es") sawEs = true; continue; }
          if (!block) continue;
          // ячейки категории
          var cells = [];
          cols.forEach(function (x) { var cell = cellAt(ws, r, x.c); if (cell && cents(cell.v)) cells.push({ w: x.w, c: x.c, cell: cell, cur: curOf(cell) }); });
          var nRub = cells.filter(function (q) { return q.cur === "RUB"; }).length, nEur = cells.filter(function (q) { return q.cur === "EUR"; }).length;
          var cur = /руб|₽/i.test(l) || block === "subs_ru" || nRub > nEur ? "RUB" : "EUR";
          // число без значка валюты: крупное — рубли, иначе как у категории
          cells.forEach(function (q) { if (q.cur === "?") q.cur = Math.abs(num(q.cell.v)) >= 50000 ? "RUB" : cur; });
          var name = String(label).trim(), key = block + "|" + norm(name), cat = catByKey[key];
          if (!cat) {
            var link = null;
            if (block === "savings") link = /доллар|\$/.test(l) ? "usd" : /вклад/.test(l) ? "dep_rub" : /инвест/.test(l) ? (cur === "RUB" ? "inv_rub" : "inv") : /нал/.test(l) ? "cash" : /накопит/.test(l) ? "sav" : null;
            cat = { id: "c" + (++sort), name: name, block: block, currency: cur, mandatory: /налог|нолог|social|seguridad|соцстрах|xolo|бухгалтер/i.test(name), link: link, sort: sort, archived: false };
            state.categories.push(cat); catByKey[key] = cat;
          }
          rowCat[r] = cat;
          cells.forEach(function (q) {
            // «=D4/95»: эта сумма — пересчёт другой строки (рубли → евро), исходную не считаем отдельно
            // и «=(E4-(E4*6%))/105»: любая формула со ссылкой на ячейку той же колонки
            if (q.cell.f && q.cur !== "RUB") {
              var colL = root.XLSX.utils.encode_col(q.c - 1), re = /\$?([A-Z]+)\$?(\d+)/g, mm2;
              while ((mm2 = re.exec(String(q.cell.f)))) if (mm2[1] === colL && Number(mm2[2]) !== r) conv.push({ row: Number(mm2[2]), w: q.w });
            }
            var c = cents(q.cell.v), tc = cat;
            if (q.cur === "USD") { usdNote++; return; }
            // ячейка явно в другой валюте, чем строка: кладём в соседнюю категорию «… (€)» / «… (₽)», без пересчёта по курсу
            if (q.cur !== cat.currency && curOf(q.cell) !== "?") {
              var tk = block + "|" + norm(name) + "|" + q.cur;
              tc = catByKey[tk];
              if (!tc) { tc = Object.assign({}, cat, { id: "c" + (++sort), name: name + (q.cur === "RUB" ? " (₽)" : " (€)"), currency: q.cur, sort: sort, link: block === "savings" ? cat.link : null }); state.categories.push(tc); catByKey[tk] = tc; }
            } else if (q.cur !== cat.currency) c = Math.round(cat.currency === "RUB" ? c * rate : c / rate);
            y.entries[tc.id] = y.entries[tc.id] || {};
            var prev = y.entries[tc.id][String(q.w)];
            if (prev) { prev.cents += c; prev.expr = prev.expr + (c < 0 ? "" : "+") + String(c / 100); }
            else y.entries[tc.id][String(q.w)] = { expr: String(c / 100), cents: c };
          });
        } else {
          if (/^факт в обращении/.test(l)) rowsOf.fact = r;
          else if (/^рубли/.test(l)) rowsOf.rub = r;
          else if (/^инвестиц/.test(l)) rowsOf.inv = r;
          else if (/^доллары/.test(l)) rowsOf.usd = r;
          else if (/\/\s*€|\/\/\s*€/.test(l) && !/^итого/.test(l)) accRows.push({ r: r, name: String(label).replace(/\s*\/+\s*€\s*$/, "").trim() });
        }
      }
      conv.forEach(function (x) { var c = rowCat[x.row]; if (c && c.currency === "RUB" && y.entries[c.id] && y.entries[c.id][String(x.w)]) { delete y.entries[c.id][String(x.w)]; y.convDropped = (y.convDropped || 0) + 1; } });
      // доход в рублях и в евро в одной неделе примерно по курсу — это одна и та же зарплата: считаем евро
      for (var wi = 0; wi < 60; wi++) {
        var rubC = [], eur = 0, rub = 0;
        state.categories.forEach(function (c) {
          if (c.block !== "income") return;
          var e = (y.entries[c.id] || {})[String(wi)]; if (!e || e.cents <= 0) return;
          if (c.currency === "RUB") { rub += e.cents; rubC.push(c); } else eur += e.cents;
        });
        if (rub && eur && rub / eur >= 60 && rub / eur <= 140) { rubC.forEach(function (c) { delete y.entries[c.id][String(wi)]; }); y.convDropped = (y.convDropped || 0) + rubC.length; }
      }
      if (y.convDropped) warnings.push(year + ": " + y.convDropped + " рублёвых доходов — та же зарплата, что и в евро (формула или сумма по курсу): считаю один раз, в евро.");
      delete y.convDropped;
      // счета в обращении (в евро) → сверки
      accRows.forEach(function (a) {
        var k = norm(a.name);
        if (!accByName[k]) { var acc = { id: "a" + (state.accounts.length + 1), name: a.name, kind: "cash_flow", sort: state.accounts.length + 1 }; state.accounts.push(acc); accByName[k] = acc; }
        cols.forEach(function (x) {
          if (rowsOf.fact && cents(val(ws, rowsOf.fact, x.c)) === null) return; // сверка — только там, где заполнен факт
          var en = entryOf(cellAt(ws, a.r, x.c)); if (!en) return;
          y.recon[String(x.w)] = y.recon[String(x.w)] || {};
          y.recon[String(x.w)][accByName[k].id] = en;
        });
      });
      // строка «ФАКТ В ОБРАЩЕНИИ» главнее суммы счетов: разницу — отдельным счётом, чтобы было видно
      if (rowsOf.fact) cols.forEach(function (x) {
        var f = cents(val(ws, rowsOf.fact, x.c)), rw = y.recon[String(x.w)];
        if (f === null || !rw) return;
        var sum = Object.keys(rw).reduce(function (t, k) { return t + (rw[k].cents || 0); }, 0);
        if (Math.abs(f - sum) < 100) return;
        if (!accByName["прочее (по таблице)"]) { var o = { id: "a" + (state.accounts.length + 1), name: "Прочее (по таблице)", kind: "cash_flow", sort: state.accounts.length + 1 }; state.accounts.push(o); accByName["прочее (по таблице)"] = o; }
        rw[accByName["прочее (по таблице)"].id] = { expr: String((f - sum) / 100), cents: f - sum, note: "факт в таблице минус сумма счетов" };
      });
      // рубли и инвестиции — в недели со сверкой
      if (rowsOf.fact) cols.forEach(function (x) {
        if (!cellAt(ws, rowsOf.fact, x.c) || cents(val(ws, rowsOf.fact, x.c)) === null) return;
        var sr = {};
        if (rowsOf.rub && cents(val(ws, rowsOf.rub, x.c)) !== null) sr.card_rub = cents(val(ws, rowsOf.rub, x.c));
        if (rowsOf.inv && cents(val(ws, rowsOf.inv, x.c)) !== null) sr.inv_rub = cents(val(ws, rowsOf.inv, x.c));
        if (rowsOf.usd && cents(val(ws, rowsOf.usd, x.c)) !== null) sr.usd = cents(val(ws, rowsOf.usd, x.c));
        if (Object.keys(sr).length) y.savRecon[String(x.w)] = sr;
      });
      // старт года: «в обращении» первой недели минус её движение
      var c0 = cols[0], flowE = 0, flowR = 0;
      state.categories.forEach(function (c) { var e = (y.entries[c.id] || {})[String(c0.w)]; if (!e) return; if (c.currency === "RUB") flowR += e.cents; else flowE += e.cents; });
      y.start = { obr: (cents(rowsOf.obr && val(ws, rowsOf.obr, c0.c)) || 0) - flowE, sav: 0, inv: 0, cash: 0,
        card_rub: rowsOf.rub ? (cents(val(ws, rowsOf.rub, c0.c)) || 0) - flowR : 0, dep_rub: 0, inv_rub: rowsOf.inv ? cents(val(ws, rowsOf.inv, c0.c)) || 0 : 0,
        usd: rowsOf.usd ? cents(val(ws, rowsOf.usd, c0.c)) || 0 : 0 };
      state.years[String(year)] = y;
    });
    if (usdNote) warnings.push("Ячеек в долларах пропущено: " + usdNote + ".");
    warnings.push("Формат «ГГГГ_€ REAL»: недели сопоставлены по датам, регулярные траты можно собрать на экране «Регулярные траты».");
    if (!Object.keys(state.years).length) throw new Error("Листы «ГГГГ_€ REAL» не получилось прочитать.");
    return { state: state, warnings: warnings, yearSheets: sheets.map(function (x) { return x.n; }) };
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
