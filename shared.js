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
  // Еда — то, что дома; кафе, рестораны и такси считаются вместе с развлечениями (так в плане по умолчанию)
  var FOOD = ["Продукты", "Доставка еды"];
  var FUN = ["Развлечения и события", "Кафе и рестораны", "Такси и транспорт"];

  // Словарь ключевых слов → категория (порядок важен: первое совпадение)
  var DICT = [
    // сначала — то, что важнее общих слов: «Ski rental» — путешествие, а не аренда
    ["Путешествия", ["ski ", "ski-", "лыж", "горнолыж", "skipass", "ски пасс"]],
    ["Доставка еды", ["glovo food", "глово еда", "uber eats", "доставка"]],
    ["Продукты", ["продукт", "меркадона", "mercadona", "аметье", "ametll", "глово", "glovo", "бонпреу", "бон преу", "bonpreu",
      "caprabo", "капрабо", "лидл", "lidl", "фрукт", "фрутерия", "кондис", "супермаркет", "groceries",
      "русский магаз", "алди", "aldi", "carrefour", "карфур", "магаз", "вода", "булоч", "хлеб", "пельмен", "мясо", "рыба", "гриб"]],
    ["Кафе и рестораны", ["pasta", "паста", "суши", "sushi", "макдак", "mcd", "mcdonald",
      "kfc", "кофе", "coffee", "cafe", "кафе", "starbucks", "старбакс", "рестик", "ресторан", "ужин", "обед", "lunch",
      "бранч", "brunch", "рамен", "поке", "poke", "пицц", "pizza", "индийск", "грузинск", "итальянск", "китайк", "азиатск",
      "бургер", "burger", "чуррос", "бабл ти", "drinks", "напитки", "бар ",
      "хинкали", "лимонад", "булочьки", "блинчик", "блины", "блин ", "роллы", "food", "еда"]],
    ["Развлечения и события", ["кино", "кинопаб", "movie", "концерт", "музей", "балет", "опер", "театр",
      "билет", "port aventura", "disney", "экскурси", "парк", "шарики", "праздник", "попкорн", "смотровая", "mirador", "аттракцион", "квест"]],
    ["Уборка", ["уборк", "cleaning", "средства для уборки", "чистящ"]],
    ["Такси и транспорт", ["такси", "taxi", "uber", "renfe", "bvg", "автобус", "транспорт", "метро", "cabify", "bolt", "бензин"]],
    ["Жильё и счета", ["rent", "аренд", "gas bill", "gas factura", "electricity", "электричеств", "agua", "water", "вода счет",
      "bill", "счёт за", "счет за", "интернет", "страховка дом", "коммунал"]],
    ["Ребёнок: школа, лагеря", ["school", "школ", "лагер"]],
    ["Аптека, здоровье, уход", ["нурофен", "аптек", "лекарств", "таблетки", "rossman", "druni", "rituals", "кондиционер для волос",
      "шампунь", "врач", "доктор", "medical", "стрижка"]],
    ["Подарки и праздники", ["подар", "gift", "др ", "день рождения", "цветы"]],
    ["Путешествия", ["отель", "hotel", "airbnb", "самолет", "самолёт", "flight", "поездк", "дюти фри"]],
    ["Дом и быт", ["икея", "ikea", "amazon", "zara home", "зара хоум", "мебел", "декатлон", "посудомо", "штор", "полк", "весы",
      "лампоч", "household", "furniture", "химчистк", "инструмент", "бокал", "fnac", "фнак", "tiger", "тайгер", "aliexpress", "алиэкспресс", "посуда"]],
    ["Одежда", ["одежд", "oysho", "zara", "футболк", "clothing", "обув"]],
    ["Документы и налоги", ["налог", "документ", "нотариус", "гестор", "gestor", "виза", "nie"]],
    ["Твои подписки (личное)", ["microsoft", "майкрософт", "365", "netflix", "spotify", "icloud", "apple music", "claude", "chatgpt"]],
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

  // Куда довписать недостающую сумму: в недели, где ушло больше, чем стоит в плане (по порядку), — там, где деньги и ушли.
  // paid, plan — центы по неделям месяца (массивы одной длины, plan ≥ 0); gap — сколько не хватает (центы, > 0).
  // Возвращает [{i, cents}] — индекс недели и сумма (кратна 1 €, в сумме = gap, округлённому до евро)
  function spreadGap(paid, plan, gap) {
    var total = Math.round(gap / 100) * 100, left = total, out = [];
    if (total <= 0) return out;
    var lastPaid = -1;
    for (var i = 0; i < paid.length; i++) {
      if (paid[i] > 0) lastPaid = i;
      var ex = Math.round(Math.max(0, paid[i] - plan[i]) / 100) * 100;
      if (ex > 0 && left > 0) { var c = Math.min(ex, left); out.push({ i: i, cents: c }); left -= c; }
    }
    if (left > 0) {
      var tgt = out.length ? out[out.length - 1].i : lastPaid >= 0 ? lastPaid : paid.length - 1;
      var hit = out.find(function (x) { return x.i === tgt; });
      if (hit) hit.cents += left; else out.push({ i: tgt, cents: left });
    }
    return out;
  }
  // похоже на перевод денег между вами, а не на трату
  var TRANSFER_RE = /одолжил|твой (нал|кеш|кэш)|(нал|кеш|кэш) у меня|вернул[аи]? (долг|тебе|мне)|за (тебя|меня) верну/i;
  // names — имена людей пространства: «Аня дала Саше» — тоже перевод (по первым трём буквам имени)
  function looksLikeTransfer(desc, names) {
    var d = norm(desc);
    if (TRANSFER_RE.test(d)) return true;
    return (names || []).some(function (n) { var st = norm(n).split(" ")[0].slice(0, 3); return st.length === 3 && d.indexOf("дал") !== -1 && new RegExp("дал[аи]? " + st).test(d); });
  }
  // learned — словарь пространства (хранится в базе, виден только участникам):
  // «описание целиком» → категория; «*слово» — слово внутри описания, важнее общих слов;
  // «~слово» — слово внутри описания на месте своей категории в DICT (имена, свои кафе, места поездок)
  var DICT_LAST = {}; DICT.forEach(function (g, i) { DICT_LAST[g[0]] = i; });
  var wordsCache = { src: null, n: -1 };
  function learnedWords(learned) {
    var keys = Object.keys(learned);
    if (wordsCache.src === learned && wordsCache.n === keys.length) return wordsCache;
    var w = { src: learned, n: keys.length, strong: [], weak: {}, rest: [] };
    keys.forEach(function (k) {
      if (k.length < 2) return;
      var m = k.charAt(0), it = { w: k.slice(1), c: learned[k] };
      if (m === "*") w.strong.push(it);
      else if (m === "~") { if (DICT_LAST[it.c] === undefined) w.rest.push(it); else (w.weak[it.c] = w.weak[it.c] || []).push(it); }
    });
    return (wordsCache = w);
  }
  function findWord(d, list) { for (var k = 0; k < list.length; k++) if (d.indexOf(list[k].w) !== -1) return list[k].c; return null; }
  function guessCategory(desc, swCat, learned) {
    var d = norm(desc), w = null, hit;
    if (learned && learned[d]) return learned[d];
    if (learned) { w = learnedWords(learned); if ((hit = findWord(d, w.strong))) return hit; }
    for (var i = 0; i < DICT.length; i++) {
      var keys = DICT[i][1];
      for (var j = 0; j < keys.length; j++) if (d.indexOf(norm(keys[j])) !== -1) return DICT[i][0];
      if (w && DICT_LAST[DICT[i][0]] === i && w.weak[DICT[i][0]] && (hit = findWord(d, w.weak[DICT[i][0]]))) return hit;
    }
    if (w && (hit = findWord(d, w.rest))) return hit;
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
    var meIdx = opts.myName ? head.indexOf(opts.myName) : -1;
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


  // ---------- общие → личный план ----------
  var MAP_GUESS = [
    ["Путешествия", /путеш|поездк|отпуск|travel/i], ["Подарки и праздники", /подар|праздн/i], ["Одежда", /одежд|обув/i],
    ["Жильё и счета", /квартир|аренд|жиль|коммун|utilit|rent|счет|счёт|свет|вода|газ/i], ["Уборка", /уборк/i], ["Такси и транспорт", /такси|транспорт|машин/i],
    ["Аптека, здоровье, уход", /здоров|аптек|врач|уход|красот|спорт/i], ["Дом и быт", /дом|быт|мебел/i], ["Ребёнок: школа, лагеря", /реб[её]н|школ|лагер|дет/i],
    ["Документы и налоги", /документ|налог|бухгалт|gestor/i], ["Няня / помощь", /нян|помощ/i], ["Твои подписки (личное)", /подписк/i],
  ];
  // Коммуналка: свет, вода, газ из «Жильё и счета» — без аренды и без интернета/телефона
  var RENT_RE = /rent|аренд|квартплат/i, NET_RE = /internet|интернет|wifi|wi-fi|lowi|movistar|vodafone|orange|digi|телефон|phone/i;
  function isUtility(e, learned) { return e.kind === "expense" && catOf(e, learned) === "Жильё и счета" && !RENT_RE.test(e.desc || "") && !NET_RE.test(e.desc || ""); }
  function utilityCat(state) {
    var ok = function (c) { return !c.archived && c.block !== "income" && c.block !== "savings"; };
    var c = state.categories.find(function (x) { return ok(x) && /коммун|utilit|счета за дом/i.test(x.name) && !/квартир|аренд/i.test(x.name); }) ||
      state.categories.find(function (x) { return ok(x) && /коммун|utilit/i.test(x.name); });
    return c ? c.id : null;
  }
  function guessPersonalCat(state, sharedCat) {
    var g = MAP_GUESS.find(function (x) { return x[0] === sharedCat; });
    if (!g) return null;
    var c = state.categories.find(function (x) { return !x.archived && x.block !== "income" && x.block !== "savings" && g[1].test(x.name); });
    return c ? c.id : null;
  }
  // С какими строками личного плана сравнивать категорию общих: выбор владельца плана, иначе все подходящие по названию
  // («Жильё и счета» → квартира, rent, utilities, счета, коммуналка)
  function planCatsFor(state, sharedCat) {
    var pick = (state.settings.sharedCompare || {})[sharedCat];
    if (pick) return pick.filter(function (id) { return state.categories.some(function (c) { return c.id === id; }); });
    var g = MAP_GUESS.find(function (x) { return x[0] === sharedCat; });
    if (!g) { var one = (state.settings.sharedMap || {})[sharedCat]; return one ? [one] : []; }
    return state.categories.filter(function (x) { return !x.archived && x.block !== "income" && x.block !== "savings" && g[1].test(x.name); }).map(function (x) { return x.id; });
  }
  // Заметные общие траты (моя доля), которых, похоже, нет в личном плане. Еда и развлечения — отдельно, через покрытие.
  function toLog(state, shared, opts) {
    opts = opts || {};
    var since = opts.since || "0000", today = opts.today || E.todayISO(), min = opts.min || 4000, handled = opts.handled || {}, map = opts.map || {};
    var out = [];
    (shared.expenses || []).forEach(function (e) {
      if (e.kind !== "expense" || e.date < since || e.date > today || handled[e.id]) return;
      var share = toEur(e.share, e.currency, e.date, state.settings);
      if (share < min) return;
      var cat = catOf(e, shared.learned);
      if (FOOD.indexOf(cat) >= 0 || FUN.indexOf(cat) >= 0 || cat === "Сводные суммы") return;
      var ys = e.date.slice(0, 4), y = state.years[ys];
      if (!y || y.archived) return;
      var util = isUtility(e, shared.learned), uc = util ? (opts.utilCat || utilityCat(state)) : null;
      var wk = E.weekOfDate(e.date), catId = uc || map[cat] || guessPersonalCat(state, cat), maybe = null;
      if (catId) {
        var r = E.compute(state, ys), m0 = Math.floor(wk.idx / 5) * 5;
        for (var w = m0; w < m0 + 5; w++) {
          var x = r.cells[catId] && r.cells[catId][w];
          if (x && -x.cents >= share * 0.8) { maybe = { week: w, cents: x.cents }; break; }
        }
      }
      out.push({ e: e, share: share, sharedCat: util ? "Коммуналка" : cat, catId: catId, year: ys, week: wk.idx, maybe: maybe, utility: util });
    });
    return out.sort(function (a, b) { return (a.maybe ? 1 : 0) - (b.maybe ? 1 : 0) || b.share - a.share; });
  }
  // Месяцы, где общая еда и развлечения (моя доля) вышли больше личного плана на эти статьи
  function coverageGaps(state, shared, opts) {
    opts = opts || {};
    var since = opts.since || "0000", today = opts.today || E.todayISO(), min = opts.min || 4000, handled = opts.handled || {}, out = [];
    var years = {};
    for (var yy = Number(since.slice(0, 4)); yy <= Number(today.slice(0, 4)); yy++) if (state.years[String(yy)] && !state.years[String(yy)].archived) years[yy] = 1;
    Object.keys(years).forEach(function (ys) {
      coverage(state, shared, ys).forEach(function (c) {
        var key = "cov:" + ys + "-" + (c.month < 10 ? "0" : "") + c.month, end = ys + "-" + (c.month < 10 ? "0" : "") + c.month + "-31";
        if ((handled[key] && handled["covfun" + key.slice(3)]) || end < since || key.slice(4) + "-01" > today.slice(0, 7) + "-01") return;
        if (ys + "-" + (c.month < 10 ? "0" : "") + c.month >= today.slice(0, 7)) return; // месяц ещё идёт
        // еда и развлечения — отдельно: каждое сравниваем со своей строкой личного плана
        var gf = c.sharedFood - c.personalFood, gj = c.sharedFun - c.personalFun;
        if (gf >= min && !handled[key]) out.push({ key: key, kind: "food", year: ys, month: c.month, shared: c.sharedFood, personal: c.personalFood, gap: gf });
        if (gj >= min && !handled["covfun" + key.slice(3)]) out.push({ key: "covfun" + key.slice(3), kind: "fun", year: ys, month: c.month, shared: c.sharedFun, personal: c.personalFun, gap: gj });
      });
    });
    return out;
  }

  root.BudgetShared = {
    SHARED_CATS: SHARED_CATS, FOOD: FOOD, FUN: FUN, guessCategory: guessCategory, looksLikeTransfer: looksLikeTransfer, spreadGap: spreadGap, parseCSV: parseCSV,
    importSplitwise: importSplitwise, computeSplit: computeSplit, makeExpense: makeExpense, makeSettlement: makeSettlement, mergeExpenses: mergeExpenses, balance: balance, toEur: toEur, catOf: catOf,
    monthlyShares: monthlyShares, coverage: coverage, norm: norm, toLog: toLog, isUtility: isUtility, utilityCat: utilityCat, coverageGaps: coverageGaps, guessPersonalCat: guessPersonalCat, planCatsFor: planCatsFor,
  };
})(typeof window !== "undefined" ? window : this);
