/* Easy Budget — учёт налички: кошелёк, конверты. Разбор фраз «кофе 4,5 из кошелька», балансы, наличные из общих трат.
   Чистые функции без DOM: работают в браузере и в тестах. */
(function (root) {
  "use strict";

  // kind: spend — трата из кармана; move — из кармана в карман; in — сняла с карты в карман;
  //       out — положила из кармана на карту; ext — получила наличными; adjust — пересчитала (to, cents со знаком)
  var KINDS = [
    { id: "spend", name: "Трата" }, { id: "move", name: "Переложила" }, { id: "in", name: "Сняла с карты" },
    { id: "out", name: "На карту" }, { id: "ext", name: "Получила" },
  ];
  var ORD = { "перв": "1", "втор": "2", "трет": "3", "четверт": "4", "пят": "5" };
  var STOP = ["из", "изо", "с", "со", "в", "во", "на", "за", "от", "к", "и", "а", "евро", "eur", "euro", "руб", "рубля", "рублей", "рубль", "доллар", "долларов",
    "налом", "наличными", "наличкой", "кешем", "кэшем", "cash", "потратила", "потратил", "потратили", "заплатила", "заплатил", "заплатили", "ушло", "минус",
    "переложила", "переложил", "переложили", "перекинула", "перекинул", "перенесла", "перенес", "положила", "положил", "положили", "убрала", "убрал",
    "сняла", "снял", "сняли", "сняла", "получила", "получил", "получили", "дали", "вернули", "вернула", "вернул", "банкомат", "банкомате", "банкомата"];

  function norm(s) { return String(s || "").toLowerCase().replace(/ё/g, "е"); }
  function tokens(s) {
    var out = [], re = /\d+(?:[.,]\d{1,2})?|[a-zа-я]+/g, m, t = norm(s);
    while ((m = re.exec(t))) {
      var w = m[0];
      Object.keys(ORD).forEach(function (k) { if (w.indexOf(k) === 0 && /^[а-я]+$/.test(w) && w.length <= k.length + 3) w = ORD[k]; });
      out.push(w);
    }
    return out;
  }
  function isNum(t) { return /^\d/.test(t); }
  function stem(t) { return isNum(t) ? t : t.slice(0, Math.max(3, Math.min(5, t.length - 1))); }
  function tokMatch(tok, nameTok) { return isNum(nameTok) ? tok === nameTok : !isNum(tok) && tok.indexOf(stem(nameTok)) === 0; }

  // Найти упоминания карманов и банка: [{id, at, end, used:[idx]}]
  function findPlaces(tk, pockets) {
    var found = [];
    pockets.forEach(function (p) {
      var nt = tokens(p.name); if (!nt.length) return;
      var first = nt.findIndex(function (t) { return !isNum(t); }); if (first < 0) first = 0;
      tk.forEach(function (tok, i) {
        if (!tokMatch(tok, nt[first])) return;
        var used = [i], ok = true;
        nt.forEach(function (n, j) {
          if (j === first) return;
          var hit = -1;
          for (var k = Math.max(0, i - 2); k <= Math.min(tk.length - 1, i + 3); k++) if (k !== i && used.indexOf(k) < 0 && tokMatch(tk[k], n)) { hit = k; break; }
          if (hit < 0) ok = false; else used.push(hit);
        });
        if (ok) found.push({ id: p.id, at: Math.min.apply(null, used), end: Math.max.apply(null, used), used: used, score: nt.length });
      });
    });
    tk.forEach(function (tok, i) {
      if (/^(карт|банк|счет|revolut|револют|bbva|wise)/.test(tok) && !/^банкомат/.test(tok)) found.push({ id: "bank", at: i, end: i, used: [i], score: 1 });
    });
    // лучшие без пересечений
    found.sort(function (a, b) { return b.score - a.score || a.at - b.at; });
    var taken = [], out = [];
    found.forEach(function (f) {
      if (f.used.some(function (u) { return taken.indexOf(u) >= 0; })) return;
      taken = taken.concat(f.used); out.push(f);
    });
    return out.sort(function (a, b) { return a.at - b.at; });
  }

  function parse(text, pockets, defaultId) {
    var tk = tokens(text), res = { kind: "spend", cents: null, from: null, to: null, note: "" };
    if (!tk.length) return res;
    var places = findPlaces(tk, pockets || []), used = [];
    places.forEach(function (p) { used = used.concat(p.used); });
    // сумма — первое число, не входящее в название кармана
    for (var i = 0; i < tk.length; i++) if (isNum(tk[i]) && used.indexOf(i) < 0) { res.cents = Math.round(parseFloat(tk[i].replace(",", ".")) * 100); used.push(i); break; }
    var from = null, to = null;
    places.forEach(function (p) {
      var prev = tk[p.at - 1];
      if (prev === "из" || prev === "изо" || prev === "с" || prev === "со" || prev === "от") from = from || p.id;
      else if (prev === "в" || prev === "во" || prev === "на" || prev === "к") to = to || p.id;
      else if (!from) from = p.id; else if (!to) to = p.id;
    });
    var txt = " " + tk.join(" ") + " ";
    var withdraw = /\s(снял|сняли|банкомат)/.test(txt), income = /\s(получил|дали|вернул|подарил|заработал|продал)/.test(txt);
    var moveVerb = /\s(перелож|перекин|перенес|перевел|положил|убрал|достал)/.test(txt);
    if (from === "bank" && to && to !== "bank") { res.kind = "in"; res.to = to; }
    else if (to === "bank") { res.kind = "out"; res.from = from && from !== "bank" ? from : defaultId; }
    else if (withdraw) { res.kind = "in"; res.to = (to || from) !== "bank" ? (to || from || defaultId) : defaultId; }
    else if (income) { res.kind = "ext"; res.to = to || from || defaultId; }
    else if (from && to) { res.kind = "move"; res.from = from; res.to = to; }
    else if (moveVerb && to) { res.kind = "move"; res.from = null; res.to = to; }
    else { res.kind = "spend"; res.from = from && from !== "bank" ? from : defaultId; }
    res.note = tk.filter(function (t, i) { return used.indexOf(i) < 0 && STOP.indexOf(t) < 0 && !/^(налич|кеш|кэш)/.test(t); }).join(" ");
    return res;
  }

  // Наличные из общих трат: я платила, и способ «наличные» или в описании «нал / кеш / cash»
  var CASH_RE = /(^|[^a-zа-яё])(нал|налом|налич\S*|кеш\S*|кэш\S*|cash)([^a-zа-яё]|$)/i;
  function isCashExpense(e) { return e.kind === "expense" && (e.method === "cash" || CASH_RE.test((e.desc || "") + " " + (e.note || ""))); }
  function sharedLines(cash, expenses) {
    if (!cash || !cash.since) return [];
    return (expenses || []).filter(function (e) { return e.paidByMe && e.date >= cash.since && isCashExpense(e); }).map(function (e) {
      return { id: "sh:" + e.id, shared: e, date: e.date, kind: "spend", from: (cash.sharedMap || {})[e.id] || cash.defaultPocket, cents: e.cost, cur: e.currency || "EUR", note: e.desc };
    });
  }

  function balances(cash, lines) {
    var b = {};
    (cash.pockets || []).forEach(function (p) { b[p.id] = p.start || 0; });
    function add(id, v) { if (id && b[id] !== undefined) b[id] += v; }
    (cash.tx || []).concat(lines || []).forEach(function (t) {
      if (t.kind === "spend" || t.kind === "out") add(t.from, -t.cents);
      else if (t.kind === "move") { add(t.from, -t.cents); add(t.to, t.cents); }
      else if (t.kind === "in" || t.kind === "ext" || t.kind === "adjust") add(t.to, t.cents);
    });
    return b;
  }

  root.BudgetCash = { KINDS: KINDS, parse: parse, tokens: tokens, isCashExpense: isCashExpense, sharedLines: sharedLines, balances: balances };
})(typeof window !== "undefined" ? window : this);
