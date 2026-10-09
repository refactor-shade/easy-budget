/* Easy Budget — экран «Главная» и календарь сверок. */
"use strict";
// ===== ГЛАВНАЯ =====
function myName() { var n = Store.user() && Store.user().name; if (!n || n === "Я") n = state.settings.myName || ""; return n.split(" ")[0]; }
function partnerName() { return sh && sh.partner ? sh.partner.name : "партнёр"; }
function greeting() { var h = new Date().getHours(); return h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер"; }
function go(hash, after) { location.hash = hash; if (after) setTimeout(after, 60); }

routes.home = function () {
  var d = defaultYearWeek(), y = d.year, w = d.week;
  var r = E.compute(state, y), wk = r.weeks[w], mon = E.monthly(state, y).months[wk.month - 1];
  var today = new Date(), t = E.todayISO();
  var dateLine = today.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  var minV = Infinity, minW = w;
  for (var i = w; i < 60; i++) if (r.base[i] < minV) { minV = r.base[i]; minW = i; }
  var lastRec = -1; for (i = w; i >= 0; i--) if (r.fact[i] !== null) { lastRec = i; break; }
  var prevEnd = (wk.month - 1) * 5 - 1, capFrom = prevEnd >= 0 ? r.cap[prevEnd] : r.startCap, dCap = r.cap[w] - capFrom;
  var name = myName(), ro = RO();

  // что сделать
  var todo = [];
  if (!ro) {
    var fw = finishedWeek(), fr = fw ? E.compute(state, fw.year) : null;
    if (fw && fr.fact[fw.week] === null) todo.push({ ic: "✓", h: "Сверка за " + shortWeek(fw.year, fw.week), p: "Впиши остатки на картах и в наличке — пара минут." +
      (lastRec < 0 ? "" : " Последняя сверка — " + shortWeek(y, lastRec) + "."), act: "recon", rw: fw });
    else if (fw && fr.diff[fw.week] < state.settings.diffAlert) todo.push({ k: "warn", ic: "↗", h: "Расхождение " + eur(rnd(fr.diff[fw.week]), { dec: 0, plus: true }) + " за " + shortWeek(fw.year, fw.week),
      p: "Денег меньше, чем по плану. Найди в выписке крупную трату и внеси её.", act: "recon", rw: fw });
    var yrH = state.years[y], planEmpty = !(yrH.recurring || []).length && !Object.keys(yrH.entries || {}).some(function (k) { return Object.keys(yrH.entries[k]).length; });
    if (planEmpty) todo.unshift({ ic: "↻", h: "Заполнить план на " + y, p: "Начни с того, что повторяется: зарплата, аренда, подписки. Один раз — и суммы встанут во все недели.", act: "recurring" });
    var nLog = toLogCount();
    if (nLog) todo.push({ ic: "⇄", h: nLog + " " + (nLog % 10 === 1 && nLog % 100 !== 11 ? "общая трата" : nLog % 10 >= 2 && nLog % 10 <= 4 && (nLog % 100 < 10 || nLog % 100 >= 20) ? "общие траты" : "общих трат") + " не в личном плане", p: "Внеси их в свой план одной кнопкой или отметь, что уже есть.", act: "tolog" });
    if (!state.settings.reminder) todo.push({ ic: "◷", h: "Поставить напоминание о сверке", p: Store.mode === "cloud" ? "Уведомление на телефон или событие в календаре раз в неделю — чтобы не забывать." : "Событие в календаре раз в неделю — чтобы не забывать.", act: "reminder" });
    else if (Store.mode === "cloud" && !state.settings.reminder.push && !state.settings.reminder.off && window.BudgetPush && window.BudgetPush.supported() && !reminderPushAsked()) todo.push({ ic: "◷", h: "Напоминание о сверке — уведомлением", p: "Теперь можно получать его прямо на телефон, а не только в календаре.", act: "reminder" });
    if (installHintNeeded()) todo.push({ ic: "⊕", h: "Добавить Easy Budget на экран «Домой»", p: "Откроется как приложение, без адресной строки, и сможет присылать напоминания.", act: "install" });
    if (minV < 0) todo.push({ k: "warn", ic: "↗", h: "Самый низкий остаток — " + eur(rnd(minV), { dec: 0 }) + ", " + shortWeek(y, minW), p: "Остаток уходит в минус. Можно сдвинуть крупные траты или переложить из накоплений.", act: "year" });
    if (!sh) todo.push({ ic: "⇄", h: "Подключить общие траты", p: "Траты на двоих: кто сколько заплатил и кто кому должен, как в Splitwise.", act: "shared" });
    else {
      if (sh.partner && !sh.partner.userId && Store.mode === "cloud") todo.push({ ic: "✉", h: esc(partnerName()) + " ещё не вошла", p: "Пришли ей ссылку на сайт — пусть войдёт с " + esc(sh.partner.email || "своим email") + ", пространство подключится само.", act: "shared" });
      var bal = S.balance(sh.expenses).EUR || 0;
      if (Math.abs(bal) >= 5000) todo.push({ ic: "€", h: bal > 0 ? esc(partnerName()) + " должна тебе " + eur(bal) : "Ты должна " + esc(partnerName()) + " " + eur(-bal), p: "Рассчитаться в «Мы».", act: "shared" });
    }
    var ny = String(Number(y) + 1);
    if (wk.month >= 10 && !state.years[ny]) todo.push({ ic: "▦", h: "Пора набросать план на " + ny, p: "Создай его на экране «Год» — регулярные траты перенесутся сами.", act: "year" });
    var lastFile = state.settings.lastFileBackupAt ? new Date(state.settings.lastFileBackupAt).getTime() : 0, daysFile = Math.floor((Date.now() - lastFile) / 864e5);
    if (daysFile >= 7 && state.settings.tourDone) todo.push({ ic: "⤓", h: "Сохранить бэкап в файл", p: (lastFile ? "Последний — " + daysFile + " дн. назад. " : "") + "Excel-файл со всем бюджетом: положи в iCloud или Google Drive — и данные у тебя, что бы ни случилось.", act: "backup" });
    if (!state.settings.tourDone) todo.push({ ic: "?", h: "Пройти знакомство — 1 минута", p: "Что такое «в обращении», зачем сверка и где что лежит.", act: "tour" });
  }

  // план недели
  var items = [], tin = 0, tout = 0;
  cats().forEach(function (c) {
    var cell = r.cells[c.id][w]; if (!cell) return;
    var v = c.currency === "RUB" ? 0 : cell.cents;
    if (c.block !== "savings") { if (v > 0) tin += v; else tout += v; }
    items.push({ c: c, cell: cell });
  });
  items.sort(function (a, b) { return Math.abs(b.cell.cents) - Math.abs(a.cell.cents); });

  // «Итог месяца» — строка в «Что сделать», подробности по нажатию
  var INS = window.BudgetInsights;
  var due = !ro ? INS.monthDue(state, E.todayISO()) : null, ms = null;
  if (due && state.settings.monthSeen !== due.key) {
    ms = INS.month(state, due.year, due.month);
    var nb0 = ms.numbers, pct = nb0.income > 0 ? Math.round(nb0.net / nb0.income * 100) : null;
    todo.unshift({ ic: "◷", h: "Итог " + E.MONTHS_GEN[due.month] + " готов", p: (nb0.dcap === null ? "" : "Капитал " + eur(rnd(nb0.dcap), { dec: 0, plus: true }) + ", ") + (pct === null ? "посмотри, как прошёл месяц" : "осталось " + pct + "% доходов"), act: "month" });
  }

  // неделя на карточке: можно листать ‹ ›
  var hw = Math.max(0, Math.min(59, w + (ui.homeWeekOff || 0)));
  if (hw !== w) {
    items = []; tin = 0; tout = 0;
    cats().forEach(function (c) {
      var cell = r.cells[c.id][hw]; if (!cell) return;
      var v = c.currency === "RUB" ? 0 : cell.cents;
      if (c.block !== "savings") { if (v > 0) tin += v; else tout += v; }
      items.push({ c: c, cell: cell });
    });
    items.sort(function (a, b) { return Math.abs(b.cell.cents) - Math.abs(a.cell.cents); });
  }
  var qb = function (key, label) { return "<button type='button' class='q-btn' data-explain='" + key + "' aria-label='" + label + "'>?</button>"; };

  var html = "<div class='home'>";
  html += "<header class='home-head'><div class='home-top'><div class='home-date'>" + esc(dateLine) + "</div>" +
    "<div class='home-act'><button type='button' class='icon-btn sync' data-sync id='homeSync' aria-label='Обновить'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'><path d='M20 11a8 8 0 1 0-2.3 5.7'/><path d='M20 4v7h-7'/></svg><i class='sync-dot' aria-hidden='true'></i></button>" +
    "<a class='icon-btn' href='#settings' aria-label='Настройки'><svg width='19' height='19' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'/></svg></a></div></div>" +
    "<h1>" + greeting() + (name && !ro ? ", " + esc(name) : "") + "</h1></header>";

  // главный блок
  var ok = minV >= 0;
  html += "<section class='hero card'><div class='hero-main'><div class='hero-label'>В обращении сейчас" + qb("obr", "Что такое «в обращении»") + "</div>" +
    "<button class='hero-value' data-ob='1' title='Из чего складывается'>" + eur(rnd(r.base[w]), { dec: 0 }) + "</button>" +
    "<div class='hero-status " + (ok ? "good" : "bad") + "'><span class='dot'></span>" + "Самый низкий остаток — " + eur(rnd(minV), { dec: 0 }) + "</div>" +
    "<div class='hero-min'>" + esc(shortWeek(y, minW)) + ", если всё пойдёт по плану<br>" +
    (r.fact[w] === null ? (lastRec >= 0 ? "По сверке " + esc(shortWeek(y, lastRec)) : "По плану, сверок ещё не было") : "По сверке этой недели") +
    " · <button class='linkish' data-ob='1'>из чего складывается</button></div></div>" +
    "<div class='hero-side'><div class='hero-label'>Капитал" + qb("cap", "Что такое капитал") + "</div><div class='hero-cap'>" + eur(rnd(r.cap[w]), { dec: 0 }) + "</div>" +
    "<div class='hero-dcap'><span class='" + sign(dCap) + "'>" + eur(rnd(dCap), { dec: 0, plus: true }) + "</span> с начала " + E.MONTHS_GEN[wk.month - 1] + "</div>" +
    "<div class='hero-chart'>" + spark(r.cap, w, y) + "</div></div></section>";

  var hasCash = !!(state.cash && state.cash.pockets && state.cash.pockets.length);
  html += "<div class='home-grid hg" + (ro ? " hg-notodo" : "") + (hasCash ? "" : " hg-nocash") + "'>";
  // дела
  if (!ro) html += "<section class='card a-todo'><h2>Что сделать</h2>" + (todo.length ? "<ul class='todo-list'>" + todo.map(function (x, j) {
    return "<li class='" + (x.k || "") + "' data-todo='" + j + "'><span class='ic'>" + x.ic + "</span><span class='tx'><b>" + x.h + "</b><span>" + x.p + "</span></span><span class='arr'>›</span></li>";
  }).join("") + "</ul>" : "<p class='all-good'><span class='ic'>✓</span>Всё сделано. Можно ничего не трогать до следующей недели.</p>") +
    "<a class='rc-row' href='#recon'><span class='rc-l'>Сверки</span>" + reconCalendar(y, true) + "<span class='arr'>›</span></a></section>";

  // наличка: карманы и вход в историю
  var cs = state.cash;
  if (cs && cs.pockets && cs.pockets.length) {
    var cb = K.balances(cs, cashLines()), cps = cs.pockets.filter(function (p) { return !p.archived; }).sort(function (a, b) { return a.sort - b.sort; });
    html += "<a class='card a-cash' href='#cash'><span class='cc-tx'><span class='cc-row'><b>Наличка</b><b>" + eur(cashEurTotal(), { dec: 0 }) + "</b></span>" +
      "<span class='small muted'>" + cps.slice(0, 3).map(function (p) { return esc(p.name) + " " + E.fmt(cb[p.id] || 0, { cur: pocketCur(p.id), dec: 0 }); }).join(" · ") + (cps.length > 3 ? " · ещё " + (cps.length - 3) : "") + "</span></span><span class='arr'>›</span></a>";
  }

  // неделя
  var open = !!ui.homeWeekOpen, shown = open ? items : items.slice(0, 5);
  html += "<section class='card a-week'><div class='wk-head'><button type='button' class='round-btn' data-hw='-1' aria-label='Предыдущая неделя'>‹</button>" +
    "<div class='wk-title'><h2>Неделя " + esc(shortWeek(y, hw)) + "</h2><div class='small muted'>приход " + eur(tin, { dec: 0 }) + " · расход " + eur(-tout, { dec: 0 }) + "</div></div>" +
    "<button type='button' class='round-btn' data-hw='1' aria-label='Следующая неделя'>›</button></div>" +
    (items.length ? "<ul class='plan-list'>" + shown.map(function (x) {
      return "<li><span class='name'>" + esc(x.c.name) + "</span><span class='val " + sign(x.cell.cents) + "'>" + E.fmt(x.cell.cents, { cur: cur(x.c), dec: 0 }) + "</span></li>";
    }).join("") + "</ul>" : "<p class='empty'>На эту неделю ничего не запланировано.</p>") +
    (items.length > 5 && !open ? "<button type='button' class='btn ghost sm more' id='hwMore'>Ещё " + (items.length - 5) + " · показать всю неделю</button>" : "") +
    "<button type='button' class='btn ghost sm more' data-go='week' data-gw='" + hw + "'>открыть в плане ›</button></section>";

  // месяц
  var monthName = E.MONTHS[wk.month - 1];
  html += "<section class='card a-month'><div class='row'><h2 style='margin:0'>" + monthName[0].toUpperCase() + monthName.slice(1) + "</h2><span class='spacer'></span><span class='small muted'>неделя " + wk.wim + " из 5</span></div>" +
    "<div class='month-bar' aria-hidden='true'>" + [1, 2, 3, 4, 5].map(function (n) { return "<span class='" + (n < wk.wim ? "past" : n === wk.wim ? "now" : "") + "'></span>"; }).join("") + "</div>" +
    "<div class='kv'><span>Доходы</span><b class='pos'>" + eur(rnd(mon.income), { dec: 0 }) + "</b></div>" +
    "<div class='kv'><span>Расходы</span><b>" + eur(rnd(mon.total), { dec: 0 }) + "</b></div>" +
    "<div class='kv'><span>Отложить в накопления</span><b>" + eur(rnd(mon.saved), { dec: 0 }) + "</b></div>" +
    "<button class='btn ghost sm more' data-go='year'>весь год ›</button></section>";
  html += "</div>";

  html += "<p class='home-help small muted'>Впервые здесь или что-то непонятно? <a href='#help'>Как это работает</a></p></div>";
  $main.innerHTML = html;

  $main.querySelectorAll("[data-hw]").forEach(function (b) { b.onclick = function () { ui.homeWeekOff = (ui.homeWeekOff || 0) + Number(b.dataset.hw); ui.homeWeekOpen = false; render(); }; });
  var hm = $main.querySelector("#hwMore"); if (hm) hm.onclick = function () { ui.homeWeekOpen = true; render(); };
  function monthModal() {
    var nb = ms.numbers, mn = E.MONTHS[due.month];
    var li = function (z, mk, h, p) { return "<li class='" + z + "'><span class='mk' aria-hidden='true'>" + mk + "</span><span><b>" + esc(h) + "</b>" + (p ? " " + esc(p) : "") + "</span></li>"; };
    modal("<div class='m-body month-sum'><h2>Итог месяца: " + mn + "</h2>" + (due.recon ? "" : "<p class='small muted' style='margin:0'>Без сверки в конце месяца — цифры по плану.</p>") +
      "<div class='ms-nums'><div><span class='muted small'>доходы</span><b class='pos'>" + eur(rnd(nb.income), { dec: 0 }) + "</b></div><div><span class='muted small'>расходы</span><b>" + eur(rnd(nb.total), { dec: 0 }) + "</b></div>" +
      "<div><span class='muted small'>осталось</span><b class='" + sign(nb.net) + "'>" + eur(rnd(nb.net), { dec: 0, plus: true }) + "</b></div><div><span class='muted small'>капитал</span><b class='" + sign(nb.dcap || 0) + "'>" + (nb.dcap === null ? "—" : eur(rnd(nb.dcap), { dec: 0, plus: true })) + "</b></div></div><ul>" +
      ms.good.map(function (c) { return li("good", "✓", c.h, c.p); }).join("") + ms.improve.map(function (c) { return li("improve", "↗", c.h, c.p); }).join("") + (ms.next ? li("next", "→", ms.next, "") : "") +
      "</ul></div><div class='m-foot'><a class='btn ghost' href='#insights'>Все выводы</a><button class='btn primary' data-act='seen'>Прочитано</button></div>", function (m) {
      m.querySelector("[data-act=seen]").onclick = function () { state.settings.monthSeen = due.key; closeModal(); changed(); };
    });
  }
  $main.querySelectorAll("[data-go]").forEach(function (el) { el.onclick = function () { ui.year = y; ui.week = el.dataset.gw ? Number(el.dataset.gw) : w; go("#" + el.dataset.go); }; });
  $main.querySelectorAll("[data-todo]").forEach(function (el) {
    el.onclick = function () {
      var td = todo[Number(el.dataset.todo)], a = td.act;
      if (a === "tour") return showTour(0);
      if (a === "month") return monthModal();
      if (a === "reminder") { try { localStorage.setItem("eb:pushAsked", "1"); } catch (e) { /* ок */ } return reminderModal(); }
      if (a === "install") return installModal();
      if (a === "backup") { backupDownload(); return render(); }
      if (a === "recon") ui.recWeek = td.rw || { year: y, week: w };
      ui.year = y; ui.week = w; go("#" + a);
    };
  });
  var hs = $main.querySelector("#homeSync"); if (hs) hs.onclick = refreshAll;
  $main.querySelectorAll("[data-q]").forEach(function (el) {
    el.onclick = function () {
      var q = el.dataset.q; ui.year = y; ui.week = w;
      if (q === "spend") spendModal();
      else if (q === "shared") go("#shared", function () { var b = document.getElementById("addExpBtn"); if (b) b.click(); });
      else if (q === "cash") go("#cash", function () { var i = document.querySelector("#cashQ [name=q]"); if (i) { i.scrollIntoView({ block: "center" }); i.focus(); } });
      else { ui.recWeek = finishedWeek() || { year: y, week: w }; go("#recon"); }
    };
  });
  $main.querySelectorAll("[data-explain]").forEach(function (el) { el.onclick = function () { explain(el.dataset.explain); }; });
  bindRecCal(y);
  $main.querySelectorAll("[data-ob]").forEach(function (b) { b.onclick = function () { obrBreakdown(y, w); }; });
  if (!ro && !state.settings.tourDone && !ui.tourShown) { ui.tourShown = true; setTimeout(function () { showTour(0); }, 350); }
};

// капитал за год: линия по неделям, прошлое — сплошной, план — пунктиром
function spark(vals, now, y) {
  var W = 320, H = 84, lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || 1;
  var X = function (i) { return (i / 59) * W; }, Y = function (v) { return 6 + (H - 12) * (1 - (v - lo) / span); };
  var pts = vals.map(function (v, i) { return X(i).toFixed(1) + "," + Y(v).toFixed(1); });
  var past = "M" + pts.slice(0, now + 1).join("L"), fut = "M" + pts.slice(now).join("L");
  var area = past + "L" + X(now).toFixed(1) + "," + H + "L0," + H + "Z";
  return "<svg viewBox='0 0 " + W + " " + H + "' preserveAspectRatio='none' class='spark' role='img' aria-label='Капитал за " + y + "'>" +
    "<path d='" + area + "' fill='var(--accent)' opacity='.1'/><path d='" + fut + "' fill='none' stroke='var(--accent)' stroke-width='1.6' stroke-dasharray='3 4' opacity='.55' vector-effect='non-scaling-stroke'/>" +
    "<path d='" + past + "' fill='none' stroke='var(--accent)' stroke-width='2' vector-effect='non-scaling-stroke' stroke-linejoin='round'/></svg>" +
    "<span class='spark-dot' style='left:" + (now / 59 * 100).toFixed(2) + "%;top:" + (Y(vals[now]) / H * 100).toFixed(2) + "%'></span>" +
    "<div class='spark-axis'><span>янв</span><span>сейчас — дальше план</span><span>дек</span></div>";
}


// ===== КАЛЕНДАРЬ СВЕРОК =====
// Цвет — по размеру расхождения, плавно: красный тем гуще, чем сильнее минус; зелёный — чем сильнее плюс
function reconStatus(y, w, r) {
  if (r.fact[w] !== null) {
    var lim = Math.abs(state.settings.diffAlert || -5000) || 5000, t = r.diff[w] / lim;
    return t <= -6 ? "n4" : t <= -3 ? "n3" : t <= -1 ? "n2" : t < -0.3 ? "n1" : t <= 0.3 ? "z" : t <= 1 ? "p1" : t <= 3 ? "p2" : "p3";
  }
  if (isNow(y, w)) return "now";
  return weekDone(y, w) ? "miss" : "future";
}
var RS_TEXT = { n4: "сильно меньше плана", n3: "заметно меньше плана", n2: "меньше плана — за порогом", n1: "чуть меньше плана", z: "точно по плану",
  p1: "чуть больше плана", p2: "больше плана", p3: "сильно больше плана", miss: "сверки не было", now: "идёт сейчас", future: "впереди" };
function rcCell(y, w, r, sel) {
  var st = reconStatus(y, w, r), d = r.diff[w];
  var txt = E.weekTitle(Number(y), w) + " — " + RS_TEXT[st] + (d !== null ? ": " + E.eur(rnd(d), { dec: 0, plus: true }) : "");
  return "<button class='rc " + st + (sel ? " sel" : "") + "' data-rw='" + w + "' data-tip='" + esc(txt) + "' data-cap='" + esc(txt) + "' aria-label='" + esc(txt) + "'></button>";
}
function reconCalendar(y, compact, selW) {
  var r = E.compute(state, y), cells = "";
  if (compact) {
    var now = (E.weekOfDate(E.todayISO()) || {}).idx, end = String(new Date().getFullYear()) === String(y) ? now : 59, from = Math.max(0, end - 15);
    for (var i = from; i <= end; i++) cells += rcCell(y, i, r, false);
    return "<div class='rc-strip'>" + cells + "</div>";
  }
  var head = E.MONTHS_SHORT.map(function (m) { return "<span>" + m + "</span>"; }).join("");
  for (var wim = 0; wim < 5; wim++) for (var m = 0; m < 12; m++) cells += rcCell(y, m * 5 + wim, r, m * 5 + wim === selW);
  var done = 0, miss = 0;
  for (var k = 0; k < 60; k++) { var t = reconStatus(y, k, r); if (t === "miss") miss++; else if (t !== "now" && t !== "future") done++; }
  return "<div class='rc-wrap'><div class='rc-head'>" + head + "</div><div class='rc-grid'>" + cells + "</div></div>" +
    "<div class='rc-cap small muted' id='rcCap'>" + (selW !== undefined ? esc(E.weekTitle(Number(y), selW) + " — " + RS_TEXT[reconStatus(y, selW, r)] + (r.diff[selW] !== null ? ": " + E.eur(rnd(r.diff[selW]), { dec: 0, plus: true }) : "")) : "") + "</div>" +
    "<div class='rc-legend small'><span class='rc-sc'><span>меньше</span><span class='rc-scale'>" + ["n4", "n3", "n2", "n1", "z", "p1", "p2", "p3"].map(function (c) { return "<i class='rc " + c + "'></i>"; }).join("") + "</span><span>больше плана</span></span>" +
    "<span class='rc-sep'><i class='rc miss'></i>пропущена</span><span class='muted'>сверок " + done + " · пропущено " + miss + "</span></div>";
}
function bindRecCal(y) {
  $main.querySelectorAll("[data-rw]").forEach(function (b) {
    b.addEventListener("mouseenter", function () { var c = document.getElementById("rcCap"); if (c) c.textContent = b.dataset.cap; });
    b.onclick = function () { ui.recWeek = { year: y, week: Number(b.dataset.rw) }; if (location.hash === "#recon") render(); else location.hash = "#recon"; };
  });
}
