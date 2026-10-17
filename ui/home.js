/* Easy Budget — экран «Главная» и календарь сверок. */
(function () {
  "use strict";
  // ===== ГЛАВНАЯ =====
  function greeting() { var h = new Date().getHours(); return h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер"; }

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
      var missed = 0; if (fw) for (var mi = fw.week; mi >= 0 && fr.fact[mi] === null; mi--) missed++;
      // незаконченная сверка — первым пунктом
      var rd = myState && myState.recDraft, rdk = rd ? rd.key.split(":") : null;
      if (rd) todo.unshift({ k: "warn", ic: "✓", h: (rd.editing ? "Правка сверки за " : "Сверка за ") + shortWeek(rdk[0], Number(rdk[1])) + " не закончена", p: "Остатки в черновике — в бюджете их пока нет. Открой и нажми «Завершить» или удали черновик.", act: "recdraft", rw: { year: rdk[0], week: Number(rdk[1]) } });
      if (fw && fr.fact[fw.week] === null && !(rd && rd.key === fw.year + ":" + fw.week)) todo.push({ ic: "✓", h: "Сверка за " + shortWeek(fw.year, fw.week), p: missed > 1 && missed < 60 ? "Не сверено недель: " + missed + ". Хватит сверить последнюю." : "Впиши остатки — пара минут.", act: "recon", rw: fw });
      else if (fw && fr.diff[fw.week] < state.settings.diffAlert) todo.push({ k: "warn", ic: "↗", h: "Расхождение " + eur(rnd(fr.diff[fw.week]), { dec: 0, plus: true }) + " за " + shortWeek(fw.year, fw.week),
        p: "Денег меньше, чем по плану. Найди в выписке крупную трату и внеси её.", act: "recon", rw: fw });
      var yrH = state.years[y], planEmpty = !(yrH.recurring || []).length && !Object.keys(yrH.entries || {}).some(function (k) { return Object.keys(yrH.entries[k]).length; });
      if (planEmpty) todo.unshift({ ic: "↻", h: "Заполнить план на " + y, p: "Начни с того, что повторяется: зарплата, аренда, подписки. Один раз — и суммы встанут во все недели.", act: "recurring" });
      var nLog = Us.toLogCount();
      if (nLog) todo.push({ ic: "⇄", h: nLog + " " + plural(nLog, "общая трата", "общие траты", "общих трат") + " не в личном плане", p: nLog === 1 ? "Внеси её в свой план одной кнопкой или отметь, что она там уже есть." : "Внеси их в свой план одной кнопкой или отметь, что уже есть.", act: "tolog" });
      if (!state.settings.reminder) todo.push({ setup: "напоминание о сверке", ic: "◷", h: "Поставить напоминание о сверке", p: Store.mode === "cloud" ? "Уведомление на телефон или событие в календаре раз в неделю — чтобы не забывать." : "Событие в календаре раз в неделю — чтобы не забывать.", act: "reminder" });
      else if (Store.mode === "cloud" && !state.settings.reminder.push && !state.settings.reminder.off && window.BudgetPush && window.BudgetPush.supported() && !reminderPushAsked()) todo.push({ setup: "напоминание уведомлением", ic: "◷", h: "Напоминание о сверке — уведомлением", p: "Теперь можно получать его прямо на телефон, а не только в календаре.", act: "reminder" });
      if (installHintNeeded()) todo.push({ setup: "значок на экране «Домой»", ic: "⊕", h: "Добавить Easy Budget на экран «Домой»", p: "Откроется как приложение, без адресной строки, и сможет присылать напоминания.", act: "install" });
      if (minV < 0) todo.push({ k: "warn", ic: "↗", h: "Самый низкий остаток — " + eur(rnd(minV), { dec: 0 }) + ", " + shortWeek(y, minW), p: "Остаток уходит в минус. Можно сдвинуть крупные траты или переложить из накоплений.", act: "year" });
      var fxm = missingFx();
      if (fxm.length) todo.push({ k: "warn", ic: "€", h: "Нет курса для " + fxm.map(function (x) { return x.cur; }).join(", "), p: "Общие траты в этих валютах не входят в итоги. Нажми — укажу, где вписать курс.", act: "fixfx" });
      var fxd = window.BudgetFx ? BudgetFx.drift(state.settings) : [];
      if (fxd.length) todo.push({ ic: "€", h: "Курс " + fxd.map(function (x) { return FX_SIGN[x.cur]; }).join(" и ") + " сдвинулся", p: "Было → сегодня, за\u00A01\u00A0€: " + fxd.map(function (x) { return FX_SIGN[x.cur] + "\u00A0" + fxNum(x.mine) + "\u00A0→\u00A0" + fxNum(x.now); }).join(" · ") + ". Нажми — поставлю сегодняшний.", act: "fx" });
      if (!sh) todo.push({ ic: "⇄", h: "Подключить общие траты", p: "Траты на двоих: кто сколько заплатил и кто кому должен, как в Splitwise.", act: "shared" });
      else {
        if (sh.partner && !sh.partner.userId && Store.mode === "cloud") todo.push({ ic: "✉", h: partnerName() + " ещё не вошла", p: "Пришли ей ссылку на сайт — пусть войдёт с " + (sh.partner.email || "своим email") + ", пространство подключится само.", act: "shared" });
        // долг в евро — от 50 €; в других валютах — любой ненулевой (их легко не заметить)
        var balAll = S.balance(sh.expenses), bal = balAll.EUR || 0, owe = function (v, cur) { return v > 0 ? partnerName() + " должна тебе " + E.fmt(v, { cur: cur }) : "Ты должна " + nameDative(partnerName()) + " " + E.fmt(-v, { cur: cur }); };
        var otherCur = Object.keys(balAll).filter(function (k) { return k !== "EUR" && Math.abs(balAll[k]) >= 1; });
        if (Math.abs(bal) >= 5000 || otherCur.length) todo.push({ ic: "€", h: Math.abs(bal) >= 5000 ? owe(bal, "€") : owe(balAll[otherCur[0]], curSign(otherCur[0])),
          p: (Math.abs(bal) >= 5000 ? otherCur : otherCur.slice(1)).map(function (k) { return "Ещё: " + owe(balAll[k], curSign(k)).replace(/^Ты/, "ты") + ". "; }).join("") + "Рассчитаться в «Мы».", act: "shared" });
      }
      var ny = String(Number(y) + 1);
      if (wk.month >= 10 && !state.years[ny]) todo.push({ ic: "▦", h: "Пора набросать план на " + ny, p: "Создай его на экране «Год» — регулярные траты перенесутся сами.", act: "year" });
      var lastFile = state.settings.lastFileBackupAt ? new Date(state.settings.lastFileBackupAt).getTime() : 0, daysFile = Math.floor((Date.now() - lastFile) / 864e5);
      if (daysFile >= 7 && state.settings.tourDone) todo.push({ setup: "бэкап в файл", ic: "⤓", h: "Сохранить бэкап в файл", p: (lastFile ? "Последний — " + daysFile + " дн. назад. " : "") + "Excel-файл со всем бюджетом: положи в iCloud или Google Drive — и данные у тебя, что бы ни случилось.", act: "backup" });
      if (!state.settings.tourDone) todo.push({ setup: "знакомство", ic: "?", h: "Пройти знакомство — 1 минута", p: "Что такое «в обращении», зачем сверка и где что лежит.", act: "tour" });
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

    // скрытые пункты: про конкретную неделю/месяц — навсегда, остальные — на неделю
    todo.sort(function (a, b) { return (b.act === "recdraft") - (a.act === "recdraft"); }); // незаконченная сверка — всегда первой
    var hid = state.settings.todoHidden || {}, tNow = E.todayISO();
    todo.forEach(function (x) { x.key = x.act + (x.rw ? ":" + x.rw.year + ":" + x.rw.week : "") + (x.act === "month" && due ? ":" + due.key : ""); });
    todo = todo.filter(function (x) { var u = hid[x.key]; return !u || (u !== "forever" && u <= tNow); });
    // настройка (напоминание, «Домой», бэкап, знакомство) — одним пунктом в конце: в «Что сделать» остаются деньги
    var setupTodo = todo.filter(function (x) { return x.setup; });
    if (setupTodo.length > 1) {
      var sNames = setupTodo.map(function (x) { return x.setup; }), su = hid.setup;
      todo = todo.filter(function (x) { return !x.setup; });
      if (!su || (su !== "forever" && su <= tNow)) todo.push({ ic: "⚙\uFE0E", h: "Настроить до конца · " + setupTodo.length + " " + plural(setupTodo.length, "пункт", "пункта", "пунктов"),
        p: sNames[0].charAt(0).toUpperCase() + sNames[0].slice(1) + ", " + sNames.slice(1).join(", ") + " — по минуте на каждый.", act: "setup", key: "setup" });
    }
    var todoShown = ui.todoAll ? todo : todo.slice(0, 4);

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
    var qb = function (key, label) { return tpl("<button type='button' class='q-btn' data-explain='{k}' aria-label='{l}'>?</button>", { k: key, l: label }); };

    var html = tpl("<div class='home{c}'>", { c: ui.homeSeen ? " static" : "" }); ui.homeSeen = true;
    html += tpl("<header class='home-head'><div class='home-top'><div class='home-date'>{d}{s}</div>", { d: dateLine, s: ui.syncAt ? " · обновлено в " + ui.syncAt : "" }) +
      "<div class='home-act'><button type='button' class='icon-btn sync' data-sync id='homeSync' aria-label='Обновить'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'><path d='M20 11a8 8 0 1 0-2.3 5.7'/><path d='M20 4v7h-7'/></svg><i class='sync-dot' aria-hidden='true'></i></button>" +
      "<a class='icon-btn' href='#settings' aria-label='Настройки'><svg width='19' height='19' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'/></svg></a></div></div>" +
      tpl("<h1>{g}{n}</h1></header>", { g: greeting(), n: name && !ro ? ", " + name : "" });

    // главный блок
    var ok = minV >= 0;
    html += tpl("<section class='hero card'><div class='hero-main'><div class='hero-label'>В обращении на {to}{!qObr}</div>" +
      "<button class='hero-value' data-ob='1' title='Из чего складывается'>{obr}</button>" +
      "<div class='hero-status {st}'><span class='dot'></span>Самый низкий остаток — {min}</div>" +
      "<div class='hero-min'>{minW}, если всё пойдёт по плану<br>{by} · <button class='linkish' data-ob='1'>из чего складывается</button></div></div>" +
      "<div class='hero-side'><div class='hero-label'>Капитал на {to}{!qCap}</div><button type='button' class='hero-cap' data-capb='1' title='Из чего складывается'>{cap}</button>" +
      "<div class='hero-dcap'>{!dcap} с начала {mon}</div><div class='hero-chart'>{!spark}</div></div></section>", {
        qObr: qb("obr", "Что такое «в обращении»"), to: dayGen(wk.to), obr: eur(rnd(r.base[w]), { dec: 0 }), st: ok ? "good" : "bad", min: eur(rnd(minV), { dec: 0 }), minW: shortWeek(y, minW),
        by: r.fact[w] === null ? (lastRec >= 0 ? "По сверке " + shortWeek(y, lastRec) : "По плану, сверок ещё не было") : "По сверке этой недели",
        qCap: qb("cap", "Что такое капитал"), cap: eur(rnd(r.cap[w]), { dec: 0 }), dcap: trendHtml(dCap), mon: E.MONTHS_GEN[wk.month - 1], spark: spark(r.cap, w, y) });

    var hasCash = !!(state.cash && state.cash.pockets && state.cash.pockets.length) || !ro; // карточка налички есть всегда (пустая — «завести»)
    html += tpl("<div class='home-grid hg{a}{b}'>", { a: ro ? " hg-notodo" : "", b: hasCash ? "" : " hg-nocash" });
    // дела
    // пункты «Что сделать» — обычный текст (h, p), экранируется здесь
    if (!ro) html += tpl("<section class='card a-todo'><h2>Что сделать</h2>{!list}" +
      "</section>", {
        list: todo.length ? "<ul class='todo-list'>" + todoShown.map(function (x, j) {
          return tpl("<li class='{k}'><button type='button' class='td-main' data-todo='{j}'><span class='ic' aria-hidden='true'>{ic}</span><span class='tx'><b>{h}</b><span>{p}</span></span><span class='arr' aria-hidden='true'>›</span></button><button type='button' class='td-hide' data-tdhide='{j}' aria-label='Скрыть «{h}»' title='Скрыть'>×</button></li>", { k: x.k || "", j: j, ic: x.ic, h: x.h, p: x.p });
        }).join("") + "</ul>" + (todo.length > 4 ? tpl("<button type='button' class='btn ghost sm more' id='todoAll'>{t}</button>", { t: ui.todoAll ? "Свернуть" : "Ещё " + (todo.length - 4) }) : "")
          : "<p class='all-good'><span class='ic'>✓</span>Всё сделано. Можно ничего не трогать до следующей недели.</p>" });

    // сверки — своя карточка рядом с «Наличкой»: история и точность плана, а не дело (задача «Сверка за …» — в «Что сделать»)
    if (!ro) {
      var recLast = -1; for (var ri = w; ri >= 0; ri--) if (r.fact[ri] !== null) { recLast = ri; break; }
      html += tpl("<section class='card a-recon'><div class='ar-head'><small>Сверки</small><b>{last}</b></div><div class='rc-row' role='link' tabindex='0' id='rcRow' aria-label='Открыть сверку'><span class='rc-l'>Сверки</span>{!cal}<span class='rc-go' aria-hidden='true'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M9 6l6 6-6 6'/></svg></span></div><div class='rc-mini-leg small' aria-hidden='true'><span><i class='rc p2'></i>больше плана</span><span><i class='rc n2'></i>меньше</span><span><i class='rc miss'></i>не было</span></div></section>", {
        cal: reconCalendar(y, true),
        last: recLast >= 0 ? "Последняя — " + shortWeek(y, recLast) + ", " + RS_TEXT[reconStatus(y, recLast, r)] : "Сверок ещё не было" });
    }

    // наличка: карманы и вход в историю
    var cs = state.cash;
    if (cs && cs.pockets && cs.pockets.length) {
      var cb = K.balances(cs, Cash.cashLines()), cps = cs.pockets.filter(function (p) { return !p.archived; }).sort(function (a, b) { return a.sort - b.sort; });
      html += tpl("<a class='card a-cash' href='#cash'><span class='cc-tx'><span class='cc-sum'><small>Наличка</small><b>{tot}</b></span><span class='small muted cc-line'>{line}</span>" +
        "<span class='cc-tiles'>{!tiles}</span><span class='cc-more'>История и карманы ›</span></span><span class='arr'>›</span></a>", {
          tot: eur(Cash.cashEurTotal(), { dec: 0 }),
          line: cps.slice(0, 3).map(function (p) { return p.name + ": " + E.fmt(cb[p.id] || 0, { cur: Cash.pocketCur(p.id), dec: 0 }); }).join(" · ") + (cps.length > 3 ? " · ещё " + (cps.length - 3) : ""),
          tiles: cps.slice(0, 4).map(function (p) { return tpl("<span class='cc-tile'><small>{n}</small><b>{v}</b></span>", { n: p.name, v: E.fmt(cb[p.id] || 0, { cur: Cash.pocketCur(p.id), dec: 0 }) }); }).join("") });
    } else if (!ro) {
      // учёт налички ещё не начат — вход в раздел, иначе его не найти
      html += "<a class='card a-cash a-cash-new' href='#cash'><span class='cc-tx'><span class='cc-sum'><small>Наличка</small><b class='cc-new'>Завести кошелёк и конверты</b></span>" +
        "<span class='small muted cc-line'>Сколько где лежит наличными — минута, чтобы начать</span><span class='cc-more'>Начать ›</span></span><span class='arr'>›</span></a>";
    }

    // последнее внесённое — вход в «История записей» с Главной (иначе его не найти)
    function lastLoggedHtml() {
      if (ro) return "";
      var all = [];
      Object.keys(state.years).forEach(function (yy) { (state.years[yy].log || []).forEach(function (l) { all.push(l); }); });
      if (!all.length) return "<a class='wk-log' href='#log'><span class='muted'>История записей</span><span class='wk-log-all'>все ›</span></a>";
      var l = all.sort(function (p, q) { return (q.ts || 0) - (p.ts || 0); })[0], c = state.categories.find(function (x) { return x.id === l.cat; });
      return tpl("<a class='wk-log' href='#log'><span><span class='muted'>Внесла {d}:</span> {n} <b class='wk-log-v'>{v}</b></span><span class='wk-log-all'>все ›</span></a>", {
        n: l.note || (c ? c.name : ""), v: eur(Math.abs(l.cents), { dec: Math.abs(l.cents) % 100 ? 2 : 0 }), d: l.date === E.todayISO() ? "сегодня" : dayGen(l.date) });
    }
    // неделя
    var open = !!ui.homeWeekOpen, shown = open ? items : items.slice(0, 5);
    html += tpl("<section class='card a-week'><div class='wk-head'><button type='button' class='round-btn' data-hw='-1' aria-label='Предыдущая неделя'>‹</button>" +
      "<div class='wk-title'><h2>Неделя {wk}</h2><div class='small muted'>{sum}</div></div><button type='button' class='round-btn' data-hw='1' aria-label='Следующая неделя'>›</button></div>{!list}{!more}{!last}</section>", {
        wk: shortWeek(y, hw), last: lastLoggedHtml(), sum: [tin ? "доходы " + eur(tin, { dec: 0 }) : "", tout ? "расходы " + eur(-tout, { dec: 0 }) : ""].filter(Boolean).join(" · "),
        list: items.length ? "<ul class='plan-list'>" + shown.map(function (x) {
          return tpl("<li><span class='name'>{n}</span><span class='val {c}'>{v}</span></li>", { n: x.c.name, c: tone(x.cell.cents), v: E.fmt(x.cell.cents, { cur: cur(x.c), dec: 0 }) });
        }).join("") + "</ul>" : "<p class='empty'>На эту неделю ничего не запланировано.</p>",
        more: items.length > 5 && !open ? tpl("<button type='button' class='btn ghost sm more' id='hwMore'>Ещё {n} · показать всю неделю</button>", { n: items.length - 5 }) : "" });

    // месяц
    var monthName = E.MONTHS[wk.month - 1];
    html += tpl("<section class='card a-month'><div class='row'><h2 style='margin:0'>{m}</h2><span class='spacer'></span><span class='small muted'>неделя {wim} из 5</span></div>" +
      "<div class='month-bar' aria-hidden='true'>{!bar}</div><div class='kv'><span>Доходы</span><b class='pos'>{inc}</b></div><div class='kv'><span>Расходы</span><b>{tot}</b></div>" +
      "<div class='kv'><span>Переводы в накопления</span><b>{sav}</b></div><button class='btn ghost sm more' data-go='year'>весь год ›</button></section>", {
        m: monthName[0].toUpperCase() + monthName.slice(1), wim: wk.wim, inc: eur(rnd(mon.income), { dec: 0 }), tot: eur(rnd(mon.total), { dec: 0 }), sav: eur(rnd(mon.saved), { dec: 0 }),
        bar: [1, 2, 3, 4, 5].map(function (n) { return tpl("<span class='{c}'></span>", { c: n < wk.wim ? "past" : n === wk.wim ? "now" : "" }); }).join("") });
    html += "</div>";

    html += "<p class='home-help small muted'>Впервые здесь или что-то непонятно? <a href='#help'>Как это работает</a></p></div>";
    $main.innerHTML = html;

    $main.querySelectorAll("[data-hw]").forEach(function (b) { b.onclick = function () { ui.homeWeekOff = (ui.homeWeekOff || 0) + Number(b.dataset.hw); ui.homeWeekOpen = false; render(); }; });
    var hm = $main.querySelector("#hwMore"); if (hm) hm.onclick = function () { ui.homeWeekOpen = true; render(); };
    function monthModal() {
      var nb = ms.numbers, mn = E.MONTHS[due.month];
      var li = function (z, mk, h, p) { return tpl("<li class='{z}'><span class='mk' aria-hidden='true'>{mk}</span><span><b>{h}</b>{p}</span></li>", { z: z, mk: mk, h: h, p: p ? " " + p : "" }); };
      modal(tpl("<div class='m-body month-sum'><h2>Итог месяца: {mn}</h2>{!plan}<div class='ms-nums'><div><span class='muted small'>доходы</span><b class='pos'>{inc}</b></div><div><span class='muted small'>расходы</span><b>{tot}</b></div>" +
        "<div><span class='muted small'>осталось</span><b>{!net}</b></div><div><span class='muted small'>капитал</span><b>{!cap}</b></div></div><ul>{!items}</ul></div>" +
        "<div class='m-foot'><a class='btn ghost' href='#insights'>Все выводы</a><button class='btn primary' data-act='seen'>Прочитано</button></div>", {
          mn: mn, plan: due.recon ? "" : "<p class='small muted' style='margin:0'>Без сверки в конце месяца — цифры по плану.</p>",
          inc: eur(rnd(nb.income), { dec: 0 }), tot: eur(rnd(nb.total), { dec: 0 }), net: trendHtml(nb.net), cap: nb.dcap === null ? "—" : trendHtml(nb.dcap),
          items: ms.good.map(function (c) { return li("good", "✓", c.h, c.p); }).join("") + ms.improve.map(function (c) { return li("improve", "↗", c.h, c.p); }).join("") + (ms.next ? li("next", "→", ms.next, "") : "") }), function (m) {
        m.querySelector("[data-act=seen]").onclick = function () { state.settings.monthSeen = due.key; closeModal(); changed(); };
      });
    }
    $main.querySelectorAll("[data-go]").forEach(function (el) { el.onclick = function () { ui.year = y; ui.week = el.dataset.gw ? Number(el.dataset.gw) : w; go("#" + el.dataset.go); }; });
    $main.querySelectorAll("[data-tdhide]").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var x = todoShown[Number(b.dataset.tdhide)], forever = /:/.test(x.key);
        state.settings.todoHidden = state.settings.todoHidden || {};
        state.settings.todoHidden[x.key] = forever ? "forever" : E.addDays(E.todayISO(), 7);
        changed(false, "Пункт скрыт"); toast(forever ? "Скрыто" : "Скрыто на неделю");
      };
    });
    var ta = $main.querySelector("#todoAll"); if (ta) ta.onclick = function () { ui.todoAll = !ui.todoAll; render(); };
    function setupModal() {
      modal(tpl("<div class='m-body'><h2>Настроить до конца</h2><ul class='todo-list'>{!list}</ul></div>", {
        list: setupTodo.map(function (x, j) { return tpl("<li><button type='button' class='td-main' data-su='{j}'><span class='ic' aria-hidden='true'>{ic}</span><span class='tx'><b>{h}</b><span>{p}</span></span><span class='arr' aria-hidden='true'>›</span></button></li>", { j: j, ic: x.ic, h: x.h, p: x.p }); }).join("") }), function (m) {
        m.querySelectorAll("[data-su]").forEach(function (b) { b.onclick = function () { closeModal(); runTodo(setupTodo[Number(b.dataset.su)]); }; });
      });
    }
    $main.querySelectorAll("[data-todo]").forEach(function (el) {
      el.onclick = function () { runTodo(todoShown[Number(el.dataset.todo)]); };
    });
    function runTodo(td) {
        var a = td.act;
        if (a === "setup") return setupModal();
        if (a === "tour") return Help.showTour(0);
        if (a === "month") return monthModal();
        if (a === "reminder") { try { localStorage.setItem("eb:pushAsked", "1"); } catch (e) { /* ок */ } return reminderModal(); }
        if (a === "install") return installModal();
        if (a === "fx") { applyFx(); return render(); }
        if (a === "fixfx") return go("#settings", function () { ui.setSec = "money"; render(); window.scrollTo(0, 0); });
        if (a === "backup") { Settings.backupDownload(); return render(); }
        if (a === "recdraft") { ui.recWeek = td.rw; ui.recStep = 2; return go("#recon"); }
        if (a === "recon") ui.recWeek = td.rw || { year: y, week: w };
        ui.year = y; ui.week = w; go("#" + a);
    }
    var hs = $main.querySelector("#homeSync"); if (hs) hs.onclick = refreshAll;
    // вся строка — в Сверку текущей недели (кубики здесь только показывают, в старые сверки не уводят)
    // вся карточка «Сверки» ведёт в сверку (как «Наличка»); с клавиатуры — строка с квадратами (role=link)
    var rr = $main.querySelector("#rcRow"), rcCard = $main.querySelector(".a-recon"), openRec = function () { ui.recWeek = null; ui.recStep = null; go("#recon"); };
    if (rcCard) rcCard.onclick = openRec;
    if (rr) rr.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRec(); } };
    $main.querySelectorAll("[data-q]").forEach(function (el) {
      el.onclick = function () {
        var q = el.dataset.q; ui.year = y; ui.week = w;
        if (q === "spend") spendModal();
        else if (q === "shared") go("#shared", function () { var b = document.getElementById("addExpBtn"); if (b) b.click(); });
        else if (q === "cash") go("#cash", function () { var i = document.querySelector("#cashQ [name=q]"); if (i) { i.scrollIntoView({ block: "center" }); i.focus(); } });
        else { ui.recWeek = finishedWeek() || { year: y, week: w }; go("#recon"); }
      };
    });
    $main.querySelectorAll("[data-explain]").forEach(function (el) { el.onclick = function () { Help.explain(el.dataset.explain); }; });
    $main.querySelectorAll("[data-ob]").forEach(function (b) { b.onclick = function () { Us.obrBreakdown(y, w); }; });
    $main.querySelectorAll("[data-capb]").forEach(function (b) { b.onclick = function () { Us.capBreakdown(y, w); }; });
    if (!ro && !state.settings.tourDone && !ui.tourShown) { ui.tourShown = true; setTimeout(function () { Help.showTour(0); }, 350); }
  };

  // капитал за год: линия по неделям, прошлое — сплошной, план — пунктиром
  function spark(vals, now, y) {
    var W = 320, H = 84, lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || 1;
    var X = function (i) { return (i / 59) * W; }, Y = function (v) { return 6 + (H - 12) * (1 - (v - lo) / span); };
    var pts = vals.map(function (v, i) { return X(i).toFixed(1) + "," + Y(v).toFixed(1); });
    var past = "M" + pts.slice(0, now + 1).join("L"), fut = "M" + pts.slice(now).join("L");
    var area = past + "L" + X(now).toFixed(1) + "," + H + "L0," + H + "Z";
    return tpl("<svg viewBox='0 0 {W} {H}' preserveAspectRatio='none' class='spark' role='img' aria-label='Капитал за {y}'>" +
      "<path d='{area}' fill='var(--accent)' opacity='.1'/><path d='{fut}' fill='none' stroke='var(--accent)' stroke-width='1.6' stroke-dasharray='3 4' opacity='.55' vector-effect='non-scaling-stroke'/>" +
      "<path d='{past}' fill='none' stroke='var(--accent)' stroke-width='2' vector-effect='non-scaling-stroke' stroke-linejoin='round'/></svg>" +
      "<span class='spark-dot' style='left:{l}%;top:{t}%'></span><div class='spark-axis'><span>янв</span><span>сейчас — дальше план</span><span>дек</span></div>", {
        W: W, H: H, y: y, area: area, fut: fut, past: past, l: (now / 59 * 100).toFixed(2), t: (Y(vals[now]) / H * 100).toFixed(2) });
  }


  // ===== КАЛЕНДАРЬ СВЕРОК =====
  // Цвет — по размеру расхождения, плавно: красный тем гуще, чем сильнее минус; зелёный — чем сильнее плюс
  function reconStatus(y, w, r) {
    if (r.fact[w] !== null) {
      var lim = Math.abs(state.settings.diffAlert || -5000) || 5000, t = r.diff[w] / lim;
      return t <= -6 ? "n4" : t <= -3 ? "n3" : t <= -1 ? "n2" : t < -0.3 ? "n1" : t <= 0.3 ? "z" : t <= 1 ? "p1" : t <= 3 ? "p2" : "p3";
    }
    if (draftOf(y, w)) return "draft";
    if (isNow(y, w)) return "now";
    return weekDone(y, w) ? "miss" : "future";
  }
  var RS_TEXT = { n4: "сильно меньше плана", n3: "заметно меньше плана", n2: "меньше плана — за порогом", n1: "чуть меньше плана", z: "точно по плану",
    p1: "чуть больше плана", p2: "больше плана", p3: "сильно больше плана", miss: "сверки не было", draft: "сверка не закончена", now: "идёт сейчас", future: "впереди" };
  function rcCell(y, w, r, sel) {
    var st = reconStatus(y, w, r), d = r.diff[w];
    var txt = E.weekTitle(Number(y), w) + " — " + RS_TEXT[st] + (d !== null ? ": " + E.eur(rnd(d), { dec: 0, plus: true }) : "");
    return tpl("<button class='rc {st}{sel}' data-rw='{w}' data-tip='{t}' data-cap='{t}' aria-label='{t}'></button>", { st: st, sel: sel ? " sel" : "", w: w, t: txt });
  }
  function reconCalendar(y, compact, selW) {
    var r = E.compute(state, y), cells = "";
    if (compact) {
      var now = (E.weekOfDate(E.todayISO()) || {}).idx, end = String(new Date().getFullYear()) === String(y) ? now : 59, from = Math.max(0, end - 19); // до 20 недель: строка заполняется, лишние прячет CSS
      for (var i = end; i >= from; i--) cells += rcCell(y, i, r, false); // новые первыми: полоска идёт справа налево
      return tpl("<div class='rc-strip'>{!cells}</div>", { cells: cells });
    }
    var head = E.MONTHS_SHORT.map(function (m) { return tpl("<span>{m}</span>", { m: m }); }).join("");
    for (var wim = 0; wim < 5; wim++) for (var m = 0; m < 12; m++) cells += rcCell(y, m * 5 + wim, r, m * 5 + wim === selW);
    var done = 0, miss = 0;
    for (var k = 0; k < 60; k++) { var t = reconStatus(y, k, r); if (t === "miss") miss++; else if (t !== "now" && t !== "future" && t !== "draft") done++; }
    return tpl("<div class='rc-wrap'><div class='rc-head'>{!head}</div><div class='rc-grid'>{!cells}</div></div><div class='rc-cap small muted' id='rcCap'>{cap}</div>" +
      "<div class='rc-legend small'><span class='rc-sc'><span>меньше</span><span class='rc-scale'>{!scale}</span><span>больше плана</span></span>" +
      "<span class='rc-sep'><i class='rc miss'></i>пропущена</span><span class='muted'>сверок {done} · пропущено {miss}</span></div>", {
        head: head, cells: cells, done: done, miss: miss,
        cap: selW !== undefined ? E.weekTitle(Number(y), selW) + " — " + RS_TEXT[reconStatus(y, selW, r)] + (r.diff[selW] !== null ? ": " + E.eur(rnd(r.diff[selW]), { dec: 0, plus: true }) : "") : "",
        scale: ["n4", "n3", "n2", "n1", "z", "p1", "p2", "p3"].map(function (c) { return tpl("<i class='rc {c}'></i>", { c: c }); }).join("") });
  }

  // для других экранов — только это; остальное внутри модуля
  window.Home = { reconStatus: reconStatus, RS_TEXT: RS_TEXT, reconCalendar: reconCalendar };
})();
