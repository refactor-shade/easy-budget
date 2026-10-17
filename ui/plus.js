/* Easy Budget — «+»: внести одной фразой. Вкладки: трата · доход · общая · наличка · сверка. */
(function () {
  "use strict";

  // ---------- разбор фразы ----------
  var PH_STOP = ["евро", "eur", "€", "руб", "р", "в", "на", "за", "из", "и", "с", "со", "по", "это", "было", "доход", "получила", "пришло", "пришла"];
  var PH_WD = { "понедельник": 1, "пн": 1, "вторник": 2, "вт": 2, "среда": 3, "среду": 3, "ср": 3, "четверг": 4, "чт": 4, "пятница": 5, "пятницу": 5, "пт": 5, "суббота": 6, "субботу": 6, "сб": 6, "воскресенье": 0, "вс": 0 };
  function phNorm(s) { return String(s || "").toLowerCase().replace(/ё/g, "е"); }
  function phLoose(w) { return phNorm(w).replace(/([а-яa-z])\1+/g, "$1"); }
  function phStem(w) { w = phNorm(w); return w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2)); }
  function phParse(text) {
    var t = phNorm(text), out = { cents: null, date: null, words: [] };
    // дата: 12.10 / 12/10
    t = t.replace(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/, function (m, d, mo, yy) {
      var y = yy ? (yy.length === 2 ? "20" + yy : yy) : E.todayISO().slice(0, 4);
      out.date = y + "-" + ("0" + mo).slice(-2) + "-" + ("0" + d).slice(-2); return " ";
    });
    // месяц словами: «в конце ноября», «15 ноября», «в начале декабря», «в феврале», «конец месяца»
    var MON = ["янв", "фев", "мар", "апр", "ма[йяе]", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    var mre = new RegExp("(?:(в\\s+)?(конц[еа]|конец|начал[еа]|середин[еуы])\\s+)?(\\d{1,2}\\s+)?(" + MON.join("|") + ")[а-я]*", "i");
    var today = E.todayISO(), ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7)) - 1;
    var lastDay = function (y, m) { return new Date(y, m + 1, 0).getDate(); };
    var mk = function (y, m, d) { return y + "-" + ("0" + (m + 1)).slice(-2) + "-" + ("0" + d).slice(-2); };
    t = t.replace(/(?:в\s+)?(конц[еа]|конец|начал[еа]|середин[еуы])\s+месяца/, function (m0, pos) {
      out.date = mk(ty, tm, /^кон/.test(pos) ? lastDay(ty, tm) : /^нач/.test(pos) ? 1 : 15); return " ";
    });
    if (!out.date) t = t.replace(mre, function (m0, v, pos, day, mon) {
      var mi = MON.findIndex(function (x) { return new RegExp("^" + x, "i").test(mon); }); if (mi < 0) return m0;
      var y = mi < tm ? ty + 1 : ty, d = day ? Number(day) : pos ? (/^кон/.test(pos) ? lastDay(y, mi) : /^нач/.test(pos) ? 1 : 15) : 1;
      out.date = mk(y, mi, Math.min(d, lastDay(y, mi))); return " ";
    });
    // сумма: первое число (4,5 · 1 200 · 89)
    t = t.replace(/(\d{1,3}(?:[.,\u00a0\u202f ]\d{3})+(?:[.,]\d{1,2})?(?!\d)|\d+(?:[.,]\d{1,2})?)/, function (m) { out.cents = Math.round(E.parseNum(m) * 100); return " "; });
    t.split(/[\s,;]+/).forEach(function (w) {
      if (!w) return;
      if (w === "сегодня") { out.date = E.todayISO(); return; }
      if (w === "вчера") { out.date = E.addDays(E.todayISO(), -1); return; }
      if (w === "позавчера") { out.date = E.addDays(E.todayISO(), -2); return; }
      if (PH_WD[w] !== undefined) { var now = new Date(E.todayISO() + "T12:00:00"), back = (now.getDay() - PH_WD[w] + 7) % 7; out.date = E.addDays(E.todayISO(), -back); return; }
      if (PH_STOP.indexOf(w) >= 0) return;
      out.words.push(w);
    });
    return out;
  }
  // категория по словам: сначала выученные слова, потом совпадение с названием
  function phCat(words, income) {
    var learned = state.settings.phraseCats || {}, ok = function (c) { return c && !c.archived && (income ? c.block === "income" : c.block !== "income" && c.block !== "savings"); };
    // «нал», «наличкой», «кэш» — про способ оплаты, не про категорию («нал» иначе совпадал с «налог»)
    var isCash = function (w) { return K.CASH_WORD.test(phNorm(w)); };
    for (var i = 0; i < words.length; i++) { if (isCash(words[i])) continue; var id = learned[phStem(words[i])], c = state.categories.find(function (x) { return x.id === id; }); if (ok(c)) return { id: c.id, used: i }; }
    var list = cats().filter(ok);
    for (i = 0; i < words.length; i++) {
      if (isCash(words[i])) continue;
      // удвоенные буквы не важны: «шоппинг» = «шопинг», «каффе» = «кафе»
      var st = phStem(phLoose(words[i])); if (st.length < 3) continue;
      var hit = list.find(function (c) { return phNorm(c.name).split(/[^a-zа-я0-9]+/).some(function (n) { n = phLoose(n); return n && (n.indexOf(st) === 0 || st.indexOf(phStem(n)) === 0); }); });
      if (hit) return { id: hit.id, used: i };
    }
    return null;
  }
  // Трата: сначала свои слова и названия строк (phCat), потом общий словарь («аптека» → «Аптека, здоровье, уход» → «здоровье, медицина»)
  function spendCat(words) {
    var ci = phCat(words, false); if (ci) return ci;
    words = words.filter(function (w) { return !K.CASH_WORD.test(phNorm(w)); });
    if (!words.length) return null;
    var sc = S.guessCategory(words.join(" "), null, sh ? sh.learned : null), id = sc && sc !== "Прочее" ? S.personalCatFor(state, sc) : null;
    return id ? { id: id, used: -1 } : null;
  }

  // Наличка от порога (по умолчанию 20 €) — предложить внести в план. null — не спрашиваем, "" — не вносить, иначе id категории.
  function cashPlanCat(md) {
    var g = cashPlanGuess(md);
    if (!g) return null;
    if (plusUi.over.cashEnv === "no") return "";
    if (plusUi.over.cashPlan !== undefined) return plusUi.over.cashPlan;
    return g.unknown ? "" : g.cat;
  }
  // строки превью «уже в плане»: сколько останется в плане недели и, если не хватило, сколько допишется сверх
  function envOverRow(over) { return over ? tpl("<div class='pw-row pw-over'><span>Сверх плана</span><b>{v} допишется к неделе</b></div>", { v: E.fmt(-over, { cur: "€" }) }) : ""; }
  function envRows(env, cents) {
    var sp = splitEnv(env, cents), lft = env.left - sp.inside;
    return tpl("<div class='pw-row'><span>Уже в плане {pl}</span><b>останется {l2}</b></div>{!over}", {
      l2: E.fmt(lft, { cur: "€", dec: lft % 100 ? 2 : 0 }), pl: E.fmt(env.plan, { cur: "€", dec: env.plan % 100 ? 2 : 0 }), over: envOverRow(sp.over) });
  }
  // категория и есть ли на эту неделю уже сумма в плане (тогда по умолчанию не вносим: еда, развлечения — недельный бюджет, иначе двойной счёт)
  function cashPlanGuess(md) {
    var cc = md.cash, min = state.settings.cashPlanMin !== undefined ? state.settings.cashPlanMin : 2000;
    if (!cc || cc.kind !== "spend" || !md.cents || md.cents < min || Cash.pocketCur(cc.from) !== "€") return null;
    var ci = spendCat(phParse(cc.note || "").words), cat = plusUi.over.cashPlanCat || (ci ? ci.id : defaultCat());
    var wk = E.weekOfDate(md.date), ys = wk && String(wk.year), planned = 0;
    if (wk && state.years[ys]) { var cell = (E.compute(state, ys).cells[cat] || [])[wk.idx]; if (cell && cell.cents < 0) planned = -cell.cents; }
    return { cat: cat, planned: planned, unknown: !ci && !plusUi.over.cashPlanCat };
  }
  // Похоже на общую трату: «пополам», «вдвоём», «общая», имя партнёра
  function sharedSignal(text) {
    var t = phNorm(text), words = t.split(/[\s,;.!?]+/).filter(Boolean);
    return !!sh && (/(^|\s)(пополам|поровну|вдво[её]м|на двоих|общ(ая|ий|ее|ую|ие))(\s|$)/.test(t) || words.some(function (w) { return partnerStems().some(function (st) { return st && w.indexOf(st) === 0; }); }));
  }
  // Слова фразы общей траты: кто платил, «целиком», «нал» — отдельно, остальное — описание
  function sharedWords(words, text) {
    var pNames = partnerStems(), r = { payP: false, full: false, cash: false, desc: [] };
    // «с Сашей», «для Саши» — вместе, а не «платила Саша»
    var withP = pNames.some(function (st) { return st && new RegExp("(^|\\s)(с|со|для|вместе с)\\s+" + st).test(phNorm(text)); });
    words.forEach(function (w) {
      if (pNames.some(function (s) { return phNorm(w).indexOf(s) === 0; })) { r.payP = !withP; return; }
      if (/^(заплатил|платил|оплатил)/.test(w)) return;
      if (w === "я" || w === "мы" || w === "двоих") return;
      if (/^(пополам|поровну|вдво[её]м|общ(ая|ий|ее|ую|ие))$/.test(w)) return;
      if (/^полност|^целиком|^всё$|^все$/.test(w)) { r.full = true; return; }
      if (K.CASH_WORD.test(phNorm(w))) { r.cash = true; return; }
      r.desc.push(w);
    });
    return r;
  }
  // Деление по умолчанию для категории общих: из «как делите по умолчанию»
  function defaultMode(cat, full) { var d = catSplitOf(cat); return full ? "full" : d === "theirs" ? "theirs" : d === "mine" ? "mine" : "equal"; }
  function splitOf(mode, cents, mine) { return mode === "equal" || mode === "full" ? { mode: mode, values: {} } : { mode: "exact", values: { me: mine, partner: cents - mine } }; }
  // Наличка, которую можно связать с общими: учёт начат и карман в евро (общие из «+» — в евро)
  function cashPockets() { var c = Cash.cashState(); return c.since ? c.pockets.filter(function (p) { return !p.archived && Cash.pocketCur(p.id) === "€"; }) : []; }
  // Трата наличными попадёт в карман, только если она не раньше начала учёта
  function cashCounts(date) { var c = Cash.cashState(); return !!c.since && date >= c.since; }
  // Перенести запись налички «кофе 8 пополам с Сашей» в общие: описание, категория, деление
  function sharedFromNote(note, cents) {
    var sw = sharedWords(phParse(note || "").words, note || ""), desc = sw.desc.join(" ") || "наличные";
    var cat = S.catOf({ desc: desc }, sh.learned), mode = defaultMode(cat, sw.full);
    if (mode === "full") mode = "theirs"; // платила я из своего кармана: «целиком» = всё на партнёре
    var md = { cents: cents, mode: mode, paidByMe: true }, mine = plusMine(md);
    return { desc: desc.charAt(0).toUpperCase() + desc.slice(1), cat: cat, mode: mode, mine: mine, split: splitOf(mode, cents, mine) };
  }
  // Вкладка по словам: «зарплата», «доход», «бонус» → Доход; «пополам», «вдвоём», имя партнёра → Общая
  function plusAutoTab(text) {
    var t = phNorm(text);
    if (sharedSignal(text)) return "shared";
    // «такси 12 нал» — трата наличными, если учёт налички уже начат
    // «уход 50 из конверта», «кофе 4 из кошелька» — тоже наличка: слова «кошелёк / конверт» или «из <название кармана>»
    // (только после «из»: конверт «продукты» не должен превращать любые продукты в наличку)
    var cst = Cash.cashState();
    if (cst.since && (t.split(/[\s,;.!?]+/).some(function (w) { return K.CASH_WORD.test(w) || /^(кошел[её]?[а-я]*|конверт[а-я]*)$/.test(w); }) ||
      (/(^|\s)из\s+\S/.test(t) && K.mentionedPocket(t.replace(/^.*?(^|\s)из\s+/, ""), (cst.pockets || []).filter(function (p) { return !p.archived; }))))) return "cash";
    if (/(^|\s)(доход|зарплат|зп(\s|$)|получил|пришл[оа]|бонус|преми|аванс|кешбэк|кэшбэк|гонорар|возврат налог)/.test(t)) return "income";
    var p = phParse(text);
    if (p.words.length && !phCat(p.words, false) && phCat(p.words, true)) return "income";
    return null;
  }
  // имя партнёра в фразе: «Аня», «Ани», «Anya» — первые 3 буквы в обеих раскладках
  function partnerStems() {
    var n = sh && sh.partner ? phNorm(sh.partner.name.split(" ")[0]) : ""; if (!n) return [];
    var lat = "abvgdezijklmnoprstufhc", cyr = "абвгдезийклмнопрстуфхц", tr = function (s, a, b) { return s.split("").map(function (ch) { var i = a.indexOf(ch); return i >= 0 ? b[i] : ch; }).join(""); };
    return [n.slice(0, 3), tr(n, lat, cyr).slice(0, 3), tr(n, cyr, lat).slice(0, 3)];
  }
  // доля «на мне»: пополам · всё на партнёре · всё на мне
  function plusMine(md) { var c = md.cents || 0; return md.mode === "theirs" ? 0 : md.mode === "mine" ? c : md.mode === "full" ? (md.paidByMe ? 0 : c) : Math.round(c / 2); }
  function nameDat(n) { n = String(n || ""); return /[ая]$/i.test(n) ? n.slice(0, -1) + "е" : n; }
  // ---------- панель ----------
  var plusUi = { tab: "spend", text: "", over: {} };
  // soft — вкладка по разделу (в «Мы» — «Общая»), но фраза всё ещё может её переключить
  function plusSheet(tab, soft) {
    if (RO()) { toast("Сейчас открыт чужой бюджет (" + view.name + ") — только просмотр"); return; }
    plusUi.tab = tab || "spend"; // без явной вкладки всегда начинаем с «Траты» — угаданная в прошлый раз не залипает
    plusUi.text = ""; plusUi.over = {};
    plusUi.manual = !!tab && !soft; plusUi.base = plusUi.tab; // вкладку угадываем по фразе, пока её не выбрали руками
    // «Сверка ›» — переход на другой экран, поэтому ссылкой в шапке, а не вкладкой среди типов записи (B13)
    modal(tpl("<div class='m-body plus'><div class='plus-head'><h2>Внести</h2><button type='button' class='linkish plus-rec'>Сверка ›</button></div><div class='plus-tabs' role='tablist' aria-label='Что вносишь'>{!tabs}</div><div id='plusBody'></div></div>", {
      tabs: [["spend", "Трата"], ["income", "Доход"], ["shared", "Общая"], ["cash", "Наличка"]].map(function (x) { return tpl("<button type='button' role='tab' data-pt='{0}'>{1}</button>", x); }).join("") }), function (m) {
      m.classList.add("sheet-plus");
      // на телефоне фокус — на самой шторке: иначе showModal ставит его на «Сверка ›» и она выглядит выделенной (Катя 17 окт)
      if (matchMedia("(pointer: coarse)").matches) { m.tabIndex = -1; m.focus({ preventScroll: true }); }

      m.querySelectorAll("[data-pt]").forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.pt === "shared" && !sh) { closeModal(); go("#shared"); return; }
          plusUi.tab = b.dataset.pt; plusUi.over = {}; plusUi.text = ""; plusUi.manual = true; drawPlus(m);
        };
      });
      m.querySelector(".plus-rec").onclick = function () { closeModal(); var d = defaultYearWeek(); ui.recWeek = finishedWeek() || (d ? { year: d.year, week: d.week } : null); go("#recon"); };
      drawPlus(m);
    });
  }

  function drawPlus(m) {
    m.querySelectorAll("[data-pt]").forEach(function (b) { b.classList.toggle("on", b.dataset.pt === plusUi.tab); b.setAttribute("aria-selected", b.dataset.pt === plusUi.tab ? "true" : "false"); });
    var tab = plusUi.tab, ex = { spend: "шопинг 89 вчера", income: "бонус 1200 в пятницу", shared: "ужин 60 пополам, " + (sh && sh.partner ? sh.partner.name : "Саша") + " платила", cash: "кофе 4,5 из кошелька" }[tab];
    var body = m.querySelector("#plusBody");
    body.innerHTML = tpl("<label class='plus-lbl' for='plusQ'>Опиши в свободном формате</label><input id='plusQ' class='plus-q' autocomplete='off' placeholder='например: {ex}' value='{text}'>" +
      "<div class='plus-chips' id='plusChips'></div><div id='plusWhere'></div><button type='button' class='btn primary plus-go' id='plusGo'>Записать</button>{!foot}", {
        ex: ex, text: plusUi.text,
        foot: tab === "cash" && Cash.cashState().since ? "<div class='plus-foot'><button type='button' class='linkish plus-form' id='plusForm'>Заполнить по полям</button><a class='plus-more' href='#cash'>История и карманы ›</a></div>" : tab !== "cash" ? "<div class='plus-foot'><button type='button' class='linkish plus-form' id='plusForm'>Заполнить по полям</button>" + (tab === "shared" ? "<a class='plus-more' href='#shared'>Лента общих ›</a>" : "<a class='plus-more' href='#log'>История записей ›</a>") + "</div>" : "<a class='plus-more' href='#cash'>История и карманы ›</a>" });
    var q = body.querySelector("#plusQ"), tmr = null;
    q.oninput = function () { clearTimeout(tmr); tmr = setTimeout(function () { plusUi.text = q.value; plusUi.over = {}; drawParsed(m); }, 200); };
    q.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); plusUi.text = q.value; drawParsed(m); plusSave(m); } };
    // на телефоне шторка открывается по содержимому и становится высокой, когда нажимаешь на поле или печатаешь — и остаётся
    // такой до закрытия (иначе нажатие на чип снимает фокус, шторка сжимается и всё прыгает).
    // Растёт по focus после касания, а не по pointerdown: если шторка вырастает под пальцем, поле уезжает и iOS теряет тап
    // (клавиатура не открывается, нужно нажать ещё раз — видео Кати 17 окт)
    var touched = false, tall = function () { m.classList.add("plus-typing"); };
    q.addEventListener("pointerdown", function () { touched = true; });
    q.addEventListener("focus", function () { if (touched) tall(); });
    q.addEventListener("input", tall);
    body.querySelector("#plusGo").onclick = function () { plusUi.text = q.value; drawParsed(m); plusSave(m); };
    var pm = body.querySelector(".plus-more"); if (pm) pm.onclick = closeModal;
    var pf = body.querySelector("#plusForm");
    if (pf) pf.onclick = function () {
      plusUi.text = q.value; var md = plusModel(); closeModal();
      setTimeout(function () {
        if (tab === "cash") cashFormModal(md);
        else if (tab === "shared") Us.expenseSheet(null, { desc: md.desc ? md.desc.charAt(0).toUpperCase() + md.desc.slice(1) : "", cost: md.cents || 0, cat: md.cat, date: md.date, paidByMe: md.paidByMe, mode: md.mode === "full" ? "full" : "equal", method: md.method || "card" });
        else spendModal({ income: tab === "income", envOver: !envDefaultIn(md), date: md.date, cat: md.cat, amount: md.cents ? String(md.cents / 100).replace(".", ",") : "", note: md.note || "" });
      }, 40);
    };
    drawParsed(m);
    // на телефоне без автофокуса: iOS без клавиатуры дёргает шторку вверх и обратно (видео Кати 17 окт)
    if (!matchMedia("(pointer: coarse)").matches) setTimeout(function () { q.focus(); }, 60);
  }

  // что получилось из фразы с учётом правок в чипах
  function plusModel() {
    var tab = plusUi.tab, p = phParse(plusUi.text), o = plusUi.over, md = { tab: tab, cents: o.cents !== undefined ? o.cents : p.cents, date: o.date || p.date || E.todayISO() };
    if (tab === "spend" || tab === "income") {
      var ci = tab === "income" ? phCat(p.words, true) : spendCat(p.words);
      md.cat = o.cat || (ci ? ci.id : (tab === "income" ? ((cats().find(function (c) { return c.block === "income" && !c.archived; }) || {}).id) : defaultCat()));
      md.catSure = !!(o.cat || ci); // false — категорию не узнала, подставлена последняя или «продукты»
      md.note = p.words.filter(function (w, i) { return !ci || i !== ci.used; }).join(" ");
      md.word = ci ? null : p.words[0];
    } else if (tab === "shared") {
      var sw = sharedWords(p.words, plusUi.text), cp = cashPockets(), named = K.mentionedPocket(plusUi.text, cp);
      md.paidByMe = o.paidByMe !== undefined ? o.paidByMe : !sw.payP;
      // чем платили: «нал», «наличкой» или карман во фразе — наличные; иначе карта. Чип «чем» — o.pay: "card" | "cash" | "cash:<карман>"
      var pay = o.pay || (sw.cash || named ? "cash" + (named ? ":" + named : "") : "card");
      md.method = pay === "card" ? "card" : "cash";
      md.pocket = md.method === "cash" ? (pay.split(":")[1] || (cp.some(function (x) { return x.id === Cash.cashState().defaultPocket; }) ? Cash.cashState().defaultPocket : cp[0] && cp[0].id) || null) : null;
      md.desc = K.dropPocketWords(sw.desc, named && cp.find(function (x) { return x.id === named; })).join(" ");
      md.cat = o.cat || (md.desc ? S.catOf({ desc: md.desc }, sh.learned) : "Продукты");
      md.mode = o.mode || defaultMode(md.cat, sw.full);
    } else if (tab === "cash") {
      var c = Cash.cashState(), pockets = c.pockets.filter(function (x) { return !x.archived; });
      md.cash = plusUi.text.trim() ? K.parse(plusUi.text, pockets, c.defaultPocket) : null;
      if (md.cash) {
        md.cents = o.cents !== undefined ? o.cents : md.cash.cents; md.cash.date = md.date;
        // карман выбран руками в чипе «из / в» — сильнее разбора фразы
        if (o.from && (md.cash.kind === "spend" || md.cash.kind === "move" || md.cash.kind === "out")) md.cash.from = o.from;
        if (o.to && (md.cash.kind === "move" || md.cash.kind === "in" || md.cash.kind === "ext")) md.cash.to = o.to;
      }
      // общая трата наличными: из своего евро-кармана, платила я. o.share: "no" | "equal" | "theirs" | "mine"
      md.canShare = !!(sh && md.cash && md.cash.kind === "spend" && md.cash.from && Cash.pocketCur(md.cash.from) === "€");
      if (md.canShare) {
        var cw = sharedWords(phParse(md.cash.note || "").words, md.cash.note || "");
        md.desc = cw.desc.join(" ");
        md.cat = o.cat || (md.desc ? S.catOf({ desc: md.desc }, sh.learned) : "Продукты");
        var dm = defaultMode(md.cat, cw.full); if (dm === "full") dm = "theirs";
        md.share = o.share || (sharedSignal(md.cash.note || "") || sharedSignal(plusUi.text) ? dm : "no");
        md.paidByMe = true; md.mode = md.share;
      } else md.share = "no";
    }
    return md;
  }
  // «Мы» в превью: сколько должна партнёр после этой траты
  function sharedWhereHtml(md) {
    var pName = sh.partner ? sh.partner.name : "партнёр", mine = plusMine(md), net = md.paidByMe ? md.cents - mine : -mine;
    var bal = (S.balance(sh.expenses).EUR || 0), after = bal + net;
    var bt = function (b) { return Math.abs(b) < 1 ? "вы в расчёте" : b > 0 ? pName + " должна тебе " + E.fmt(b, { cur: "€", dec: 2 }) : "ты должна " + E.fmt(-b, { cur: "€", dec: 2 }); };
    return tpl("<div class='pw-row'><span>Мы · «{d}»</span><b class='{c}'>{who}</b></div><div class='pw-sub'>Баланс: {b1} → {b2}</div>", {
      d: md.desc || "без описания", c: net >= 0 ? "pos" : "warn", who: Math.abs(net) < 1 ? "без долга" : net > 0 ? pName + " должна " + E.fmt(net, { cur: "€", dec: 2 }) : "ты должна " + E.fmt(-net, { cur: "€", dec: 2 }),
      b1: bt(bal), b2: bt(after).replace(/^.+ должна (тебе )?/, "") }) + sharedPlanLine(md, mine);
  }
  // Где в личном плане учтётся твоя часть: еда и развлечения — строки из «Общие траты и твой план», остальное — по категории.
  // В «+» план не меняется: за месяц доля сравнивается с планом, и если выйдет больше — там предложат довписать
  function sharedPlanLine(md, mine) {
    if (mine < 100) return "";
    var kind = S.FOOD.indexOf(md.cat) >= 0 ? "food" : S.FUN.indexOf(md.cat) >= 0 ? "fun" : null;
    var pids = kind ? ((state.settings.coverage || {})[kind] || []) : S.planCatsFor(state, md.cat);
    var names = pids.map(catName).filter(Boolean);
    // одной строкой, как «План · неделя · строка» на «Трате»; длинное название строки обрезается многоточием
    return tpl("<div class='pw-row'><span>План · {m} · {r}</span><b>твоя часть {v}</b></div>", { v: E.fmt(mine, { cur: "€", dec: mine % 100 ? 2 : 0 }), m: E.MONTHS_SHORT[Number(md.date.slice(5, 7)) - 1], r: names.length ? names.join(", ") : "строка не выбрана" });
  }
  // Карман в превью: «кошелёк 100 → 92 €» (или почему не меняется)
  function pocketWhereHtml(pid, cents, date) {
    var cs = Cash.cashState(); if (!pid || !cs.since) return "";
    var now = K.balances(cs, Cash.cashLines())[pid] || 0;
    if (!cashCounts(date)) return tpl("<div class='pw-sub'>Наличными, но до начала учёта налички ({d}) — карман не изменится.</div>", { d: dayGen(cs.since) });
    return tpl("<div class='pw-row'><span>Наличка · {n}</span><b class='{c}'>{a} → {b}</b></div>", { n: Cash.pocketName(pid), c: now >= 0 && now - cents < 0 ? "neg" : "", a: E.fmt(now, { dec: now % 100 ? 2 : 0 }), b: E.fmt(now - cents, { cur: "€", dec: (now - cents) % 100 ? 2 : 0 }) }) + pocketWarn(pid, now, cents, "pay");
  }
  // Трата уводит карман в минус (а до неё он был не в минусе): одна строка и, если в другом кармане хватает, — «Взять из …».
  // Записать всё равно можно — вдруг просто не внесено пополнение. key — какой чип меняет кнопка: "from" (Наличка) или "pay" (Общая)
  function pocketWarn(pid, now, cents, key) {
    if (!pid || !cents || now < 0 || now - cents >= 0) return "";
    var cs = Cash.cashState(), bal = K.balances(cs, Cash.cashLines()), cur = Cash.pocketCur(pid);
    var alt = cs.pockets.filter(function (p) { return !p.archived && p.id !== pid && Cash.pocketCur(p.id) === cur && (bal[p.id] || 0) >= cents; }).sort(function (a, b) { return a.sort - b.sort; })[0];
    return tpl("<div class='pw-warn'>В «{n}» не хватит {v}. Проверь сумму или карман.{!alt}</div>", { n: Cash.pocketName(pid), v: E.fmt(cents - now, { cur: cur, dec: (cents - now) % 100 ? 2 : 0 }),
      alt: alt ? tpl(" <button type='button' class='linkish' data-swk='{k}' data-swv='{v}'>Взять из «{n}» ({b})</button>", { k: key, v: key === "pay" ? "cash:" + alt.id : alt.id, n: alt.name, b: E.fmt(bal[alt.id] || 0, { cur: cur, dec: 0 }) }) : "" });
  }

  // label — обычный текст (экранируется здесь), inner — HTML поля выбора
  function plusChip(label, cls, inner) { return tpl("<label class='pchip {c}'>{l}{!in}</label>", { c: cls || "", l: label, in: inner || "" }); }
  function opt(v, label, sel) { return tpl("<option value='{v}'{!s}>{l}</option>", { v: v, l: label, s: sel ? " selected" : "" }); }
  function drawParsed(m) {
    // разбор фразы отложен на 200 мс: если за это время окно «+» закрыли или сменили («Заполнить по полям») — рисовать некуда
    if (!m.querySelector("#plusChips")) return;
    if (!plusUi.manual && plusUi.base === "spend") {
      var want = plusAutoTab(plusUi.text) || "spend";
      if (want !== plusUi.tab) {
        plusUi.tab = want; plusUi.over = {};
        m.querySelectorAll("[data-pt]").forEach(function (b) { b.classList.toggle("on", b.dataset.pt === want); b.setAttribute("aria-selected", b.dataset.pt === want ? "true" : "false"); });
      }
    }
    var md = plusModel(), chips = m.querySelector("#plusChips"), where = m.querySelector("#plusWhere"), html = "", wh = "";
    var dateLbl = md.date === E.todayISO() ? "сегодня" : md.date === E.addDays(E.todayISO(), -1) ? "вчера" : new Date(md.date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    var dateChip = plusChip(dateLbl + " ▾", md.date === E.todayISO() ? "soft" : "", tpl("<input type='date' data-o='date' value='{d}'>", { d: md.date }));
    if (!plusUi.text.trim()) { chips.innerHTML = ""; where.innerHTML = ""; return; }
    if (md.tab === "spend" || md.tab === "income") {
      html += plusChip(md.cents ? (md.tab === "income" ? "+" : "−") + E.fmt(md.cents, { cur: "€" }) : "сумма?", "strong" + (md.cents ? "" : " miss"));
      html += plusChip(catName(md.cat) + " ▾", md.catSure ? "" : "ask", tpl("<select data-o='cat' aria-label='{a}'>{!o}</select>", { a: md.catSure ? "Категория" : "Категорию не узнала — выбери", o: catOptions(md.cat, md.tab === "income" ? function (c) { return c.block === "income"; } : function (c) { return c.block !== "income" && c.block !== "savings"; }) }));
      html += dateChip;
      var rep = plusUi.over.rep || "no";
      html += plusChip({ no: "не повторять", month: "каждый месяц", week: "каждую неделю" }[rep] + " ▾", rep === "no" ? "soft" : "", "<select data-o='rep'>" +
        opt("no", "не повторять", rep === "no") + opt("month", "каждый месяц — станет регулярной", rep === "month") + opt("week", "каждую неделю — станет регулярной", rep === "week") + "</select>");
      var wk = E.weekOfDate(md.date), ys = wk && String(wk.year);
      // у категории в эту неделю уже есть сумма в плане — трата уже в ней или сверх
      var env = md.tab === "spend" && rep === "no" && wk && state.years[ys] && !state.years[ys].archived ? weekEnv(ys, md.cat, wk.idx) : null, envIn = env && envDefaultIn(md);
      if (env) html += plusChip(envIn ? "уже в плане недели ▾" : "сверх плана ▾", envIn ? "soft" : "", "<select data-o='env' aria-label='Трата уже в плане недели или сверх'>" +
        opt("in", "уже в плане недели — план не меняется", envIn) + opt("over", "сверх плана — прибавится к неделе", !envIn) + "</select>");
      if (!wk || !state.years[ys] || state.years[ys].archived) wh = tpl("<div class='pw-err'>Плана на {y} нет — создай его в «Плане».</div>", { y: ys || "эту дату" });
      else if (md.cents && envIn) {
        // коротко: сколько останется в плане недели и, если не хватило, сколько допишется сверх
        wh = envRows(env, md.cents);
      }
      else if (md.cents) {
        var r = E.compute(state, ys), cell = r.cells[md.cat][wk.idx], before = cell ? cell.cents : 0, v = md.tab === "income" ? md.cents : -md.cents;
        wh = tpl("<div class='pw-row'><span>План · {wk} · {cat}</span><b>{a} → {b}</b></div>{!ask}", {
          ask: md.catSure || md.tab === "income" ? "" : tpl("<div class='pw-sub pw-ask'>Категорию не узнала — поставила «{c}». Можно выбрать другую.</div>", { c: catName(md.cat) }),
          wk: shortWeek(ys, wk.idx).replace(/([а-я]{3})[а-я]+$/, "$1"), cat: catName(md.cat), a: E.fmt(before, { cur: "€", dec: 0 }), b: E.fmt(before + v, { cur: "€", dec: 0 }) });
      }
      // «В обращении» не показываем — разница всегда равна сумме. Предупреждаем, только если трата уводит самый низкий остаток в минус
      if (md.cents && md.tab === "spend" && rep === "no" && wh && wk && state.years[ys] && !state.years[ys].archived) {
        var neg = lowGoesNeg(ys, wk.idx, envIn ? splitEnv(env, md.cents).over : md.cents);
        if (neg) wh += tpl("<div class='pw-err'>Самый низкий остаток уйдёт в минус: {v}, {wk}.</div>", { v: E.fmt(rnd(neg.v), { cur: "€", dec: 0 }), wk: shortWeek(ys, neg.week) });
      }
    } else if (md.tab === "shared") {
      var pName = sh.partner ? sh.partner.name : "партнёр";
      html += plusChip(md.cents ? "−" + E.fmt(md.cents, { cur: "€" }) : "сумма?", "strong" + (md.cents ? "" : " miss"));
      html += plusChip(Us.catLabel(md.cat) + " ▾", "", "<select data-o='cat'>" + Us.sharedCats().map(function (c) { return opt(c, Us.catLabel(c), c === md.cat); }).join("") + "</select>");
      html += plusChip("платила " + (md.paidByMe ? "ты" : pName) + " ▾", "", "<select data-o='paidByMe'>" + opt("1", "платила ты", md.paidByMe) + opt("0", "платила " + pName, !md.paidByMe) + "</select>");
      var modeLbl = { equal: "пополам", full: "всё на " + (md.paidByMe ? nameDat(pName) : "тебе"), theirs: "всё на " + nameDat(pName), mine: "всё на тебе" }[md.mode] || "пополам";
      html += plusChip(modeLbl + " ▾", "", "<select data-o='mode'>" + opt("equal", "пополам", md.mode === "equal") + opt("theirs", "всё на " + nameDat(pName), md.mode === "theirs") + opt("mine", "всё на тебе", md.mode === "mine") + "</select>");
      // чем платили: карта или наличные (из какого кармана — если учёт налички начат)
      var cp = cashPockets(), payV = md.method === "cash" ? "cash" + (md.pocket ? ":" + md.pocket : "") : "card";
      var payLbl = md.method === "cash" ? "наличными" + (md.pocket && md.paidByMe ? " · " + Cash.pocketName(md.pocket) : "") : "картой";
      html += plusChip(payLbl + " ▾", md.method === "cash" ? "" : "soft", "<select data-o='pay' aria-label='Чем платили'>" + opt("card", "картой", md.method !== "cash") +
        (cp.length ? cp.map(function (x) { return opt("cash:" + x.id, "наличными · " + x.name, payV === "cash:" + x.id); }).join("") : opt("cash", "наличными", md.method === "cash")) + "</select>");
      html += dateChip;
      if (md.cents) {
        wh = sharedWhereHtml(md);
        if (md.method === "cash") wh += md.paidByMe ? pocketWhereHtml(md.pocket, md.cents, md.date) : tpl("<div class='pw-sub'>Наличными платила {p} — твои карманы не меняются.</div>", { p: pName });
      }
    } else if (md.tab === "cash") {
      var cs = Cash.cashState();
      if (!cs.pockets.length) { chips.innerHTML = ""; where.innerHTML = "<div class='pw-err'>Сначала заведи кошелёк и конверты — <a href='#cash'>это минута</a>.</div>"; return; }
      var cc = md.cash, kinds = { spend: "трата", move: "переложила", "in": "сняла с карты", out: "на карту", ext: "получила" };
      html += plusChip(kinds[cc.kind] || "трата", "");
      html += plusChip(md.cents ? (cc.kind === "spend" || cc.kind === "out" ? "−" : "") + E.fmt(md.cents, { cur: Cash.pocketCur(cc.from || cc.to) }) : "сумма?", "strong" + (md.cents ? "" : " miss"));
      // карман можно поменять руками: «из: кошелёк ▾» → конверт
      var live = cs.pockets.filter(function (p) { return !p.archived; }).sort(function (a, b) { return a.sort - b.sort; });
      var pocketSel = function (k, sel, lbl) { return plusChip(lbl + ": " + (sel ? Cash.pocketName(sel) : "?") + " ▾", sel ? "" : "ask", tpl("<select data-o='{k}' aria-label='{a}'>{!o}</select>", { k: k, a: k === "from" ? "Из какого кармана" : "В какой карман",
        o: (sel ? "" : opt("", "выбери", true)) + live.map(function (p) { return opt(p.id, p.name, p.id === sel); }).join("") })); };
      if (cc.kind === "spend" || cc.kind === "move" || cc.kind === "out") html += pocketSel("from", cc.from, "из");
      if (cc.kind === "move" || cc.kind === "in" || cc.kind === "ext") html += pocketSel("to", cc.to, "в");
      var shOn = md.share !== "no";
      if (shOn) html += plusChip("«" + (md.desc || "без описания") + "»", "");
      else if (cc.note) html += plusChip("«" + cc.note + "»", "");
      // общая или нет — тот же чип и для «кофе 8», и для «кофе 8 пополам с Сашей»
      if (md.canShare) {
        var pN = sh.partner ? sh.partner.name : "партнёр";
        var shLbl = { no: "не общая", equal: "общая · пополам", theirs: "общая · всё на " + nameDat(pN), mine: "общая · всё на тебе" }[md.share];
        html += plusChip(shLbl + " ▾", shOn ? "" : "soft", "<select data-o='share' aria-label='Общая трата?'>" + opt("no", "не общая", !shOn) + opt("equal", "общая · пополам", md.share === "equal") +
          opt("theirs", "общая · всё на " + nameDat(pN), md.share === "theirs") + opt("mine", "общая · всё на тебе", md.share === "mine") + "</select>");
        if (shOn) html += plusChip(Us.catLabel(md.cat) + " ▾", "", "<select data-o='cat'>" + Us.sharedCats().map(function (c) { return opt(c, Us.catLabel(c), c === md.cat); }).join("") + "</select>");
      }
      var pc = shOn ? null : cashPlanCat(md), pg = shOn ? null : cashPlanGuess(md);
      // в личный план — те же чипы, что на «Трате»: строка плана и «уже в плане недели / сверх плана / не в план»
      var pw2 = pg && E.weekOfDate(md.date), pys2 = pw2 && String(pw2.year), pyOk = pw2 && state.years[pys2] && !state.years[pys2].archived;
      var penv = pc && pyOk ? weekEnv(pys2, pc, pw2.idx) : null, pmode = !pc ? "no" : penv ? (plusUi.over.cashEnv === "over" ? "over" : "in") : "over";
      if (pg && pyOk) {
        html += plusChip(catName(pc || pg.cat) + " ▾", pg.unknown && !pc ? "ask" : "", tpl("<select data-o='cashPlanCat' aria-label='Строка плана'>{!o}</select>", { o: catOptions(pc || pg.cat, function (c) { return c.block !== "income" && c.block !== "savings"; }) }));
        html += plusChip({ "in": "уже в плане недели", over: penv ? "сверх плана" : "в план", no: "не в план" }[pmode] + " ▾", pmode === "over" ? "" : "soft", "<select data-o='cashEnv' aria-label='Трата уже в плане недели, сверх или не в план'>" +
          (penv ? opt("in", "уже в плане недели — план не меняется", pmode === "in") + opt("over", "сверх плана — прибавится к неделе", pmode === "over") : opt("over", "в план — прибавится к неделе", pmode === "over")) + opt("no", "не в план", pmode === "no") + "</select>");
      }
      html += dateChip;
      // общая трата спишется из кармана, только если она не раньше начала учёта налички
      var moves = !shOn || cashCounts(md.date);
      var bal2 = K.balances(cs, Cash.cashLines());
      // карманы — такими же строками, как остальное превью: «Наличка · кошелёк   500 → 300 €», только те, что меняются
      wh = cs.pockets.filter(function (p) { return !p.archived && moves && md.cents && (cc.from === p.id || cc.to === p.id); }).sort(function (a, b) { return a.sort - b.sort; }).map(function (p) {
        var now = bal2[p.id] || 0, nxt = now - (cc.from === p.id ? md.cents : 0) + (cc.to === p.id ? md.cents : 0);
        return tpl("<div class='pw-row'><span>Наличка · {n}</span><b class='{c}'>{was}{v}</b></div>", { n: p.name, c: now >= 0 && nxt < 0 ? "neg" : "", was: E.fmt(now, { dec: now % 100 ? 2 : 0 }) + "\u00A0→\u00A0", v: E.fmt(nxt, { cur: Cash.pocketCur(p.id), dec: nxt % 100 ? 2 : 0 }) }) +
          (cc.from === p.id ? pocketWarn(p.id, now, md.cents, "from") : "");
      }).join("");
      if (shOn && md.cents) {
        wh += sharedWhereHtml(md);
        wh += moves ? "<div class='pw-sub'>Запишу в «Мы» как общую трату наличными.</div>"
          : tpl("<div class='pw-sub'>Это до начала учёта налички ({d}) — карман не изменится, трата будет только в «Мы».</div>", { d: dayGen(cs.since) });
      }
      // «И в личный план» — заметный переключатель; если на неделю в плане уже есть сумма, по умолчанию выключен
      if (pg && pyOk && md.cents) {
        if (pmode === "in") wh += envRows(penv, md.cents);
        else if (pmode === "over") {
          var pcell = E.compute(state, pys2).cells[pc][pw2.idx], pb = pcell ? pcell.cents : 0;
          wh += tpl("<div class='pw-row'><span>План · {wk} · {cat}</span><b>{a} → {b}</b></div>", { wk: shortWeek(pys2, pw2.idx).replace(/([а-я]{3})[а-я]+$/, "$1"), cat: catName(pc), a: E.fmt(pb, { cur: "€", dec: 0 }), b: E.fmt(pb - md.cents, { cur: "€", dec: 0 }) });
        } else if (pg.unknown) wh += "<div class='pw-sub'>Категорию не узнала — выбери строку, если хочешь внести в план.</div>";
      }
    }
    chips.innerHTML = html;
    where.innerHTML = wh ? tpl("<div class='plus-where'><div class='pw-h'>Куда запишется</div>{!wh}</div>", { wh: wh }) : "";
    where.querySelectorAll("[data-swk]").forEach(function (b) { b.onclick = function () { plusUi.over[b.dataset.swk] = b.dataset.swv; drawParsed(m); }; });
    chips.querySelectorAll("[data-o]").forEach(function (el) {
      el.onchange = function () {
        var k = el.dataset.o, v = el.value;
        plusUi.over[k] = k === "paidByMe" ? v === "1" : v;
        // наличка: выбрала строку плана — значит, в план (если не «не в план»); «не в план» и обратно
        if (k === "cashPlanCat") plusUi.over.cashPlan = plusUi.over.cashEnv === "no" ? "" : v;
        if (k === "cashEnv") plusUi.over.cashPlan = v === "no" ? "" : plusUi.over.cashPlanCat || (cashPlanGuess(plusModel()) || {}).cat || "";
        drawParsed(m);
      };
    });
  }

  // «уже в плане» — по умолчанию, но только если категорию узнала: при подставленной наугад трата не должна молча уйти в чужой план
  function envDefaultIn(md) { return plusUi.over.env ? plusUi.over.env === "in" : (md.catSure || !!plusUi.over.cat); }
  function plusSave(m) {
    var md = plusModel();
    if (!plusUi.text.trim()) { m.querySelector("#plusQ").focus(); return; }
    if (!md.cents) { toast("Не вижу сумму — допиши число"); return; }
    if (md.tab === "spend" || md.tab === "income") {
      var wk = E.weekOfDate(md.date), ys = wk && String(wk.year);
      if (!wk || !state.years[ys] || state.years[ys].archived) { toast("Плана на эту дату нет"); return; }
      var rep = plusUi.over.rep || "no", envSaved = false;
      if (rep !== "no") {
        var yr = state.years[ys], v = md.tab === "income" ? md.cents : -md.cents;
        yr.recurring = yr.recurring || [];
        var rid = E.uid("r");
        yr.recurring.push({ id: rid, catId: md.cat, expr: String(v / 100), cents: v, weeks: rep === "week" ? "все" : String(wk.wim), from: md.date, to: null });
        yr.log = yr.log || []; yr.log.push({ id: E.uid("l"), ts: Date.now(), date: md.date, w: wk.idx, cat: md.cat, cents: v, rule: rid, rep: rep, note: md.note || "", src: "plus" });
      } else if ((envSaved = md.tab === "spend" && envDefaultIn(md) && !!weekEnv(ys, md.cat, wk.idx))) logSpend(ys, md.cat, wk.idx, md.cents, md.note, { src: "plus", date: md.date });
      else addToCell(ys, md.cat, wk.idx, String(md.cents / 100), md.note, { src: "plus", date: md.date });
      state.settings.lastCat = md.cat;
      state.settings.recentCats = [md.cat].concat((state.settings.recentCats || []).filter(function (x) { return x !== md.cat; })).slice(0, 6);
      if (md.word && plusUi.over.cat) { state.settings.phraseCats = state.settings.phraseCats || {}; state.settings.phraseCats[phStem(md.word)] = md.cat; }
      closeModal(); toast((md.tab === "income" ? "Доход " : "") + E.fmt(md.cents, { cur: "€" }) + " → «" + catName(md.cat) + "», " + (rep === "month" ? "каждый месяц с " + shortWeek(ys, wk.idx) : rep === "week" ? "каждую неделю с " + shortWeek(ys, wk.idx) : shortWeek(ys, wk.idx) + (envSaved ? " · уже в плане" : ""))); changed();
    } else if (md.tab === "shared") {
      saveShared(m, md, md.method, md.method === "cash" && md.paidByMe ? md.pocket : null);
    } else if (md.tab === "cash" && md.share !== "no") {
      // общая трата наличными — одна запись в «Мы»; из кармана её списывает сама наличка (sharedLines), отдельной записи налички нет
      saveShared(m, md, "cash", md.cash.from);
    } else if (md.tab === "cash") {
      var c = Cash.cashState(), cur = md.cash, k = cur.kind;
      if ((k === "spend" || k === "move" || k === "out") && !cur.from) { toast("Из какого кармана?"); return; }
      if ((k === "move" || k === "in" || k === "ext") && !cur.to) { toast("В какой карман?"); return; }
      var ntx = { id: E.uid("t"), ts: Date.now(), date: md.date, kind: k, cents: md.cents, from: k === "in" || k === "ext" ? null : cur.from, to: k === "spend" || k === "out" ? null : cur.to, note: cur.note };
      var pcat = cashPlanCat(md), pw = E.weekOfDate(md.date), pys = pw && String(pw.year), inPlan = "";
      if (pcat && pw && state.years[pys] && !state.years[pys].archived) {
        ntx.plan = cashToPlan(pys, pcat, pw.idx, md.cents, (cur.note || "") + " (нал)", plusUi.over.cashEnv || "in"); inPlan = cashPlanToast(ntx);
      }
      c.tx.push(ntx);
      closeModal(); toast("Записано: " + (cur.note || "наличка") + " " + E.fmt(md.cents, { cur: "€" }) + inPlan); changed();
    }
  }

  // хвост подтверждения: куда в плане попала трата налички
  function cashPlanToast(t) {
    var p = t.plan; if (!p) return "";
    if (p.inside === undefined) return " и в план «" + catName(p.cat) + "»";
    return " · уже в плане «" + catName(p.cat) + "»" + (p.term ? ", сверх " + E.fmt(t.cents - p.inside, { cur: "€" }) : "");
  }
  // «Наличка» → «Заполнить по полям»: трата наличными из кармана; «И в план» — как при вводе фразой
  // (общую трату наличными удобнее вносить на вкладке «Общая»: там есть «наличными · карман»)
  function cashFormModal(md) {
    var c = Cash.cashState(), pockets = c.pockets.filter(function (p) { return !p.archived; });
    var from = (md && md.cash && md.cash.from) || c.defaultPocket || (pockets[0] && pockets[0].id), g = (md && md.cents ? cashPlanGuess(md) : null) || {};
    var planOn = !!(md && md.cents && cashPlanCat(md)), pcat = g.cat || defaultCat();
    modal(tpl("<form class='m-body' id='cfForm'><h2>Трата наличными</h2><div class='form-grid cf-grid'>" +
      "<label class='f'>Сумма<input type='text' name='v' inputmode='decimal' placeholder='12' value='{amount}' required autofocus></label>" +
      "<label class='f'>Дата<input type='date' name='d' value='{date}' required></label>" +
      "<label class='f'>Из кармана<select name='from'>{!pk}</select></label>" +
      "<label class='f'>Что это<input type='text' name='note' value='{note}' placeholder='например, такси'></label>" +
      "<label class='f f-wide cf-plan'><span><input type='checkbox' name='plan'{!on}> И в план</span><select name='cat' aria-label='Строка плана'>{!opts}</select></label>" +
      "<label class='f f-wide'>План недели<select name='env'><option value='in' selected>уже в плане недели</option><option value='over'>сверх плана</option></select></label>" +
      "</div><p class='small muted cf-hint'>«Уже в плане» — сначала из того, что на эту неделю запланировано; в План допишется только то, что сверх.</p><button type='submit' hidden></button></form>" +
      "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Записать</button></div>", {
        amount: md && md.cents ? String(md.cents / 100).replace(".", ",") : "", date: (md && md.date) || E.todayISO(), note: (md && md.cash && md.cash.note) || "", on: planOn ? " checked" : "",
        pk: pockets.map(function (p) { return tpl("<option value='{id}'{!s}>{n} · {b}</option>", { id: p.id, s: p.id === from ? " selected" : "", n: p.name, b: Cash.pocketCur(p.id) }); }).join(""),
        opts: catOptions(pcat, function (x) { return x.block !== "income" && x.block !== "savings"; }) }), function (m) {
      var f = m.querySelector("#cfForm");
      f.cat.onchange = function () { f.plan.checked = true; };
      function ok() {
        var v; try { v = E.exprCents(f.v.value || ""); } catch (e) { v = null; }
        if (!v) { toast("Впиши сумму"); f.v.focus(); return; }
        v = Math.abs(v);
        var note = f.note.value.trim(), date = f.d.value || E.todayISO();
        var ntx = { id: E.uid("t"), ts: Date.now(), date: date, kind: "spend", cents: v, from: f.from.value, to: null, note: note }, inPlan = "";
        if (f.plan.checked) {
          var pw = E.weekOfDate(date), pys = pw && String(pw.year);
          if (!pw || !state.years[pys] || state.years[pys].archived) toast("Плана на эту дату нет — в план не вношу");
          else { ntx.plan = cashToPlan(pys, f.cat.value, pw.idx, v, (note || "") + " (нал)", f.env.value); inPlan = cashPlanToast(ntx); }
        }
        c.tx.push(ntx); closeModal(); toast("Записано: " + (note || "наличка") + " " + E.fmt(v, { cur: Cash.pocketCur(ntx.from) }) + inPlan); changed();
      }
      f.onsubmit = function (e) { e.preventDefault(); ok(); };
      m.querySelector("[data-act=ok]").onclick = ok;
      m.querySelector("[data-act=cancel]").onclick = closeModal;
    });
  }
  // Общая трата из «+». pocket — карман, если платила я наличными: запоминаем его для этой траты (cash.sharedMap)
  function saveShared(m, md, method, pocket) {
    var mine = plusMine(md);
    var ex = S.makeExpense({ date: md.date, desc: md.desc ? md.desc.charAt(0).toUpperCase() + md.desc.slice(1) : "", cost: md.cents, currency: "EUR", paidByMe: md.paidByMe, myShare: mine, cat: md.cat, method: method, note: "", kind: "expense", split: splitOf(md.mode, md.cents, mine) });
    if (md.cat && ex.desc) learn(ex.desc, md.cat); // одно число без описания — можно, категория из чипа
    var btn = m.querySelector("#plusGo"); btn.disabled = true;
    var row = SU.toRow(ex, sh.meId, sh.partnerId, sh.space.id), pName = sh.partner ? sh.partner.name : "партнёр", net = md.paidByMe ? md.cents - mine : -mine;
    Store.insertShared([row]).then(function () { closeModal(); return loadShared(); })
      .then(function () {
        // id строки ставит хранилище при вставке
        if (pocket && row.id) { var c = Cash.cashState(); c.sharedMap = c.sharedMap || {}; c.sharedMap[row.id] = pocket; changed(); } else render();
        var who = Math.abs(net) < 1 ? "" : net > 0 ? ", " + pName + " должна " + E.fmt(net, { cur: "€" }) : ", ты должна " + E.fmt(-net, { cur: "€" });
        toast(method === "cash" ? "Записано в «Мы»" + (pocket && cashCounts(md.date) ? ": −" + E.fmt(md.cents, { cur: "€" }) + " из «" + Cash.pocketName(pocket) + "»" : "") + who : "Общая трата добавлена" + who);
      })
      .catch(function (err) { btn.disabled = false; toast("Не сохранилось: " + err.message); });
  }

  // для других экранов — только это; остальное внутри модуля
  window.Plus = { phParse: phParse, phCat: phCat, plusSheet: plusSheet, sharedSignal: sharedSignal, sharedFromNote: sharedFromNote };
})();
