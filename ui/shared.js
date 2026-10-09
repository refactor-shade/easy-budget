/* Easy Budget — общие траты: «Общие», «в личный план», «Мы», ввод траты как в Splitwise. */
"use strict";
// ===== ОБЩИЕ → ЛИЧНЫЙ ПЛАН =====
function logOpts() {
  // по умолчанию — с начала прошлого месяца
  var set = state.settings, t = new Date(), pm = t.getMonth() || 12, py = t.getMonth() ? t.getFullYear() : t.getFullYear() - 1;
  var since = set.sharedLogSince || (py + "-" + (pm < 10 ? "0" : "") + pm + "-01");
  return { since: since, min: set.sharedLogMin || 4000, handled: set.sharedLog || {}, map: set.sharedMap || {}, utilCat: set.utilCat || S.utilityCat(state) };
}
// значок категории в цветном кружке, как в Splitwise
var CAT_IC = {
  home: "<path d='M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'/>", cart: "<path d='M3 4h2l2.4 11h11.2L21 7H6.2'/><circle cx='9' cy='20' r='1.3'/><circle cx='17' cy='20' r='1.3'/>",
  cup: "<path d='M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z'/><path d='M17 10h2a2 2 0 0 1 0 4h-2'/>", plane: "<path d='M2 16l20-8-4 12-5-4-3 3v-5l9-7'/>",
  gift: "<path d='M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0'/>", star: "<path d='m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z'/>",
  car: "<path d='M4 16V11l2-5h12l2 5v5M4 16h16M7 16v2M17 16v2'/>", heart: "<path d='M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z'/>",
  doc: "<path d='M7 3h7l4 4v14H7zM14 3v4h4'/>", box: "<path d='M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10'/>", shirt: "<path d='M8 4 4 7l2 3 2-1v11h8V9l2 1 2-3-4-3a4 4 0 0 1-8 0z'/>",
  child: "<circle cx='12' cy='7' r='3'/><path d='M6 21v-3a6 6 0 0 1 12 0v3'/>", swap: "<path d='M4 8h14l-3-3M20 16H6l3 3'/>", dot: "<circle cx='12' cy='12' r='3'/>",
};
var CAT_STYLE = [
  [/жиль|счет/i, "home", "#e3ecf7", "#2c5a8f"], [/продукт/i, "cart", "#e6f0ea", "#2f6f4f"], [/кафе|ресторан|доставк/i, "cup", "#f7ebe0", "#9a5520"],
  [/путеш/i, "plane", "#e5eef3", "#2d6278"], [/подар|праздн/i, "gift", "#f6e7ee", "#94406a"], [/развлеч|событ/i, "star", "#efe9f7", "#5f4a96"],
  [/такси|транспорт/i, "car", "#eef0e4", "#5b6526"], [/аптек|здоров|уход/i, "heart", "#f8e6e4", "#a3433a"], [/документ|налог/i, "doc", "#efede7", "#4d4c47"],
  [/дом|быт|уборк/i, "box", "#f2ede2", "#7a5d2a"], [/одежд/i, "shirt", "#eaeef6", "#3f5788"], [/ребён|ребен|школ|няня/i, "child", "#f3e6f2", "#8a3f83"],
];
function catIcon(name) {
  var st = name === "__transfer" ? ["", "swap", "#efede7", "#4d4c47"] : CAT_STYLE.find(function (x) { return x[0].test(name || ""); }) || ["", "dot", "#efede7", "#6f6e68"];
  return "<span class='cat-ic' style='background:" + st[2] + ";color:" + st[3] + "' title='" + esc(name === "__transfer" ? "перевод" : name || "") + "'><svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'>" + CAT_IC[st[1]] + "</svg></span>";
}
function toLogCount() {
  if (!sh || RO()) return 0;
  var o = logOpts(), c = sharedForCalc();
  return S.toLog(state, c, o).filter(function (x) { return !x.maybe; }).length + S.coverageGaps(state, c, o).length;
}


// Плановая сумма категории за месяц недели w (без того, что уже внесено фактом из общих)
function monthPlan(y, catId, w) {
  var r = E.compute(state, y), m0 = Math.floor(w / 5) * 5, t = 0;
  for (var k = m0; k < m0 + 5; k++) { var c = r.cells[catId] && r.cells[catId][k]; if (c && !/из общих/.test(c.note || "")) t -= c.cents; }
  return t > 0 ? t : 0;
}
function replacedSoFar(y, catId, w) {
  var r = E.compute(state, y), m0 = Math.floor(w / 5) * 5, t = 0;
  for (var k = m0; k < m0 + 5; k++) { var c = r.cells[catId] && r.cells[catId][k]; if (c && /из общих/.test(c.note || "")) t -= c.cents; }
  return t;
}
// Заменить план месяца фактом: плановые недели месяца — в 0, неделя счёта — сумма из общих
function replaceWithFact(y, catId, w, share, desc) {
  var r = E.compute(state, y), m0 = Math.floor(w / 5) * 5;
  for (var k = m0; k < m0 + 5; k++) {
    var c = r.cells[catId] && r.cells[catId][k];
    if (k !== w && c && !/из общих/.test(c.note || "")) E.setEntry(state, y, catId, String(k), "0", "план заменён фактом из общих");
  }
  var cur = r.cells[catId] && r.cells[catId][w], base = cur && /из общих/.test(cur.note || "") ? -cur.cents : 0;
  var note = (cur && /из общих/.test(cur.note || "") ? cur.note.replace(/ \(из общих\)$/, "") + ", " : "") + desc + " (из общих)";
  E.setEntry(state, y, catId, String(w), String(-(base + share) / 100), note);
}

