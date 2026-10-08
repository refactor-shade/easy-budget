/* Easy Budget — бэкап в Excel (.xlsx). Чистые функции без DOM, нужен SheetJS (window.XLSX).
   В файле: листы по годам (как в таблице: категории × недели, итоги), общие траты списком
   и скрытый лист «_backup» с полной копией бюджета — из него бюджет восстанавливается один в один. */
(function (root) {
  "use strict";
  var E = root.BudgetEngine;
  var MARK = "easy-budget-backup v1", CHUNK = 30000; // в ячейке Excel не больше 32 767 символов

  function eurs(c) { return c === null || c === undefined ? "" : Math.round(c) / 100; }

  function yearSheet(state, y) {
    var r = E.compute(state, y), aoa = [];
    aoa.push([Number(y), "регулярно", "недели"].concat(r.weeks.map(function () { return ""; })));
    aoa.push(["", "", ""].concat(r.weeks.map(function (w) { return E.MONTHS_SHORT[w.month - 1] + " " + w.label; })));
    var cats = state.categories.slice().sort(function (a, b) { return a.sort - b.sort; });
    E.BLOCKS.forEach(function (b) {
      var list = cats.filter(function (c) { return c.block === b.id && r.cells[c.id] && r.cells[c.id].some(Boolean); });
      if (!list.length) return;
      aoa.push([b.name]);
      list.forEach(function (c) {
        aoa.push([c.name, "", ""].concat(r.cells[c.id].map(function (x) { return x ? eurs(x.cents) : ""; })));
      });
    });
    aoa.push([]);
    aoa.push(["Итого в обращении (расчёт)", "", ""].concat(r.obr.map(eurs)));
    if (r.fact) aoa.push(["Факт (сумма счетов)", "", ""].concat(r.fact.map(eurs)));
    if (r.diff) aoa.push(["Расхождение", "", ""].concat(r.diff.map(eurs)));
    if (r.cap) aoa.push(["Капитал €", "", ""].concat(r.cap.map(eurs)));
    var ws = root.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 34 }, { wch: 10 }, { wch: 8 }].concat(r.weeks.map(function () { return { wch: 9 }; }));
    ws["!freeze"] = { xSplit: 3, ySplit: 2 };
    return ws;
  }

  function sharedSheet(expenses, partnerName) {
    var aoa = [["Дата", "Описание", "Категория", "Сумма", "Валюта", "Кто платил", "Моя доля", "Тип", "Заметка"]];
    (expenses || []).forEach(function (e) {
      aoa.push([e.date, e.desc || "", e.catName || e.cat || "", eurs(e.cost), e.currency || "EUR", e.paidByMe ? "я" : (partnerName || "партнёр"), eurs(e.share),
        { expense: "трата", batch: "сводная", settlement: "расчёт", refund: "возврат" }[e.kind] || e.kind, e.note || ""]);
    });
    var ws = root.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 11 }, { wch: 36 }, { wch: 22 }, { wch: 10 }, { wch: 7 }, { wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];
    return ws;
  }

  // state — мой бюджет; opts: { expenses, partnerName, createdAt }
  function toWorkbook(state, opts) {
    opts = opts || {};
    var X = root.XLSX, wb = X.utils.book_new(), data = JSON.parse(JSON.stringify(state));
    delete data._ver;
    var readme = [["Easy Budget — резервная копия"], ["Создана", opts.createdAt || new Date().toISOString()],
      [""], ["Как восстановить: Настройки → «Загрузить бэкап» → выбрать этот файл. Бюджет вернётся целиком, как был."],
      ["Листы с годами и общими тратами — для чтения в Excel или Google Sheets."]];
    var wsR = X.utils.aoa_to_sheet(readme); wsR["!cols"] = [{ wch: 30 }, { wch: 30 }];
    X.utils.book_append_sheet(wb, wsR, "Читать");
    Object.keys(data.years).sort().forEach(function (y) {
      if (data.years[y].archived) return;
      try { X.utils.book_append_sheet(wb, yearSheet(state, y), y); } catch (e) { /* год без расчёта — пропустить */ }
    });
    if (opts.expenses && opts.expenses.length) X.utils.book_append_sheet(wb, sharedSheet(opts.expenses, opts.partnerName), "Общие траты");
    var json = JSON.stringify(data), rows = [[MARK], [opts.createdAt || new Date().toISOString()]];
    for (var i = 0; i < json.length; i += CHUNK) rows.push([json.slice(i, i + CHUNK)]);
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), "_backup");
    wb.Workbook = { Sheets: wb.SheetNames.map(function (n) { return { name: n, Hidden: n === "_backup" ? 1 : 0 }; }) };
    return wb;
  }

  // книга → { state, createdAt } или null, если это не бэкап Easy Budget
  function fromWorkbook(wb) {
    var ws = wb.Sheets && wb.Sheets._backup;
    if (!ws) return null;
    var X = root.XLSX, aoa = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    if (!aoa.length || String(aoa[0][0]) !== MARK) return null;
    var json = aoa.slice(2).map(function (r) { return String(r[0] || ""); }).join("");
    var state = JSON.parse(json);
    if (!state.years || !state.categories) throw new Error("бэкап повреждён");
    return { state: state, createdAt: String(aoa[1][0] || "") };
  }

  function toArrayBuffer(state, opts) { return root.XLSX.write(toWorkbook(state, opts), { bookType: "xlsx", type: "array" }); }

  root.BudgetBackup = { toWorkbook: toWorkbook, fromWorkbook: fromWorkbook, toArrayBuffer: toArrayBuffer };
})(typeof window !== "undefined" ? window : this);
