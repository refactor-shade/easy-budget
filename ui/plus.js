/* Easy Budget — «+»: внести одной фразой. Вкладки: трата · доход · общая · наличка · сверка. */
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
  t = t.replace(/(\d+(?:[  ]\d{3})*(?:[.,]\d{1,2})?)/, function (m) { out.cents = Math.round(Number(m.replace(/[  ]/g, "").replace(",", ".")) * 100); return " "; });
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

// Вкладка по словам: «зарплата», «доход», «бонус» → Доход; «пополам», «вдвоём», имя партнёра → Общая
function plusAutoTab(text) {
  var t = phNorm(text), words = t.split(/[\s,;.!?]+/).filter(Boolean);
  if (sh && (/(^|\s)(пополам|поровну|вдво[её]м|на двоих|общ(ая|ий|ее|ую|ие))(\s|$)/.test(t) || words.some(function (w) { return partnerStems().some(function (st) { return st && w.indexOf(st) === 0; }); }))) return "shared";
  if (/(^|\s)(доход|зарплат|зп(\s|$)|получил|пришл[оа]|бонус|преми|аванс|кешбэк|кэшбэк|гонорар|возврат налог)/.test(t)) return "income";
  var p = phParse(text);
  if (p.words.length && !phCat(p.words, false) && phCat(p.words, true)) return "income";
  return null;
}
// имя партнёра в фразе: «Рита», «Риты», «Rita» — первые 3 буквы в обеих раскладках
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
function plusSheet(tab) {
  if (RO()) { toast("Сейчас открыт чужой бюджет (" + view.name + ") — только просмотр"); return; }
  plusUi.tab = tab || "spend"; // без явной вкладки всегда начинаем с «Траты» — угаданная в прошлый раз не залипает
  plusUi.text = ""; plusUi.over = {};
  plusUi.manual = !!tab; plusUi.base = plusUi.tab; // вкладку угадываем по фразе, пока её не выбрали руками
  modal("<div class='m-body plus'><div class='plus-head'><h2>Внести</h2><button class='linkish' data-act='x'>Закрыть</button></div>" +
    "<div class='plus-tabs' role='tablist'>" + [["spend", "Трата"], ["income", "Доход"], ["shared", "Общая"], ["cash", "Наличка"], ["recon", "Сверка ›"]].map(function (x) {
      return "<button type='button' role='tab' data-pt='" + x[0] + "'>" + x[1] + "</button>";
    }).join("") + "</div><div id='plusBody'></div></div>", function (m) {
    m.classList.add("sheet-plus");
    m.querySelector("[data-act=x]").onclick = closeModal;
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
  var tab = plusUi.tab, ex = { spend: "шопинг 89 вчера", income: "бонус 1200 в пятницу", shared: "ужин 60 пополам, " + (sh && sh.partner ? sh.partner.name : "Рита") + " платила", cash: "кофе 4,5 из кошелька" }[tab];
  var body = m.querySelector("#plusBody");
  body.innerHTML = "<label class='plus-lbl' for='plusQ'>Опиши в свободном формате</label>" +
    "<input id='plusQ' class='plus-q' autocomplete='off' placeholder='например: " + esc(ex) + "' value='" + esc(plusUi.text) + "'>" +
    "<div class='plus-chips' id='plusChips'></div><div id='plusWhere'></div>" +
    "<button type='button' class='btn primary plus-go' id='plusGo'>Записать</button>" +
    (tab !== "cash" ? "<button type='button' class='linkish plus-form' id='plusForm'>Заполнить по полям</button>" : "") +
    (tab === "cash" ? "<a class='plus-more' href='#cash'>История и карманы ›</a>" : "");
  var q = body.querySelector("#plusQ"), tmr = null;
  q.oninput = function () { clearTimeout(tmr); tmr = setTimeout(function () { plusUi.text = q.value; plusUi.over = {}; drawParsed(m); }, 200); };
  q.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); plusUi.text = q.value; drawParsed(m); plusSave(m); } };
  body.querySelector("#plusGo").onclick = function () { plusUi.text = q.value; drawParsed(m); plusSave(m); };
  var pm = body.querySelector(".plus-more"); if (pm) pm.onclick = closeModal;
  var pf = body.querySelector("#plusForm");
  if (pf) pf.onclick = function () {
    plusUi.text = q.value; var md = plusModel(); closeModal();
    setTimeout(function () {
      if (tab === "shared") expenseSheet(null, { desc: md.desc ? md.desc.charAt(0).toUpperCase() + md.desc.slice(1) : "", cost: md.cents || 0, cat: md.cat, date: md.date, paidByMe: md.paidByMe, mode: md.mode === "full" ? "full" : "equal" });
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
    // «с Ритой», «для Риты» — вместе, а не «платила Рита»
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
    var defSplit = (sh.space.settings.catSplit || {})[md.cat];
    md.mode = o.mode || (full ? "full" : defSplit === "theirs" ? "theirs" : defSplit === "mine" ? "mine" : "equal");
  } else if (tab === "cash") {
    var c = cashState(), pockets = c.pockets.filter(function (x) { return !x.archived; });
    md.cash = plusUi.text.trim() ? K.parse(plusUi.text, pockets, c.defaultPocket) : null;
    if (md.cash) { md.cents = o.cents !== undefined ? o.cents : md.cash.cents; md.cash.date = md.date; }
  }
  return md;
}

function plusChip(label, cls, inner) { return "<label class='pchip " + (cls || "") + "'>" + label + (inner || "") + "</label>"; }
function drawParsed(m) {
  if (!plusUi.manual && plusUi.base === "spend") {
    var want = plusAutoTab(plusUi.text) || "spend";
    if (want !== plusUi.tab) {
      plusUi.tab = want; plusUi.over = {};
      m.querySelectorAll("[data-pt]").forEach(function (b) { b.classList.toggle("on", b.dataset.pt === want); b.setAttribute("aria-selected", b.dataset.pt === want ? "true" : "false"); });
    }
  }
  var md = plusModel(), chips = m.querySelector("#plusChips"), where = m.querySelector("#plusWhere"), html = "", wh = "";
  var dateLbl = md.date === E.todayISO() ? "сегодня" : md.date === E.addDays(E.todayISO(), -1) ? "вчера" : new Date(md.date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  var dateChip = plusChip(esc(dateLbl) + " ▾", md.date === E.todayISO() ? "soft" : "", "<input type='date' data-o='date' value='" + md.date + "'>");
  if (!plusUi.text.trim()) { chips.innerHTML = ""; where.innerHTML = ""; return; }
  if (md.tab === "spend" || md.tab === "income") {
    html += plusChip(md.cents ? (md.tab === "income" ? "+" : "−") + E.fmt(md.cents, { cur: "€" }) : "сумма?", "strong" + (md.cents ? "" : " miss"));
    html += plusChip(esc(catName(md.cat)) + " ▾", "", "<select data-o='cat'>" + catOptions(md.cat, md.tab === "income" ? function (c) { return c.block === "income"; } : function (c) { return c.block !== "income" && c.block !== "savings"; }) + "</select>");
    html += dateChip;
    var rep = plusUi.over.rep || "no";
    html += plusChip({ no: "не повторять", month: "каждый месяц", week: "каждую неделю" }[rep] + " ▾", rep === "no" ? "soft" : "", "<select data-o='rep'><option value='no'" + (rep === "no" ? " selected" : "") + ">не повторять</option><option value='month'" + (rep === "month" ? " selected" : "") + ">каждый месяц — станет регулярной</option><option value='week'" + (rep === "week" ? " selected" : "") + ">каждую неделю — станет регулярной</option></select>");
    var wk = E.weekOfDate(md.date), ys = wk && String(wk.year);
    if (!wk || !state.years[ys] || state.years[ys].archived) wh = "<div class='pw-err'>Плана на " + (ys || "эту дату") + " нет — создай его в «Плане».</div>";
    else if (md.cents) {
      var r = E.compute(state, ys), cell = r.cells[md.cat][wk.idx], before = cell ? cell.cents : 0, v = md.tab === "income" ? md.cents : -md.cents;
      wh = "<div class='pw-row'><span>План · " + esc(shortWeek(ys, wk.idx).replace(/([а-я]{3})[а-я]+$/, "$1")) + " · " + esc(catName(md.cat)) + "</span><b>" + E.fmt(before, { cur: "€", dec: 0 }) + " → " + E.fmt(before + v, { cur: "€", dec: 0 }) + "</b></div>" +
        "<div class='pw-sub'>В обращении на конец недели: " + E.fmt(rnd(r.base[wk.idx]), { cur: "€", dec: 0 }) + " → " + E.fmt(rnd(r.base[wk.idx] + v), { cur: "€", dec: 0 }) + "</div>";
    }
  } else if (md.tab === "shared") {
    var pName = sh.partner ? sh.partner.name : "партнёр";
    html += plusChip(md.cents ? "−" + E.fmt(md.cents, { cur: "€" }) : "сумма?", "strong" + (md.cents ? "" : " miss"));
    html += plusChip(esc(catLabel(md.cat)) + " ▾", "", "<select data-o='cat'>" + sharedCats().map(function (c) { return "<option value='" + esc(c) + "'" + (c === md.cat ? " selected" : "") + ">" + esc(catLabel(c)) + "</option>"; }).join("") + "</select>");
    html += plusChip("платила " + (md.paidByMe ? "ты" : esc(pName)) + " ▾", "", "<select data-o='paidByMe'><option value='1'" + (md.paidByMe ? " selected" : "") + ">платила ты</option><option value='0'" + (md.paidByMe ? "" : " selected") + ">платила " + esc(pName) + "</option></select>");
    var modeLbl = { equal: "пополам", full: "всё на " + (md.paidByMe ? esc(nameDat(pName)) : "тебе"), theirs: "всё на " + esc(nameDat(pName)), mine: "всё на тебе" }[md.mode] || "пополам";
    html += plusChip(modeLbl + " ▾", "", "<select data-o='mode'><option value='equal'" + (md.mode === "equal" ? " selected" : "") + ">пополам</option><option value='theirs'" + (md.mode === "theirs" ? " selected" : "") + ">всё на " + esc(nameDat(pName)) + "</option><option value='mine'" + (md.mode === "mine" ? " selected" : "") + ">всё на тебе</option></select>");
    html += dateChip;
    if (md.cents) {
      var mine = plusMine(md), net = md.paidByMe ? md.cents - mine : -mine;
      var bal = (S.balance(sh.expenses).EUR || 0), after = bal + net;
      var bt = function (b) { return Math.abs(b) < 1 ? "вы в расчёте" : b > 0 ? esc(pName) + " должна тебе " + E.fmt(b, { cur: "€", dec: 2 }) : "ты должна " + E.fmt(-b, { cur: "€", dec: 2 }); };
      wh = "<div class='pw-row'><span>Мы · «" + esc(md.desc || "без описания") + "»</span><b class='" + (net >= 0 ? "pos" : "warn") + "'>" + (net >= 0 ? esc(pName) + " должна " + E.fmt(net, { cur: "€", dec: 2 }) : "ты должна " + E.fmt(-net, { cur: "€", dec: 2 })) + "</b></div>" +
        "<div class='pw-sub'>Баланс: " + bt(bal) + " → " + bt(after).replace(/^.+ должна (тебе )?/, "") + "</div>";
    }
  } else if (md.tab === "cash") {
    var cs = cashState();
    if (!cs.pockets.length) { chips.innerHTML = ""; where.innerHTML = "<div class='pw-err'>Сначала заведи кошелёк и конверты — <a href='#cash'>это минута</a>.</div>"; return; }
    var cc = md.cash, kinds = { spend: "трата", move: "переложила", "in": "сняла с карты", out: "на карту", ext: "получила" };
    html += plusChip(esc(kinds[cc.kind] || "трата"), "");
    html += plusChip(md.cents ? (cc.kind === "spend" || cc.kind === "out" ? "−" : "") + E.fmt(md.cents, { cur: pocketCur(cc.from || cc.to) }) : "сумма?", "strong" + (md.cents ? "" : " miss"));
    if (cc.from) html += plusChip("из: " + esc(pocketName(cc.from)), "");
    if (cc.to) html += plusChip("в: " + esc(pocketName(cc.to)), "");
    if (cc.note) html += plusChip("«" + esc(cc.note) + "»", "");
    html += dateChip;
    var bal2 = K.balances(cs, cashLines());
    wh = "<div class='pw-pockets'>" + cs.pockets.filter(function (p) { return !p.archived; }).sort(function (a, b) { return a.sort - b.sort; }).slice(0, 3).map(function (p) {
      var now = bal2[p.id] || 0, nxt = now - (cc.from === p.id ? md.cents || 0 : 0) + (cc.to === p.id ? md.cents || 0 : 0);
      return "<div><small>" + esc(p.name) + "</small><b>" + (nxt !== now ? E.fmt(now, { dec: now % 100 ? 2 : 0 }) + "&nbsp;→&nbsp;" : "") + E.fmt(nxt, { cur: pocketCur(p.id), dec: nxt % 100 ? 2 : 0 }) + "</b></div>";
    }).join("") + "</div>";
  }
  chips.innerHTML = html;
  where.innerHTML = wh ? "<div class='plus-where'><div class='pw-h'>Куда запишется</div>" + wh + "</div>" : "";
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
    sh.learned[S.norm(ex.desc)] = md.cat; saveLearned();
    var btn = m.querySelector("#plusGo"); btn.disabled = true;
    Store.insertShared([SU.toRow(ex, sh.meId, sh.partnerId, sh.space.id)]).then(function () { closeModal(); return loadShared(); })
      .then(function () { render(); toast("Общая трата добавлена"); })
      .catch(function (err) { btn.disabled = false; toast("Не сохранилось: " + err.message); });
  } else if (md.tab === "cash") {
    var c = cashState(), cur = md.cash, k = cur.kind;
    if ((k === "spend" || k === "move" || k === "out") && !cur.from) { toast("Из какого кармана?"); return; }
    if ((k === "move" || k === "in" || k === "ext") && !cur.to) { toast("В какой карман?"); return; }
    c.tx.push({ id: E.uid("t"), ts: Date.now(), date: md.date, kind: k, cents: md.cents, from: k === "in" || k === "ext" ? null : cur.from, to: k === "spend" || k === "out" ? null : cur.to, note: cur.note });
    closeModal(); toast("Записано: " + (cur.note || "наличка") + " " + E.fmt(md.cents, { cur: "€" })); changed();
  }
}