// Коммуналка: план против факта из общих (свет, вода, газ)
function utilitiesCard() {
  var set = state.settings, y = E.todayISO().slice(0, 4), yr = state.years[y];
  if (!sh || !yr || yr.archived) return { html: "", bind: function () {} };
  var ucat = set.utilCat || S.utilityCat(state), r = E.compute(state, y), nowM = Number(E.todayISO().slice(5, 7)) - 1;
  var bills = sh.expenses.filter(function (e) { return e.date.slice(0, 4) === y && S.isUtility(e, sh.learned); });
  if (!bills.length) return { html: "", bind: function () {} };
  var fact = [], paid = [], plan = [], firstM = 12;
  for (var m = 0; m < 12; m++) {
    fact[m] = 0; paid[m] = 0; plan[m] = 0;
    if (ucat) for (var w = m * 5; w < m * 5 + 5; w++) { var x = r.cells[ucat][w]; if (x) plan[m] -= x.cents; }
  }
  // счёт часто покрывает несколько месяцев: период — обычный промежуток между счетами этого вида
  var kind = function (e) { var d = (e.desc || "").toLowerCase(); return /gas|газ/.test(d) ? "gas" : /agua|water|вод/.test(d) ? "water" : /electr|luz|свет|электр/.test(d) ? "el" : "other"; };
  var allBills = sh.expenses.filter(function (e) { return S.isUtility(e, sh.learned); }), period = {};
  ["gas", "water", "el", "other"].forEach(function (k) {
    var ds = allBills.filter(function (e) { return kind(e) === k; }).map(function (e) { return new Date(e.date).getTime(); }).sort(function (a, b) { return a - b; });
    var gaps = []; for (var i = 1; i < ds.length; i++) gaps.push((ds[i] - ds[i - 1]) / 864e5);
    gaps.sort(function (a, b) { return a - b; });
    var med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : (k === "gas" || k === "water" ? 60 : 30);
    period[k] = Math.max(1, Math.min(3, Math.round(med / 30)));
  });
  bills.forEach(function (e) {
    var m = Number(e.date.slice(5, 7)) - 1, v = S.toEur(e.share, e.currency, e.date, set), p = period[kind(e)];
    paid[m] += v;
    for (var j = 0; j < p; j++) { var mm = m - j; if (mm >= 0) { fact[mm] += v / p; if (mm < firstM) firstM = mm; } }
  });
  var past = []; for (m = firstM; m < nowM; m++) past.push(m);
  var last6 = past.slice(-6), avg = last6.length ? Math.round(last6.reduce(function (t, m) { return t + fact[m]; }, 0) / last6.length / 100) * 100 : 0;
  var html = "<div class='card util-card'><h2>Коммуналка: план и факт</h2><p class='small muted' style='margin-top:-6px'>Твоя доля общих счетов за свет, воду и газ. Аренда и интернет сюда не входят.</p>" +
    (ucat ? "" : "<div class='hint small'>Не нашла категорию для коммуналки — выбери её: <select id='ucSel'><option value=''>…</option>" + catOptions(null, function (c) { return c.block !== "income" && c.block !== "savings"; }) + "</select></div>") +
    "<div class='tbl-wrap' style='margin-top:10px'><table class='t'><thead><tr><th></th>" + past.map(function (m) { return "<th class='n'>" + E.MONTHS_SHORT[m] + "</th>"; }).join("") + "<th class='n'>в среднем</th></tr></thead><tbody>" +
    "<tr><td>План</td>" + past.map(function (m) { return "<td class='n'>" + Math.round(plan[m] / 100) + "</td>"; }).join("") + "<td class='n'>" + (past.length ? Math.round(past.reduce(function (t, m) { return t + plan[m]; }, 0) / past.length / 100) : "—") + "</td></tr>" +
    "<tr><td>Факт по периодам</td>" + past.map(function (m) { return "<td class='n " + (fact[m] > plan[m] * 1.1 ? "neg" : "") + "'>" + Math.round(fact[m] / 100) + "</td>"; }).join("") + "<td class='n'><b>" + (past.length ? Math.round(past.reduce(function (t, m) { return t + fact[m]; }, 0) / past.length / 100) : "—") + "</b></td></tr>" +
    "<tr class='muted'><td>Оплачено в месяце</td>" + past.map(function (m) { return "<td class='n'>" + Math.round(paid[m] / 100) + "</td>"; }).join("") + "<td></td></tr>" +
    "</tbody></table></div><p class='small muted'>Счёт разнесён по месяцам, которые он покрывает: " + [["el", "свет"], ["water", "вода"], ["gas", "газ"]].filter(function (k) { return allBills.some(function (e) { return kind(e) === k[0]; }); }).map(function (k) { return k[1] + " — " + (period[k[0]] === 1 ? "каждый месяц" : "раз в " + period[k[0]] + " мес"); }).join(", ") +
    ". «Оплачено» — когда деньги реально ушли.</p>" +
    (ucat && past.length ? "<div class='row'><button class='btn' id='ucFact'>Заменить план фактом за " + E.MONTHS_SHORT[past[0]] + "–" + E.MONTHS_SHORT[past[past.length - 1]] + "</button>" +
      (avg ? "<button class='btn' id='ucAvg'>Поставить " + E.eur(avg, { dec: 0 }) + " в месяц на будущее</button>" : "") + "</div>" : "") + "</div>";
  function bind() {
    var sel = $main.querySelector("#ucSel"); if (sel) sel.onchange = function () { if (sel.value) { set.utilCat = sel.value; changed(); } };
    var bf = $main.querySelector("#ucFact");
    if (bf) bf.onclick = function () {
      if (!confirm("Заменить «" + catName(ucat) + "» за " + E.MONTHS_SHORT[past[0]] + "–" + E.MONTHS_SHORT[past[past.length - 1]] + " реальными счетами из «Общих»? Суммы встанут в те недели, когда счёт оплачен (так верно считаются деньги в обращении); в остальные недели этих месяцев — 0.")) return;
      set.sharedLog = set.sharedLog || {};
      past.forEach(function (m) {
        for (var w = m * 5; w < m * 5 + 5; w++) {
          var inWeek = bills.filter(function (e) { var k = E.weekOfDate(e.date); return k && k.idx === w; });
          var sum = inWeek.reduce(function (t, e) { return t + S.toEur(e.share, e.currency, e.date, set); }, 0);
          var had = r.cells[ucat][w];
          if (sum) E.setEntry(state, y, ucat, String(w), String(-Math.round(sum) / 100), inWeek.map(function (e) { return e.desc; }).join(", ") + " (из общих)");
          else if (had) E.setEntry(state, y, ucat, String(w), "0", "счетов не было");
          inWeek.forEach(function (e) { set.sharedLog[e.id] = "added"; });
        }
      });
      changed(); toast("План коммуналки за прошедшие месяцы = факт");
    };
    var ba = $main.querySelector("#ucAvg");
    if (ba) ba.onclick = function () {
      var fromM = nowM + 1;
      if (fromM > 11) { toast("В этом году будущих месяцев не осталось — поставь сумму в плане следующего года"); return; }
      // неделя месяца, в которую коммуналка стоит в плане чаще всего
      var cnt = [0, 0, 0, 0, 0, 0];
      for (var w = 0; w < 60; w++) if (r.cells[ucat][w]) cnt[w % 5 + 1]++;
      var wim = String(cnt.indexOf(Math.max.apply(null, cnt)) || 2);
      if (!confirm("С " + E.MONTHS_GEN[fromM] + " коммуналка в плане — " + E.eur(avg, { dec: 0 }) + " в месяц (" + wim + "-я неделя), одной регулярной тратой. Суммы, вписанные вручную в будущие недели, уберу. Прошлые месяцы не тронутся.")) return;
      var fromISO = y + "-" + (fromM < 9 ? "0" : "") + (fromM + 1) + "-01";
      yr.recurring = (yr.recurring || []).map(function (ru) { if (ru.catId === ucat && (!ru.to || ru.to >= fromISO)) { if (ru.from && ru.from >= fromISO) return null; ru.to = E.addDays(fromISO, -1); } return ru; }).filter(Boolean);
      yr.recurring.push({ id: E.uid("r"), catId: ucat, expr: String(-avg / 100), cents: -avg, weeks: wim, from: fromISO, to: null });
      var en = (yr.entries || {})[ucat] || {};
      Object.keys(en).forEach(function (k) { if (Number(k) >= fromM * 5) delete en[k]; });
      changed(); toast("Коммуналка на будущее: " + E.eur(avg, { dec: 0 }) + " в месяц");
    };
  }
  return { html: html, bind: bind };
}
routes.tolog = function () {
  if (!sh || RO()) { location.hash = "#shared"; return; }
  var set = state.settings, o = logOpts(), calc = sharedForCalc();
  set.sharedLog = set.sharedLog || {}; set.sharedMap = set.sharedMap || {};
  var list = S.toLog(state, calc, o), gaps = S.coverageGaps(state, calc, o);
  var fresh = list.filter(function (x) { return !x.maybe; }), maybe = list.filter(function (x) { return x.maybe; });
  // по категориям за месяц: твоя доля общих рядом с суммой в личном плане
  var ty = E.todayISO().slice(0, 4), tm = ui.tologM !== undefined ? ui.tologM : Number(E.todayISO().slice(5, 7)) - 1;
  var msh = S.monthlyShares(calc, set, ty), rr = state.years[ty] ? E.compute(state, ty) : null;
  var catRows = Object.keys(msh.byCat).map(function (c) {
    var share = msh.byCat[c][tm] || 0, pid = set.sharedMap[c] || S.guessPersonalCat(state, c) || (S.FOOD.indexOf(c) >= 0 && set.coverage && set.coverage.food ? set.coverage.food[0] : null), plan = 0;
    if (rr && pid && rr.cells[pid]) for (var w2 = tm * 5; w2 < tm * 5 + 5; w2++) { var x2 = rr.cells[pid][w2]; if (x2) plan -= x2.cents; }
    return { c: c, share: share, plan: plan, pid: pid };
  }).filter(function (x) { return x.share >= 1000; }).sort(function (a2, b2) { return b2.share - a2.share; });
  var html = "<div class='tl-head'><h1>Общие траты и твой план</h1><div class='tl-month'><button type='button' class='round-btn' data-tm='-1' aria-label='Предыдущий месяц'>‹</button><b>" + E.MONTHS[tm][0].toUpperCase() + E.MONTHS[tm].slice(1) + " " + ty + "</b><button type='button' class='round-btn' data-tm='1' aria-label='Следующий месяц'>›</button></div>" +
    "<p class='small muted'>Твоя доля общих трат рядом с суммой в личном плане. Ничего не вносится само — только если нажмёшь.</p></div>";
  function row(x) {
    var e = x.e;
    return "<li class='lg' data-id='" + esc(e.id) + "'><div class='lg-main'><b>" + esc(e.desc) + "</b><span class='small muted'>" + esc(e.date.slice(8, 10) + "." + e.date.slice(5, 7)) + " · " + esc(x.sharedCat) + " · всего " + E.fmt(e.cost, { cur: e.currency === "EUR" ? "€" : e.currency, dec: 0 }) +
      (x.maybe ? " · в плане уже есть " + E.eur(-x.maybe.cents, { dec: 0 }) + " в " + esc(shortWeek(x.year, x.maybe.week)) : "") + "</span></div>" +
      "<div class='lg-val'>" + E.eur(x.share) + "<span class='small muted'>твоя доля</span></div>" +
      "<div class='lg-act'><select data-lc aria-label='Категория личного плана'><option value=''>категория…</option>" + catOptions(x.catId, function (c) { return c.block !== "income" && c.block !== "savings"; }) + "</select>" +
      "<button class='btn sm primary' data-la='add'>Внести</button><button class='btn sm' data-la='had'>Уже есть</button><button class='btn sm ghost' data-la='skip'>Не нужно</button></div></li>";
  }
  var uc = utilitiesCard();
  if (!fresh.length && !maybe.length && !gaps.length) html += "<div class='card all-good'><span class='ic'>✓</span>Всё заметное из общих уже в личном плане.</div>";
  if (fresh.length) html += "<div class='card'><h2>Нет в личном плане · " + fresh.length + "</h2><p class='small muted' style='margin-top:-6px'>Выбери категорию и нажми «Внести» — или «Уже есть», если учла по-другому.</p><ul class='lg-list'>" + fresh.map(row).join("") + "</ul></div>";
  if (gaps.length) html += "<div class='card'><h2>Еда и развлечения вышли за план</h2><ul class='lg-list'>" + gaps.map(function (g) {
    return "<li class='lg' data-gap='" + g.key + "'><div class='lg-main'><b>" + E.MONTHS[g.month - 1][0].toUpperCase() + E.MONTHS[g.month - 1].slice(1) + " " + g.year + "</b><span class='small muted'>общие " + E.eur(rnd(g.shared), { dec: 0 }) + " (твоя доля) при личном плане " + E.eur(rnd(g.personal), { dec: 0 }) + "</span></div>" +
      "<div class='lg-val neg'>+" + E.eur(rnd(g.gap), { dec: 0 }) + "</div><div class='lg-act'><button class='btn sm primary' data-ga='add'>Добавить разницу в план</button><button class='btn sm ghost' data-ga='skip'>Не нужно</button></div></li>";
  }).join("") + "</ul></div>";
  if (maybe.length) html += "<details class='card' style='margin-top:16px'><summary><b>Похоже, уже учтено · " + maybe.length + "</b> <span class='small muted'>в нужной категории в тот месяц есть сумма не меньше</span></summary>" +
    "<div class='row' style='margin:10px 0'><button class='btn sm' id='allHad'>Да, всё это уже учтено</button></div><ul class='lg-list'>" + maybe.map(row).join("") + "</ul></details>";
  // обзор по категориям, коммуналка и настройки — ниже, после того, что нужно сделать
  html += "<h2 class='section'>По категориям за месяц</h2><div class='card tl-cats'>" + (catRows.length ? catRows.map(function (x) {
    var ok = x.plan > 0 && x.share <= x.plan, none = !x.plan;
    return "<div class='tl-row" + (none ? " none" : "") + "'><div class='tl-top'><b>" + esc(catLabel(x.c)) + "</b>" + (ok ? "<span class='pos'>✓</span>" : none ? "<span class='warn'>нет в плане</span>" : "<span class='warn'>выше плана</span>") + "</div>" +
      (x.plan ? "<div class='tl-track'><i style='width:" + Math.min(100, Math.round(x.share / x.plan * 100)) + "%'></i></div>" : "") +
      "<div class='small muted'>общие " + E.eur(rnd(x.share), { dec: 0 }) + (x.plan ? " из плана " + E.eur(rnd(x.plan), { dec: 0 }) + (x.pid ? " · «" + esc(catName(x.pid)) + "»" : "") : x.pid ? " · в «" + esc(catName(x.pid)) + "» на этот месяц 0 €" : " · категория личного плана не выбрана") + "</div></div>";
  }).join("") : "<p class='muted' style='margin:0'>В этом месяце заметных общих трат пока нет.</p>") + "</div>";
  html += "<details class='tl-opts small' style='margin-top:16px'><summary>Какие траты проверять</summary><div class='row' style='margin-top:8px'><label class='small muted'>с <input type='date' id='lgSince' value='" + o.since + "'></label><label class='small muted'>доля от <input id='lgMin' inputmode='decimal' value='" + o.min / 100 + "' style='width:64px'> €</label></div></details>";
  html += uc.html;
  $main.innerHTML = html;
  uc.bind();
  $main.querySelectorAll("[data-tm]").forEach(function (b) { b.onclick = function () { var v = (ui.tologM !== undefined ? ui.tologM : Number(E.todayISO().slice(5, 7)) - 1) + Number(b.dataset.tm); ui.tologM = Math.max(0, Math.min(11, v)); render(); }; });
  $main.querySelector("#lgSince").onchange = function (e) { set.sharedLogSince = e.target.value; changed(); };
  $main.querySelector("#lgMin").onchange = function (e) { var v = Number(String(e.target.value).replace(",", ".")); if (v > 0) { set.sharedLogMin = Math.round(v * 100); changed(); } };
  $main.querySelectorAll("li[data-id]").forEach(function (li) {
    var x = list.find(function (q) { return q.e.id === li.dataset.id; });
    li.querySelectorAll("[data-la]").forEach(function (b) {
      b.onclick = function () {
        var a = b.dataset.la;
        if (a === "add") {
          var cat = li.querySelector("[data-lc]").value;
          if (!cat) { toast("Выбери категорию"); li.querySelector("[data-lc]").focus(); return; }
          if (x.sharedCat !== "Прочее") set.sharedMap[x.sharedCat] = cat;
          var planned = monthPlan(x.year, cat, x.week);
          var finish = function (how) {
            if (how === "replace") replaceWithFact(x.year, cat, x.week, x.share, x.e.desc);
            else addToCell(x.year, cat, x.week, String(x.share / 100), x.e.desc + " (общая)");
            set.sharedLog[x.e.id] = "added"; changed();
            toast((how === "replace" ? "План заменён фактом" : "Добавлено") + " в «" + catName(cat) + "» · " + shortWeek(x.year, x.week));
          };
          if (!planned) return finish("add");
          var mName = E.MONTHS[Math.floor(x.week / 5)];
          modal("<div class='m-body'><h2>В плане уже есть " + E.eur(planned, { dec: 0 }) + "</h2><p class='muted' style='margin:6px 0 0'>«" + esc(catName(cat)) + "» на " + mName + " уже запланирована. Как внести " + E.eur(x.share) + " — " + esc(x.e.desc) + "?</p>" +
            "<div class='rem-opts'><button class='rem-opt' data-how='replace'><span><b>Заменить план фактом</b><small>за " + mName + " будет " + E.eur(x.share + replacedSoFar(x.year, cat, x.week)) + " — плановые суммы этого месяца обнулятся</small></span></button>" +
            "<button class='rem-opt' data-how='add'><span><b>Добавить сверху</b><small>за " + mName + " будет " + E.eur(planned + x.share) + " — если это отдельная трата</small></span></button></div></div>" +
            "<div class='m-foot'><button class='btn ghost' data-act='x'>Отмена</button></div>", function (m) {
            m.querySelector("[data-act=x]").onclick = closeModal;
            m.querySelectorAll("[data-how]").forEach(function (bb) { bb.onclick = function () { closeModal(); finish(bb.dataset.how); }; });
          });
          return;
        }
        set.sharedLog[x.e.id] = a; changed();
      };
    });
  });
  var ah = $main.querySelector("#allHad"); if (ah) ah.onclick = function () { maybe.forEach(function (x) { set.sharedLog[x.e.id] = "had"; }); changed(); toast("Отмечено"); };
  $main.querySelectorAll("li[data-gap]").forEach(function (li) {
    var g = gaps.find(function (q) { return q.key === li.dataset.gap; });
    li.querySelectorAll("[data-ga]").forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.ga === "add") {
          var cat = (set.coverage && set.coverage.food && set.coverage.food[0]) || defaultCat();
          addToCell(g.year, cat, (g.month - 1) * 5 + 4, String(rnd(g.gap) / 100), "общие сверх плана");
          toast("Добавлено " + E.eur(rnd(g.gap), { dec: 0 }) + " в «" + catName(cat) + "»");
        }
        set.sharedLog[g.key] = b.dataset.ga; changed();
      };
    });
  });
};


