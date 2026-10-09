/* Easy Budget — выводы по методу ANALYSIS_METHOD.md: критерии, зоны и порядок «бутерброд».
   Чистые функции без DOM: работают в браузере и в тестах. Тексты — по TONE_OF_VOICE.md.
   Карточка: { id, ic, h, p, rank, act?, actLabel?, next? } — rank: меньше = важнее. */
(function (root) {
  "use strict";
  var E = root.BudgetEngine;

  // ---------- форматирование ----------
  function r100(c) { return Math.round(c / 100) * 100; }
  function eur(c) { return E.eur(r100(c), { dec: 0 }); }
  function eurP(c) { return E.eur(r100(c), { dec: 0, plus: true }); }
  function pct(x) { var v = Math.round(x * 100); return (v < 0 ? "−" : "") + Math.abs(v) + "%"; }
  function months1(n) { var v = Math.round(n * 10) / 10; return String(v).replace(".", ","); }
  function plural(n, a, b, c) { n = Math.abs(n) % 100; var n1 = n % 10; return n > 10 && n < 20 ? c : n1 > 1 && n1 < 5 ? b : n1 === 1 ? a : c; }
  function monthsWord(n) { var v = Math.round(n * 10) / 10; return v % 1 ? "месяца" : plural(v, "месяц", "месяца", "месяцев"); } // «6,1 месяца», «6 месяцев»
  function ago(d) { return d <= 0 ? "сегодня" : d === 1 ? "вчера" : d + " " + plural(d, "день", "дня", "дней") + " назад"; }
  function mName(i) { return E.MONTHS[i]; }
  function mIn(i) { return E.MONTHS[i].replace(/ь$/, "е").replace(/й$/, "е").replace(/т$/, "те"); } // «в октябре»
  function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function list(arr) { // «июль и октябрь»; если в названии уже есть «и» — через запятую
    if (arr.length < 2) return arr.join("");
    return arr.some(function (x) { return / и /.test(x); }) ? arr.join(", ") : arr.slice(0, -1).join(", ") + " и " + arr[arr.length - 1];
  }

  // ---------- «на радость»: флажок категории, по умолчанию — по названию ----------
  var JOY_RE = /развлеч|путеш|одежд|шопинг|уход|красот|beauty|skin|концерт|спорт|танц|хобби|кино|театр|ресторан|кафе/i;
  function isJoy(c) { return c.joy !== undefined ? !!c.joy : (c.block !== "income" && c.block !== "savings" && JOY_RE.test(c.name)); }
  var SPEND_BLOCKS = { base: 1, periodic: 1, subs_es: 1, subs_ru: 1 };

  // траты категории по месяцам (в €, плюсом), для любого года
  function catMonthly(state, year) {
    var r = E.compute(state, year), rate = state.settings.rate || 1, out = {};
    if (!r) return out;
    state.categories.forEach(function (c) {
      var arr = new Array(12).fill(0), cells = r.cells[c.id] || [];
      for (var w = 0; w < 60; w++) { var x = cells[w]; if (x) arr[Math.floor(w / 5)] += (c.currency === "RUB" ? x.cents / rate : x.cents); }
      out[c.id] = c.block === "income" ? arr : arr.map(function (v) { return -v; });
    });
    return out;
  }
  function sum(arr, from, to) { var s = 0; for (var i = from; i < to; i++) s += arr[i] || 0; return s; }

  // где мы во времени относительно года
  function when(year, today) {
    var wk = E.weekOfDate(today), y = Number(year), ty = Number(today.slice(0, 4));
    if (y === ty && wk) { var m = Math.floor(wk.idx / 5); return { cur: true, wNow: wk.idx, curM: m, done: m, plan: m === 0 }; }
    if (y < ty) return { cur: false, wNow: 59, curM: 11, done: 12, plan: false };
    return { cur: false, wNow: 0, curM: 0, done: 12, plan: true }; // будущий год — по плану целиком
  }
  function periodLabel(t, year) { return t.plan ? "по плану " + year : t.cur ? "за " + t.done + " " + plural(t.done, "месяц", "месяца", "месяцев") : "за " + year; }

  // средние расходы в месяц за последние 12 завершённых месяцев (этот и прошлый год)
  function avgMonthly(state, year, t) {
    var vals = [], mon = E.monthly(state, year), prev = state.years[String(Number(year) - 1)] ? E.monthly(state, String(Number(year) - 1)) : null;
    var upto = t.plan ? 12 : t.done;
    for (var i = upto - 1; i >= 0 && vals.length < 12; i--) vals.push(mon.months[i].total);
    if (prev) for (var j = 11; j >= 0 && vals.length < 12; j--) if (prev.months[j].total > 0) vals.push(prev.months[j].total);
    vals = vals.filter(function (v) { return v > 0; });
    return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
  }

  // =====================================================================
  // Личные выводы за год
  // =====================================================================
  function personal(state, year, ctx) {
    ctx = ctx || {};
    var today = ctx.today || E.todayISO(), t = when(year, today), Y = String(year), prevY = String(Number(year) - 1);
    var good = [], improve = [], info = [];
    var r = E.compute(state, Y), mon = E.monthly(state, Y), hasPrev = !!state.years[prevY];
    var pmon = hasPrev ? E.monthly(state, prevY) : null;
    var n = t.plan ? 12 : t.done, period = periodLabel(t, Y);
    function tot(m, key, from, to) { var s = 0; for (var i = from; i < to; i++) s += m.months[i][key] || 0; return s; }
    var inc = tot(mon, "income", 0, n), spend = tot(mon, "total", 0, n), mand = tot(mon, "mandatory", 0, n), living = tot(mon, "living", 0, n);
    var avgM = avgMonthly(state, Y, t);

    // --- капитал ---
    var capNow = null, capStart = r && r.startCap !== undefined ? r.startCap : null;
    if (r && !r.archived) capNow = t.cur ? r.cap[t.wNow] : mon.total.cap;
    if (capNow !== null && capStart !== null && !t.plan) {
      var dCap = capNow - capStart;
      if (dCap >= 10000) good.push({ id: "cap", ic: "◆", rank: 1, h: "Капитал " + (t.cur ? "с начала года" : "за " + Y) + " " + eurP(dCap), p: (t.cur ? "Сейчас" : "На конец года") + " " + eur(capNow) + " — все твои деньги вместе." });
      var m1 = n - 1, m2 = n - 2;
      if (m2 >= 0 && mon.months[m1].dcap !== null && mon.months[m2].dcap !== null && mon.months[m1].dcap < 0 && mon.months[m2].dcap < 0)
        improve.push({ id: "capdown", ic: "↘", rank: 12, h: "Капитал снижается второй месяц подряд", p: mName(m2) + " " + eurP(mon.months[m2].dcap) + ", " + mName(m1) + " " + eurP(mon.months[m1].dcap) + ". Стоит посмотреть, какие траты были крупнее обычного.", act: "analysis", actLabel: "Открыть анализ" });
    }

    // --- доля сбережений ---
    if (inc > 0) {
      var rate = (inc - spend) / inc;
      var prevRate = null;
      if (pmon) { var pi = tot(pmon, "income", 0, n), ps = tot(pmon, "total", 0, n); if (pi > 0) prevRate = (pi - ps) / pi; }
      if (rate >= 0.1) good.push({ id: "rate", ic: "↑", rank: 2, h: "Откладываешь " + pct(rate) + " доходов" + (rate >= 0.2 ? " — отлично" : ""), p: eur(inc - spend) + " " + period + ". " + (rate >= 0.2 ? "Это выше ориентира 10–20%." : "Это в ориентире 10–20%.") });
      else if (rate < 0) improve.push({ id: "rate", ic: "↗", rank: 3, h: "Расходы больше доходов на " + eur(spend - inc), p: cap1(period) + " ушло " + eur(spend) + " при доходах " + eur(inc) + ". Можно посмотреть, что из крупного сдвинуть на потом.", act: "year", actLabel: "Открыть год", next: "Сдвинь одну крупную трату на потом — и год выйдет в плюс." });
      else info.push({ id: "rate", ic: "↑", rank: 30, h: "Откладываешь " + pct(rate) + " доходов", p: "Ориентир — 10–20%. " + eur(inc - spend) + " " + period + "." });
      if (prevRate !== null && rate >= 0 && prevRate - rate >= 0.1) improve.push({ id: "ratedrop", ic: "↘", rank: 9, h: "Доля сбережений ниже прошлого года: " + pct(rate) + " против " + pct(prevRate), p: "За те же месяцы " + prevY + " оставалось больше. Чаще всего это рост пары категорий — они ниже в выводах." });
    }

    // --- запас ---
    if (capNow !== null && avgM > 0) {
      var res = capNow / avgM;
      if (res >= 6) good.push({ id: "reserve", ic: "◎", rank: 3, h: "Запас — " + months1(res) + " " + monthsWord(res) + " расходов", p: "Цель — 6 месяцев, и она выполнена. Это спокойствие на случай, если доход просядет.", gloss: "reserve" });
      else if (res < 3) improve.push({ id: "reserve", ic: "◎", rank: 2, h: "Запас — " + months1(res) + " " + monthsWord(res) + " расходов", p: "Ориентир — 3–6 месяцев, наша цель — 6. Можно откладывать понемногу каждый месяц.", gloss: "reserve", next: "Откладывай по " + eur(avgM * (6 - res) / 12) + " в месяц — через год запас будет 6 месяцев." });
      else info.push({ id: "reserve", ic: "◎", rank: 31, h: "Запас — " + months1(res) + " " + monthsWord(res) + " расходов", p: "Копишь к цели 6 месяцев: осталось " + eur(avgM * (6 - res)) + ".", gloss: "reserve" });
    }

    // --- остаток впереди и деньги без процента (только текущий год) ---
    if (t.cur && r && !r.archived && avgM > 0) {
      var minV = Infinity, minW = t.wNow;
      for (var i = t.wNow; i < 60; i++) if (r.base[i] < minV) { minV = r.base[i]; minW = i; }
      var wkTitle = E.weekTitle(Number(Y), minW);
      if (minV < 0) improve.push({ id: "low", ic: "↗", rank: 0, h: "Остаток уйдёт в минус: " + eur(minV) + ", " + wkTitle, p: "Если всё пойдёт по плану. Можно сдвинуть крупную трату или переложить из накоплений.", act: "year", actLabel: "Открыть год", next: "Сдвинь крупную трату с " + wkTitle + " — и остаток не уйдёт в минус." });
      else if (minV < avgM) improve.push({ id: "low", ic: "↗", rank: 1, h: "Самый низкий остаток — " + eur(minV) + ", " + wkTitle, p: "Это меньше месяца расходов. Можно заранее сдвинуть крупную трату.", act: "year", actLabel: "Открыть год" });
      else info.push({ id: "low", ic: "✓", rank: 32, h: "Самый низкий остаток впереди — " + eur(minV), p: wkTitle + ", если всё пойдёт по плану. Это больше месяца расходов." });
      var obrNow = r.base[t.wNow];
      if (obrNow > avgM * 3) improve.push({ id: "idle", ic: "%", rank: 14, h: "В обращении " + eur(obrNow) + " — " + months1(obrNow / avgM) + " " + monthsWord(obrNow / avgM) + " расходов", p: "На каждый день хватит и двух-трёх. Около " + eur(obrNow - avgM * 3) + " можно положить под процент — капитал от этого не уменьшится.", next: "Переложи " + eur(obrNow - avgM * 3) + " на счёт с процентом — это плюс к капиталу без усилий." });
    }

    // --- сверки (текущий год) ---
    if (t.cur && r && !r.archived) {
      var finished = [];
      for (var w = 0; w < t.wNow; w++) if (r.weeks[w].to < today) finished.push(w);
      var last13 = finished.slice(-13), doneN = last13.filter(function (x) { return r.fact[x] !== null; }).length;
      var miss = 0; for (var k = finished.length - 1; k >= 0 && r.fact[finished[k]] === null; k--) miss++;
      var streak = 0; for (var k2 = finished.length - 1; k2 >= 0 && r.fact[finished[k2]] !== null; k2--) streak++;
      if (miss >= 2) improve.push({ id: "recon", ic: "✓", rank: 8, h: "Сверки не было " + miss + " " + plural(miss, "неделю", "недели", "недель"), p: "Десять минут — и план снова совпадёт с жизнью. Достаточно вписать остатки на сегодня.", act: "recon", actLabel: "Сделать сверку" });
      else if (last13.length >= 4 && (doneN / last13.length >= 0.75 || streak >= 4)) good.push({ id: "recon", ic: "✓", rank: 5, h: streak >= 4 ? "Сверки " + streak + " " + plural(streak, "неделю", "недели", "недель") + " подряд" : "Сверки — " + doneN + " из " + last13.length + " недель", p: "План держится на реальных остатках, поэтому ему можно доверять." });
      var diffs = finished.filter(function (x) { return r.diff[x] !== null; }).slice(-8);
      if (diffs.length >= 3) {
        var mean = diffs.reduce(function (a, x) { return a + Math.abs(r.diff[x]); }, 0) / diffs.length;
        var lvl = Math.max(1, r.base[t.wNow]);
        if (mean <= lvl * 0.02) good.push({ id: "accuracy", ic: "≈", rank: 6, h: "План точный: расхождение в среднем " + eur(mean), p: "Это меньше 2% от денег в обращении. До цента и не нужно :)" });
        else if (mean > lvl * 0.05) improve.push({ id: "accuracy", ic: "≈", rank: 11, h: "План расходится с жизнью в среднем на " + eur(mean), p: "Возможно, какая-то регулярная трата изменилась. Загляни в выписку за пару недель.", act: "recurring", actLabel: "Регулярные траты" });
      }
    }

    // --- категории к тому же периоду прошлого года ---
    var cm = catMonthly(state, Y), pcm = hasPrev ? catMonthly(state, prevY) : null;
    if (pcm && !t.plan) {
      var ch = state.categories.filter(function (c) { return SPEND_BLOCKS[c.block] && !c.mandatory; }).map(function (c) {
        var a = sum(cm[c.id] || [], 0, n), b = sum(pcm[c.id] || [], 0, n); return { c: c, a: a, b: b, d: a - b };
      }).filter(function (x) { return x.b > 0; });
      var down = ch.filter(function (x) { return x.d <= -30000 && x.d / x.b <= -0.2; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 2);
      var up = ch.filter(function (x) { return x.d >= 30000 && x.d / x.b >= 0.2; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 2);
      if (down.length) good.push({ id: "down", ic: "↘", rank: 4, h: cap1(list(down.map(function (x) { return x.c.name; }))) + ": меньше, чем в " + prevY, p: down.map(function (x) { return x.c.name + " " + eur(x.b) + " → " + eur(x.a); }).join(" · ") + " (" + period + ")." });
      if (up.length) improve.push({ id: "up", ic: "↗", rank: 10, h: cap1(list(up.map(function (x) { return x.c.name; }))) + ": больше, чем в " + prevY, p: up.map(function (x) { return x.c.name + " " + eur(x.b) + " → " + eur(x.a); }).join(" · ") + ". Если это осознанно — всё хорошо; если нет — стоит поправить план." });
      // обязательные траты
      var mA = tot(mon, "mandatory", 0, n), mB = tot(pmon, "mandatory", 0, n);
      if (mB > 0 && mA - mB >= 100000 && (mA - mB) / mB >= 0.3) improve.push({ id: "mandatory", ic: "§", rank: 7, h: "Налоги и соцстрах выросли: " + eur(mA) + " против " + eur(mB), p: "Если рост постоянный, стоит заложить полный год в план и откладывать на налоги заранее.", next: "Откладывай на налоги каждый месяц на отдельный счёт — тогда платежи не будут сюрпризом." });
      // подписки
      var subs = state.categories.filter(function (c) { return c.block === "subs_es" || c.block === "subs_ru"; });
      var sA = subs.reduce(function (s, c) { return s + sum(cm[c.id] || [], 0, n); }, 0) / Math.max(1, n), sB = subs.reduce(function (s, c) { return s + sum(pcm[c.id] || [], 0, n); }, 0) / Math.max(1, n);
      if (sB > 0 && sA < sB * 0.9 && sB - sA >= 500) good.push({ id: "subs", ic: "↻", rank: 8, h: "Подписки подешевели: " + eur(sA) + " в месяц", p: "В " + prevY + " было " + eur(sB) + " в месяц." });
      else if (sB > 0 && sA >= sB * 1.2 && sA - sB >= 1000) improve.push({ id: "subs", ic: "↻", rank: 13, h: "Подписки выросли до " + eur(sA) + " в месяц", p: "В " + prevY + " было " + eur(sB) + ". Можно пробежаться по списку — вдруг что-то уже не нужно.", act: "recurring", actLabel: "Регулярные траты" });
    }

    // --- дорогие месяцы впереди ---
    var avgYear = mon.total.total / 12, fromM = t.cur ? t.curM + 1 : t.plan ? 0 : 12;
    var heavy = [];
    for (var hm = fromM; hm < 12; hm++) if (mon.months[hm].total > avgYear * 1.3) heavy.push(hm);
    if (heavy.length) {
      var excess = heavy.reduce(function (s, m) { return s + mon.months[m].total - avgYear; }, 0);
      var monthsTo = Math.max(1, heavy[heavy.length - 1] - (t.cur ? t.curM : 0) + (t.cur ? 0 : 1));
      var perM = excess / monthsTo, names = heavy.map(mName);
      improve.push({ id: "heavy", ic: "▲", rank: 5, h: cap1(list(names)) + " — " + (heavy.length > 1 ? "дорогие месяцы" : "дорогой месяц"), p: "Расходы выше обычного на " + eur(excess) + ". Если откладывать по " + eur(perM) + " в месяц, " + (heavy.length > 1 ? "они пройдут" : "он пройдёт") + " спокойно.",
        next: "Откладывай по " + eur(perM) + " в месяц — и " + list(names) + " пройдут без провала остатка." });
    }

    // --- праздники семьи: предсказуемая годовая трата ---
    var fam = state.categories.find(function (c) { return /праздники и подарки семьи/i.test(c.name); });
    if (fam && cm[fam.id]) {
      var famT = sum(cm[fam.id], 0, 12);
      if (famT >= 50000) info.push({ id: "family", ic: "❀", rank: 36, h: "Праздники семьи: " + eur(famT) + " за год", p: "Если откладывать по " + eur(famT / 12) + " в месяц, пики не будут бить по остатку." });
    }

    // --- нестабильный доход ---
    var incCats = state.categories.filter(function (c) { return c.block === "income"; });
    var vol = incCats.filter(function (c) { return /бонус|крипт|фриланс/i.test(c.name); }).reduce(function (s, c) { return s + sum(cm[c.id] || [], 0, 12); }, 0);
    var incY = incCats.reduce(function (s, c) { return s + sum(cm[c.id] || [], 0, 12); }, 0);
    if (incY > 0) {
      var vs = vol / incY;
      if (vs > 0.3) improve.push({ id: "volatile", ic: "◑", rank: 6, h: "Нестабильный доход — " + pct(vs) + " (бонус, крипта, фриланс)", p: eur(vol) + " из " + eur(incY) + " за " + Y + ". Для плана лучше знать, хватит ли денег без них — это стоит заложить скромнее.", next: "В плане следующего года заложи бонус и крипту скромнее — и проверь, хватает ли без них." });
      var topInc = incCats.map(function (c) { return { c: c, v: sum(cm[c.id] || [], 0, 12) }; }).sort(function (a, b) { return b.v - a.v; })[0];
      if (topInc && topInc.v > 0) info.push({ id: "incomes", ic: "◑", rank: 34, h: "Доходы " + Y + ": " + eur(incY), p: "Главный источник — «" + topInc.c.name + "», " + pct(topInc.v / incY) + "." });
    }

    // --- для справки: на жизнь, структура трат ---
    if (n > 0 && living > 0) {
      var plv = pmon ? tot(pmon, "living", 0, n) / n : 0;
      info.push({ id: "living", ic: "≈", rank: 33, h: "На жизнь — " + eur(living / n) + " в месяц", p: (plv ? prevY + ": " + eur(plv) + " в месяц. " : "") + "Без налогов, соцстраха и бухгалтерии (" + eur(mand) + " " + period + ")." });
      var afterTax = inc - mand;
      if (afterTax > 0) {
        var joy = 0, fixed = 0;
        state.categories.forEach(function (c) {
          if (!SPEND_BLOCKS[c.block] || c.mandatory) return;
          var v = sum(cm[c.id] || [], 0, n); if (isJoy(c)) joy += v; else fixed += v;
        });
        var saved = afterTax - joy - fixed;
        info.push({ id: "structure", ic: "◔", rank: 35, gloss: "joy", h: "Структура трат: обязательное " + pct(fixed / afterTax) + ", на радость " + pct(joy / afterTax) + ", остаётся " + pct(saved / afterTax), p: "От дохода после налогов. Ориентир: обязательное 50–60%, на радость 20–35%, накопления 10–20%." });
      }
    }

    // --- общие траты в личном плане ---
    var S = root.BudgetShared;
    if (ctx.shared && S && !t.plan && r && !r.archived) {
      var cov = S.coverage(state, ctx.shared, Y).filter(function (c) { return c.personal > 0 && c.shared > 0; });
      if (cov.length) {
        var sS = cov.reduce(function (a, c) { return a + c.shared; }, 0), sP = cov.reduce(function (a, c) { return a + c.personal; }, 0);
        if (sS > sP * 1.2) improve.push({ id: "coverage", ic: "⇄", rank: 12, h: "Общие траты на еду и развлечения выше плана", p: "Общие " + eur(sS) + " при личном плане " + eur(sP) + " за " + cov.length + " мес. Можно поднять план на продукты и развлечения.", act: "year", actLabel: "Открыть год" });
        else info.push({ id: "coverage", ic: "⇄", rank: 37, h: "Еда и развлечения: общие — " + pct(sS / sP) + " личного плана", p: "Остальное уходит на свои кафе, кофе и мелочи." });
      }
    }
    if (ctx.toLog >= 3) improve.push({ id: "tolog", ic: "⇄", rank: 15, h: ctx.toLog + " " + plural(ctx.toLog, "общая трата", "общие траты", "общих трат") + " не в личном плане", p: "Внеси их одной кнопкой — и план будет полным.", act: "tolog", actLabel: "В личный план" });

    return finish(good, improve, info, { period: period, plan: t.plan, neutral: inc > 0 ? { id: "neutral", ic: "·", rank: 99, h: cap1(period) + ": доходы " + eur(inc) + ", расходы " + eur(spend), p: "Ничего особенного — просто цифры для ориентира." } : null,
      fallbackNext: function () {
        var rr = inc > 0 ? (inc - spend) / inc : 0, resv = capNow !== null && avgM > 0 ? capNow / avgM : 0;
        if (rr >= 0.2 && resv >= 6) return "Капитал растёт, запас есть — часть бюджета можно сознательно вернуть себе: путешествие, что-то для дома, что давно хотелось.";
        if (resv < 6 && avgM > 0 && capNow !== null) return "Двигайся к запасу в 6 месяцев: по " + eur(avgM * Math.max(0, 6 - resv) / 12) + " в месяц — и через год он будет.";
        return "Продолжай сверки раз в неделю — это главное, на чём держится план.";
      } });
  }

  // бутерброд: лучшее сверху, до 3 «улучшить», шаг вперёд, остальное — для справки
  function finish(good, improve, info, o) {
    var byRank = function (a, b) { return a.rank - b.rank; };
    good.sort(byRank); improve.sort(byRank); info.sort(byRank);
    var g = good.slice(0, 3), im = improve.slice(0, 3);
    info = info.concat(good.slice(3), improve.slice(3)).sort(byRank);
    var withNext = improve.filter(function (x) { return x.next; })[0];
    var next = withNext ? withNext.next : o.fallbackNext ? o.fallbackNext() : null;
    return { good: g, improve: im, next: next, info: info, neutral: g.length ? null : o.neutral || null, period: o.period, plan: !!o.plan };
  }

  // =====================================================================
  // Итог месяца: после сверки последней недели (или через 3 дня после конца)
  // =====================================================================
  function monthDue(state, today) {
    var d = new Date(today + "T12:00:00Z"), y = d.getUTCFullYear(), m = d.getUTCMonth(); // m — текущий месяц
    var py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1, Y = String(py);
    if (!state.years[Y] || state.years[Y].archived) return null;
    var r = E.compute(state, Y), lastW = pm * 5 + 4;
    var reconDone = r.fact[lastW] !== null;
    if (!reconDone && d.getUTCDate() < 4) return null;
    return { year: Y, month: pm, recon: reconDone, key: Y + "-" + (pm < 9 ? "0" : "") + (pm + 1) };
  }
  function month(state, year, m, ctx) {
    ctx = ctx || {};
    var Y = String(year), mon = E.monthly(state, Y), row = mon.months[m], good = [], improve = [];
    var avgYear = mon.total.total / 12, cm = catMonthly(state, Y);
    if (row.dcap !== null && row.dcap >= 10000) good.push({ id: "mcap", ic: "◆", rank: 1, h: "Капитал за " + mName(m) + " " + eurP(row.dcap), p: "Теперь " + eur(row.cap) + "." });
    if (row.income > 0 && row.net > 0) good.push({ id: "mnet", ic: "↑", rank: 2, h: "Осталось " + eur(row.net) + " — " + pct(row.net / row.income) + " доходов", p: row.net / row.income >= 0.1 ? "В ориентире 10–20% или выше." : "Ориентир — 10–20%." });
    if (avgYear > 0 && row.total < avgYear * 0.8) good.push({ id: "mlight", ic: "◌", rank: 3, h: cap1(mName(m)) + " — лёгкий месяц", p: "Расходы " + eur(row.total) + " — на " + pct(1 - row.total / avgYear) + " ниже обычного." });
    if (row.income > 0 && row.net < 0) improve.push({ id: "mneg", ic: "↗", rank: 1, h: "Расходы больше доходов на " + eur(-row.net), p: "Бывает в дорогие месяцы. Главное — чтобы год в целом был в плюсе." });
    var cats = state.categories.filter(function (c) { return SPEND_BLOCKS[c.block] && !c.mandatory; }).map(function (c) {
      var arr = cm[c.id] || [], others = 0, k = 0; for (var i = 0; i < 12; i++) if (i !== m) { others += arr[i]; k++; }
      return { c: c, v: arr[m], avg: k ? others / k : 0 };
    }).filter(function (x) { return x.v - x.avg >= 20000 && x.v > x.avg * 1.3; }).sort(function (a, b) { return (b.v - b.avg) - (a.v - a.avg); });
    if (cats.length) improve.push({ id: "mcat", ic: "↗", rank: 2, h: cap1(cats[0].c.name) + " в " + mIn(m) + " — " + eur(cats[0].v), p: "Обычно около " + eur(cats[0].avg) + " в месяц. Если это разовое — всё в порядке." });
    var nm = m + 1, next = null;
    if (nm < 12 && avgYear > 0 && mon.months[nm].total > avgYear * 1.3) next = cap1(mName(nm)) + " по плану дорогой: " + eur(mon.months[nm].total) + ". Проверь, хватит ли остатка, — открой неделю.";
    else if (nm < 12) next = "В " + mIn(nm) + " по плану " + eur(mon.months[nm].total) + " расходов — обычный месяц.";
    good.sort(function (a, b) { return a.rank - b.rank; }); improve.sort(function (a, b) { return a.rank - b.rank; });
    return { year: Y, month: m, numbers: { income: row.income, total: row.total, saved: row.saved, net: row.net, dcap: row.dcap, cap: row.cap }, good: good.slice(0, 2), improve: improve.slice(0, 1), next: next };
  }

  // =====================================================================
  // «Мы»: только общие критерии (одинаково у обеих, с моей стороны)
  // =====================================================================
  var HALF = ["Жильё и счета", "Продукты", "Кафе и рестораны", "Доставка еды", "Развлечения и события", "Путешествия"];
  function together(expenses, ctx) {
    ctx = ctx || {};
    var S = root.BudgetShared, today = ctx.today || E.todayISO(), learned = ctx.learned || {}, partner = ctx.partnerName || "партнёр";
    var good = [], improve = [], info = [];
    var y = today.slice(0, 4), py = String(Number(y) - 1), mNow = Number(today.slice(5, 7)) - 1, n = Math.max(1, mNow);
    var ex = (expenses || []).filter(function (e) { return e.currency === "EUR" || !e.currency; });
    // баланс и расчёты
    var bal = S.balance(ex).EUR || 0, abs = Math.abs(bal);
    var lastSet = ex.filter(function (e) { return e.kind === "settlement" || e.kind === "refund"; }).map(function (e) { return e.date; }).sort().pop() || null;
    var days = lastSet ? Math.round((Date.parse(today) - Date.parse(lastSet)) / 864e5) : null;
    var who = bal > 0 ? partner + " должна тебе " + eur(abs) : "ты должна " + partner + " " + eur(abs);
    if (abs < 10000 || (days !== null && days <= 31 && abs < 50000)) good.push({ id: "bal", ic: "€", rank: 3, h: abs < 10000 ? "Вы почти в расчёте" : "Последний перевод — " + ago(days), p: abs < 10000 ? "Баланс " + eur(abs) + " — меньше 100 €." : "Сейчас " + who + "." });
    else if (abs > 50000 || (days !== null && days > 30)) improve.push({ id: "bal", ic: "€", rank: 1, h: cap1(who), p: (days !== null ? "Последний перевод между вами — " + ago(days) + ". " : "") + "Можно рассчитаться сейчас и дальше раз в месяц — так баланс не копится.", act: "settle", actLabel: "Рассчитаться", next: "Рассчитайтесь и договоритесь делать это раз в месяц — баланс перестанет копиться." });
    // общие траты в месяц: этот год против прошлого
    var spendOf = function (yy, upto) { return ex.filter(function (e) { return (e.kind === "expense" || e.kind === "batch") && e.date.slice(0, 4) === yy && Number(e.date.slice(5, 7)) - 1 < upto; }); };
    var cur = spendOf(y, n), prev = spendOf(py, n), prevAll = spendOf(py, 12);
    var tot = function (a) { return a.reduce(function (s, e) { return s + e.cost; }, 0); };
    var aM = tot(cur) / n, bM = tot(prev) / n;
    if (bM > 0) {
      if (aM <= bM) good.push({ id: "total", ic: "↘", rank: 2, h: "Общие траты — " + eur(aM) + " в месяц", p: "В " + py + " за те же месяцы было " + eur(bM) + ": " + (aM < bM * 0.95 ? "на " + pct(1 - aM / bM) + " меньше." : "примерно так же.") });
      else if (aM >= bM * 1.2 && aM - bM >= 20000) improve.push({ id: "total", ic: "↗", rank: 3, h: "Общие траты выросли до " + eur(aM) + " в месяц", p: "В " + py + " было " + eur(bM) + ". Посмотрите вместе, какие категории выросли." });
    }
    // категории
    var catOf = function (e) { return e.kind === "batch" && !e.cat ? "Сводные суммы" : S.catOf(e, learned); };
    var byCat = function (arr) { var o = {}; arr.forEach(function (e) { var c = catOf(e); o[c] = (o[c] || 0) + e.cost; }); return o; };
    var ca = byCat(cur), cb = byCat(prev);
    var diffs = Object.keys(cb).filter(function (c) { return c !== "Сводные суммы" && c !== "Прочее"; }).map(function (c) { return { c: c, a: ca[c] || 0, b: cb[c] }; });
    var down = diffs.filter(function (x) { return x.b - x.a >= 30000 && (x.b - x.a) / x.b >= 0.2; }).sort(function (p, q) { return (q.b - q.a) - (p.b - p.a); }).slice(0, 2);
    var up = diffs.filter(function (x) { return x.a - x.b >= 30000 && (x.a - x.b) / x.b >= 0.2; }).sort(function (p, q) { return (q.a - q.b) - (p.a - p.b); }).slice(0, 2);
    if (down.length) good.push({ id: "cdown", ic: "↘", rank: 4, h: list(down.map(function (x) { return x.c; })) + ": меньше, чем в " + py, p: down.map(function (x) { return x.c + " " + eur(x.b) + " → " + eur(x.a); }).join(" · ") + "." });
    if (up.length) improve.push({ id: "cup", ic: "↗", rank: 4, h: list(up.map(function (x) { return x.c; })) + ": больше, чем в " + py, p: up.map(function (x) { return x.c + " " + eur(x.b) + " → " + eur(x.a); }).join(" · ") + ". Если это осознанный выбор — всё хорошо." });
    // деление по договорённости: пополам — дом, еда, развлечения, путешествия (ребёнок не проверяем)
    var from90 = new Date(Date.parse(today) - 90 * 864e5).toISOString().slice(0, 10);
    var odd = ex.filter(function (e) { return e.kind === "expense" && e.date >= from90 && e.cost > 0 && HALF.indexOf(catOf(e)) >= 0 && Math.abs(e.share / e.cost - 0.5) > 0.02; });
    if (odd.length) improve.push({ id: "split", ic: "½", rank: 5, h: odd.length + " " + plural(odd.length, "трата", "траты", "трат") + " поделены не пополам", p: "Дом, еда, развлечения и путешествия вы делите пополам. Проверь: " + odd.slice(0, 3).map(function (e) { return "«" + (e.desc || "без описания") + "»"; }).join(", ") + (odd.length > 3 ? " и ещё " + (odd.length - 3) : "") + ". Бывают и исключения.", act: "shared", actLabel: "Открыть ленту" });
    // кто платит — только справка
    var paidMe = tot(cur.filter(function (e) { return e.paidByMe; })), all = tot(cur);
    if (all > 0) info.push({ id: "payer", ic: "⇄", rank: 30, h: "Кто платил: ты " + pct(paidMe / all) + ", " + partner + " " + pct(1 - paidMe / all), p: "Это кто оплачивал, а не чья доля больше: доли делятся при вводе, разницу показывает баланс." });
    if (prevAll.length) info.push({ id: "prevyear", ic: "·", rank: 31, h: "Общие траты " + py + ": " + eur(tot(prevAll)), p: "В среднем " + eur(tot(prevAll) / 12) + " в месяц." });
    if (ctx.toLog >= 3) improve.push({ id: "tolog", ic: "⇄", rank: 6, h: ctx.toLog + " " + plural(ctx.toLog, "общая трата", "общие траты", "общих трат") + " не в личном плане", p: "Внеси их в свой план одной кнопкой.", act: "tolog", actLabel: "В личный план" });
    return finish(good, improve, info, { period: "за " + n + " " + plural(n, "месяц", "месяца", "месяцев") + " " + y, neutral: all > 0 ? { id: "neutral", ic: "·", rank: 99, h: "Общие траты " + y + ": " + eur(tot(spendOf(y, 12))), p: "Пока без заметных перемен." } : null,
      fallbackNext: function () { return "Рассчитывайтесь раз в месяц — так баланс всегда понятен обеим."; } });
  }

  root.BudgetInsights = { personal: personal, month: month, monthDue: monthDue, together: together, isJoy: isJoy, JOY_RE: JOY_RE, HALF: HALF };
})(typeof window !== "undefined" ? window : this);
