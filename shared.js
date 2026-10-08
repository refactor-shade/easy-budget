/* Easy Budget — общие траты с партнёром (ТЗ 3.8–3.10, раздел 4 «Импорт»).
   Splitwise CSV, баланс «кто кому должен», автокатегории, разбор пакетов из заметок. */
(function (root) {
  "use strict";
  var E = root.BudgetEngine;

  var SHARED_CATS = [
    "Продукты", "Кафе и рестораны", "Доставка еды", "Развлечения и события", "Жильё и счета", "Путешествия",
    "Подарки и праздники", "Няня / помощь", "Уборка", "Такси и транспорт", "Ребёнок: школа, лагеря",
    "Аптека, здоровье, уход", "Документы и налоги", "Дом и быт", "Одежда", "Прочее", "Сводные суммы", "Твои подписки (личное)",
  ];
  var FOOD = ["Продукты", "Кафе и рестораны", "Доставка еды"];
  var FUN = ["Развлечения и события"];

  // Словарь ключевых слов → категория (порядок важен: первое совпадение)
  var DICT = [
    ["Доставка еды", ["glovo food", "глово еда", "uber eats", "доставка"]],
    ["Продукты", ["продукт", "меркадона", "mercadona", "аметье", "ametll", "глово", "glovo", "бонпреу", "бон преу", "bonpreu",
      "caprabo", "капрабо", "лидл", "lidl", "фрукт", "servifruit", "сервифрут", "фрутерия", "кондис", "супермаркет", "groceries",
      "русский магаз", "алди", "aldi", "carrefour", "карфур", "магаз", "вода", "булоч", "хлеб", "пельмен", "мясо", "рыба"]],
    ["Кафе и рестораны", ["онест", "honest", "машина паста", "machina", "pasta", "паста", "суши", "sushi", "макдак", "mcd", "mcdonald",
      "kfc", "фанки", "кофе", "coffee", "cafe", "кафе", "starbucks", "старбакс", "рестик", "ресторан", "ужин", "обед", "lunch",
      "бранч", "brunch", "рамен", "поке", "poke", "пицц", "pizza", "индийск", "грузинск", "итальянск", "китайк", "азиатск",
      "бургер", "burger", "abacus", "абакус", "kevabro", "печенька", "onyva", "онива", "crusants", "cru sants", "крюсантс",
      "roma sants", "рома сантс", "samsmack", "самсмак", "vicio", "висио", "чуррос", "бабл ти", "drinks", "напитки", "бар ",
      "хинкали", "лимонад", "булочьки", "блинчик", "роллы", "food", "еда", "солтс", "salts", "армони", "винитус", "сато"]],
    ["Развлечения и события", ["primavera", "примавера", "кино", "кинопаб", "movie", "концерт", "музей", "балет", "опер", "театр",
      "билет", "port aventura", "disney", "экскурси", "парк", "шарики", "праздник"]],
    ["Уборка", ["уборк", "cleaning", "средства для уборки", "чистящ"]],
    ["Такси и транспорт", ["такси", "taxi", "uber", "renfe", "bvg", "автобус", "транспорт", "метро", "cabify", "bolt", "бензин"]],
    ["Жильё и счета", ["rent", "аренд", "gas bill", "gas factura", "electricity", "электричеств", "agua", "water", "вода счет",
      "bill", "счёт за", "счет за", "интернет", "страховка дом", "коммунал"]],
    ["Ребёнок: школа, лагеря", ["school", "школ", "лагер", "lev", "лев", "льву", "harry potter"]],
    ["Аптека, здоровье, уход", ["нурофен", "аптек", "лекарств", "таблетки", "rossman", "druni", "rituals", "кондиционер для волос",
      "шампунь", "врач", "доктор", "medical", "стрижка"]],
    ["Подарки и праздники", ["подар", "gift", "др ", "день рождения", "цветы"]],
    ["Путешествия", ["отель", "hotel", "airbnb", "самолет", "самолёт", "flight", "поездк", "дюти фри", "париж", "paris",
      "san sebastian", "bilbao", "нури", "nuria", "монсерат", "монтсеррат", "ситджес"]],
    ["Дом и быт", ["икея", "ikea", "amazon", "zara home", "зара хоум", "мебел", "декатлон", "посудомо", "штор", "полк", "весы",
      "лампоч", "household", "furniture", "химчистк", "инструмент"]],
    ["Одежда", ["одежд", "oysho", "zara", "футболк", "clothing", "обув"]],
    ["Документы и налоги", ["налог", "документ", "нотариус", "гестор", "gestor", "виза", "nie"]],
    ["Твои подписки (личное)", ["microsoft", "365", "netflix", "spotify", "icloud", "apple music", "claude", "chatgpt"]],
  ];
  var SW_CATS = {
    "Groceries": "Продукты", "Liquor": "Продукты", "Dining out": "Кафе и рестораны", "Taxi": "Такси и транспорт",
    "Bus/train": "Такси и транспорт", "Gas/fuel": "Такси и транспорт", "Bicycle": "Такси и транспорт", "Rent": "Жильё и счета",
    "Electricity": "Жильё и счета", "Heat/gas": "Жильё и счета", "Water": "Жильё и счета", "TV/Phone/Internet": "Жильё и счета",
    "Clothing": "Одежда", "Gifts": "Подарки и праздники", "Furniture": "Дом и быт", "Household supplies": "Дом и быт",
    "Home - Other": "Дом и быт", "Cleaning": "Уборка", "Hotel": "Путешествия", "Medical expenses": "Аптека, здоровье, уход",
    "Movies": "Развлечения и события", "Entertainment - Other": "Развлечения и события", "Music": "Развлечения и события",
    "Pets": "Прочее", "Life - Other": "Прочее",
  };
  // Деление суммы как в Splitwise. mode: equal | exact | percent | shares | adjust.
  // v = {me, partner} — суммы в центах (exact, adjust), проценты (percent) или доли (shares).
  // Возвращает {me, partner, error}: доли в центах, всегда в сумме = cost.
  function computeSplit(cost, mode, v) {
    v = v || {};
    var me, err = null;
    var a = Number(v.me) || 0, b = Number(v.partner) || 0;
    if (mode === "exact") {
      me = Math.round(a);
      if (Math.round(a + b) !== cost) err = "Сумма долей " + E.fmt(Math.round(a + b)) + " из " + E.fmt(cost) + " — осталось " + E.fmt(cost - Math.round(a + b));
    } else if (mode === "percent") {
      me = Math.round(cost * a / 100);
      if (Math.abs(a + b - 100) > 1e-9) err = (Math.round((a + b) * 100) / 100) + "% из 100% — осталось " + (Math.round((100 - a - b) * 100) / 100) + "%";
    } else if (mode === "shares") {
      if (a + b <= 0) { err = "Нужна хотя бы одна доля"; me = 0; } else me = Math.round(cost * a / (a + b));
    } else if (mode === "adjust") {
      var rest = cost - Math.round(a) - Math.round(b);
      me = Math.round(a) + Math.round(rest / 2);
      if (rest < 0) err = "Поправки больше суммы";
    } else {
      me = Math.round(cost / 2);
    }
    return { me: me, partner: cost - me, error: err };
  }

  // Ручной ввод (я или партнёр): доля плательщика не в долг, остальное — долг второго
  function makeExpense(o) {
    var cost = o.cost, myShare = o.myShare !== undefined ? o.myShare : Math.round(cost * (o.shareMine !== undefined ? o.shareMine : 0.5));
    var net = o.paidByMe ? cost - myShare : -myShare;
    return { id: o.id || ("m:" + E.uid("e")), date: o.date, desc: o.desc, cost: cost, currency: o.currency || "EUR", net: net,
      share: myShare, paidByMe: !!o.paidByMe, kind: o.kind || "expense", cat: o.cat || null, method: o.method || "card",
      addedBy: o.addedBy || "me", source: "app", personalOf: o.personalOf || null, split: o.split || null, note: o.note || "" };
  }
  // Расчёт: amount > 0 — партнёр перевёл мне, < 0 — я перевела партнёру
  function makeSettlement(date, amount, currency, addedBy) {
    return { id: "m:" + E.uid("s"), date: date, desc: amount > 0 ? "Партнёр рассчитался" : "Я рассчиталась", cost: Math.abs(amount),
      currency: currency || "EUR", net: -amount, share: 0, paidByMe: amount < 0, kind: "settlement", source: "app", addedBy: addedBy || "me" };
  }

  var REFUND_RE = /(^|\s)(долг|долги|возврат|вернула|вернул|взяла нал|взяла рубли|дала рубли|я взяла|я дала|в долг|остатки нала|его деньги|lost cash|cash$|пять тыщ)/i;
  var BATCH_RE = /(расшифровк|расчеты|расчёты)/i;

  function norm(s) { return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim(); }

  function guessCategory(desc, swCat, learned) {
    var d = norm(desc);
    if (learned && learned[d]) return learned[d];
    for (var i = 0; i < DICT.length; i++) {
      var keys = DICT[i][1];
      for (var j = 0; j < keys.length; j++) if (d.indexOf(norm(keys[j])) !== -1) return DICT[i][0];
    }
    if (swCat && SW_CATS[swCat]) return SW_CATS[swCat];
    return "Прочее";
  }

  // ---------- CSV ----------
  function parseCSV(text) {
    var rows = [], row = [], cur = "", q = false;
    text = String(text).replace(/^﻿/, "");
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); rows.push(row); row = []; cur = "";
      } else cur += ch;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function toCents(s) { var v = parseFloat(String(s).replace(",", ".")); return isNaN(v) ? 0 : Math.round(v * 100); }

  // Splitwise: Date, Description, Category, Cost, Currency, <me>, <partner>
  function importSplitwise(text, opts) {
    opts = opts || {};
    var rows = parseCSV(text);
    var head = rows[0] || [];
    var meIdx = head.indexOf(opts.myName || "Katya");
    if (meIdx < 0) meIdx = 5;
    var partner = head.filter(function (_, i) { return i >= 5 && i !== meIdx; })[0] || "Партнёр";
    var out = [], seen = {}, control = {};
    rows.slice(1).forEach(function (r) {
      if (!r[0] || r.length < 6) return;
      var desc = (r[1] || "").trim();
      if (desc === "Total balance") { control[r[4]] = toCents(r[meIdx]); return; }
      var cost = toCents(r[3]), mine = toCents(r[meIdx]);
      var base = [r[0], desc, cost, r[4], mine].join("|");
      seen[base] = (seen[base] || 0) + 1;
      var kind = r[2] === "Payment" ? "settlement" : BATCH_RE.test(desc) ? "batch" : REFUND_RE.test(norm(desc)) ? "refund" : "expense";
      out.push({
        id: "sw:" + base + "|" + seen[base], date: r[0], desc: desc, swCat: r[2], cost: cost, currency: r[4] || "EUR",
        net: mine, share: mine > 0 ? cost - mine : -mine, paidByMe: mine > 0, kind: kind, source: "splitwise",
      });
    });
    return { expenses: out, control: control, partnerName: partner };
  }

  // Слить новую выгрузку с уже имеющимися (правки категорий и типов сохраняются)
  function mergeExpenses(existing, incoming) {
    var byId = {};
    existing.forEach(function (e) { byId[e.id] = e; });
    var added = 0;
    incoming.forEach(function (e) {
      if (byId[e.id]) return;
      existing.push(e); byId[e.id] = e; added++;
    });
    existing.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return added;
  }

  // 3.8 Баланс: >0 — партнёр должен мне, по валютам
  function balance(expenses, untilISO) {
    var b = {};
    expenses.forEach(function (e) {
      if (untilISO && e.date > untilISO) return;
      b[e.currency] = (b[e.currency] || 0) + e.net;
    });
    return b;
  }

  function toEur(cents, currency, date, settings) {
    if (!currency || currency === "EUR") return cents;
    var fx = (settings && settings.fx) || {};
    var r = fx[currency];
    if (typeof r === "object" && r) r = r[String(date).slice(0, 4)] || r.default;
    return r ? cents / r : 0;
  }

  function catOf(e, learned) { return e.cat || guessCategory(e.desc, e.swCat, learned); }

  // Траты по месяцам и категориям (моя доля, €). Сводные суммы из Splitwise — своя категория.
  function monthlyShares(shared, settings, year) {
    var res = {};
    function add(cat, m, v) {
      res[cat] = res[cat] || new Array(12).fill(0);
      res[cat][m] += v;
    }
    (shared.expenses || []).forEach(function (e) {
      if (String(e.date).slice(0, 4) !== String(year)) return;
      var m = Number(e.date.slice(5, 7)) - 1;
      if (e.kind === "settlement" || e.kind === "refund") return;
      var share = toEur(e.share, e.currency, e.date, settings);
      add(e.kind === "batch" && !e.cat ? "Сводные суммы" : catOf(e, shared.learned), m, share);
    });
    return { byCat: res };
  }

  // 3.10 Сверка общего и личного: еда и развлечения по месяцам
  function coverage(state, shared, year) {
    var ms = monthlyShares(shared || {}, state.settings, year);
    var cov = state.settings.coverage || { food: ["c21"], fun: ["c23"] };
    var y = state.years[String(year)], r = y ? E.compute(state, year) : null;
    var out = [];
    for (var m = 0; m < 12; m++) {
      var sf = 0, sfun = 0, pf = 0, pfun = 0;
      FOOD.forEach(function (c) { if (ms.byCat[c]) sf += ms.byCat[c][m]; });
      FUN.forEach(function (c) { if (ms.byCat[c]) sfun += ms.byCat[c][m]; });
      if (r) {
        for (var w = m * 5; w < m * 5 + 5; w++) {
          cov.food.forEach(function (id) { var x = r.cells[id] && r.cells[id][w]; if (x) pf -= x.cents; });
          cov.fun.forEach(function (id) { var x = r.cells[id] && r.cells[id][w]; if (x) pfun -= x.cents; });
        }
      }
      var s = sf + sfun, p = pf + pfun;
      out.push({ month: m + 1, sharedFood: sf, sharedFun: sfun, shared: s, personalFood: pf, personalFun: pfun, personal: p,
        outside: p - s, coverage: p ? s / p : null });
    }
    return out;
  }

  root.BudgetShared = {
    SHARED_CATS: SHARED_CATS, FOOD: FOOD, FUN: FUN, guessCategory: guessCategory, parseCSV: parseCSV,
    importSplitwise: importSplitwise, computeSplit: computeSplit, makeExpense: makeExpense, makeSettlement: makeSettlement, mergeExpenses: mergeExpenses, balance: balance, toEur: toEur, catOf: catOf,
    monthlyShares: monthlyShares, coverage: coverage, norm: norm,
  };
})(typeof window !== "undefined" ? window : this);