// ===== МЫ: общий бюджет =====
function loadPartnerData(force) {
  var p = people.find(function (x) { return x.theirLevel === "full" || x.theirLevel === "totals"; }) || people[0];
  if (!p) return Promise.resolve(null);
  if (!force && ui.us && ui.us.id === p.userId && Date.now() - ui.us.at < 120000) return Promise.resolve(ui.us);
  var job = p.theirLevel === "full" ? Store.loadBudgetOf(p.userId).then(function (row) {
    if (!row) return null;
    var st = migrate(row.data); st._ver = 1;
    var yrs = {}; Object.keys(st.years).forEach(function (y) { try { var m = E.monthly(st, y); yrs[y] = { months: m.months, total: m.total, archived: !!st.years[y].archived }; } catch (e) { /* пропуск */ } });
    return { years: yrs };
  }) : p.theirLevel === "totals" ? Store.loadSummaryOf(p.userId).then(function (row) { return row ? row.data : null; }) : Promise.resolve(null);
  return job.then(function (d) { ui.us = { id: p.userId, name: p.name, level: p.theirLevel, data: d, at: Date.now() }; return ui.us; })
    .catch(function () { ui.us = { id: p.userId, name: p.name, level: "hidden", data: null, at: Date.now() }; return ui.us; });
}
routes.us = function () {
  if (RO()) { switchTo("me"); return; }
  if (!ui.usLoaded) {
    $main.innerHTML = "<p class='loading'>Собираю общий бюджет…</p>";
    ui.usLoaded = true;
    loadPartnerData(true).then(function () { if (location.hash === "#us") render(); ui.usLoaded = false; });
    return;
  }
  var pd = ui.us && ui.us.data, pName = (ui.us && ui.us.name) || (sh && sh.partner ? sh.partner.name : "партнёр"), meName = myName() || "Я";
  var ys = activeYears(), y = ui.usYear && ys.indexOf(ui.usYear) >= 0 ? ui.usYear : (ys.indexOf(E.todayISO().slice(0, 4)) >= 0 ? E.todayISO().slice(0, 4) : ys[ys.length - 1]);
  var mine = E.monthly(state, y), theirs = pd && pd.years && pd.years[y], both = !!theirs;
  var nowM = String(new Date().getFullYear()) === y ? new Date().getMonth() : 11;
  var sum = function (k, m) { var a = mine.months[m][k] || 0, b = both ? (theirs.months[m][k] || 0) : 0; return a + b; };
  var tot = function (k) { return (mine.total[k] || 0) + (both ? (theirs.total[k] || 0) : 0); };
  var capMe = mine.months[nowM].cap, capThem = both ? theirs.months[nowM].cap : null;
  var html = "<div class='page-head'><div class='chips'>" + ys.map(function (x) { return "<button class='chip" + (x === y ? " on" : "") + "' data-uy='" + x + "'>" + x + "</button>"; }).join("") + "</div></div>";
  if (!both) html += "<div class='hint' style='margin:0 0 14px'>" + (ui.us ? esc(pName) + " пока не открыла свой бюджет" + (ui.us.data ? " за " + y : "") + ". В её «Настройках → Мы и доступ» можно открыть итоги или весь бюджет." :
    "Цифры на двоих появятся, когда партнёр войдёт в приложение и откроет доступ к своему бюджету.") + " Пока — твои цифры и общие траты.</div>";
  var months = nowM + 1;
  // 1. капитал вместе
  var capAll = (capMe || 0) + (capThem || 0), pMe = both && capAll > 0 ? Math.max(0, Math.min(100, Math.round((capMe || 0) / capAll * 100))) : 100;
  html += "<div class='card ut-cap'><div class='small muted'>" + (both ? "Капитал вместе" : "Капитал") + "<button type='button' class='q-btn' data-explain='cap' aria-label='Что такое капитал'>?</button></div>" +
    "<div class='ut-sum'>" + (capMe === null ? "—" : eur(rnd(capAll), { dec: 0 })) + "</div>" +
    (both ? "<div class='ut-bar'><i style='width:" + pMe + "%'></i><i style='width:" + (100 - pMe) + "%'></i></div><div class='ut-leg'><span><b class='d1'>●</b> " + esc(meName) + " " + eur(rnd(capMe || 0), { dec: 0 }) + "</span><span><b class='d2'>●</b> " + esc(pName) + " " + eur(rnd(capThem || 0), { dec: 0 }) + "</span></div>" : "") +
    "<div class='small muted' style='margin-top:6px'>на конец " + E.MONTHS_GEN[nowM] + "</div></div>";
  // 2. сколько тратим вдвоём — прозрачно: общие целиком + личное каждой сверх своей доли в общих
  // Период один на весь блок: полные месяцы года (как в «Кто платил»); за прошлые годы — весь год.
  var ex = sh ? sh.expenses.filter(function (e) { return (e.kind === "expense" || e.kind === "batch") && e.date.slice(0, 4) === y; }) : [];
  var prevEx = sh ? sh.expenses.filter(function (e) { return (e.kind === "expense" || e.kind === "batch") && e.date.slice(0, 4) === String(Number(y) - 1); }) : [];
  var toE = function (e) { return S.toEur(e.cost, e.currency, e.date, state.settings); };
  var fullM = String(new Date().getFullYear()) === y ? Math.max(1, new Date().getMonth()) : 12;
  var pay = window.BudgetInsights.payers(sh ? sh.expenses : [], y, fullM, toE), period = pay.label;
  var catKey = function (e) { return e.kind === "batch" && !e.cat ? "Сводные суммы" : S.catOf(e, sh.learned); };
  var byCat = {}, prevCat = {}, sharedTot = 0, shareMe = 0;
  ex.forEach(function (e) {
    if (Number(e.date.slice(5, 7)) > fullM) return;
    var v = toE(e), c = catKey(e); byCat[c] = (byCat[c] || 0) + v; sharedTot += v;
    shareMe += S.toEur(e.share, e.currency, e.date, state.settings);
  });
  prevEx.forEach(function (e) { if (Number(e.date.slice(5, 7)) > fullM) return; var c = catKey(e); prevCat[c] = (prevCat[c] || 0) + toE(e); });
  var shareThem = sharedTot - shareMe, livSum = function (src) { var t = 0; for (var mi = 0; mi < fullM; mi++) t += src.months[mi].living || 0; return t / fullM; };
  var livMe = livSum(mine), livThem = both ? livSum(theirs) : null;
  var sharedM = sharedTot / fullM, overMe = livMe - shareMe / fullM, overThem = both ? livThem - shareThem / fullM : null;
  var family = both ? sharedM + overMe + overThem : null;
  var low = function (over, liv) { return over !== null && over < Math.max(10000, (liv || 0) * 0.15); };
  var row = function (label, sub, v, cls) { return "<div class='kv" + (cls ? " " + cls : "") + "'><span>" + label + (sub ? " <small>" + sub + "</small>" : "") + "</span><b>" + (v === null ? "—" : eur(rnd(v), { dec: 0 })) + "</b></div>"; };
  html += "<div class='card ut-spend'><h2>Сколько тратим вдвоём · в месяц</h2><p class='small muted' style='margin:-6px 0 8px'>" + esc(period) + ", в среднем за месяц</p>" +
    row("Общие траты", "Splitwise, целиком", sharedM) +
    row(esc(meName) + " сверх общих", "личное на жизнь − своя доля в общих", overMe) +
    row(esc(pName) + " сверх общих", "личное на жизнь − своя доля в общих", overThem) +
    row("Итого как семья", "", family, "ut-total") +
    [[meName, overMe, livMe], [pName, overThem, livThem]].filter(function (x) { return low(x[1], x[2]); }).map(function (x) {
      return "<p class='hint small ut-warn'>Похоже, в плане " + esc(nameGen(x[0])) + " учтены не все общие траты: личное на жизнь " + (x[1] < 0 ? "меньше" : "почти равно") + " доле в общих.</p>";
    }).join("") +
    "<details class='ut-how'><summary>Как считается</summary><ul class='small muted'>" +
    "<li><b>Общие траты</b> — все траты и сводные суммы из общей ленты за " + esc(period) + ", целиком, в евро. Переводы между вами не считаются.</li>" +
    "<li><b>Сверх общих</b> — личный план «на жизнь» (без налогов и накоплений) минус своя доля в общих: каждая вносит долю общих в личный план, поэтому её вычитаем, чтобы не посчитать дважды.</li>" +
    "<li>Доли: " + esc(meName) + " " + eur(rnd(shareMe / fullM), { dec: 0 }) + ", " + esc(pName) + " " + eur(rnd(shareThem / fullM), { dec: 0 }) + " в месяц. Личное на жизнь: " + esc(meName) + " " + eur(rnd(livMe), { dec: 0 }) + (both ? ", " + esc(pName) + " " + eur(rnd(livThem), { dec: 0 }) : "") + ".</li>" +
    "<li><b>Итого как семья</b> = общие + сверх общих у каждой.</li></ul></details></div>";
  // 3. кто платил — та же формула, что «Кто платил» в «Для справки»
  if (pay.all > 0) {
    var shMe = pay.me / pay.all, pm = Math.round(shMe * 100);
    html += "<div class='card'><div class='small muted'>Кто платил за общее · " + esc(period) + "</div><div class='ut-bar' style='margin-top:8px'><i style='width:" + pm + "%'></i><i style='width:" + (100 - pm) + "%'></i></div>" +
      "<div class='ut-leg'><span>" + esc(meName) + " " + pm + "% · " + eur(rnd(pay.me), { dec: 0 }) + "</span><span>" + esc(pName) + " " + (100 - pm) + "% · " + eur(rnd(pay.them), { dec: 0 }) + "</span></div>" +
      "<p class='small muted' style='margin:6px 0 0'>Траты и сводные суммы, в евро. Это кто оплачивал, а не чья доля больше — разницу закрывает «Рассчитаться».</p></div>";
  }
  // 4. выводы про нас
  if (sh) {
    var tres = window.BudgetInsights.together(sh.expenses, { today: E.todayISO(), learned: sh.learned, partnerName: pName, toLog: toLogCount(), toEur: toE });
    if (both) {
      var dcap = (mine.total.dcap || 0) + (theirs.total.dcap || 0);
      var cc = { id: "capboth", ic: "◆", rank: 0, h: "Капитал вместе за " + y + ": " + eur(rnd(dcap), { dec: 0, plus: true }), p: meName + " " + eur(rnd(mine.total.dcap || 0), { dec: 0, plus: true }) + ", " + pName + " " + eur(rnd(theirs.total.dcap || 0), { dec: 0, plus: true }) + "." };
      if (dcap >= 0) tres.good = [cc].concat(tres.good).slice(0, 3); else tres.improve = [cc].concat(tres.improve).slice(0, 3);
    }
    html += "<div class='section'><h2 style='margin-bottom:0'>Выводы про нас</h2></div>" + sandwichHtml(tres);
  }
  // 5. на что уходят общие деньги: названия целиком, суммы ровной колонкой, стрелки отдельно
  var cats2 = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
  if (sharedTot > 0) {
    var mx = byCat[cats2[0]] || 1;
    html += "<div class='card section'><h2>На что уходят общие деньги</h2><p class='small muted' style='margin-top:-6px'>" + esc(period) + " · целиком · в среднем " + eur(rnd(sharedTot / fullM), { dec: 0 }) + " в месяц</p><div class='ut-cats'>" +
      cats2.slice(0, 8).map(function (c) {
        var v = byCat[c], pv = prevCat[c], tr = pv ? (v > pv * 1.15 ? "↑" : v < pv * 0.85 ? "↓" : "") : "";
        return "<div class='uc-row'><span class='uc-n'>" + catIcon(c) + "<span>" + esc(catLabel(c)) + "</span></span><span class='uc-v'>" + eur(rnd(v), { dec: 0 }) + "</span><span class='uc-tr " + (tr === "↑" ? "up" : tr ? "down" : "") + "'" + (tr ? " title='" + (tr === "↑" ? "больше" : "меньше") + ", чем " + esc(period.replace(y, String(Number(y) - 1))) + "'" : "") + ">" + tr + "</span>" +
          "<span class='uc-track'><i style='width:" + Math.max(3, Math.round(v / mx * 100)) + "%'></i></span></div>";
      }).join("") + "</div>" +
      "<details class='ut-how'><summary>Как считается</summary><ul class='small muted'><li>Суммы — общие траты целиком (обе доли), в евро, за " + esc(period) + ".</li>" +
      "<li>↑ / ↓ — больше или меньше, чем за те же месяцы " + (Number(y) - 1) + ", если разница больше 15%.</li><li>Показаны 8 самых крупных категорий.</li></ul></details></div>";
  }
  // 6. твоя доля по категориям
  var msh = S.monthlyShares(sharedForCalc(), state.settings, y), shareRows = Object.keys(msh.byCat).map(function (c) { return { c: c, v: msh.byCat[c].reduce(function (a, b) { return a + b; }, 0) }; }).filter(function (x) { return Math.abs(x.v) >= 100; }).sort(function (a, b) { return b.v - a.v; });
  if (shareRows.length) html += "<div class='card section'><h2>Твоя доля по категориям</h2><p class='small muted' style='margin-top:-6px'>" + y + " · то, что приходится на тебя из общих трат</p>" +
    shareRows.slice(0, 8).map(function (x) { return "<div class='kv'><span>" + esc(catLabel(x.c)) + "</span><b>" + eur(rnd(x.v), { dec: 0 }) + "</b></div>"; }).join("") + "</div>";
  // 7. коммуналка
  var uc = utilitiesCard(); html += uc.html;
  // 8. графики
  var capVals = mine.months.map(function (m, i) { return { me: m.cap, them: both ? theirs.months[i].cap : null }; });
  html += "<div class='grid2 section'><div class='card'><h2>" + (both ? "Капитал вместе" : "Капитал") + " по месяцам</h2>" + C.bars({ labels: E.MONTHS, short: E.MONTHS_SHORT, stacked: true, title: "Капитал по месяцам",
    fmt: function (v) { return E.eur(Math.round(v) * 100, { dec: 0 }); },
    series: [{ name: meName, color: "var(--series-1)", values: capVals.map(function (c) { return c.me === null ? 0 : c.me / 100; }) }].concat(both ? [{ name: pName, color: "var(--series-2)", values: capVals.map(function (c) { return c.them === null ? 0 : c.them / 100; }) }] : []) }) + "</div>";
  html += "<div class='card'><h2>Доходы и расходы" + (both ? " вдвоём" : "") + "</h2>" + C.bars({ labels: E.MONTHS, short: E.MONTHS_SHORT, title: "Доходы и расходы по месяцам",
    fmt: function (v) { return E.eur(Math.round(v) * 100, { dec: 0 }); },
    series: [{ name: "доходы", color: "var(--series-3)", values: mine.months.map(function (_, i) { return sum("income", i) / 100; }) }, { name: "расходы", color: "var(--series-2)", values: mine.months.map(function (_, i) { return sum("total", i) / 100; }) }] }) + "</div></div>";
  if (ui.us && ui.us.level === "full") html += "<div class='section row'><button class='btn' id='openPartner'>Открыть её бюджет целиком</button></div>";
  $main.innerHTML = html;
  $main.querySelectorAll("[data-uy]").forEach(function (b) { b.onclick = function () { ui.usYear = b.dataset.uy; render(); }; });
  var op = $main.querySelector("#openPartner"); if (op) op.onclick = function () { switchTo(ui.us.id); location.hash = "#home"; };
  bindInsights($main); uc.bind();
  $main.querySelectorAll(".ut-cap [data-explain]").forEach(function (q) { q.onclick = function () { explain(q.dataset.explain); }; });
};


