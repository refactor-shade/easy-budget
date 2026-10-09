/* Easy Budget — движок расчётов (ТЗ, разделы 3.1–3.7).
   Чистые функции без DOM: работают в браузере и в тестах (osascript -l JavaScript).
   Деньги — целые центы. Рубли переводятся в € по курсу настроек. */
(function (root) {
  "use strict";

  var BLOCKS = [
    { id: "income", name: "Доходы" },
    { id: "base", name: "Расходы базовые" },
    { id: "periodic", name: "Расходы периодические" },
    { id: "subs_es", name: "Подписки + телефон ES" },
    { id: "subs_ru", name: "Подписки + телефон RU (₽)" },
    { id: "savings", name: "Накопления (переводы, со знаком минус)" },
  ];
  var MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  var MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  var MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  var SAV_KEYS = ["sav", "inv", "cash"];
  var RUB_KEYS = ["card_rub", "dep_rub", "inv_rub"];
  var CAPITAL_ROWS = [
    { key: "sav", name: "накопительный счёт €" },
    { key: "inv", name: "инвестиции €" },
    { key: "cash", name: "отложенная наличка €" },
    { key: "card_rub", name: "карта / счёт ₽" },
    { key: "dep_rub", name: "вклад ₽" },
    { key: "inv_rub", name: "инвестиции ₽" },
    { key: "usd", name: "доллары $" },
  ];

  // ---------- даты ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function weekday(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); } // 0 = вс
  function todayISO() { var t = new Date(); return iso(t.getFullYear(), t.getMonth() + 1, t.getDate()); }
  function addDays(isoDate, n) {
    var p = isoDate.split("-").map(Number);
    var t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  // 3.1 Генерация недель: 5 отрезков в каждом месяце, граница — воскресенье.
  var weeksCache = {};
  function genWeeks(year) {
    if (weeksCache[year]) return weeksCache[year];
    var out = [];
    for (var m = 1; m <= 12; m++) {
      var n = daysInMonth(year, m), segs = [], start = 1;
      for (var d = 1; d <= n; d++) {
        if (weekday(year, m, d) === 0 || d === n) { segs.push([start, d]); start = d + 1; }
      }
      while (segs.length > 5) { segs.splice(0, 2, [segs[0][0], segs[1][1]]); }
      while (segs.length < 5) {
        var last = segs[segs.length - 1];
        segs.splice(segs.length - 1, 1, [last[0], last[1] - 1], [last[1], last[1]]);
      }
      segs.forEach(function (s, i) {
        out.push({
          idx: (m - 1) * 5 + i, month: m, wim: i + 1,
          from: iso(year, m, s[0]), to: iso(year, m, s[1]),
          label: s[0] === s[1] ? String(s[0]) : s[0] + "-" + s[1], days: s[1] - s[0] + 1,
        });
      });
    }
    weeksCache[year] = out;
    return out;
  }
  function weekOfDate(isoDate) {
    var y = Number(isoDate.slice(0, 4));
    var ws = genWeeks(y);
    for (var i = 0; i < ws.length; i++) if (isoDate >= ws[i].from && isoDate <= ws[i].to) return { year: y, idx: i };
    return null;
  }
  function weekTitle(year, w) {
    var wk = genWeeks(year)[w];
    var a = wk.label.split("-");
    return (a.length > 1 ? a[0] + "–" + a[1] : a[0]) + " " + MONTHS_GEN[wk.month - 1] + " " + year;
  }

  // ---------- безопасный калькулятор выражений «=-35-20», «(30+30)/2» ----------
  function evalExpr(src) {
    if (src === null || src === undefined) return null;
    var s = String(src).trim().replace(/^=/, "").replace(/[−‒–—]/g, "-")
      .replace(/\s+/g, "").replace(/(\d),(\d)/g, "$1.$2").replace(/[€₽]/g, "");
    if (s === "") return null;
    var i = 0;
    function peek() { return s[i]; }
    function num() {
      var j = i;
      while (i < s.length && /[0-9.]/.test(s[i])) i++;
      if (j === i) throw new Error("ожидалось число");
      var v = parseFloat(s.slice(j, i));
      if (isNaN(v)) throw new Error("плохое число");
      return v;
    }
    function factor() {
      var c = peek();
      if (c === "-") { i++; return -factor(); }
      if (c === "+") { i++; return factor(); }
      if (c === "(") { i++; var v = expr(); if (s[i] !== ")") throw new Error("нет «)»"); i++; return v; }
      return num();
    }
    function term() {
      var v = factor();
      while (peek() === "*" || peek() === "/") {
        var op = s[i++], r = factor();
        v = op === "*" ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      var v = term();
      while (peek() === "+" || peek() === "-") {
        var op = s[i++], r = term();
        v = op === "+" ? v + r : v - r;
      }
      return v;
    }
    var v = expr();
    if (i !== s.length) throw new Error("лишний символ «" + s[i] + "»");
    if (!isFinite(v)) throw new Error("деление на ноль");
    return v;
  }
  function exprCents(src) {
    var v = evalExpr(src);
    return v === null ? null : Math.round(v * 100);
  }

  // ---------- форматирование ----------
  function fmt(cents, opts) {
    if (cents === null || cents === undefined || isNaN(cents)) return "";
    opts = opts || {};
    var v = cents / 100;
    var dec = opts.dec !== undefined ? opts.dec : (Math.round(v) === v ? 0 : 2);
    var s = Math.abs(v).toFixed(dec).replace(".", ",");
    var parts = s.split(",");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    s = parts.join(",");
    var sign = v < 0 && Math.abs(v) >= Math.pow(10, -dec) / 2 ? "−" : (opts.plus && v > 0 ? "+" : "");
    return sign + s + (opts.cur ? "\u00A0" + opts.cur : "");
  }
  function eur(c, o) { o = o || {}; o.cur = "€"; return fmt(c, o); }

  // ---------- регулярные платежи (3.2) ----------
  function ruleMatches(rule, wk) {
    if (rule.from && wk.to < rule.from) return false;
    if (rule.to && wk.from > rule.to) return false;
    var spec = String(rule.weeks || "").trim().toLowerCase();
    if (spec === "все" || spec === "all" || spec === "*") return true;
    return spec.indexOf(String(wk.wim)) !== -1;
  }

  function catsById(state) {
    var m = {};
    state.categories.forEach(function (c) { m[c.id] = c; });
    return m;
  }

  // Сетка значений года: {catId: [{cents, src, rule, expr, note}] x60}
  function yearCells(state, year) {
    var y = state.years[year], weeks = genWeeks(Number(year)), cells = {};
    state.categories.forEach(function (c) {
      var arr = new Array(60);
      for (var w = 0; w < 60; w++) arr[w] = null;
      cells[c.id] = arr;
    });
    (y.recurring || []).forEach(function (r) {
      var arr = cells[r.catId];
      if (!arr || r.cents === null || r.cents === undefined) return;
      weeks.forEach(function (wk) {
        if (!ruleMatches(r, wk)) return;
        if (arr[wk.idx] && arr[wk.idx].src === "rec") arr[wk.idx].cents += r.cents;
        else arr[wk.idx] = { cents: r.cents, src: "rec", rule: r.id };
      });
    });
    Object.keys(y.entries || {}).forEach(function (cid) {
      var arr = cells[cid];
      if (!arr) return;
      var e = y.entries[cid];
      Object.keys(e).forEach(function (w) {
        var en = e[w];
        if (en.cents === null || en.cents === undefined) return;
        arr[Number(w)] = { cents: en.cents, src: "manual", expr: en.expr, note: en.note || "", shared: en.shared };
      });
    });
    return cells;
  }

  function accountActive(acc, wk) {
    if (acc.kind !== "cash_flow" || acc.archived) return false;
    if (acc.countsFrom && wk.to < acc.countsFrom) return false;
    return true;
  }

  // ---------- главный пересчёт года (3.3–3.6) ----------
  var memo = { key: null, map: {} };
  function compute(state, year) {
    year = String(year);
    if (memo.state !== state || memo.ver !== state._ver) memo = { state: state, ver: state._ver, map: {} };
    if (memo.map[year]) return memo.map[year];
    var y = state.years[year];
    if (!y) return null;
    var weeks = genWeeks(Number(year));
    var cats = state.categories, rate = state.settings.rate || 1, usdRate = (state.settings.fx && state.settings.fx.USD) || 1.08;
    var cells = yearCells(state, year);
    var res = { year: Number(year), weeks: weeks, cells: cells, archived: !!y.archived };

    // суммы по неделе
    var eurFlow = [], rubFlow = [], link = { sav: [], inv: [], cash: [], dep_rub: [], inv_rub: [], usd: [] };
    for (var w = 0; w < 60; w++) {
      eurFlow[w] = 0; rubFlow[w] = 0;
      for (var k in link) link[k][w] = 0;
    }
    cats.forEach(function (c) {
      var arr = cells[c.id];
      for (var w = 0; w < 60; w++) {
        var v = arr[w] ? arr[w].cents : 0;
        if (!v) continue;
        if (c.currency === "RUB") rubFlow[w] += v; else eurFlow[w] += v;
        if (c.link && link[c.link]) link[c.link][w] += v;
      }
    });
    res.eurFlow = eurFlow; res.rubFlow = rubFlow;

    if (y.archived) {
      res.capMonth = (y.capitalByMonth || []).slice();
      memo.map[year] = res;
      return res;
    }

    var start = startOf(state, year);
    res.start = start;
    var startCap = capitalOf(start, rate, usdRate);
    res.startCap = startCap;

    var obr = [], fact = [], diff = [], base = [], rows = {}, cap = [], dweek = [], dmonth = [], rubEur = [];
    CAPITAL_ROWS.forEach(function (r) { rows[r.key] = []; });
    var recon = y.recon || {}, sr = y.savRecon || {};
    for (w = 0; w < 60; w++) {
      var prevBase = w === 0 ? start.obr : base[w - 1];
      obr[w] = prevBase + eurFlow[w];
      // факт: сумма остатков по счетам в обращении
      var rw = recon[w], f = null;
      if (rw) {
        state.accounts.forEach(function (a) {
          var e = rw[a.id];
          if (!e || e.cents === null || e.cents === undefined) return;
          if (!accountActive(a, weeks[w])) return;
          f = (f || 0) + e.cents;
        });
      }
      fact[w] = f;
      diff[w] = f === null ? null : f - obr[w];
      base[w] = f === null ? obr[w] : f;
      var s = sr[w] || {};
      SAV_KEYS.concat(["dep_rub", "inv_rub", "usd"]).forEach(function (k) {
        var prev = w === 0 ? start[k] : rows[k][w - 1];
        rows[k][w] = (s[k] !== undefined && s[k] !== null) ? s[k] : prev - link[k][w];
      });
      var prevCard = w === 0 ? start.card_rub : rows.card_rub[w - 1];
      rows.card_rub[w] = (s.card_rub !== undefined && s.card_rub !== null) ? s.card_rub : prevCard + rubFlow[w];
      rubEur[w] = (rows.card_rub[w] + rows.dep_rub[w] + rows.inv_rub[w]) / rate;
      cap[w] = base[w] + rows.sav[w] + rows.inv[w] + rows.cash[w] + rubEur[w] + rows.usd[w] / usdRate;
      dweek[w] = cap[w] - (w === 0 ? startCap : cap[w - 1]);
      dmonth[w] = weeks[w].wim === 5 ? cap[w] - (w < 5 ? startCap : cap[w - 5]) : null;
    }
    res.obr = obr; res.fact = fact; res.diff = diff; res.base = base; res.rows = rows;
    res.rubEur = rubEur; res.cap = cap; res.dweek = dweek; res.dmonth = dmonth;
    res.savEur = obr.map(function (_, w) { return rows.sav[w] + rows.inv[w] + rows.cash[w]; });
    res.capMonth = [];
    for (var m = 0; m < 12; m++) res.capMonth[m] = cap[m * 5 + 4];
    res.end = { obr: base[59] };
    CAPITAL_ROWS.forEach(function (r) { res.end[r.key] = rows[r.key][59]; });
    memo.map[year] = res;
    return res;
  }

  function capitalOf(s, rate, usdRate) {
    return s.obr + s.sav + s.inv + s.cash + (s.card_rub + s.dep_rub + s.inv_rub) / rate + (s.usd || 0) / (usdRate || 1.08);
  }

  // Старт года: вручную или остатки последней недели прошлого года (3.7)
  function startOf(state, year) {
    var y = state.years[year];
    var zero = { obr: 0, sav: 0, inv: 0, cash: 0, card_rub: 0, dep_rub: 0, inv_rub: 0, usd: 0 };
    if (!y.fromPrev) return Object.assign({}, zero, y.start || {});
    var prev = state.years[String(Number(year) - 1)];
    if (!prev || prev.archived) return Object.assign({}, zero, y.start || {});
    var r = compute(state, Number(year) - 1);
    var s = {};
    Object.keys(zero).forEach(function (k) { s[k] = Math.round(r.end[k]); });
    return s;
  }

  // ---------- анализ по месяцам (лист «Анализ») ----------
  function monthly(state, year) {
    var r = compute(state, year);
    if (!r) return null;
    var cats = state.categories, rate = state.settings.rate || 1;
    var out = [];
    for (var m = 0; m < 12; m++) {
      var row = { month: m + 1, income: 0, base: 0, periodic: 0, subs_es: 0, subs_ru: 0, mandatory: 0, saved: 0 };
      cats.forEach(function (c) {
        var arr = r.cells[c.id], sum = 0;
        for (var w = m * 5; w < m * 5 + 5; w++) if (arr[w]) sum += arr[w].cents;
        if (!sum) return;
        var e = c.currency === "RUB" ? sum / rate : sum;
        if (c.block === "income") row.income += e;
        else if (c.block === "savings") { if (c.currency !== "RUB") row.saved -= e; }
        else row[c.block] -= e;
        if (c.mandatory) row.mandatory -= e;
      });
      row.total = row.base + row.periodic + row.subs_es + row.subs_ru;
      row.living = row.total - row.mandatory;
      row.net = row.income - row.total;
      row.rate = row.income ? row.net / row.income : null;
      row.cap = r.capMonth[m] === undefined ? null : r.capMonth[m];
      out.push(row);
    }
    out.forEach(function (row, m) {
      if (row.cap === null) { row.dcap = null; return; }
      var prev = m === 0 ? (r.startCap !== undefined ? r.startCap : null) : out[m - 1].cap;
      row.dcap = prev === null ? null : row.cap - prev;
    });
    var tot = { month: 0 };
    ["income", "base", "periodic", "subs_es", "subs_ru", "mandatory", "saved", "total", "living", "net"].forEach(function (k) {
      tot[k] = out.reduce(function (a, x) { return a + x[k]; }, 0);
    });
    tot.rate = tot.income ? tot.net / tot.income : null;
    tot.cap = out[11].cap;
    tot.dcap = out.reduce(function (a, x) { return a + (x.dcap || 0); }, 0);
    return { months: out, total: tot };
  }

  // Итоги года по категориям, € (расходы — плюсом)
  function categoryTotals(state, year) {
    var r = compute(state, year);
    if (!r) return {};
    var rate = state.settings.rate || 1, out = {};
    state.categories.forEach(function (c) {
      var s = 0;
      r.cells[c.id].forEach(function (x) { if (x) s += x.cents; });
      if (c.currency === "RUB") s = s / rate;
      out[c.id] = c.block === "income" ? s : -s;
    });
    return out;
  }

  // ---------- изменения данных ----------
  function setEntry(state, year, catId, w, expr, note) {
    var y = state.years[year];
    y.entries = y.entries || {};
    if (expr === null || String(expr).trim() === "") {
      if (y.entries[catId]) delete y.entries[catId][w];
      return null;
    }
    var c = exprCents(expr);
    y.entries[catId] = y.entries[catId] || {};
    var prev = y.entries[catId][w] || {};
    y.entries[catId][w] = { expr: String(expr).trim().replace(/^=/, ""), cents: c, note: note !== undefined ? note : (prev.note || "") };
    return c;
  }

  // Изменить сумму регулярного платежа с даты: прошлые недели не трогаем
  function changeRuleFrom(state, year, ruleId, patch, fromISO) {
    var y = state.years[year];
    var r = y.recurring.find(function (x) { return x.id === ruleId; });
    if (!r) return;
    if (!fromISO || fromISO <= (r.from || year + "-01-01")) { Object.assign(r, patch); return r; }
    var nr = Object.assign({}, r, patch, { id: uid("r"), from: fromISO, to: r.to });
    r.to = addDays(fromISO, -1);
    y.recurring.splice(y.recurring.indexOf(r) + 1, 0, nr);
    return nr;
  }

  // Новый год из прошлого: старт = остатки на 31.12, регулярные копируются
  function createYear(state, year, opts) {
    opts = opts || {};
    var prev = state.years[String(year - 1)];
    var ny = { year: year, labels: genWeeks(year).map(function (w) { return w.label; }), start: null, fromPrev: !!prev && !prev.archived,
      entries: {}, recurring: [], recon: {}, savRecon: {}, notes: "" };
    if (!ny.fromPrev) ny.start = { obr: 0, sav: 0, inv: 0, cash: 0, card_rub: 0, dep_rub: 0, inv_rub: 0, usd: 0 };
    if (prev && opts.copyRecurring !== false) {
      var endISO = (year - 1) + "-12-31";
      (prev.recurring || []).forEach(function (r) {
        if (r.to && r.to < endISO) return;
        ny.recurring.push(Object.assign({}, r, { id: uid("r"), from: year + "-01-01", to: null }));
      });
    }
    if (prev && opts.copyOneOff) {
      Object.keys(prev.entries || {}).forEach(function (cid) {
        Object.keys(prev.entries[cid]).forEach(function (w) {
          var e = prev.entries[cid][w];
          if (e.shared) return;
          ny.entries[cid] = ny.entries[cid] || {};
          ny.entries[cid][w] = { expr: e.expr, cents: e.cents, note: e.note || "" };
        });
      });
    }
    state.years[String(year)] = ny;
    return ny;
  }

  // Ручные записи, которые повторяются месяц за месяцем (та же сумма в те же недели месяца) — кандидаты в регулярные
  function findRepeats(state, year, minMonths) {
    minMonths = minMonths || 3;
    var y = state.years[String(year)], out = [];
    if (!y) return out;
    var rules = y.recurring || [];
    Object.keys(y.entries || {}).forEach(function (cid) {
      var e = y.entries[cid], by = {};
      Object.keys(e).forEach(function (w) {
        var en = e[w], wi = Number(w);
        if (en.cents === null || en.cents === undefined || !en.cents || en.shared) return;
        var m = Math.floor(wi / 5);
        by[en.cents] = by[en.cents] || {};
        (by[en.cents][m] = by[en.cents][m] || []).push(wi % 5 + 1);
      });
      Object.keys(by).forEach(function (cents) {
        var months = by[cents], key = function (m) { return months[m] ? months[m].slice().sort().join(",") : ""; };
        for (var m = 0; m < 12; m++) {
          if (!months[m]) continue;
          var k = key(m), s = m;
          while (m + 1 < 12 && key(m + 1) === k) m++;
          if (m - s + 1 < minMonths) continue;
          // уже есть регулярная в этой категории на эти месяцы — не предлагаем
          var from = iso(year, s + 1, 1), to = iso(year, m + 1, daysInMonth(year, m + 1));
          if (rules.some(function (r) { return r.catId === cid && !(r.to && r.to < from) && !(r.from && r.from > to); })) continue;
          out.push({ catId: cid, cents: Number(cents), weeks: k === "1,2,3,4,5" ? "все" : k, fromM: s, toM: m });
        }
      });
    });
    return out;
  }
  // Превратить кандидата в регулярную трату. Суммы в плане не должны измениться — иначе откат.
  function applyRepeat(state, year, c) {
    year = String(year);
    var y = state.years[year], before = yearCells(state, year);
    y.recurring = y.recurring || [];
    var rule = { id: uid("r"), catId: c.catId, expr: String(c.cents / 100), cents: c.cents, weeks: c.weeks,
      from: iso(Number(year), c.fromM + 1, 1), to: c.toM === 11 ? null : iso(Number(year), c.toM + 1, daysInMonth(Number(year), c.toM + 1)) };
    y.recurring.push(rule);
    var e = y.entries[c.catId] || {}, removed = [];
    Object.keys(e).forEach(function (w) {
      var wi = Number(w), m = Math.floor(wi / 5), en = e[w];
      if (m < c.fromM || m > c.toM || en.cents !== c.cents || en.note) return;
      if (!/^[-+]?\d+([.,]\d+)?$/.test(String(en.expr).trim())) return;
      removed.push([w, en]); delete e[w];
    });
    var after = yearCells(state, year), same = Object.keys(before).every(function (cid) {
      return before[cid].every(function (x, w) { var a = after[cid][w]; return (x ? x.cents : 0) === (a ? a.cents : 0); });
    });
    if (!same) {
      y.recurring.splice(y.recurring.indexOf(rule), 1);
      removed.forEach(function (p) { e[p[0]] = p[1]; });
      return null;
    }
    return { rule: rule, removed: removed.length };
  }

  var uidN = 0;
  function uid(p) { return (p || "id") + Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 6); }

  root.BudgetEngine = {
    BLOCKS: BLOCKS, MONTHS: MONTHS, MONTHS_GEN: MONTHS_GEN, MONTHS_SHORT: MONTHS_SHORT, CAPITAL_ROWS: CAPITAL_ROWS,
    genWeeks: genWeeks, weekOfDate: weekOfDate, weekTitle: weekTitle, todayISO: todayISO, addDays: addDays,
    evalExpr: evalExpr, exprCents: exprCents, fmt: fmt, eur: eur,
    yearCells: yearCells, compute: compute, startOf: startOf, capitalOf: capitalOf, monthly: monthly,
    categoryTotals: categoryTotals, setEntry: setEntry, changeRuleFrom: changeRuleFrom, createYear: createYear,
    catsById: catsById, ruleMatches: ruleMatches, accountActive: accountActive, uid: uid,
    findRepeats: findRepeats, applyRepeat: applyRepeat,
  };
})(typeof window !== "undefined" ? window : this);
