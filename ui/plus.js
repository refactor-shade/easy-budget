/* Easy Budget — «+»: внести одной фразой. Вкладки: трата · доход · общая · наличка · сверка. */
(function () {
  "use strict";

  // ---------- разбор фразы ----------
  var PH_STOP = ["евро", "eur", "€", "руб", "р", "в", "на", "за", "из", "и", "с", "со", "по", "это", "было", "доход", "получила", "пришло", "пришла"];
  var PH_WD = { "понедельник": 1, "пн": 1, "вторник": 2, "вт": 2, "среда": 3, "среду": 3, "ср": 3, "четверг": 4, "чт": 4, "пятница": 5, "пятницу": 5, "пт": 5, "суббота": 6, "субботу": 6, "сб": 6, "воскресенье": 0, "вс": 0 };
  function phNorm(s) { return String(s || "").toLowerCase().replace(/ё/g, "е"); }
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
    for (var i = 0; i < words.length; i++) { var id = learned[phStem(words[i])], c = state.categories.find(function (x) { return x.id === id; }); if (ok(c)) return { id: c.id, used: i }; }
    var list = cats().filter(ok);
    for (i = 0; i < words.length; i++) {
      var st = phStem(words[i]); if (st.length < 3) continue;
      var hit = list.find(function (c) { return phNorm(c.name).split(/[^a-zа-я0-9]+/).some(function (n) { return n && (n.indexOf(st) === 0 || st.indexOf(phStem(n)) === 0); }); });
      if (hit) return { id: hit.id, used: i };
    }
    return null;
  }

  // Наличка от порога (по умолчанию 20 €) — предложить внести в план. null — не спрашиваем, "" — не вносить, иначе id категории.
  function cashPlanCat(md) {
    var g = cashPlanGuess(md);
    if (!g) return null;
    if (plusUi.over.cashPlan !== undefined) return plusUi.over.cashPlan;
    return g.planned || g.unknown ? "" : g.cat;
  }
  // подпись под «И в план»: зависит от того, включён ли флажок (не обещаем «внесу», если выключено)
  function planHint(pg, on) {
    if (on) return pg.planned ? "На эту неделю в плане уже " + E.fmt(pg.planned, { cur: "€", dec: 0 }) + " — внесу сверху, если это отдельная трата." : "Такого в плане на эту неделю нет — внесу, чтобы сверка сошлась.";
    if (pg.unknown) return "Не узнала категорию — выбери строку, если хочешь внести в план.";
    if (pg.planned) return "На эту неделю в плане уже " + E.fmt(pg.planned, { cur: "€", dec: 0 }) + " — трата из них, отдельно не вношу.";
    return "В план не вношу.";
  }
  // категория и есть ли на эту неделю уже сумма в плане (тогда по умолчанию не вносим: еда, развлечения — недельный бюджет, иначе двойной счёт)
  function cashPlanGuess(md) {
    var cc = md.cash, min = state.settings.cashPlanMin !== undefined ? state.settings.cashPlanMin : 2000;
    if (!cc || cc.kind !== "spend" || !md.cents || md.cents < min || Cash.pocketCur(cc.from) !== "€") return null;
    var ci = phCat(phParse(cc.note || "").words, false), cat = plusUi.over.cashPlanCat || (ci ? ci.id : defaultCat());
    var wk = E.weekOfDate(md.date), ys = wk && String(wk.year), planned = 0;
    if (wk && state.years[ys]) { var cell = (E.compute(state, ys).cells[cat] || [])[wk.idx]; if (cell && cell.cents < 0) planned = -cell.cents; }
    return { cat: cat, planned: planned, unknown: !ci && !plusUi.over.cashPlanCat };
  }
  // Вкладка по словам: «зарплата», «доход», «бонус» → Доход; «пополам», «вдвоём», имя партнёра → Общая
  function plusAutoTab(text) {
    var t = phNorm(text), words = t.split(/[\s,;.!?]+/).filter(Boolean);
    if (sh && (/(^|\s)(пополам|поровну|вдво[её]м|на двоих|общ(ая|ий|ее|ую|ие))(\s|$)/.test(t) || words.some(function (w) { return partnerStems().some(function (st) { return st && w.indexOf(st) === 0; }); }))) return "shared";
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
    modal(tpl("<div class='m-body plus'><div class='plus-head'><h2>Внести</h2></div><div class='plus-tabs' role='tablist'>{!tabs}</div><div id='plusBody'></div></div>", {
      tabs: [["spend", "Трата"], ["income", "Доход"], ["shared", "Общая"], ["cash", "Наличка"], ["recon", "Сверка ›"]].map(function (x) { return tpl("<button type='button' role='tab' data-pt='{0}'>{1}</button>", x); }).join("") }), function (m) {
      m.classList.add("sheet-plus");

      m.querySelectorAll("[data-pt]").forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.pt === "recon") { closeModal(); var d = defaultYearWeek(); ui.recWeek = finishedWeek() || (d ? { year: d.year, week: d.week } : null); go("#recon"); return; }
          if (b.dataset.pt === "shared" && !sh) { closeModal(); go("#shared"); return; }
          plusUi.tab = b.dataset.pt; plusUi.over = {}; plusUi.text = ""; plusUi.manual = true; drawPlus(m);
        };
      });
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
        foot: tab !== "cash" ? "<button type='button' class='linkish plus-form' id='plusForm'>Заполнить по полям</button>" : "<a class='plus-more' href='#cash'>История и карманы ›</a>" });
    var q = body.querySelector("#plusQ"), tmr = null;
    q.oninput = function () { clearTimeout(tmr); tmr = setTimeout(function () { plusUi.text = q.value; plusUi.over = {}; drawParsed(m); }, 200); };
    q.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); plusUi.text = q.value; drawParsed(m); plusSave(m); } };
    body.querySelector("#plusGo").onclick = function () { plusUi.text = q.value; drawParsed(m); plusSave(m); };
    var pm = body.querySelector(".plus-more"); if (pm) pm.onclick = closeModal;
    var pf = body.querySelector("#plusForm");
    if (pf) pf.onclick = function () {
      plusUi.text = q.value; var md = plusModel(); closeModal();
      setTimeout(function () {
        if (tab === "shared") Us.expenseSheet(null, { desc: md.desc ? md.desc.charAt(0).toUpperCase() + md.desc.slice(1) : "", cost: md.cents || 0, cat: md.cat, date: md.date, paidByMe: md.paidByMe, mode: md.mode === "full" ? "full" : "equal" });
        else spendModal({ income: tab === "income", date: md.date, cat: md.cat, amount: md.cents ? String(md.cents / 100).replace(".", ",") : "", note: md.note || "" });
      }, 40);
    };
    drawParsed(m);
    setTimeout(function () { q.focus(); }, 60);
  }

  // что получилось из фразы с учётом правок в чипах
  function plusModel() {
    var tab = plusUi.tab, p = phParse(plusUi.text), o = plusUi.over, md = { tab: tab, cents: o.cents !== undefined ? o.cents : p.cents, date: o.date || p.date || E.todayISO() };
    if (tab === "spend" || tab === "income") {
      var ci = phCat(p.words, tab === "income");
      md.cat = o.cat || (ci ? ci.id : (tab === "income" ? ((cats().find(function (c) { return c.block === "income" && !c.archived; }) || {}).id) : defaultCat()));
      md.note = p.words.filter(function (w, i) { return !ci || i !== ci.used; }).join(" ");
      md.word = ci ? null : p.words[0];
    } else if (tab === "shared") {
      var pNames = partnerStems(), payP = false, full = false, desc = [];
      // «с Сашей», «для Саши» — вместе, а не «платила Рита»
      var withP = pNames.some(function (st) { return st && new RegExp("(^|\\s)(с|со|для|вместе с)\\s+" + st).test(phNorm(plusUi.text)); });
      p.words.forEach(function (w) {
        if (pNames.some(function (s) { return phNorm(w).indexOf(s) === 0; })) { payP = !withP; return; }
        if (/^(заплатил|платил|оплатил)/.test(w)) return;
        if (w === "я" || w === "мы") return;
        if (/^(пополам|поровну|вдво[её]м|общ(ая|ий|ее|ую|ие))$/.test(w)) return;
        if (/^полност|^целиком|^всё$|^все$/.test(w)) { full = true; return; }
        desc.push(w);
      });
      md.paidByMe = o.paidByMe !== undefined ? o.paidByMe : !payP;
      md.desc = desc.join(" ");
      md.cat = o.cat || (md.desc ? S.catOf({ desc: md.desc }, sh.learned) : "Продукты");
      var defSplit = catSplitOf(md.cat);
      md.mode = o.mode || (full ? "full" : defSplit === "theirs" ? "theirs" : defSplit === "mine" ? "mine" : "equal");
    } else if (tab === "cash") {
      var c = Cash.cashState(), pockets = c.pockets.filter(function (x) { return !x.archived; });
      md.cash = plusUi.text.trim() ? K.parse(plusUi.text, pockets, c.defaultPocket) : null;
      if (md.cash) { md.cents = o.cents !== undefined ? o.cents : md.cash.cents; md.cash.date = md.date; }
    }
    return md;
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
      html += plusChip(catName(md.cat) + " ▾", "", tpl("<select data-o='cat'>{!o}</select>", { o: catOptions(md.cat, md.tab === "income" ? function (c) { return c.block === "income"; } : function (c) { return c.block !== "income" && c.block !== "savings"; }) }));
      html += dateChip;
      var rep = plusUi.over.rep || "no";
      html += plusChip({ no: "не повторять", month: "каждый месяц", week: "каждую неделю" }[rep] + " ▾", rep === "no" ? "soft" : "", "<select data-o='rep'>" +
        opt("no", "не повторять", rep === "no") + opt("month", "каждый месяц — станет регулярной", rep === "month") + opt("week", "каждую неделю — станет регулярной", rep === "week") + "</select>");
      var wk = E.weekOfDate(md.date), ys = wk && String(wk.year);
      if (!wk || !state.years[ys] || state.years[ys].archived) wh = tpl("<div class='pw-err'>Плана на {y} нет — создай его в «Плане».</div>", { y: ys || "эту дату" });
      else if (md.cents) {
        var r = E.compute(state, ys), cell = r.cells[md.cat][wk.idx], before = cell ? cell.cents : 0, v = md.tab === "income" ? md.cents : -md.cents;
        wh = tpl("<div class='pw-row'><span>План · {wk} · {cat}</span><b>{a} → {b}</b></div><div class='pw-sub'>В обращении на конец недели: {o1} → {o2}</div>", {
          wk: shortWeek(ys, wk.idx).replace(/([а-я]{3})[а-я]+$/, "$1"), cat: catName(md.cat), a: E.fmt(before, { cur: "€", dec: 0 }), b: E.fmt(before + v, { cur: "€", dec: 0 }),
          o1: E.fmt(rnd(r.base[wk.idx]), { cur: "€", dec: 0 }), o2: E.fmt(rnd(r.base[wk.idx] + v), { cur: "€", dec: 0 }) });
      }
    } else if (md.tab === "shared") {
      var pName = sh.partner ? sh.partner.name : "партнёр";
      html += plusChip(md.cents ? "−" + E.fmt(md.cents, { cur: "€" }) : "сумма?", "strong" + (md.cents ? "" : " miss"));
      html += plusChip(Us.catLabel(md.cat) + " ▾", "", "<select data-o='cat'>" + Us.sharedCats().map(function (c) { return opt(c, Us.catLabel(c), c === md.cat); }).join("") + "</select>");
      html += plusChip("платила " + (md.paidByMe ? "ты" : pName) + " ▾", "", "<select data-o='paidByMe'>" + opt("1", "платила ты", md.paidByMe) + opt("0", "платила " + pName, !md.paidByMe) + "</select>");
      var modeLbl = { equal: "пополам", full: "всё на " + (md.paidByMe ? nameDat(pName) : "тебе"), theirs: "всё на " + nameDat(pName), mine: "всё на тебе" }[md.mode] || "пополам";
      html += plusChip(modeLbl + " ▾", "", "<select data-o='mode'>" + opt("equal", "пополам", md.mode === "equal") + opt("theirs", "всё на " + nameDat(pName), md.mode === "theirs") + opt("mine", "всё на тебе", md.mode === "mine") + "</select>");
      html += dateChip;
      if (md.cents) {
        var mine = plusMine(md), net = md.paidByMe ? md.cents - mine : -mine;
        var bal = (S.balance(sh.expenses).EUR || 0), after = bal + net;
        var bt = function (b) { return Math.abs(b) < 1 ? "вы в расчёте" : b > 0 ? pName + " должна тебе " + E.fmt(b, { cur: "€", dec: 2 }) : "ты должна " + E.fmt(-b, { cur: "€", dec: 2 }); };
        wh = tpl("<div class='pw-row'><span>Мы · «{d}»</span><b class='{c}'>{who}</b></div><div class='pw-sub'>Баланс: {b1} → {b2}</div>", {
          d: md.desc || "без описания", c: net >= 0 ? "pos" : "warn", who: net >= 0 ? pName + " должна " + E.fmt(net, { cur: "€", dec: 2 }) : "ты должна " + E.fmt(-net, { cur: "€", dec: 2 }),
          b1: bt(bal), b2: bt(after).replace(/^.+ должна (тебе )?/, "") });
      }
    } else if (md.tab === "cash") {
      var cs = Cash.cashState();
      if (!cs.pockets.length) { chips.innerHTML = ""; where.innerHTML = "<div class='pw-err'>Сначала заведи кошелёк и конверты — <a href='#cash'>это минута</a>.</div>"; return; }
      var cc = md.cash, kinds = { spend: "трата", move: "переложила", "in": "сняла с карты", out: "на карту", ext: "получила" };
      html += plusChip(kinds[cc.kind] || "трата", "");
      html += plusChip(md.cents ? (cc.kind === "spend" || cc.kind === "out" ? "−" : "") + E.fmt(md.cents, { cur: Cash.pocketCur(cc.from || cc.to) }) : "сумма?", "strong" + (md.cents ? "" : " miss"));
      if (cc.from) html += plusChip("из: " + Cash.pocketName(cc.from), "");
      if (cc.to) html += plusChip("в: " + Cash.pocketName(cc.to), "");
      if (cc.note) html += plusChip("«" + cc.note + "»", "");
      html += dateChip;
      var pc = cashPlanCat(md), pg = cashPlanGuess(md);
      var bal2 = K.balances(cs, Cash.cashLines());
      wh = "<div class='pw-pockets'>" + cs.pockets.filter(function (p) { return !p.archived; }).sort(function (a, b) { return a.sort - b.sort; }).slice(0, 3).map(function (p) {
        var now = bal2[p.id] || 0, nxt = now - (cc.from === p.id ? md.cents || 0 : 0) + (cc.to === p.id ? md.cents || 0 : 0);
        return tpl("<div><small>{n}</small><b>{was}{v}</b></div>", { n: p.name, was: nxt !== now ? E.fmt(now, { dec: now % 100 ? 2 : 0 }) + "\u00A0→\u00A0" : "", v: E.fmt(nxt, { cur: Cash.pocketCur(p.id), dec: nxt % 100 ? 2 : 0 }) });
      }).join("") + "</div>";
      // «И в личный план» — заметный переключатель; если на неделю в плане уже есть сумма, по умолчанию выключен
      if (pg) {
        var pw2 = E.weekOfDate(md.date);
        wh += tpl("<div class='pw-plan{off}'><label class='pw-plan-l'><input type='checkbox' id='pwPlan'{!on}> И в план</label><select id='pwPlanCat' aria-label='Строка плана'>{!o}</select></div><div class='pw-sub'>{hint}</div>", {
          off: pc ? "" : " off", on: pc ? " checked" : "", o: catOptions(pc || pg.cat, function (c) { return c.block !== "income" && c.block !== "savings"; }), hint: planHint(pg, !!pc) });
      }
    }
    chips.innerHTML = html;
    where.innerHTML = wh ? tpl("<div class='plus-where'><div class='pw-h'>Куда запишется</div>{!wh}</div>", { wh: wh }) : "";
    var pp = where.querySelector("#pwPlan"), ppc = where.querySelector("#pwPlanCat");
    if (pp) {
      pp.onchange = function () { plusUi.over.cashPlan = pp.checked ? ppc.value : ""; drawParsed(m); };
      ppc.onchange = function () { plusUi.over.cashPlanCat = ppc.value; if (pp.checked) plusUi.over.cashPlan = ppc.value; else delete plusUi.over.cashPlan; drawParsed(m); };
    }
    chips.querySelectorAll("[data-o]").forEach(function (el) {
      el.onchange = function () {
        var k = el.dataset.o, v = el.value;
        plusUi.over[k] = k === "paidByMe" ? v === "1" : v; drawParsed(m);
      };
    });
  }

  function plusSave(m) {
    var md = plusModel();
    if (!plusUi.text.trim()) { m.querySelector("#plusQ").focus(); return; }
    if (!md.cents) { toast("Не вижу сумму — допиши число"); return; }
    if (md.tab === "spend" || md.tab === "income") {
      var wk = E.weekOfDate(md.date), ys = wk && String(wk.year);
      if (!wk || !state.years[ys] || state.years[ys].archived) { toast("Плана на эту дату нет"); return; }
      var rep = plusUi.over.rep || "no";
      if (rep !== "no") {
        var yr = state.years[ys], v = md.tab === "income" ? md.cents : -md.cents;
        yr.recurring = yr.recurring || [];
        yr.recurring.push({ id: E.uid("r"), catId: md.cat, expr: String(v / 100), cents: v, weeks: rep === "week" ? "все" : String(wk.wim), from: md.date, to: null });
      } else addToCell(ys, md.cat, wk.idx, String(md.cents / 100), md.note);
      state.settings.lastCat = md.cat;
      state.settings.recentCats = [md.cat].concat((state.settings.recentCats || []).filter(function (x) { return x !== md.cat; })).slice(0, 6);
      if (md.word && plusUi.over.cat) { state.settings.phraseCats = state.settings.phraseCats || {}; state.settings.phraseCats[phStem(md.word)] = md.cat; }
      closeModal(); toast((md.tab === "income" ? "Доход " : "") + E.fmt(md.cents, { cur: "€" }) + " → «" + catName(md.cat) + "», " + (rep === "month" ? "каждый месяц с " + shortWeek(ys, wk.idx) : rep === "week" ? "каждую неделю с " + shortWeek(ys, wk.idx) : shortWeek(ys, wk.idx))); changed();
    } else if (md.tab === "shared") {
      if (!md.desc) { toast("Добавь, что это было: например «ужин»"); return; }
      var mine = plusMine(md);
      var ex = S.makeExpense({ date: md.date, desc: md.desc.charAt(0).toUpperCase() + md.desc.slice(1), cost: md.cents, currency: "EUR", paidByMe: md.paidByMe, myShare: mine, cat: md.cat, method: "card", note: "", kind: "expense", split: md.mode === "equal" || md.mode === "full" ? { mode: md.mode, values: {} } : { mode: "exact", values: { me: mine, partner: md.cents - mine } } });
      if (md.cat) learn(ex.desc, md.cat);
      var btn = m.querySelector("#plusGo"); btn.disabled = true;
      Store.insertShared([SU.toRow(ex, sh.meId, sh.partnerId, sh.space.id)]).then(function () { closeModal(); return loadShared(); })
        .then(function () { render(); toast("Общая трата добавлена"); })
        .catch(function (err) { btn.disabled = false; toast("Не сохранилось: " + err.message); });
    } else if (md.tab === "cash") {
      var c = Cash.cashState(), cur = md.cash, k = cur.kind;
      if ((k === "spend" || k === "move" || k === "out") && !cur.from) { toast("Из какого кармана?"); return; }
      if ((k === "move" || k === "in" || k === "ext") && !cur.to) { toast("В какой карман?"); return; }
      var ntx = { id: E.uid("t"), ts: Date.now(), date: md.date, kind: k, cents: md.cents, from: k === "in" || k === "ext" ? null : cur.from, to: k === "spend" || k === "out" ? null : cur.to, note: cur.note };
      var pcat = cashPlanCat(md), pw = E.weekOfDate(md.date), pys = pw && String(pw.year), inPlan = "";
      if (pcat && pw && state.years[pys] && !state.years[pys].archived) {
        addToCell(pys, pcat, pw.idx, String(md.cents / 100), (cur.note || "") + " (нал)"); ntx.plan = { year: pys, week: pw.idx, cat: pcat }; inPlan = " и в план «" + catName(pcat) + "»";
      }
      c.tx.push(ntx);
      closeModal(); toast("Записано: " + (cur.note || "наличка") + " " + E.fmt(md.cents, { cur: "€" }) + inPlan); changed();
    }
  }

  // для других экранов — только это; остальное внутри модуля
  window.Plus = { phParse: phParse, phCat: phCat, plusSheet: plusSheet };
})();