// Из чего складывается сумма «в обращении» на неделю w
function obrBreakdown(y, w) {
  var r = E.compute(state, y), yr = state.years[y], L = -1;
  for (var i = w; i >= 0; i--) if (r.fact[i] !== null) { L = i; break; }
  var html = "<div class='m-body ob'><h2>Из чего складывается " + eur(rnd(r.base[w]), { dec: 0 }) + "</h2><p class='small muted' style='margin:2px 0 12px'>В обращении на " + esc(shortWeek(y, w)) + " — деньги на картах и в наличке, без накоплений.</p>";
  var startV;
  if (L >= 0) {
    startV = r.fact[L];
    var accRows = state.accounts.filter(function (a) { var e = (yr.recon[L] || {})[a.id]; return e && e.cents !== null && E.accountActive(a, r.weeks[L]); })
      .map(function (a) { return { n: a.name, v: yr.recon[L][a.id].cents }; }).filter(function (x) { return x.v; }).sort(function (a, b) { return b.v - a.v; });
    html += "<div class='ob-sec'><div class='ob-row head'><span>Сверка " + esc(shortWeek(y, L)) + "</span><b>" + eur(startV) + "</b></div>" +
      accRows.map(function (x) { return "<div class='ob-row sub'><span>" + esc(x.n) + "</span><span>" + eur(x.v) + "</span></div>"; }).join("") + "</div>";
  } else {
    startV = r.start ? r.start.obr : 0;
    html += "<div class='ob-sec'><div class='ob-row head'><span>Старт года</span><b>" + eur(startV) + "</b></div><div class='ob-row sub'><span>Сверок в " + y + " ещё не было — считаю от остатка на 1 января</span><span></span></div></div>";
  }
  if (w > L) {
    var from = L + 1, groups = {};
    state.categories.forEach(function (c) {
      if (c.currency === "RUB") return;
      var sum = 0;
      for (var k = from; k <= w; k++) { var x = r.cells[c.id][k]; if (x) sum += x.cents; }
      if (!sum) return;
      var g = c.block === "income" ? "income" : c.block === "savings" ? "savings" : "spend";
      (groups[g] = groups[g] || []).push({ n: c.name, v: sum });
    });
    var titles = { income: "Доходы по плану", spend: "Расходы по плану", savings: "Переводы в накопления" };
    html += "<p class='small muted' style='margin:14px 0 6px'>С тех пор по плану" + (from === w ? " (" + esc(shortWeek(y, w)) + ")" : ": " + esc(shortWeek(y, from)) + " — " + esc(shortWeek(y, w))) + "</p>";
    ["income", "spend", "savings"].forEach(function (g) {
      var list = (groups[g] || []).sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); });
      if (!list.length) return;
      var tot = list.reduce(function (t, x) { return t + x.v; }, 0), top = list.slice(0, 5), rest = list.slice(5).reduce(function (t, x) { return t + x.v; }, 0);
      html += "<div class='ob-sec'><div class='ob-row head'><span>" + titles[g] + "</span><b class='" + sign(tot) + "'>" + eur(tot, { plus: true }) + "</b></div>" +
        top.map(function (x) { return "<div class='ob-row sub'><span>" + esc(x.n) + "</span><span>" + eur(x.v, { plus: true }) + "</span></div>"; }).join("") +
        (rest ? "<div class='ob-row sub'><span>остальное (" + (list.length - 5) + ")</span><span>" + eur(rest, { plus: true }) + "</span></div>" : "") + "</div>";
    });
  }
  html += "<div class='ob-row total'><span>В обращении на " + esc(shortWeek(y, w)) + "</span><b>" + eur(r.base[w]) + "</b></div>" +
    (r.fact[w] === null ? "<p class='small muted' style='margin:10px 0 0'>Это расчёт: сверка покажет, сколько на самом деле.</p>" : "") + "</div>" +
    "<div class='m-foot'><button class='btn ghost' data-act='def'>Что такое «в обращении»</button><button class='btn primary' data-act='ok'>Понятно</button></div>";
  modal(html, function (m) { m.querySelector("[data-act=ok]").onclick = closeModal; m.querySelector("[data-act=def]").onclick = function () { explain("obr"); }; });
}


// ===== ОБЩИЕ ТРАТЫ =====
function sharedSetup() {
  var cloud = Store.mode === "cloud", meName = (Store.user() && Store.user().name) || "";
  $main.innerHTML = "<div class='page-head'><div><h1>Общие траты</h1><div class='sub'>Общее пространство для двоих: траты, доли, баланс «кто кому должен».</div></div></div>" +
    "<div class='card' style='max-width:560px'><h2>Создать общее пространство</h2>" +
    (cloud ? "<p class='muted' style='margin-top:-4px'>Партнёру ничего настраивать не нужно: пусть откроет этот сайт и войдёт с email, который ты укажешь.</p>" : "") +
    "<form id='spForm' class='form-grid'><label class='f'>Моё имя<input name='me' value='" + esc(meName) + "' required></label>" +
    "<label class='f'>Имя партнёра<input name='partner' required placeholder='Рита'></label>" +
    (cloud ? "<label class='f' style='grid-column:1/-1'>Email партнёра (для входа)<input type='email' name='email' required placeholder='rita@…'></label>" : "") +
    "<button class='btn primary' type='submit'>Создать</button></form></div>";
  $main.querySelector("#spForm").onsubmit = function (e) {
    e.preventDefault();
    var f = e.target;
    Store.createSpace("Общие траты", f.me.value.trim(), f.partner.value.trim(), f.email ? f.email.value.trim() : "")
      .then(loadShared).then(loadPeople).then(function () { profileBar(); render(); toast("Пространство создано"); })
      .catch(function (err) { toast("Не получилось: " + err.message); });
  };
}

// своё название для встроенной категории общих трат (данные не переписываются)
function catLabel(c) { var m = sh && sh.space.settings.catNames; return (m && m[c]) || c; }
function sharedCats() {
  var custom = (sh && sh.space.settings.customCats) || [], hidden = (sh && sh.space.settings.hiddenCats) || [];
  return S.SHARED_CATS.filter(function (c) { return c !== "Сводные суммы"; }).concat(custom.filter(function (c) { return S.SHARED_CATS.indexOf(c) < 0; })).filter(function (c) { return hidden.indexOf(c) < 0; });
}
function catPicker(current, onPick) {
  var list = sharedCats();
  modal("<div class='m-body'><h2>Категория</h2><div class='chips cat-grid'>" + list.map(function (c) { return "<button class='chip" + (c === current ? " on" : "") + "' data-pc='" + esc(c) + "'>" + esc(catLabel(c)) + "</button>"; }).join("") +
    "<button class='chip add' data-pc-new='1'>+ своя категория</button></div></div><div class='m-foot'><button class='btn ghost' data-act='x'>Отмена</button></div>", function (m) {
    m.querySelector("[data-act=x]").onclick = closeModal;
    m.querySelectorAll("[data-pc]").forEach(function (b) { b.onclick = function () { closeModal(); onPick(b.dataset.pc); }; });
    m.querySelector("[data-pc-new]").onclick = function () {
      var n = (prompt("Название новой категории общих трат (например, «Животные»)") || "").trim();
      if (!n) return;
      sh.space.settings.customCats = (sh.space.settings.customCats || []).concat([n]);
      Store.saveSpaceSettings(sh.space.id, sh.space.settings).catch(function () {});
      closeModal(); onPick(n);
    };
  });
}
routes.shared = function () {
  if (!sh) return sharedSetup();
  var st = ui.shared, set = myState.settings, learned = sh.learned;
  var partner = sh.partner ? sh.partner.name : "Партнёр", meName = sh.me.name;
  var exps = sh.expenses, calc = sharedForCalc();
  var yrs = {}; exps.forEach(function (e) { yrs[e.date.slice(0, 4)] = 1; });
  var ylist = Object.keys(yrs).sort();
  if (!st.year) st.year = ylist.indexOf(E.todayISO().slice(0, 4)) >= 0 ? E.todayISO().slice(0, 4) : (ylist[ylist.length - 1] || E.todayISO().slice(0, 4));
  if (ylist.indexOf(st.year) < 0) ylist.push(st.year);
  var bal = S.balance(exps);
  var balHtml = Object.keys(bal).filter(function (k) { return Math.abs(bal[k]) >= 1; }).map(function (k) {
    var v = bal[k];
    return "<div class='kpi-value'>" + E.fmt(Math.abs(v), { cur: k === "EUR" ? "€" : k, dec: 2 }) + "</div><div class='kpi-foot'>" + (v > 0 ? esc(partner) + " должна тебе" : "ты должна " + esc(partner)) + "</div>";
  }).join("") || "<div class='kpi-value'>0 €</div><div class='kpi-foot'>вы в расчёте</div>";
  var invite = sh.partner && !sh.partner.userId && Store.mode === "cloud"
    ? "<div class='hint small row'><span style='flex:1 1 260px'>" + esc(partner) + " ещё не входила. Пусть откроет сайт и войдёт с <b>" + esc(sh.partner.email || "") + "</b> — пространство подключится само." +
      " Её таблицу можно загрузить заранее — тогда бюджет будет ждать её готовым.</span><label class='btn sm' id='prepPartner'><span>Загрузить её таблицу</span><input type='file' id='prepFile' accept='.xlsx' hidden></label></div>" : "";

  // открыт профиль партнёра: лента всё равно с моей стороны — говорим об этом прямо
  var sideNote = RO() ? "<div class='hint small' style='margin:0 0 14px'>Лента показана с твоей стороны: зелёным — что должны тебе, оранжевым — что должна ты. У " + esc(view.name) + " в её профиле цвета наоборот.</div>" : "";
  var balK = Object.keys(bal).filter(function (k) { return Math.abs(bal[k]) >= 1; }), bv = balK.length ? bal[balK[0]] : 0, bc = balK.length && balK[0] !== "EUR" ? balK[0] : "€";
  var html = sideNote + invite + "<div class='card us-bal'><div class='ub-tx'><div class='small muted'>" + (Math.abs(bv) < 1 ? "Вы в расчёте" : bv > 0 ? esc(partner) + " должна тебе" : "Ты должна " + esc(partner)) + "</div>" +
    "<div class='ub-sum'>" + E.fmt(Math.abs(bv), { cur: bc, dec: 2 }) + "</div></div>" + (Math.abs(bv) >= 1 ? "<button class='btn primary' id='settle'>Рассчитаться</button>" : "") + "</div>";
  // общие траты и личный план: текущий месяц
  var nowM = Number(E.todayISO().slice(5, 7)) - 1, covM = myState.years[st.year] ? S.coverage(myState, calc, st.year)[nowM] : null, tl = toLogCount();
  var covBad = covM && covM.personal && covM.shared > covM.personal;
  if (covBad || tl) {
    html += "<div class='us-plan'><b>Общие траты и твой план · " + E.MONTHS[nowM] + "</b>" +
      (covBad ? "<div class='up-row'><span>Еда и развлечения: общие " + E.fmt(rnd(covM.shared), { cur: "€" }) + " — больше, чем в твоём плане (" + E.fmt(rnd(covM.personal), { cur: "€" }) + ")</span><a href='#tolog'>поправить ›</a></div>" : "") +
      (tl ? "<div class='up-row'><span>Нет в личном плане: " + tl + " " + (tl % 10 === 1 && tl % 100 !== 11 ? "трата" : tl % 10 >= 2 && tl % 10 <= 4 && (tl % 100 < 10 || tl % 100 >= 20) ? "траты" : "трат") + "</span><a href='#tolog'>посмотреть ›</a></div>" : "") + "</div>";
  }
  // вход на экран сравнения есть всегда, даже когда всё учтено
  else if (!RO()) html += "<a class='us-plan us-plan-ok' href='#tolog'><span><b>Общие траты и твой план</b><span class='small muted'>всё заметное уже учтено ✓</span></span><span class='arr'>›</span></a>";

  // сколько фильтров включено, кроме года (год виден всегда — в заголовке ленты)
  var nF = (st.month !== "all") + (st.cat !== "all") + (st.kind !== "all") + (st.year !== E.todayISO().slice(0, 4));
  var mlist = ["all"].concat(E.MONTHS_SHORT.map(function (_, i) { return String(i + 1); }));
  var filtered = exps.filter(function (e) {
    if (e.date.slice(0, 4) !== st.year) return false;
    if (st.month !== "all" && Number(e.date.slice(5, 7)) !== Number(st.month)) return false;
    if (st.kind === "transfer" ? (e.kind !== "refund" && e.kind !== "settlement") : (st.kind !== "all" && e.kind !== st.kind)) return false;
    if (st.cat !== "all" && (e.kind === "batch" && !e.cat ? "Сводные суммы" : S.catOf(e, learned)) !== st.cat) return false;
    if (st.q) {
      var q = st.q.toLowerCase().replace(",", "."), hay = ((e.desc || "") + " " + (e.note || "") + " " + (e.cost / 100).toFixed(2) + " " + (e.share / 100).toFixed(2)).toLowerCase();
      if (q.split(/\s+/).some(function (w) { return w && hay.indexOf(w) < 0; })) return false;
    }
    return true;
  }).slice().reverse();
  html += "<div class='section us-feed'><div class='row' style='margin-bottom:10px'>" +
    "<input type='search' id='fQ' class='sh-search' placeholder='Поиск: описание, заметка, сумма' value='" + esc(st.q || "") + "' aria-label='Поиск по общим тратам'>" +
    "<button type='button' class='btn sh-ftoggle" + (st.fopen ? " on" : "") + "' id='fToggle' aria-expanded='" + (st.fopen ? "true" : "false") + "'>Фильтры" + (nF ? " · " + nF : "") + "</button>" +
    (RO() ? "" : "<button type='button' class='btn primary us-addbtn' id='usAdd'>+ Общая трата</button>") +
    "<div class='sh-filters" + (st.fopen ? " open" : "") + "'><select id='fY'>" + ylist.map(function (y) { return "<option" + (y === st.year ? " selected" : "") + ">" + y + "</option>"; }).join("") + "</select>" +
    "<select id='fM'>" + mlist.map(function (m) { return "<option value='" + m + "'" + (m === st.month ? " selected" : "") + ">" + (m === "all" ? "все месяцы" : E.MONTHS[Number(m) - 1]) + "</option>"; }).join("") + "</select>" +
    "<select id='fC'><option value='all'>все категории</option>" + sharedCats().concat(["Сводные суммы"]).map(function (c) { return "<option value='" + esc(c) + "'" + (c === st.cat ? " selected" : "") + ">" + esc(catLabel(c)) + "</option>"; }).join("") + "</select>" +
    "<select id='fK'>" + [["all", "все типы"], ["expense", "траты"], ["batch", "сводные"], ["transfer", "переводы между вами"]].map(function (k) { return "<option value='" + k[0] + "'" + (k[0] === st.kind ? " selected" : "") + ">" + k[1] + "</option>"; }).join("") + "</select></div></div>";
  html += "<div class='small muted' style='margin:-2px 0 8px'>" + (filtered.length ? "Найдено " + filtered.length + (filtered.length > st.limit ? " · показаны последние " + st.limit : "") : "") + "</div>";
  // лента как в Splitwise: по месяцам, кто платил, кто кому должен — цветом
  var monthG = null, feedHtml = "";
  filtered.slice(0, st.limit).forEach(function (e) {
    var k = e.kind, c$ = e.currency === "EUR" ? "€" : e.currency, mKey = e.date.slice(0, 7);
    if (mKey !== monthG) { monthG = mKey; var mi = Number(mKey.slice(5)) - 1; feedHtml += "<li class='fr-month'>" + E.MONTHS[mi][0].toUpperCase() + E.MONTHS[mi].slice(1) + " " + mKey.slice(0, 4) + "</li>"; }
    var dd = Number(e.date.slice(8, 10)) + " " + E.MONTHS_SHORT[Number(e.date.slice(5, 7)) - 1], amt, ic, sub;
    if (k === "settlement" || k === "refund") {
      ic = catIcon("__transfer");
      sub = dd + (k === "refund" ? " · возврат" : "") + " · перевод между вами";
      amt = "<span class='fa transfer'>" + E.fmt(e.cost, { cur: c$ }) + "</span>";
    } else {
      var cc = e.kind === "batch" && !e.cat ? "Сводные суммы" : S.catOf(e, learned);
      ic = catIcon(cc);
      sub = dd + " · " + (e.paidByMe ? "ты" : esc(partner)) + " · " + E.fmt(e.cost, { cur: c$ }) + (e.method === "cash" ? " · нал" : "");
      amt = Math.abs(e.net) < 1 ? "<span class='fa even'>—</span>" : e.net > 0 ? "<span class='fa lent'>+" + E.fmt(e.net, { cur: c$ }) + "</span>" : "<span class='fa owe'>−" + E.fmt(-e.net, { cur: c$ }) + "</span>";
    }
    var title = (k === "settlement" || k === "refund") ? (e.paidByMe ? "Ты → " + esc(partner) : esc(partner) + " → тебе") : esc(e.desc || "без описания");
    feedHtml += "<li class='fr' data-open='" + esc(e.id) + "'>" + ic + "<span class='fr-main'><span class='fr-t'>" + title + "</span><small>" + sub + (e.note ? " · " + esc(e.note) : "") +
      (e.pending ? " · <span class='pend'>не отправлено</span>" : "") + "</small></span>" + amt + "</li>";
  });
  if (!filtered.length) feedHtml = "<li class='fd-empty muted'>Ничего не найдено.</li>";
  html += "<ul class='feed3 card'>" + feedHtml + "</ul>" + (filtered.length > st.limit ? "<div class='row' style='margin-top:10px'><button class='btn' id='more'>Показать ещё " + Math.min(50, filtered.length - st.limit) + "</button><span class='small muted'>осталось " + (filtered.length - st.limit) + "</span></div>" : "") + "</div>";

  var ms = S.monthlyShares(calc, set, st.year);
  var catsUsed = S.SHARED_CATS.filter(function (c) { return ms.byCat[c] && ms.byCat[c].some(function (v) { return Math.abs(v) >= 50; }); });
  html += "<details class='section sh-more'><summary><h2>Твоя доля по категориям, € · " + st.year + "</h2><span class='small muted'>таблица по месяцам</span></summary><div class='tbl-wrap tbl-scroll'><table class='t'><thead><tr><th>Категория</th>" +
    E.MONTHS_SHORT.map(function (m) { return "<th class='n'>" + m + "</th>"; }).join("") + "<th class='n'>Год</th></tr></thead><tbody>";
  var colTot = new Array(12).fill(0);
  catsUsed.forEach(function (c) {
    var arr = ms.byCat[c], t = 0;
    html += "<tr><td>" + esc(catLabel(c)) + "</td>" + arr.map(function (v, i) { t += v; colTot[i] += v; return "<td class='n'>" + (Math.abs(v) >= 50 ? E.fmt(rnd(v)) : "") + "</td>"; }).join("") + "<td class='n'><b>" + E.fmt(rnd(t)) + "</b></td></tr>";
  });
  html += "<tr class='total'><td>Итого</td>" + colTot.map(function (v) { return "<td class='n'>" + E.fmt(rnd(v)) + "</td>"; }).join("") + "<td class='n'>" + E.fmt(rnd(colTot.reduce(function (a, b) { return a + b; }, 0))) + "</td></tr></tbody></table></div></details>";

  if (myState.years[st.year]) {
    var cov = S.coverage(myState, calc, st.year);
    html += "<details class='section sh-more'><summary><h2>Общие и личный план: еда и развлечения</h2><span class='small muted'>сравнение по месяцам</span></summary><p class='small muted' style='margin-top:-6px'>Еда = продукты + кафе + доставка из общих трат. «Вне общего счёта» — сколько из личных сумм на продукты и развлечения ушло мимо общих трат.</p>" +
      "<div class='tbl-wrap tbl-scroll'><table class='t'><thead><tr><th></th>" + E.MONTHS_SHORT.map(function (m) { return "<th class='n'>" + m + "</th>"; }).join("") + "</tr></thead><tbody>" +
      covRow("Общие: еда", cov, "sharedFood") + covRow("Общие: развлечения", cov, "sharedFun") + covRow("Личный план: продукты + развлечения", cov, "personal") +
      "<tr><td>Вне общего счёта</td>" + cov.map(function (c) { return "<td class='n " + (c.personal && c.outside < 0 ? "neg" : "") + "'>" + (c.personal || c.shared ? E.fmt(rnd(c.outside)) : "") + "</td>"; }).join("") + "</tr>" +
      "<tr class='total'><td>Покрытие</td>" + cov.map(function (c) { return "<td class='n'>" + (c.coverage === null ? "" : pct(c.coverage)) + "</td>"; }).join("") + "</tr></tbody></table></div></details>";
  }
  html += "<div class='us-foot small'><button class='linkish' id='shWhy'>Как считаются общие траты</button> · <button class='linkish' id='shExport'>Скачать CSV</button> · <label class='linkish'>Импорт из Splitwise<input type='file' id='swFile' accept='.csv,text/csv' hidden></label></div>";
  $main.innerHTML = html;

  function reloadShared(msg) { return loadShared().then(function () { render(); if (msg) toast(msg); }).catch(function (err) { toast("Ошибка: " + err.message); }); }
  function bindF(id, key) { $main.querySelector(id).onchange = function (e) { st[key] = e.target.value; st.limit = 20; render(); }; }
  $main.querySelector("#fToggle").onclick = function () { st.fopen = !st.fopen; var f = $main.querySelector(".sh-filters"); f.classList.toggle("open", st.fopen); this.classList.toggle("on", st.fopen); this.setAttribute("aria-expanded", st.fopen ? "true" : "false"); };
  $main.querySelector("#shWhy").onclick = function () {
    modal("<div class='m-body'><h2>Как считаются общие траты</h2><p>Каждая трата делится при вводе: поровну, точными суммами, процентами, долями или с поправкой. В расходы каждой попадает только её доля.</p>" +
      "<p>Возврат долга и «Рассчитаться» — это переводы между вами. Они меняют только баланс и в расходы не попадают, иначе покупка посчиталась бы дважды.</p></div>" +
      "<div class='m-foot'><span class='spacer'></span><button class='btn primary' data-act='ok'>Понятно</button></div>", function (m) { m.querySelector("[data-act=ok]").onclick = closeModal; });
  };
  var fq = $main.querySelector("#fQ"), fqT = null;
  fq.oninput = function () { clearTimeout(fqT); fqT = setTimeout(function () { st.q = fq.value.trim(); st.limit = 20; var y0 = window.scrollY; render(); window.scrollTo(0, y0); var n = $main.querySelector("#fQ"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  $main.querySelector("#shExport").onclick = function () {
    var other = partner, rows = [["Дата", "Описание", "Категория", "Тип", "Сумма", "Валюта", "Платил(а)", "Доля " + meName, "Доля " + other, "Способ", "Заметка"]];
    exps.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (e) {
      var type = e.kind === "settlement" || e.kind === "refund" ? "перевод между вами" : e.kind === "batch" ? "сводная" : "трата";
      rows.push([e.date, e.desc || "", type === "трата" || type === "сводная" ? (e.kind === "batch" && !e.cat ? "Сводные суммы" : S.catOf(e, learned)) : "", type,
        (e.cost / 100).toFixed(2).replace(".", ","), e.currency || "EUR", e.paidByMe ? meName : other,
        e.kind === "settlement" ? "" : (e.share / 100).toFixed(2).replace(".", ","), e.kind === "settlement" ? "" : ((e.cost - e.share) / 100).toFixed(2).replace(".", ","),
        e.method === "cash" ? "наличные" : "карта", e.note || ""]);
    });
    download("obshchie-traty-" + E.todayISO() + ".csv", "\ufeff" + rows.map(function (r) { return r.map(function (x) { x = String(x); return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(";"); }).join("\n"), "text/csv");
    toast("Скачано: " + (rows.length - 1) + " записей");
  };
  bindF("#fY", "year"); bindF("#fM", "month"); bindF("#fC", "cat"); bindF("#fK", "kind");
  var more = $main.querySelector("#more"); if (more) more.onclick = function () { var y0 = window.scrollY; st.limit += 50; render(); window.scrollTo(0, y0); };
  window.sharedAdd = function () { expenseSheet(null); };
  var ua = $main.querySelector("#usAdd"); if (ua) ua.onclick = function () { plusSheet("shared"); };
  $main.querySelectorAll("[data-open]").forEach(function (el) {
    el.onclick = function () { var e = exps.find(function (x) { return x.id === el.dataset.open; }); if (e) expenseSheet(e); };
  });
  // категория: меняем сразу на экране, сохраняем в фоне, можно отменить
  $main.querySelectorAll("[data-cat]").forEach(function (btn) {
    btn.onclick = function () {
      var e = exps.find(function (x) { return x.id === btn.dataset.cat; }), prev = e.cat, prevLearned = learned[S.norm(e.desc)];
      catPicker(S.catOf(e, learned), function (c) {
        if (c === S.catOf(e, learned)) return;
        e.cat = c; learned[S.norm(e.desc)] = c; saveLearned(); btn.textContent = c;
        Store.updateShared(e.id, { category: c }).catch(function (err) { toast("Не сохранилось: " + err.message + ". Проверь связь"); });
        pushUndo({ label: "«" + e.desc + "» → " + c + ". Похожие траты буду относить сюда же", revert: function () {
          e.cat = prev; if (prevLearned) learned[S.norm(e.desc)] = prevLearned; else delete learned[S.norm(e.desc)]; saveLearned();
          return Store.updateShared(e.id, { category: prev || null });
        } });
      });
    };
  });
  $main.querySelectorAll("[data-kind]").forEach(function (b) {
    b.onclick = function () {
      var e = exps.find(function (x) { return x.id === b.dataset.kind; }), prev = e.kind, to = b.dataset.to;
      e.kind = to; render();
      Store.updateShared(e.id, { kind: to }).catch(function (err) { toast("Не сохранилось: " + err.message); });
      pushUndo({ label: to === "refund" ? "«" + e.desc + "» — перевод между вами, в расходы не идёт" : "«" + e.desc + "» снова трата", revert: function () { e.kind = prev; return Store.updateShared(e.id, { kind: prev }); } });
    };
  });
  $main.querySelectorAll("[data-delx]").forEach(function (b) {
    b.onclick = function () {
      if (!confirm("Удалить трату у вас обеих? Баланс пересчитается.")) return;
      var row = (sh.rows || []).find(function (r) { return r.id === b.dataset.delx; });
      Store.deleteShared(b.dataset.delx).then(function () { return reloadShared(); }).then(function () {
        if (row) pushUndo({ label: "Трата удалена", revert: function () { return Store.insertShared([row]).then(loadShared); } });
      });
    };
  });
  var pp = $main.querySelector("#prepPartner");
  if (pp) {
    $main.querySelector("#prepFile").onchange = function (e) { preparePartnerBudget(sh.partner.email, partner, e.target.files[0]); e.target.value = ""; };
    Store.pendingFor(sh.partner.email).then(function (r) { if (r && pp.isConnected) pp.querySelector("span").textContent = "Обновить её таблицу · загружена " + new Date(r.created_at).toLocaleDateString("ru-RU"); });
  }
  if ($main.querySelector("#settle")) $main.querySelector("#settle").onclick = function () {
    var v = bal.EUR || 0;
    modal("<div class='m-body'><h2>Рассчитаться</h2><p class='muted'>Перевод между вами меняет только баланс — в расходы он не попадает.</p><div class='form-grid'>" +
      "<label class='f'>Кто переводит<select id='stW'><option value='partner'" + (v > 0 ? " selected" : "") + ">" + esc(partner) + " → мне</option><option value='me'" + (v < 0 ? " selected" : "") + ">я → " + esc(partner) + "</option></select></label>" +
      "<label class='f'>Сумма, €<input type='text' id='stA' value='" + esc((Math.abs(v) / 100).toFixed(2).replace(".", ",")) + "' autofocus></label>" +
      "<label class='f'>Дата<input type='date' id='stD' value='" + E.todayISO() + "'></label></div></div>" +
      "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Записать</button></div>", function (m) {
      m.querySelector("[data-act=cancel]").onclick = closeModal;
      m.querySelector("[data-act=ok]").onclick = function () {
        var a; try { a = E.exprCents(m.querySelector("#stA").value); } catch (err) { toast("Ошибка в сумме"); return; }
        var who = m.querySelector("#stW").value;
        var stl = S.makeSettlement(m.querySelector("#stD").value, who === "partner" ? a : -a);
        closeModal();
        Store.insertShared([SU.toRow(stl, sh.meId, sh.partnerId, sh.space.id)]).then(function () { return reloadShared("Расчёт записан"); });
      };
    });
  };
  $main.querySelector("#swFile").onchange = function (e) {
    var file = e.target.files[0]; if (!file) return;
    file.text().then(function (txt) {
      var head = S.parseCSV(txt)[0] || [], cols = head.slice(5).filter(Boolean);
      if (cols.length < 2) { toast("Не похоже на выгрузку Splitwise"); return; }
      var guess = cols.find(function (c) { return S.norm(c).indexOf(S.norm(meName).split(" ")[0]) === 0; }) || cols[0];
      modal("<div class='m-body'><h2>Импорт из Splitwise</h2><p class='muted'>Какая колонка в выгрузке — ты? Повторные записи не задвоятся.</p>" +
        "<label class='f'>Я в Splitwise<select id='swMe'>" + cols.map(function (c) { return "<option" + (c === guess ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></label></div>" +
        "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Импортировать</button></div>", function (m) {
        m.querySelector("[data-act=cancel]").onclick = closeModal;
        m.querySelector("[data-act=ok]").onclick = function () {
          var res = S.importSplitwise(txt, { myName: m.querySelector("#swMe").value });
          closeModal(); toast("Загружаю " + res.expenses.length + " записей…");
          var rows = res.expenses.map(function (x) { return SU.toRow(x, sh.meId, sh.partnerId, sh.space.id); });
          Store.insertShared(rows).then(function (added) {
            return loadShared().then(function () {
              var b = S.balance(sh.expenses.filter(function (x) { return x.source === "splitwise"; }));
              var okb = Object.keys(res.control).every(function (k) { return Math.abs((b[k] || 0) - res.control[k]) < 2; });
              render(); toast("Добавлено: " + added + (okb ? " · баланс сходится со Splitwise" : " · ⚠ баланс не сходится с Total balance"));
            });
          }).catch(function (err) { toast("Ошибка импорта: " + err.message); });
        };
      });
    });
  };
};
// ---------- ввод общей траты как в Splitwise ----------
function expenseSheet(existing, pre) {
  var partner = sh.partner ? sh.partner.name : "Партнёр", meName = sh.me.name;
  var d = existing ? {
    desc: existing.desc, cost: existing.cost, currency: existing.currency, cat: existing.cat || (existing.kind === "batch" ? "Сводные суммы" : S.catOf(existing, sh.learned)),
    date: existing.date, method: existing.method || "card", note: existing.note || "", paidByMe: existing.paidByMe, kind: existing.kind,
    mode: existing.split ? existing.split.mode : (existing.share * 2 === existing.cost || Math.abs(existing.share * 2 - existing.cost) <= 1 ? "equal" : "exact"),
    values: existing.split ? existing.split.values : { me: existing.share, partner: existing.cost - existing.share },
  } : Object.assign({ desc: "", cost: 0, currency: "EUR", cat: "Продукты", date: E.todayISO(), method: "card", note: "", paidByMe: true, kind: "expense", mode: "equal", values: {} }, pre || {});
  var catTouched = !!existing || !!(pre && pre.cat), pane = "main";
  function money(c) { return E.fmt(c, { cur: d.currency === "EUR" ? "€" : d.currency, dec: 2 }); }
  function split() {
    if (d.mode === "full") return { me: d.paidByMe ? 0 : d.cost, partner: d.paidByMe ? d.cost : 0, error: null };
    return S.computeSplit(d.cost, d.mode, d.values);
  }
  function summary() {
    var sp = split(), payer = d.paidByMe ? "я" : partner;
    if (d.mode === "equal") return "Платил(а) " + payer + ", поровну";
    if (d.mode === "full") return d.paidByMe ? "Платила я, всё на " + partner : "Платила " + partner + ", всё на мне";
    var names = { exact: "точными суммами", percent: "по процентам", shares: "по долям", adjust: "с поправкой" };
    return "Платил(а) " + payer + ", " + names[d.mode] + (sp.error ? " ⚠" : "");
  }
  function owesLine(paidByMe, mode) {
    var c = d.cost || 0, sp = mode === "full" ? { me: paidByMe ? 0 : c, partner: paidByMe ? c : 0 } : S.computeSplit(c, "equal");
    return paidByMe ? "<span class='pos'>" + esc(partner) + " должна тебе " + money(sp.partner) + "</span>" : "<span class='neg'>Ты должна " + esc(partner) + " " + money(sp.me) + "</span>";
  }
  function draw() {
    var html;
    if (pane === "main") {
      html = "<div class='sheet-head'><button class='btn ghost' data-act='cancel'>Отмена</button><b>" + (existing ? "Трата" : "Новая трата") + "</b><button class='btn ghost save' data-act='save'>Сохранить</button></div>" +
        "<div class='m-body sheet-body'><div class='with'>С тобой: <span class='chip on'>" + esc(partner) + "</span></div>" +
        "<label class='big-field'><span class='ic'>✎</span><input id='exDesc' placeholder='Описание' value='" + esc(d.desc) + "' autocomplete='off'></label>" +
        "<label class='big-field amount'><select id='exCur' aria-label='Валюта'>" + ["EUR", "RUB", "USD", "GEL"].map(function (c) { return "<option" + (c === d.currency ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select>" +
        "<input id='exCost' inputmode='decimal' placeholder='0,00' value='" + (d.cost ? esc(String(d.cost / 100).replace(".", ",")) : "") + "'></label>" +
        "<div class='center'><button class='btn split-pill' data-act='split'>" + esc(summary()) + "</button></div>" +
        "<div class='sheet-meta'><label class='f'>Дата<input type='date' id='exDate' value='" + esc(d.date) + "'></label>" +
        "<label class='f'>Категория<select id='exCat'>" + sharedCats().map(function (c) { return "<option value='" + esc(c) + "'" + (c === d.cat ? " selected" : "") + ">" + esc(catLabel(c)) + "</option>"; }).join("") + "</select></label>" +
        "<label class='f'>Способ<select id='exMethod'><option value='card'" + (d.method !== "cash" ? " selected" : "") + ">карта</option><option value='cash'" + (d.method === "cash" ? " selected" : "") + ">наличные</option></select></label>" +
        "<label class='f' style='grid-column:1/-1'>Заметка<input id='exNote' value='" + esc(d.note) + "' placeholder='необязательно'></label></div>" +
        (existing ? "<div class='row' style='margin-top:14px'><label class='row small'><input type='checkbox' id='exRefund'" + (d.kind === "refund" ? " checked" : "") + "> это возврат долга — в расходы не пойдёт</label><span class='spacer'></span><button class='btn ghost danger' data-act='delete'>Удалить</button></div>" : "") +
        "</div>";
    } else if (pane === "quick") {
      var opts = [["me", "equal", "Платила я, поровну"], ["me", "full", "Платила я, всё на " + partner], ["partner", "equal", "Платила " + partner + ", поровну"], ["partner", "full", "Платила " + partner + ", всё на мне"]];
      html = "<div class='sheet-head'><button class='btn ghost' data-act='back'>‹ Назад</button><b>Как делим?</b><span style='width:70px'></span></div><div class='sheet-body'>" +
        opts.map(function (o, i) {
          var on = (o[0] === "me") === d.paidByMe && d.mode === o[1];
          return "<button class='opt" + (on ? " on" : "") + "' data-q='" + i + "'><span><b>" + esc(o[2]) + "</b><br>" + owesLine(o[0] === "me", o[1]) + "</span>" + (on ? "<span class='check'>✓</span>" : "") + "</button>";
        }).join("") + "<div class='center' style='padding:16px'><button class='btn' data-act='more'>Больше вариантов</button></div></div>";
      pane_opts = opts;
    } else {
      var modes = [["equal", "=", "Поровну"], ["exact", "1,23", "Точные суммы"], ["percent", "%", "Проценты"], ["shares", "▥", "Доли"], ["adjust", "+/−", "Поправка"]];
      var m = d.mode === "full" ? "exact" : d.mode;
      if (d.mode === "full") { d.mode = "exact"; var f0 = split(); d.values = { me: d.paidByMe ? 0 : d.cost, partner: d.paidByMe ? d.cost : 0 }; }
      var sp = split(), unit = { exact: "€", percent: "%", shares: "доли", adjust: "+ €" }[m];
      var hint = { equal: "Сумма делится пополам.", exact: "Укажи, сколько точно должен каждый.", percent: "Проценты в сумме — 100%.", shares: "Например, 2 ночи → 2 доли.", adjust: "Укажи, кто должен больше; остальное — поровну." }[m];
      function inVal(who) {
        var v = (d.values || {})[who];
        if (v === undefined || v === null || v === "") return "";
        return (m === "exact" || m === "adjust") ? String(v / 100).replace(".", ",") : String(v).replace(".", ",");
      }
      html = "<div class='sheet-head'><button class='btn ghost' data-act='quick'>‹ Назад</button><b>Деление</b><button class='btn ghost save' data-act='done'>Готово</button></div><div class='sheet-body'>" +
        "<div class='row' style='justify-content:center;margin-bottom:12px'>Платил(а): <div class='seg'><button data-payer='me' class='" + (d.paidByMe ? "on" : "") + "'>" + esc(meName) + "</button><button data-payer='partner' class='" + (!d.paidByMe ? "on" : "") + "'>" + esc(partner) + "</button></div></div>" +
        "<div class='modes'>" + modes.map(function (x) { return "<button data-mode='" + x[0] + "' class='" + (x[0] === m ? "on" : "") + "' title='" + x[2] + "'>" + x[1] + "</button>"; }).join("") + "</div>" +
        "<p class='center small muted'><b>" + modes.find(function (x) { return x[0] === m; })[2] + "</b><br>" + hint + "</p>" +
        [["me", meName], ["partner", partner]].map(function (p) {
          return "<div class='person'><div><b>" + esc(p[1]) + "</b><div class='small muted'>" + money(sp[p[0]]) + "</div></div>" +
            (m === "equal" ? "" : "<label class='row'>" + (m === "adjust" ? "+" : "") + "<input class='pv' data-who='" + p[0] + "' inputmode='decimal' placeholder='0' value='" + esc(inVal(p[0])) + "'><span class='small muted'>" + unit + "</span></label>") + "</div>";
        }).join("") +
        "<div class='split-foot " + (sp.error ? "neg" : "") + "'>" + (sp.error ? esc(sp.error) : "✓ " + money(d.cost) + " распределено") + "</div></div>";
    }
    modal(html, bind);
  }
  var pane_opts = null;
  function readMain(m) {
    if (!m.querySelector("#exDesc")) return true;
    d.desc = m.querySelector("#exDesc").value.trim();
    try { d.cost = E.exprCents(m.querySelector("#exCost").value) || 0; } catch (err) { toast("Ошибка в сумме"); return false; }
    d.currency = m.querySelector("#exCur").value; d.date = m.querySelector("#exDate").value; d.cat = m.querySelector("#exCat").value;
    d.method = m.querySelector("#exMethod").value; d.note = m.querySelector("#exNote").value.trim();
    var rf = m.querySelector("#exRefund"); if (rf) d.kind = rf.checked ? "refund" : (d.kind === "refund" ? "expense" : d.kind);
    return true;
  }
  function bind(m) {
    m.classList.add("sheet");
    var q = function (sel) { return m.querySelector(sel); };
    if (q("[data-act=cancel]")) q("[data-act=cancel]").onclick = closeModal;
    var desc = q("#exDesc");
    if (desc) {
      if (!existing) setTimeout(function () { desc.focus(); }, 40);
      desc.addEventListener("input", function () { if (!catTouched) q("#exCat").value = S.guessCategory(desc.value, null, sh.learned); });
      q("#exCat").addEventListener("change", function () { catTouched = true; });
      q("#exCost").addEventListener("input", function () { try { d.cost = E.exprCents(q("#exCost").value) || 0; q("[data-act=split]").textContent = summary(); } catch (err) {} });
    }
    if (q("[data-act=split]")) q("[data-act=split]").onclick = function () { if (!readMain(m)) return; pane = "quick"; draw(); };
    if (q("[data-act=back]")) q("[data-act=back]").onclick = function () { pane = "main"; draw(); };
    if (q("[data-act=quick]")) q("[data-act=quick]").onclick = function () { pane = "quick"; draw(); };
    if (q("[data-act=more]")) q("[data-act=more]").onclick = function () { pane = "more"; draw(); };
    m.querySelectorAll("[data-q]").forEach(function (b) {
      b.onclick = function () { var o = pane_opts[Number(b.dataset.q)]; d.paidByMe = o[0] === "me"; d.mode = o[1]; d.values = {}; pane = "main"; draw(); };
    });
    m.querySelectorAll("[data-payer]").forEach(function (b) { b.onclick = function () { d.paidByMe = b.dataset.payer === "me"; draw(); }; });
    m.querySelectorAll("[data-mode]").forEach(function (b) {
      b.onclick = function () {
        d.mode = b.dataset.mode;
        d.values = d.mode === "percent" ? { me: 50, partner: 50 } : d.mode === "shares" ? { me: 1, partner: 1 } : d.mode === "exact" ? { me: Math.round(d.cost / 2), partner: d.cost - Math.round(d.cost / 2) } : {};
        draw();
      };
    });
    m.querySelectorAll(".pv").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var raw = inp.value.trim(), v;
        try { v = raw === "" ? 0 : E.evalExpr(raw); } catch (err) { toast("Ошибка: " + err.message); return; }
        d.values = d.values || {};
        d.values[inp.dataset.who] = (d.mode === "exact" || d.mode === "adjust") ? Math.round(v * 100) : v;
        // точные суммы: второй получает остаток автоматически, если его ещё не трогали
        if (d.mode === "exact") { var other = inp.dataset.who === "me" ? "partner" : "me"; if (!inp.dataset.both) d.values[other] = d.cost - d.values[inp.dataset.who]; }
        if (d.mode === "percent") { var o2 = inp.dataset.who === "me" ? "partner" : "me"; d.values[o2] = Math.round((100 - v) * 100) / 100; }
        draw();
      });
    });
    if (q("[data-act=done]")) q("[data-act=done]").onclick = function () {
      var sp = split(); if (sp.error) { toast(sp.error); return; }
      pane = "main"; draw();
    };
    if (q("[data-act=delete]")) q("[data-act=delete]").onclick = function () {
      if (!confirm("Удалить «" + existing.desc + "» у обоих?")) return;
      var row = (sh.rows || []).find(function (r) { return r.id === existing.id; });
      closeModal(); Store.deleteShared(existing.id).then(loadShared).then(function () {
        render();
        if (row) pushUndo({ label: "Трата «" + existing.desc + "» удалена", revert: function () { return Store.insertShared([row]).then(loadShared); } });
      });
    };
    if (q("[data-act=save]")) q("[data-act=save]").onclick = function () {
      if (!readMain(m)) return;
      if (!d.desc) { toast("Добавь описание"); q("#exDesc").focus(); return; }
      if (!d.cost) { toast("Укажи сумму"); q("#exCost").focus(); return; }
      var sp = split(); if (sp.error) { toast("Деление: " + sp.error); return; }
      var ex = S.makeExpense({ date: d.date, desc: d.desc, cost: d.cost, currency: d.currency, paidByMe: d.paidByMe, myShare: sp.me, cat: d.cat, method: d.method,
        note: d.note, kind: d.kind === "batch" ? "batch" : d.kind, split: { mode: d.mode, values: d.values || {} } });
      sh.learned[S.norm(ex.desc)] = d.cat; saveLearned();
      var row = SU.toRow(ex, sh.meId, sh.partnerId, sh.space.id);
      var btn = q("[data-act=save]"); btn.disabled = true;
      var job;
      if (existing) { delete row.space_id; delete row.source; delete row.ext_id; job = Store.updateShared(existing.id, row); }
      else job = Store.insertShared([row]);
      job.then(function () { closeModal(); ui.shared.year = d.date.slice(0, 4); return loadShared(); })
        .then(function () { render(); toast(existing ? "Сохранено" : "Трата добавлена"); })
        .catch(function (err) { btn.disabled = false; toast("Не сохранилось: " + err.message); });
    };
  }
  draw();
}

function covRow(label, cov, k) { return "<tr><td>" + label + "</td>" + cov.map(function (c) { return "<td class='n'>" + (c[k] ? E.fmt(rnd(c[k])) : "") + "</td>"; }).join("") + "</tr>"; }
