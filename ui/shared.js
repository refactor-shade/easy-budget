/* Easy Budget — общие траты: «Общие», «в личный план», «Мы», ввод траты как в Splitwise. */
(function () {
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
    // цвета и путь иконки — из CAT_STYLE / CAT_IC выше (свой код)
    return tpl("<span class='cat-ic' style='background:{bg};color:{fg}' title='{t}'><svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'>{!ic}</svg></span>",
      { bg: st[2], fg: st[3], t: name === "__transfer" ? "перевод" : name || "", ic: CAT_IC[st[1]] });
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

  // Строка «По категориям за месяц»: траты месяца, с какими строками плана сравниваю, довписать / не учитывать
  function tlRowSheet(x, ty, tm, rr) {
    var set = state.settings, calc = sharedForCalc(), mName = E.MONTHS[tm] + " " + ty;
    var exps = calc.expenses.filter(function (e) { return e.kind === "expense" && e.date.slice(0, 4) === ty && Number(e.date.slice(5, 7)) - 1 === tm && x.cats.indexOf(S.catOf(e, calc.learned)) >= 0; })
      .sort(function (a, b) { return b.share - a.share; });

    var picked = x.pids.slice(), over = x.over, skipK = ty + "-" + tm + ":" + x.key;
    // выбранные строки — первыми, чтобы сразу было видно, с чем сравниваю
    var opts = cats().filter(function (c) { return !c.archived && c.block !== "income" && c.block !== "savings"; })
      .sort(function (a, b) { return (picked.indexOf(b.id) >= 0) - (picked.indexOf(a.id) >= 0); });
    var expLi = function (e) { return tpl("<li><span>{d} · {desc}</span><b>{v}</b></li>", { d: e.date.slice(8, 10) + "." + e.date.slice(5, 7), desc: e.desc, v: E.eur(S.toEur(e.share, e.currency, e.date, set)) }); };
    var tg = function (id, label, on, attr) { return tpl("<button type='button' class='tg{on}' {a}='{id}'>{l}</button>", { on: on ? " on" : "", a: attr, id: id, l: (on ? "✓ " : "") + label }); };
    modal(tpl("<div class='m-body tl-sheet'><h2>{c} · {m}</h2><div class='tl-nums'><span>общие <b>{share}</b></span><span>в плане <b id='tlPlan'>{plan}</b></span></div><ul class='tl-exps'>{!first}</ul>{!more}" +
      "<div class='tl-cmp small'><span class='muted' id='tlPre'>Сравниваю с </span><span id='tlNames'></span> <button type='button' class='linkish' id='tlEdit'>изменить</button></div>" +
      "<div class='tg-row tl-pick' hidden>{!pick}</div><div id='tlActs'></div><button type='button' class='linkish small tl-skip' data-act='skip'>{skip}</button></div>" +
      "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Закрыть</button><button class='btn primary' data-act='ok' hidden>Сохранить</button></div>", {
        c: x.c, m: E.MONTHS[tm], share: E.eur(rnd(x.share), { dec: 0 }), plan: E.eur(rnd(x.plan), { dec: 0 }), first: exps.slice(0, 3).map(expLi).join(""),
        more: exps.length > 3 ? tpl("<details class='tl-more'><summary class='small'>ещё {n}</summary><ul class='tl-exps'>{!li}</ul></details>", { n: exps.length - 3, li: exps.slice(3, 30).map(expLi).join("") }) : "",
        pick: opts.map(function (c) { return tg(c.id, c.name, picked.indexOf(c.id) >= 0, "data-pk"); }).join(""),
        skip: set.tlSkip && set.tlSkip[skipK] ? "Снова учитывать этот месяц" : "Не учитывать в этом месяце" }), function (m) {
      var pick0 = picked.slice().sort().join();
      var names = function () {
        m.querySelector("#tlPre").textContent = picked.length ? "Сравниваю с " : "Строка плана не выбрана";
        m.querySelector("#tlNames").textContent = picked.map(function (id) { return "«" + catName(id) + "»"; }).join(", ");
        var ed = m.querySelector("#tlEdit"); if (!picked.length && m.querySelector(".tl-pick").hidden) ed.textContent = "выбрать";
        // «Сохранить» нужна, только если поменяла строки для сравнения
        var dirty = picked.slice().sort().join() !== pick0;
        m.querySelector("[data-act=ok]").hidden = !dirty; m.querySelector("[data-act=cancel]").textContent = dirty ? "Отмена" : "Закрыть";
      };
      names();
      m.querySelector("#tlEdit").onclick = function () { var pk = m.querySelector(".tl-pick"); pk.hidden = !pk.hidden; this.textContent = pk.hidden ? (picked.length ? "изменить" : "выбрать") : "свернуть"; };
      var planNow = function () { var p = 0; if (rr) picked.forEach(function (pid) { if (!rr.cells[pid]) return; for (var w = tm * 5; w < tm * 5 + 5; w++) { var c = rr.cells[pid][w]; if (c) p -= c.cents; } }); return p; };
      // куда довписать, если строк для сравнения несколько: выбор; для «Жильё и счета» по умолчанию — строка коммуналки
      var utilId = set.utilCat || S.utilityCat(state), target = null;
      var acts = function () {
        var gap = x.share - planNow(), box = m.querySelector("#tlActs");
        m.querySelector("#tlPlan").textContent = E.eur(rnd(planNow()), { dec: 0 }); names();
        if (picked.indexOf(target) < 0) target = x.key === "Жильё и счета" && picked.indexOf(utilId) >= 0 ? utilId : picked[0];
        var can = picked.length && gap >= 500 && rr;
        box.innerHTML = (can && picked.length > 1 ? tpl("<div class='small muted tl-tgt-h'>Довписать в строку</div><div class='tg-row tl-tgt'>{!b}</div>", { b: picked.map(function (id) { return tg(id, catName(id), id === target, "data-tgt"); }).join("") }) : "") +
          (can ? tpl("<button type='button' class='btn tl-fill-btn' data-act='fill'>Довписать {v} в «{c}»</button>", { v: E.eur(rnd(gap), { dec: 0 }), c: catName(target) }) :
          picked.length && gap < 500 ? "<p class='small pos tl-okmsg'>В плане хватает ✓</p>" : "");
        box.querySelectorAll("[data-tgt]").forEach(function (b) { b.onclick = function () { target = b.dataset.tgt; acts(); }; });
        var f = box.querySelector("[data-act=fill]");
        if (f) f.onclick = function () {
          saveMap();
          // по неделям месяца: где твоя доля общих больше плана — туда (где деньги ушли), а не в текущую неделю
          var pw = [0, 0, 0, 0, 0], plw = [0, 0, 0, 0, 0];
          exps.forEach(function (e) { var k = E.weekOfDate(e.date); if (k && String(k.year) === ty) pw[k.idx % 5] += S.toEur(e.share, e.currency, e.date, set); });
          if (rr) picked.forEach(function (pid) { for (var q = 0; q < 5; q++) { var c0 = rr.cells[pid] && rr.cells[pid][tm * 5 + q]; if (c0 && c0.cents < 0) plw[q] -= c0.cents; } });
          var parts = S.spreadGap(pw, plw, gap);
          parts.forEach(function (pt) { addToCell(ty, target, tm * 5 + pt.i, String(pt.cents / 100), "общие сверх плана"); });
          closeModal(); changed(); toast("Довписала " + parts.map(function (pt) { return E.eur(pt.cents, { dec: 0 }) + " · " + shortWeek(ty, tm * 5 + pt.i); }).join(", ") + " в «" + catName(target) + "»");
        };
      };
      var saveMap = function () {
        if (x.kind) { set.coverage = set.coverage || {}; set.coverage[x.kind] = picked.slice(); }
        else { set.sharedCompare = set.sharedCompare || {}; set.sharedCompare[x.key] = picked.slice(); }
      };
      m.querySelectorAll("[data-pk]").forEach(function (b) {
        b.onclick = function () { var id = b.dataset.pk, i = picked.indexOf(id); if (i >= 0) picked.splice(i, 1); else picked.push(id); var on = i < 0; b.classList.toggle("on", on); b.textContent = (on ? "✓ " : "") + catName(id); acts(); };
      });
      acts();
      m.querySelector("[data-act=cancel]").onclick = closeModal;
      m.querySelector("[data-act=ok]").onclick = function () { saveMap(); closeModal(); changed(); toast("Сохранено"); };
      m.querySelector("[data-act=skip]").onclick = function () { set.tlSkip = set.tlSkip || {}; if (set.tlSkip[skipK]) delete set.tlSkip[skipK]; else set.tlSkip[skipK] = 1; closeModal(); changed(); };
    });
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
    // план считает, когда деньги ушли со счёта (так сходится Сверка) — и сравниваем с тем же: оплачено в этом месяце
    var firstPaid = 12; for (m = 0; m < 12; m++) if (paid[m]) { firstPaid = m; break; }
    var start = Math.min(firstPaid, past.length ? past[0] : 12), shown = []; for (m = start; m <= nowM; m++) shown.push(m);
    var IN_M = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
    var listIn = function (ms) { var w = ms.map(function (x) { return IN_M[x]; }); return w.length > 1 ? w.slice(0, -1).join(", ") + " и " + w[w.length - 1] : w[0]; };
    var gapsU = shown.filter(function (m) { return ucat && paid[m] - plan[m] >= 500; });
    var overU = shown.filter(function (m) { return ucat && m < nowM && plan[m] - paid[m] >= 500; }); // в плане больше, чем ушло (прошлые месяцы)
    var c0 = function (v) { return Math.round(v / 100); };
    // среднее — по закончившимся месяцам (текущий ещё идёт)
    var done = shown.filter(function (m) { return m < nowM; });
    var avgOf = function (arr) { return done.length ? Math.round(done.reduce(function (t, m) { return t + arr[m]; }, 0) / done.length / 100) : "—"; };
    var row = function (label, cells, avgCell) { return tpl("<tr><td>{l}</td>{!cells}{!avg}</tr>", { l: label, cells: cells, avg: avgCell }); };
    var table = shown.length ? tpl("<div class='tbl-wrap' style='margin-top:10px'><table class='t'><thead><tr><th></th>{!ths}<th class='n'>в среднем</th></tr></thead><tbody>{!r1}{!r2}</tbody></table></div>", {
      ths: shown.map(function (m) { return tpl("<th class='n'>{m}</th>", { m: E.MONTHS_SHORT[m] }); }).join(""),
      r1: row("В плане", shown.map(function (m) { return tpl("<td class='n{w}'>{v}</td>", { w: overU.indexOf(m) >= 0 ? " warn-c" : "", v: c0(plan[m]) }); }).join(""), tpl("<td class='n muted'>{v}</td>", { v: avgOf(plan) })),
      r2: row("Ушло со счёта", shown.map(function (m) { var d = paid[m] - plan[m]; return tpl("<td class='n {c}'>{v}</td>", { c: d >= 500 ? "neg" : "", v: c0(paid[m]) }); }).join(""), tpl("<td class='n'><b>{v}</b></td>", { v: avgOf(paid) })) }) : "";
    var acts = ucat ? tpl("<div class='util-acts'>{!gaps}{!avg}{!fact}</div>", {
      gaps: gapsU.slice(-3).map(function (m) { return tpl("<button type='button' class='btn' data-ugap='{m}'>Довписать {v} в {mn}</button>", { m: m, v: E.eur(rnd(paid[m] - plan[m]), { dec: 0 }), mn: E.MONTHS[m] }); }).join(""),
      avg: past.length && avg ? tpl("<button type='button' class='btn' id='ucAvg'>Поставить {v} в месяц на будущее</button>", { v: E.eur(avg, { dec: 0 }) }) : "",
      fact: past.length ? tpl("<button type='button' class='btn' id='ucFact'>Заменить план за {a}–{b}</button>", { a: E.MONTHS_SHORT[past[0]], b: E.MONTHS_SHORT[past[past.length - 1]] }) : "" }) : "";
    var html = tpl("<div class='card util-card'><h2>Коммуналка в плане</h2><p class='small muted' style='margin-top:-6px'>Твоя доля счетов за свет, воду, газ и страховку дома{line}. Сравниваю с тем, что ушло со счёта в этом месяце: так же считается Сверка.</p>{!pick}{!table}{!note}{!acts}</div>", {
      line: ucat ? " — и строка плана «" + catName(ucat) + "»" : "", table: table, acts: acts,
      pick: ucat ? "" : tpl("<div class='hint small'>Не нашла строку плана для коммуналки — выбери её: <select id='ucSel'><option value=''>…</option>{!o}</select></div>", { o: catOptions(null, function (c) { return c.block !== "income" && c.block !== "savings"; }) }),
      note: overU.length ? tpl("<p class='small muted' style='margin:8px 0 0'>В {m} в плане больше, чем ушло со счёта.</p>", { m: listIn(overU) }) :
        !gapsU.length && shown.length && ucat ? "<p class='small pos' style='margin:8px 0 0'>План совпадает с тем, что ушло со счёта ✓</p>" : "" });
    function bind() {
      $main.querySelectorAll("[data-ugap]").forEach(function (b) {
        b.onclick = function () {
          var mm = Number(b.dataset.ugap), d = rnd(paid[mm] - plan[mm]);
          // в неделю последнего счёта этого месяца — там, где деньги и ушли
          // по неделям месяца: где ушло больше, чем в плане, — туда и довписываем (там, где деньги ушли)
          var pw = [0, 0, 0, 0, 0], plw = [0, 0, 0, 0, 0];
          bills.forEach(function (e) { var k = E.weekOfDate(e.date); if (k && String(k.year) === y && Math.floor(k.idx / 5) === mm) pw[k.idx % 5] += S.toEur(e.share, e.currency, e.date, set); });
          for (var q = 0; q < 5; q++) { var x0 = r.cells[ucat][mm * 5 + q]; plw[q] = x0 && x0.cents < 0 ? -x0.cents : 0; }
          var parts = S.spreadGap(pw, plw, paid[mm] - plan[mm]);
          parts.forEach(function (pt) { addToCell(y, ucat, mm * 5 + pt.i, String(pt.cents / 100), "счета из общих"); });
          changed(); toast("Довписала " + parts.map(function (pt) { return E.eur(pt.cents, { dec: 0 }) + " · " + shortWeek(y, mm * 5 + pt.i); }).join(", ") + " в «" + catName(ucat) + "»");
        };
      });
      var sel = $main.querySelector("#ucSel"); if (sel) sel.onchange = function () { if (sel.value) { set.utilCat = sel.value; changed(); } };
      var bf = $main.querySelector("#ucFact");
      if (bf) bf.onclick = function () {
        askConfirm("Заменить «" + catName(ucat) + "» за " + E.MONTHS_SHORT[past[0]] + "–" + E.MONTHS_SHORT[past[past.length - 1]] + " реальными счетами из «Общих»? Суммы встанут в те недели, когда счёт оплачен (так верно считаются деньги в обращении); в остальные недели этих месяцев — 0.", "Заменить", function () {
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
          changed(); toast("План коммуналки за прошедшие месяцы = счета");
        });
      };
      var ba = $main.querySelector("#ucAvg");
      if (ba) ba.onclick = function () {
        var fromM = nowM + 1;
        if (fromM > 11) { toast("В этом году будущих месяцев не осталось — поставь сумму в плане следующего года"); return; }
        // неделя месяца, в которую коммуналка стоит в плане чаще всего
        var cnt = [0, 0, 0, 0, 0, 0];
        for (var w = 0; w < 60; w++) if (r.cells[ucat][w]) cnt[w % 5 + 1]++;
        var wim = String(cnt.indexOf(Math.max.apply(null, cnt)) || 2);
        askConfirm("С " + E.MONTHS_GEN[fromM] + " коммуналка в плане — " + E.eur(avg, { dec: 0 }) + " в месяц (" + wim + "-я неделя), одной регулярной тратой. Суммы, вписанные вручную в будущие недели, уберу. Прошлые месяцы не тронутся.", "Поставить", function () {
          var fromISO = y + "-" + (fromM < 9 ? "0" : "") + (fromM + 1) + "-01";
          yr.recurring = (yr.recurring || []).map(function (ru) { if (ru.catId === ucat && (!ru.to || ru.to >= fromISO)) { if (ru.from && ru.from >= fromISO) return null; ru.to = E.addDays(fromISO, -1); } return ru; }).filter(Boolean);
          yr.recurring.push({ id: E.uid("r"), catId: ucat, expr: String(-avg / 100), cents: -avg, weeks: wim, from: fromISO, to: null });
          var en = (yr.entries || {})[ucat] || {};
          Object.keys(en).forEach(function (k) { if (Number(k) >= fromM * 5) delete en[k]; });
          changed(); toast("Коммуналка на будущее: " + E.eur(avg, { dec: 0 }) + " в месяц");
        });
      };
    }
    return { html: html, bind: bind, gaps: gapsU.map(function (m) { return { m: m, eur: rnd(paid[m] - plan[m]) }; }) };
  }
  // Строки «По категориям за месяц» (твоя доля общих рядом с планом) — и для экрана, и для ссылки в «Мы»
  function tologCatRows(ty, tm) {
    var set = state.settings, calc = sharedForCalc();
    var msh = S.monthlyShares(calc, set, ty), rr = state.years[ty] ? E.compute(state, ty) : null;
    var covS = set.coverage || {};
    var planOf = function (ids) { var p = 0; if (rr) (ids || []).forEach(function (pid) { var c = state.categories.find(function (x) { return x.id === pid; }); if (!rr.cells[pid] || (c && c.currency === "RUB")) return; for (var w2 = tm * 5; w2 < tm * 5 + 5; w2++) { var x2 = rr.cells[pid][w2]; if (x2) p -= x2.cents; } }); return p; };
    var skipKey = function (key) { return ty + "-" + tm + ":" + key; };
    // еда и развлечения — одной строкой каждая (кафе, рестораны, такси считаются в развлечениях)
    var grp = function (kind, list, label) {
      var share = 0, parts = [];
      list.forEach(function (c) { var v = msh.byCat[c] ? msh.byCat[c][tm] || 0 : 0; share += v; if (v >= 100) parts.push({ "Развлечения и события": "события", "Кафе и рестораны": "кафе", "Такси и транспорт": "такси", "Доставка еды": "доставка" }[c] || catLabel(c).toLowerCase()); });
      var pids = (covS[kind] || []).slice();
      return { key: kind, c: label, cats: list, sub: parts.join(", "), share: share, plan: planOf(pids), pids: pids, kind: kind };
    };
    var catRows = [grp("fun", S.FUN, "Развлечения"), grp("food", S.FOOD, "Еда домой")].concat(Object.keys(msh.byCat).filter(function (c) { return S.FUN.indexOf(c) < 0 && S.FOOD.indexOf(c) < 0; }).map(function (c) {
      var pids = S.planCatsFor(state, c);
      return { key: c, c: catLabel(c), cats: [c], share: msh.byCat[c][tm] || 0, plan: planOf(pids), pids: pids };
    })).filter(function (x) { return x.share >= 1000; }).sort(function (a2, b2) { return b2.share - a2.share; });
    catRows.forEach(function (x) { x.skip = !!(set.tlSkip || {})[skipKey(x.key)]; x.over = rr && x.pids.length && x.share > x.plan ? x.share - x.plan : 0; });
    return { rows: catRows, rr: rr, msh: msh };
  }
  routes.tolog = function () {
    if (!sh || RO()) { location.hash = "#shared"; return; }
    var set = state.settings, o = logOpts(), calc = sharedForCalc();
    set.sharedLog = set.sharedLog || {}; set.sharedMap = set.sharedMap || {};
    var list = S.toLog(state, calc, o), gaps = S.coverageGaps(state, calc, o);
    var fresh = list.filter(function (x) { return !x.maybe; }), maybe = list.filter(function (x) { return x.maybe; });
    // по категориям за месяц: твоя доля общих рядом с суммой в личном плане
    var ty = E.todayISO().slice(0, 4), tm = ui.tologM !== undefined ? ui.tologM : Number(E.todayISO().slice(5, 7)) - 1;
    var tcr = tologCatRows(ty, tm), catRows = tcr.rows, rr = tcr.rr, msh = tcr.msh;
    var html = tpl("<div class='tl-head'><h1>Общие траты и твой план</h1><div class='tl-month'><button type='button' class='round-btn' data-tm='-1' aria-label='Предыдущий месяц'>‹</button><b>{m} {y}</b><button type='button' class='round-btn' data-tm='1' aria-label='Следующий месяц'>›</button></div>" +
      "<p class='small muted'>Твоя доля общих трат рядом с суммой в личном плане. Ничего не вносится само — только если нажмёшь.</p></div>", { m: E.MONTHS[tm][0].toUpperCase() + E.MONTHS[tm].slice(1), y: ty });
    function row(x) {
      var e = x.e;
      return tpl("<li class='lg' data-id='{id}'><div class='lg-main'><b>{desc}</b><span class='small muted'>{date} · {cat} · всего {cost}{maybe}</span></div><div class='lg-val'>{share}<span class='small muted'>твоя доля</span></div>" +
        "<div class='lg-act'><select data-lc aria-label='Категория личного плана'><option value=''>категория…</option>{!opts}</select>" +
        "<button class='btn sm primary' data-la='add'>Внести</button><button class='btn sm' data-la='had'>Уже есть</button><button class='btn sm ghost' data-la='skip'>Не нужно</button></div></li>", {
          id: e.id, desc: e.desc, date: e.date.slice(8, 10) + "." + e.date.slice(5, 7), cat: x.sharedCat, cost: E.fmt(e.cost, { cur: e.currency === "EUR" ? "€" : e.currency, dec: 0 }),
          maybe: x.maybe ? " · в плане уже есть " + E.eur(-x.maybe.cents, { dec: 0 }) + " в " + shortWeek(x.year, x.maybe.week) : "", share: E.eur(x.share),
          opts: catOptions(x.catId, function (c) { return c.block !== "income" && c.block !== "savings"; }) });
    }
    html += fxMissingHtml();
    var uc = utilitiesCard();
    var funOver = !!rr && catRows.some(function (x) { return !x.skip && x.pids.length && x.share - x.plan >= 500; });
    if (!fresh.length && !maybe.length && !gaps.length && !funOver) html += "<div class='card all-good'><span class='ic'>✓</span>Всё заметное из общих уже в личном плане.</div>";
    if (fresh.length) html += tpl("<div class='card'><h2>Нет в личном плане · {n}</h2><p class='small muted' style='margin-top:-6px'>За все месяцы, не только этот. Выбери категорию и нажми «Внести» — или «Уже есть», если учла по-другому.</p><ul class='lg-list'>{!li}</ul></div>", { n: fresh.length, li: fresh.map(row).join("") });
    if (gaps.length) html += tpl("<div class='card'><h2>Общие выше личного плана</h2><p class='small muted' style='margin-top:-6px'>Кафе, рестораны и такси из общих считаются в развлечениях.</p><ul class='lg-list'>{!li}</ul></div>", { li: gaps.map(function (g) {
      var to = (set.coverage || {})[g.kind] && set.coverage[g.kind][0];
      return tpl("<li class='lg' data-gap='{key}'><div class='lg-main'><b>{what} · {m} {y}</b><span class='small muted'>{sub}: общие {sh} (твоя доля) при личном плане {pl}</span></div>" +
        "<div class='lg-val neg'>+{gap}</div><div class='lg-act'><button class='btn sm primary' data-ga='add'>Довписать {gap}{to}</button><button class='btn sm ghost' data-ga='skip'>Не нужно</button></div></li>", {
          key: g.key, what: g.kind === "fun" ? "Развлечения" : "Еда домой", m: E.MONTHS[g.month - 1], y: g.year, sub: g.kind === "fun" ? "события, кафе, рестораны, такси" : "продукты и доставка",
          sh: E.eur(rnd(g.shared), { dec: 0 }), pl: E.eur(rnd(g.personal), { dec: 0 }), gap: E.eur(rnd(g.gap), { dec: 0 }), to: to ? " в «" + catName(to) + "»" : " в план" });
    }).join("") });
    if (maybe.length) html += tpl("<details class='card' style='margin-top:16px'><summary><b>Похоже, уже учтено · {n}</b><span class='small muted tl-sum-sub'>В нужной категории в тот месяц уже есть сумма не меньше.</span></summary>" +
      "<div class='row' style='margin:10px 0'><button class='btn sm' id='allHad'>Да, всё это уже учтено</button></div><ul class='lg-list'>{!li}</ul></details>", { n: maybe.length, li: maybe.map(row).join("") });
    // обзор по категориям, коммуналка и настройки — ниже, после того, что нужно сделать
    var pnames = function (ids) { return ids.map(function (id) { return "«" + catName(id) + "»"; }).join(", "); };
    html += tpl("<h2 class='section'>По категориям за месяц</h2><div class='card tl-cats'>{!rows}</div>", { rows: catRows.length ? catRows.map(function (x, i) {
      var ok = x.skip || (x.plan > 0 && x.share <= x.plan + 500), none = !x.skip && !x.plan; // до 5 € сверху — не считаем «выше плана»
      var badge = x.skip ? "<span class='muted small'>не учитываю</span>" : ok ? "<span class='pos'>✓</span>" : none ? "<span class='warn'>нет в плане</span>" : "<span class='warn'>выше плана</span>";
      return tpl("<button type='button' class='tl-row{none}' data-tlrow='{i}'><div class='tl-top'><b>{c}{!sub}</b>{!badge}<span class='arr'>›</span></div>{!track}<div class='small muted'>общие {share}{line}</div></button>", {
        none: none ? " none" : "", i: i, c: x.c, badge: badge, share: E.eur(rnd(x.share), { dec: 0 }),
        sub: x.sub ? tpl(" <span class='small muted' style='font-weight:400'>· {s}</span>", { s: x.sub }) : "",
        track: x.plan ? tpl("<div class='tl-track'><i style='width:{w}%'></i></div>", { w: Math.min(100, Math.round(x.share / x.plan * 100)) }) : "",
        line: x.plan ? " из плана " + E.eur(rnd(x.plan), { dec: 0 }) + " · " + pnames(x.pids) : x.pids.length ? " · в " + pnames(x.pids) + " на этот месяц 0 €" : " · строка плана не выбрана" });
    }).join("") : "<p class='muted' style='margin:0'>В этом месяце заметных общих трат пока нет.</p>" });
    html += tpl("<details class='tl-opts small' style='margin-top:16px'><summary>Какие траты проверять</summary><div class='row' style='margin-top:8px'><label class='small muted'>с <input type='date' id='lgSince' value='{since}'></label><label class='small muted'>доля от <input id='lgMin' inputmode='decimal' value='{min}' style='width:64px'> €</label></div></details>", { since: o.since, min: o.min / 100 });
    html += uc.html;
    $main.innerHTML = html;
    uc.bind(); bindFxMissing();
    $main.querySelectorAll("[data-tlrow]").forEach(function (b) { b.onclick = function () { tlRowSheet(catRows[Number(b.dataset.tlrow)], ty, tm, rr); }; });
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
            modal(tpl("<div class='m-body'><h2>В плане уже есть {planned}</h2><p class='muted' style='margin:6px 0 0'>«{cat}» на {m} уже запланирована. Как внести {share} — {desc}?</p>" +
              "<div class='rem-opts'><button class='rem-opt' data-how='replace'><span><b>Заменить план фактом</b><small>за {m} будет {repl} — плановые суммы этого месяца обнулятся</small></span></button>" +
              "<button class='rem-opt' data-how='add'><span><b>Добавить сверху</b><small>за {m} будет {sum} — если это отдельная трата</small></span></button></div></div>" +
              "<div class='m-foot'><button class='btn ghost' data-act='x'>Отмена</button></div>", {
                planned: E.eur(planned, { dec: 0 }), cat: catName(cat), m: mName, share: E.eur(x.share), desc: x.e.desc, repl: E.eur(x.share + replacedSoFar(x.year, cat, x.week)), sum: E.eur(planned + x.share) }), function (m) {
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
            var cat = (set.coverage && set.coverage[g.kind] && set.coverage[g.kind][0]) || defaultCat();
            addToCell(g.year, cat, (g.month - 1) * 5 + 4, String(rnd(g.gap) / 100), "общие сверх плана");
            toast("Довписала " + E.eur(rnd(g.gap), { dec: 0 }) + " в «" + catName(cat) + "»");
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
    var html = tpl("<div class='page-head'><div class='chips'>{!chips}</div></div>", { chips: ys.map(function (x) { return tpl("<button class='chip{on}' data-uy='{y}'>{y}</button>", { on: x === y ? " on" : "", y: x }); }).join("") });
    if (!both) html += tpl("<div class='hint' style='margin:0 0 14px'>{t} Пока — твои цифры и общие траты.</div>", {
      t: ui.us ? pName + " пока не открыла свой бюджет" + (ui.us.data ? " за " + y : "") + ". В её «Настройках → Мы и доступ» можно открыть итоги или весь бюджет." : "Цифры на двоих появятся, когда партнёр войдёт в приложение и откроет доступ к своему бюджету." });
    html += fxMissingHtml();
    var months = nowM + 1;
    // 1. капитал вместе
    var capAll = (capMe || 0) + (capThem || 0), pMe = both && capAll > 0 ? Math.max(0, Math.min(100, Math.round((capMe || 0) / capAll * 100))) : 100;
    html += tpl("<div class='card ut-cap'><div class='small muted'>{t}<button type='button' class='q-btn' data-explain='cap' aria-label='Что такое капитал'>?</button></div><div class='ut-sum'>{sum}</div>{!bar}<div class='small muted' style='margin-top:6px'>на конец {m}</div></div>", {
      t: both ? "Капитал вместе" : "Капитал", sum: capMe === null ? "—" : eur(rnd(capAll), { dec: 0 }), m: E.MONTHS_GEN[nowM],
      bar: both ? tpl("<div class='ut-bar'><i style='width:{a}%'></i><i style='width:{b}%'></i></div><div class='ut-leg'><span><b class='d1'>●</b> {me} {cm}</span><span><b class='d2'>●</b> {p} {cp}</span></div>", {
        a: pMe, b: 100 - pMe, me: meName, cm: eur(rnd(capMe || 0), { dec: 0 }), p: pName, cp: eur(rnd(capThem || 0), { dec: 0 }) }) : "" });
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
    var row = function (label, sub, v, cls) { return tpl("<div class='kv{c}'><span>{l}{!sub}</span><b>{v}</b></div>", { c: cls ? " " + cls : "", l: label, sub: sub ? tpl(" <small>{s}</small>", { s: sub }) : "", v: v === null ? "—" : eur(rnd(v), { dec: 0 }) }); };
    html += tpl("<div class='card ut-spend'><h2>Сколько тратим вдвоём · в месяц</h2><p class='small muted' style='margin:-6px 0 8px'>{per}, в среднем за месяц</p>{!rows}<div class='kv ut-mute'><span>Переводы между вами</span><span>не считаются</span></div>{!total}{!warn}" +
      "<details class='ut-how'><summary>Как считается</summary><ul class='small muted'><li><b>Общие траты</b> — все траты и сводные суммы из общей ленты за {per}, целиком, в евро. Переводы между вами не считаются.</li>" +
      "<li><b>Сверх общих</b> — личный план «на жизнь» (без налогов и накоплений) минус своя доля в общих: каждая вносит долю общих в личный план, поэтому её вычитаем, чтобы не посчитать дважды.</li>" +
      "<li>Доли: {me} {shMe}, {p} {shP} в месяц. Личное на жизнь: {me} {livMe}{livP}.</li><li><b>Итого как семья</b> = общие + сверх общих у каждой.</li></ul></details></div>", {
        per: period, me: meName, p: pName, shMe: eur(rnd(shareMe / fullM), { dec: 0 }), shP: eur(rnd(shareThem / fullM), { dec: 0 }), livMe: eur(rnd(livMe), { dec: 0 }), livP: both ? ", " + pName + " " + eur(rnd(livThem), { dec: 0 }) : "",
        rows: row("Общие траты", "целиком", sharedM) + row(meName + " сверх общих", "личное на жизнь − своя доля в общих", overMe) + row(pName + " сверх общих", "личное на жизнь − своя доля в общих", overThem),
        total: row("Итого как семья", "", family, "ut-total"),
        warn: [[meName, overMe, livMe], [pName, overThem, livThem]].filter(function (x) { return low(x[1], x[2]); }).map(function (x) {
          return tpl("<p class='hint small ut-warn'>Похоже, в плане {n} учтены не все общие траты: личное на жизнь {how} доле в общих.</p>", { n: nameGen(x[0]), how: x[1] < 0 ? "меньше" : "почти равно" });
        }).join("") });
    // 3. кто платил — та же формула, что «Кто платил» в «Для справки»
    if (pay.all > 0) {
      var shMe = pay.me / pay.all, pm = Math.round(shMe * 100);
      html += tpl("<div class='card'><div class='small muted'>Кто платил за общее · {per}</div><div class='ut-bar' style='margin-top:8px'><i style='width:{a}%'></i><i style='width:{b}%'></i></div>" +
        "<div class='ut-leg'><span>{me} {a}% · {vm}</span><span>{p} {b}% · {vp}</span></div><p class='small muted' style='margin:6px 0 0'>Траты и сводные суммы, в евро. Это кто оплачивал, а не чья доля больше — разницу закрывает «Рассчитаться».</p></div>", {
          per: period, a: pm, b: 100 - pm, me: meName, p: pName, vm: eur(rnd(pay.me), { dec: 0 }), vp: eur(rnd(pay.them), { dec: 0 }) });
    }
    // 4. выводы про нас
    if (sh) {
      var tres = window.BudgetInsights.together(sh.expenses, { today: E.todayISO(), learned: sh.learned, partnerName: pName, toLog: toLogCount(), toEur: toE });
      if (pay.all > 0) tres.info = tres.info.filter(function (c) { return c.id !== "payer"; }); // уже есть карточкой выше
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
      html += tpl("<div class='card section'><h2>На что уходят общие деньги</h2><p class='small muted' style='margin-top:-6px'>{per} · целиком · в среднем {avg} в месяц</p><div class='ut-cats'>{!rows}</div>" +
        "<details class='ut-how'><summary>Как считается</summary><ul class='small muted'><li>Суммы — общие траты целиком (обе доли), в евро, за {per}.</li>" +
        "<li>↑ / ↓ — больше или меньше, чем за те же месяцы {py}, если разница больше 15%.</li><li>Показаны 8 самых крупных категорий.</li></ul></details></div>", {
          per: period, avg: eur(rnd(sharedTot / fullM), { dec: 0 }), py: Number(y) - 1,
          rows: cats2.slice(0, 8).map(function (c) {
            var v = byCat[c], pv = prevCat[c], tr = pv ? (v > pv * 1.15 ? "↑" : v < pv * 0.85 ? "↓" : "") : "";
            return tpl("<div class='uc-row'><span class='uc-n'>{!ic}<span>{n}</span></span><span class='uc-v'>{v}</span><span class='uc-tr {c}'{!title}>{tr}</span><span class='uc-track'><i style='width:{w}%'></i></span></div>", {
              ic: catIcon(c), n: catLabel(c), v: eur(rnd(v), { dec: 0 }), c: tr === "↑" ? "up" : tr ? "down" : "", tr: tr, w: Math.max(3, Math.round(v / mx * 100)),
              title: tr ? tpl(" title='{t}, чем {p}'", { t: tr === "↑" ? "больше" : "меньше", p: period.replace(y, String(Number(y) - 1)) }) : "" });
          }).join("") });
    }
    // 6. твоя доля по категориям
    var msh = S.monthlyShares(sharedForCalc(), state.settings, y), shareRows = Object.keys(msh.byCat).map(function (c) { return { c: c, v: msh.byCat[c].reduce(function (a, b) { return a + b; }, 0) }; }).filter(function (x) { return Math.abs(x.v) >= 100; }).sort(function (a, b) { return b.v - a.v; });
    if (shareRows.length) html += tpl("<div class='card section'><h2>Твоя доля по категориям</h2><p class='small muted' style='margin-top:-6px'>{y} · то, что приходится на тебя из общих трат</p>{!rows}</div>", { y: y,
      rows: shareRows.slice(0, 8).map(function (x) {
        var ds = sh ? catSplitOf(x.c) : "equal";
        return tpl("<div class='kv'><span>{n}{!who}</span><b>{v}</b></div>", { n: catLabel(x.c), v: eur(rnd(x.v), { dec: 0 }), who: ds === "theirs" || ds === "mine" ? tpl(" <small class='muted'>в основном {w}</small>", { w: ds === "theirs" ? pName : meName }) : "" });
      }).join("") });
    // 7. коммуналка
    var uc = { html: "", bind: function () {} }; // коммуналка — в «Общие и план»; крупные счета каждый ведёт по-своему
    // 8. графики
    var capVals = mine.months.map(function (m, i) { return { me: m.cap, them: both ? theirs.months[i].cap : null }; });
    html += tpl("<div class='grid2 section'><div class='card'><h2>{t} по месяцам</h2>", { t: both ? "Капитал вместе" : "Капитал" }) + C.bars({ labels: E.MONTHS, short: E.MONTHS_SHORT, stacked: true, title: "Капитал по месяцам",
      fmt: function (v) { return E.eur(Math.round(v) * 100, { dec: 0 }); },
      series: [{ name: meName, color: "var(--series-1)", values: capVals.map(function (c) { return c.me === null ? 0 : c.me / 100; }) }].concat(both ? [{ name: pName, color: "var(--series-2)", values: capVals.map(function (c) { return c.them === null ? 0 : c.them / 100; }) }] : []) }) + "</div>";
    html += tpl("<div class='card'><h2>Доходы и расходы{b}</h2>", { b: both ? " вдвоём" : "" }) + C.bars({ labels: E.MONTHS, short: E.MONTHS_SHORT, title: "Доходы и расходы по месяцам",
      fmt: function (v) { return E.eur(Math.round(v) * 100, { dec: 0 }); },
      series: [{ name: "доходы", color: "var(--series-3)", values: mine.months.map(function (_, i) { return sum("income", i) / 100; }) }, { name: "расходы", color: "var(--series-2)", values: mine.months.map(function (_, i) { return sum("total", i) / 100; }) }] }) + "</div></div>";
    if (ui.us && ui.us.level === "full") html += "<div class='section row'><button class='btn' id='openPartner'>Открыть её бюджет целиком</button></div>";
    $main.innerHTML = html;
    $main.querySelectorAll("[data-uy]").forEach(function (b) { b.onclick = function () { ui.usYear = b.dataset.uy; render(); }; });
    var op = $main.querySelector("#openPartner"); if (op) op.onclick = function () { switchTo(ui.us.id); location.hash = "#home"; };
    bindInsights($main); uc.bind(); bindFxMissing();
    $main.querySelectorAll(".ut-cap [data-explain]").forEach(function (q) { q.onclick = function () { Help.explain(q.dataset.explain); }; });
  };


  // Из чего складывается сумма «в обращении» на неделю w
  function obrBreakdown(y, w) {
    var r = E.compute(state, y), yr = state.years[y], L = -1;
    for (var i = w; i >= 0; i--) if (r.fact[i] !== null) { L = i; break; }
    // строка разбивки: подпись и сумма — текст; head — жирная сумма
    var obRow = function (cls, label, val, bcls) { return cls === "head" ? tpl("<div class='ob-row head'><span>{l}</span><b class='{c}'>{v}</b></div>", { l: label, v: val, c: bcls || "" }) : tpl("<div class='ob-row {c}'><span>{l}</span><span>{v}</span></div>", { c: cls, l: label, v: val }); };
    var html = tpl("<div class='m-body ob'><h2>Из чего складывается {v}</h2><p class='small muted' style='margin:2px 0 12px'>В обращении на {wk} — деньги на картах и в наличке, без накоплений.</p>", { v: eur(rnd(r.base[w]), { dec: 0 }), wk: shortWeek(y, w) });
    var startV;
    if (L >= 0) {
      startV = r.fact[L];
      var accRows = state.accounts.filter(function (a) { var e = (yr.recon[L] || {})[a.id]; return e && e.cents !== null && E.accountActive(a, r.weeks[L]); })
        .map(function (a) { var c = yr.recon[L][a.id].cents, ac = E.accCur(a); return { n: a.name + (ac !== "EUR" ? " · " + E.fmt(c, { dec: 0, cur: ac === "RUB" ? "₽" : "$" }) : ""), v: rnd(E.accToEur(state, a, c)) }; }).filter(function (x) { return x.v; }).sort(function (a, b) { return b.v - a.v; });
      html += tpl("<div class='ob-sec'><div class='ob-row head'><span>Сверка {wk}</span><b>{v}</b></div>{!rows}</div>", { wk: shortWeek(y, L), v: eur(startV), rows: accRows.map(function (x) { return obRow("sub", x.n, eur(x.v)); }).join("") });
    } else {
      startV = r.start ? r.start.obr : 0;
      html += tpl("<div class='ob-sec'><div class='ob-row head'><span>Старт года</span><b>{v}</b></div><div class='ob-row sub'><span>Сверок в {y} ещё не было — считаю от остатка на 1 января</span><span></span></div></div>", { v: eur(startV), y: y });
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
      html += tpl("<p class='small muted' style='margin:14px 0 6px'>С тех пор по плану{p}</p>", { p: from === w ? " (" + shortWeek(y, w) + ")" : ": " + shortWeek(y, from) + " — " + shortWeek(y, w) });
      ["income", "spend", "savings"].forEach(function (g) {
        var list = (groups[g] || []).sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); });
        if (!list.length) return;
        var tot = list.reduce(function (t, x) { return t + x.v; }, 0); // все строки, без «остальное (N)»
        html += tpl("<div class='ob-sec'>{!head}{!rows}</div>", { head: obRow("head", titles[g], eur(tot, { plus: true }), tot > 0 ? "pos" : ""), rows: list.map(function (x) { return obRow("sub", x.n, eur(x.v, { plus: true })); }).join("") });
      });
    }
    html += tpl("<div class='ob-row total'><span>В обращении на {wk}</span><b>{v}</b></div>", { wk: shortWeek(y, w), v: eur(r.base[w]) }) +
      (r.fact[w] === null ? "<p class='small muted' style='margin:10px 0 0'>Это расчёт: сверка покажет, сколько на самом деле.</p>" : "") + "</div>" +
      "<div class='m-foot'><button class='btn ghost' data-act='def'>Что такое «в обращении»</button><button class='btn primary' data-act='ok'>Понятно</button></div>";
    modal(html, function (m) { m.querySelector("[data-act=ok]").onclick = closeModal; m.querySelector("[data-act=def]").onclick = function () { Help.explain("obr"); }; });
  }

  // Капитал: из чего складывается на неделю w и как изменился за месяц и с начала года
  function capBreakdown(y, w) {
    var r = E.compute(state, y), rw = r.rows, rate = state.settings.rate || 1, usdRate = (state.settings.fx && state.settings.fx.USD) || 1.08;
    var wk = r.weeks[w], prevEnd = (wk.month - 1) * 5 - 1, capFrom = prevEnd >= 0 ? r.cap[prevEnd] : r.startCap;
    var rub = rw.card_rub[w] + rw.dep_rub[w] + rw.inv_rub[w];
    var parts = [
      ["В обращении", r.base[w], "карты и наличка"],
      ["Накопительный счёт", rw.sav[w]], ["Инвестиции", rw.inv[w]], ["Отложенная наличка", rw.cash[w]],
      ["Рубли", rub / rate, E.fmt(rnd(rub), { cur: "₽", dec: 0 }) + " по курсу " + (Math.round(rate * 100) / 100).toString().replace(".", ",")],
      ["Доллары", rw.usd[w] / usdRate, E.fmt(rnd(rw.usd[w]), { cur: "$", dec: 0 })],
    ].filter(function (p) { return Math.round(p[1] / 100); });
    var dM = r.cap[w] - capFrom, dY = r.cap[w] - r.startCap;
    var html = tpl("<div class='m-body ob'><h2>Из чего складывается {cap}</h2><p class='small muted' style='margin:2px 0 12px'>Капитал на {wk}</p><div class='ob-sec'>{!parts}</div>" +
      "<div class='ob-row total'><span>Капитал</span><b>{cap}</b></div><div class='ob-sec' style='margin-top:14px'><div class='ob-row'><span>С начала {mon}</span><b>{!dM}</b></div>" +
      "<div class='ob-row'><span>С начала {y} года</span><b>{!dY}</b></div></div><a class='linkish small cb-more' href='#analysis'>Капитал по месяцам — в «Анализе» ›</a></div>" +
      "<div class='m-foot'><button class='btn ghost' data-act='def'>Что такое капитал</button><button class='btn primary' data-act='ok'>Понятно</button></div>", {
        cap: eur(rnd(r.cap[w]), { dec: 0 }), wk: shortWeek(y, w), mon: E.MONTHS_GEN[wk.month - 1], y: y, dM: trendHtml(dM), dY: trendHtml(dY),
        parts: parts.map(function (p) { return tpl("<div class='ob-row'><span>{n}{!sm}</span><span>{v}</span></div>", { n: p[0], sm: p[2] ? tpl(" <small class='muted'>{s}</small>", { s: p[2] }) : "", v: eur(rnd(p[1]), { dec: 0 }) }); }).join("") });
    modal(html, function (m) {
      m.querySelector("[data-act=ok]").onclick = closeModal;
      m.querySelector("[data-act=def]").onclick = function () { Help.explain("cap"); };
      m.querySelector(".cb-more").onclick = function () { closeModal(); };
    });
  }

  // ===== ОБЩИЕ ТРАТЫ =====
  function sharedSetup() {
    var cloud = Store.mode === "cloud", meName = (Store.user() && Store.user().name) || "";
    $main.innerHTML = "<div class='page-head'><div><h1>Общие траты</h1><div class='sub'>Общее пространство для двоих: траты, доли, баланс «кто кому должен».</div></div></div>" +
      "<div class='card' style='max-width:560px'><h2>Создать общее пространство</h2>" +
      (cloud ? "<p class='muted' style='margin-top:-4px'>Партнёру ничего настраивать не нужно: пусть откроет этот сайт и войдёт с email, который ты укажешь.</p>" : "") +
      tpl("<form id='spForm' class='form-grid'><label class='f'>Моё имя<input name='me' value='{n}' required></label>", { n: meName }) +
      "<label class='f'>Имя партнёра<input name='partner' required placeholder='Саша'></label>" +
      (cloud ? "<label class='f' style='grid-column:1/-1'>Email партнёра (для входа)<input type='email' name='email' required placeholder='sasha@…'></label>" : "") +
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
  // ===== РАЗОБРАТЬ «ПРОЧЕЕ» =====
  // Траты, которые попали в «Прочее» сами (приложение не узнало название). Выбранное вручную «Прочее» сюда не попадает
  function otherToSort(year) {
    if (!sh) return [];
    return sh.expenses.filter(function (e) { return e.kind === "expense" && !e.cat && S.catOf(e, sh.learned) === "Прочее" && (!year || e.date.slice(0, 4) === year); })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  // короткое имя категории для кнопок
  function shortCat(c) {
    var m = { "Развлечения и события": "Развлечения", "Кафе и рестораны": "Кафе", "Ребёнок: школа, лагеря": "Ребёнок", "Подарки и праздники": "Подарки", "Аптека, здоровье, уход": "Здоровье",
      "Такси и транспорт": "Транспорт", "Жильё и счета": "Жильё", "Документы и налоги": "Документы", "Твои подписки (личное)": "Подписки", "Доставка еды": "Доставка", "Няня / помощь": "Няня", "Ребёнок: школа": "Ребёнок" };
    var l = catLabel(c); return l !== c ? l : m[c] || c;
  }
  // частые категории — для подсказок
  function topSharedCats(n) {
    var cnt = {};
    sh.expenses.forEach(function (e) { if (e.kind !== "expense") return; var c = S.catOf(e, sh.learned); if (c !== "Прочее" && c !== "Сводные суммы") cnt[c] = (cnt[c] || 0) + 1; });
    return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, n);
  }
  routes.other = function () {
    if (!sh || RO()) { location.hash = "#shared"; return; }
    var y = E.todayISO().slice(0, 4), all = ui.otherAll, list = otherToSort(all ? null : y), older = all ? 0 : otherToSort(null).length - list.length;
    var top = topSharedCats(6), partner = partnerName();
    var html = "<div class='tl-head'><h1>Разобрать «Прочее»</h1><p class='small muted'>Траты, которые я не узнала по названию. Выбери категорию — и похожие дальше пойдут туда сами. Изменения увидите обе.</p></div>";
    var trN = list.filter(function (e) { return S.looksLikeTransfer(e.desc, spaceNames()); }).length;
    if (trN > 1) html += tpl("<div class='us-plan oth-bulk'><span><b>Похоже на переводы между вами: {n}</b><span class='small muted'>«Твой нал», «Одолжила тебе» и т. п. — в расходы не пойдут</span></span><button type='button' class='btn' id='othAllTr'>Отметить все</button></div>", { n: trN });
    if (!list.length) html += tpl("<div class='card all-good'><span class='ic'>✓</span>{t}</div>", { t: all ? "В «Прочем» ничего не осталось." : "За " + y + " всё разобрано." });
    else html += tpl("<ul class='card oth-list'>{!li}</ul>{!more}", { more: list.length > 60 ? "<p class='small muted'>Показаны первые 60 — разберёшь их, появятся следующие.</p>" : "", li: list.slice(0, 60).map(function (e) {
      var tr = S.looksLikeTransfer(e.desc, spaceNames()), sugg = top.slice(0, 4);
      return tpl("<li data-oid='{id}'><div class='oth-top'><b>{desc}</b><span class='oth-v'>{cost}</span></div><div class='small muted'>{date} · платила {who}</div>{!tr}" +
        "<div class='tg-row oth-acts'>{!sugg}<button type='button' class='tg' data-more='1'>ещё…</button></div><div class='oth-sec small'>{!tr2}<button type='button' class='linkish' data-keep='1'>оставить в «Прочем»</button></div></li>", {
          id: e.id, desc: e.desc || "без описания", cost: E.fmt(e.cost, { cur: e.currency === "EUR" ? "€" : e.currency, dec: e.cost % 100 ? 2 : 0 }),
          date: e.date.slice(8, 10) + "." + e.date.slice(5, 7) + "." + e.date.slice(2, 4), who: e.paidByMe ? "ты" : partner,
          tr: tr ? "<div class='oth-acts'><button type='button' class='tg tg-sugg' data-tr='1'>Перевод между нами</button><span class='small muted oth-hint'>похоже на перевод</span></div>" : "",
          sugg: sugg.map(function (c) { return tpl("<button type='button' class='tg' data-oc='{c}' title='{l}'>{s}</button>", { c: c, l: catLabel(c), s: shortCat(c) }); }).join(""),
          tr2: tr ? "" : "<button type='button' class='linkish' data-tr='1'>перевод между нами</button> · " });
    }).join("") });
    if (older) html += tpl("<button type='button' class='btn ghost' id='othAll'>Показать и старые · {n}</button>", { n: older });
    $main.innerHTML = html;
    var ob = $main.querySelector("#othAll"); if (ob) ob.onclick = function () { ui.otherAll = true; render(); };
    var learned = sh.learned;
    // выбрать категорию: сохраняем у вас обеих и запоминаем для похожих
    function setCat(e, c) {
      var prev = e.cat, prevL = learned[S.norm(e.desc)];
      e.cat = c; if (c !== "Прочее") learn(e.desc, c);
      Store.updateShared(e.id, { category: c }).catch(function (err) { toast("Не сохранилось: " + err.message + ". Проверь связь"); });
      render();
      pushUndo({ label: c === "Прочее" ? "«" + e.desc + "» — оставила в «Прочем»" : "«" + e.desc + "» → " + catLabel(c) + ". Похожие буду относить сюда же", revert: function () {
        e.cat = prev; if (c !== "Прочее") learn(e.desc, prevL || null);
        return Store.updateShared(e.id, { category: prev || null });
      } });
    }
    function setTransfer(e) {
      var prev = e.kind; e.kind = "refund";
      Store.updateShared(e.id, { kind: "refund" }).catch(function (err) { toast("Не сохранилось: " + err.message); });
      render();
      pushUndo({ label: "«" + e.desc + "» — перевод между вами, в расходы не идёт", revert: function () { e.kind = prev; return Store.updateShared(e.id, { kind: prev }); } });
    }
    // трату берём заново в момент нажатия: общие траты могли перезагрузиться из облака, и старая копия уже не на экране
    $main.querySelectorAll("[data-oid]").forEach(function (li) {
      var cur = function () { return sh.expenses.find(function (x) { return x.id === li.dataset.oid; }); };
      li.querySelectorAll("[data-oc]").forEach(function (b) { b.onclick = function () { var e = cur(); if (e) setCat(e, b.dataset.oc); }; });
      li.querySelectorAll("[data-tr]").forEach(function (b) { b.onclick = function () { var e = cur(); if (e) setTransfer(e); }; });
      li.querySelector("[data-keep]").onclick = function () { var e = cur(); if (e) setCat(e, "Прочее"); };
      li.querySelector("[data-more]").onclick = function () { catPicker(null, function (c) { var e = cur(); if (e) setCat(e, c); }); };
    });
    var allTr = $main.querySelector("#othAllTr");
    if (allTr) allTr.onclick = function () {
      var ids = list.filter(function (e) { return S.looksLikeTransfer(e.desc, spaceNames()); }).map(function (e) { return e.id; }), prev = {};
      ids.forEach(function (id) { var e = sh.expenses.find(function (x) { return x.id === id; }); if (!e) return; prev[id] = e.kind; e.kind = "refund"; Store.updateShared(id, { kind: "refund" }).catch(function (err) { toast("Не сохранилось: " + err.message); }); });
      render();
      pushUndo({ label: ids.length + " " + plural(ids.length, "трата отмечена", "траты отмечены", "трат отмечено") + " как переводы между вами", revert: function () {
        return Promise.all(ids.map(function (id) { var e = sh.expenses.find(function (x) { return x.id === id; }); if (e) e.kind = prev[id] || "expense"; return Store.updateShared(id, { kind: prev[id] || "expense" }); }));
      } });
    };
  };

  function catPicker(current, onPick) {
    var list = sharedCats();
    modal(tpl("<div class='m-body'><h2>Категория</h2><div class='chips cat-grid'>{!chips}<button class='chip add' data-pc-new='1'>+ своя категория</button></div></div><div class='m-foot'><button class='btn ghost' data-act='x'>Отмена</button></div>", {
      chips: list.map(function (c) { return tpl("<button class='chip{on}' data-pc='{c}'>{l}</button>", { on: c === current ? " on" : "", c: c, l: catLabel(c) }); }).join("") }), function (m) {
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
    var invite = sh.partner && !sh.partner.userId && Store.mode === "cloud"
      ? tpl("<div class='hint small row'><span style='flex:1 1 260px'>{p} ещё не входила. Пусть откроет сайт и войдёт с <b>{email}</b> — пространство подключится само." +
        " Её таблицу можно загрузить заранее — тогда бюджет будет ждать её готовым.</span><label class='btn sm' id='prepPartner'><span>Загрузить её таблицу</span><input type='file' id='prepFile' accept='.xlsx' hidden></label></div>", { p: partner, email: sh.partner.email || "" }) : "";

    // открыт профиль партнёра: лента всё равно с моей стороны — говорим об этом прямо
    var sideNote = RO() ? tpl("<div class='hint small' style='margin:0 0 14px'>Лента показана с твоей стороны: зелёным — что должны тебе, оранжевым — что должна ты. У {n} в её профиле цвета наоборот.</div>", { n: view.name }) : "";
    // баланс по каждой валюте: крупно — основной (евро, если по нему есть долг), остальные — строками ниже
    var balK = Object.keys(bal).filter(function (k) { return Math.abs(bal[k]) >= 1; }).sort(function (a, b) { return (b === "EUR") - (a === "EUR"); });
    var sign$ = curSign;
    var whoOwes = function (v) { return v > 0 ? partner + " должна тебе" : "Ты должна " + partner; };
    var bv = balK.length ? bal[balK[0]] : 0;
    var html = sideNote + invite + tpl("<div class='card us-bal'><div class='ub-tx'><div class='small muted'>{who}</div><div class='ub-sum'>{sum}</div>{!more}</div>{!btn}</div>", {
      who: Math.abs(bv) < 1 ? "Вы в расчёте" : whoOwes(bv), sum: E.fmt(Math.abs(bv), { cur: balK.length ? sign$(balK[0]) : "€", dec: 2 }),
      more: balK.slice(1).map(function (k) { return tpl("<div class='small ub-more'>и ещё <b>{v}</b> — {who}</div>", { v: E.fmt(Math.abs(bal[k]), { cur: sign$(k), dec: 2 }), who: whoOwes(bal[k]).replace(/^Ты/, "ты") }); }).join(""),
      btn: balK.length ? "<button class='btn primary' id='settle'>Рассчитаться</button>" : "" });
    html += fxMissingHtml();
    // общие траты и личный план: текущий месяц
    var nowM = Number(E.todayISO().slice(5, 7)) - 1, tl = toLogCount();
    // всё, что показывает экран «Общие траты и твой план»: траты не в плане, строки выше плана или без плана, коммуналка
    var tcr = RO() ? { rows: [] } : tologCatRows(E.todayISO().slice(0, 4), nowM);
    var overRows = tcr.rows.filter(function (x) { return !x.skip && x.pids.length && x.share - x.plan >= 500; });
    var noPlanRows = tcr.rows.filter(function (x) { return !x.skip && !x.plan && x.key !== "Прочее"; }); // для «Прочего» — своя ссылка «Разобрать»
    var ug = RO() ? [] : (utilitiesCard().gaps || []);
    if (tl || overRows.length || noPlanRows.length || ug.length) {
      // кнопка перехода — без подробностей: они на самом экране
      var nIss = overRows.length + noPlanRows.length + ug.length + tl;
      html += tpl("<a class='us-plan' href='#tolog'><span><b>Общие траты и твой план</b><span class='small muted'>{n} {w} проверить</span></span><span class='arr'>›</span></a>", { n: nIss, w: plural(nIss, "пункт стоит", "пункта стоит", "пунктов стоит") });
    }
    // вход на экран сравнения есть всегда, даже когда всё учтено
    else if (!RO()) html += "<a class='us-plan us-plan-ok' href='#tolog'><span><b>Общие траты и твой план</b><span class='small muted'>всё заметное уже учтено ✓</span></span><span class='arr'>›</span></a>";
    // «Прочее», которое приложение не узнало: предложить разобрать
    var nOther = RO() ? 0 : otherToSort(E.todayISO().slice(0, 4)).length;
    if (nOther) html += tpl("<a class='us-plan us-plan-ok' href='#other'><span><b>Разобрать «Прочее»</b><span class='small muted'>{n} {w} за {y} без понятной категории</span></span><span class='arr'>›</span></a>", { n: nOther, w: plural(nOther, "трата", "траты", "трат"), y: E.todayISO().slice(0, 4) });

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
    var o = function (v, l, sel) { return tpl("<option value='{v}'{!s}>{l}</option>", { v: v, l: l, s: sel ? " selected" : "" }); };
    html += tpl("<div class='section us-feed'><div class='row' style='margin-bottom:10px'><input type='search' id='fQ' class='sh-search' placeholder='Поиск: описание, заметка, сумма' value='{q}' aria-label='Поиск по общим тратам'>" +
      "<button type='button' class='btn sh-ftoggle{on}' id='fToggle' aria-expanded='{exp}'>Фильтры{nf}</button>{!add}" +
      "<div class='sh-filters{open}'><select id='fY'>{!ys}</select><select id='fM'>{!ms}</select><select id='fC'><option value='all'>все категории</option>{!cs}</select><select id='fK'>{!ks}</select></div></div>", {
        q: st.q || "", on: st.fopen ? " on" : "", exp: st.fopen ? "true" : "false", nf: nF ? " · " + nF : "", open: st.fopen ? " open" : "",
        add: RO() ? "" : "<button type='button' class='btn primary us-addbtn' id='usAdd'>+ Общая трата</button>",
        ys: ylist.map(function (y) { return tpl("<option{!s}>{y}</option>", { s: y === st.year ? " selected" : "", y: y }); }).join(""),
        ms: mlist.map(function (m) { return o(m, m === "all" ? "все месяцы" : E.MONTHS[Number(m) - 1], m === st.month); }).join(""),
        cs: sharedCats().concat(["Сводные суммы"]).map(function (c) { return o(c, catLabel(c), c === st.cat); }).join(""),
        ks: [["all", "все типы"], ["expense", "траты"], ["batch", "сводные"], ["transfer", "переводы между вами"]].map(function (k) { return o(k[0], k[1], k[0] === st.kind); }).join("") });
    html += tpl("<div class='small muted' style='margin:-2px 0 8px'>{t}</div>", { t: filtered.length ? "Найдено " + filtered.length + (filtered.length > st.limit ? " · показаны последние " + st.limit : "") : "" });
    // лента как в Splitwise: по месяцам, кто платил, кто кому должен — цветом
    var monthG = null, feedHtml = "";
    filtered.slice(0, st.limit).forEach(function (e) {
      var k = e.kind, c$ = e.currency === "EUR" ? "€" : e.currency, mKey = e.date.slice(0, 7);
      if (mKey !== monthG) { monthG = mKey; var mi = Number(mKey.slice(5)) - 1; feedHtml += tpl("<li class='fr-month'>{m} {y}</li>", { m: E.MONTHS[mi][0].toUpperCase() + E.MONTHS[mi].slice(1), y: mKey.slice(0, 4) }); }
      var dd = Number(e.date.slice(8, 10)) + " " + E.MONTHS_SHORT[Number(e.date.slice(5, 7)) - 1], amt, ic, sub;
      if (k === "settlement" || k === "refund") {
        ic = catIcon("__transfer");
        sub = dd + (k === "refund" ? " · возврат" : "") + " · перевод между вами";
        amt = tpl("<span class='fa transfer'>{v}</span>", { v: E.fmt(e.cost, { cur: c$ }) });
      } else {
        var cc = e.kind === "batch" && !e.cat ? "Сводные суммы" : S.catOf(e, learned);
        ic = catIcon(cc);
        sub = dd + " · " + (e.paidByMe ? "ты" : partner) + " · " + E.fmt(e.cost, { cur: c$ }) + (e.method === "cash" ? " · нал" : "");
        amt = Math.abs(e.net) < 1 ? "<span class='fa even'>—</span>" : tpl("<span class='fa {c}'>{v}</span>", { c: e.net > 0 ? "lent" : "owe", v: e.net > 0 ? "+" + E.fmt(e.net, { cur: c$ }) : "−" + E.fmt(-e.net, { cur: c$ }) });
      }
      // title и sub — текст; amt и ic — HTML из своего кода
      var title = (k === "settlement" || k === "refund") ? (e.paidByMe ? "Ты → " + partner : partner + " → тебе") : e.desc || "без описания";
      feedHtml += tpl("<li class='fr' data-open='{id}'>{!ic}<span class='fr-main'><span class='fr-t'>{t}</span><small>{sub}{note}{!pend}</small></span>{!amt}</li>", {
        id: e.id, ic: ic, t: title, sub: sub, note: e.note ? " · " + e.note : "", pend: e.pending ? " · <span class='pend'>не отправлено</span>" : "", amt: amt });
    });
    if (!filtered.length) feedHtml = "<li class='fd-empty muted'>Ничего не найдено.</li>";
    html += tpl("<ul class='feed3 card'>{!li}</ul>{!more}</div>", { li: feedHtml,
      more: filtered.length > st.limit ? tpl("<div class='row' style='margin-top:10px'><button class='btn' id='more'>Показать ещё {n}</button><span class='small muted'>осталось {left}</span></div>", { n: Math.min(50, filtered.length - st.limit), left: filtered.length - st.limit }) : "" });

    var ms = S.monthlyShares(calc, set, st.year);
    var catsUsed = S.SHARED_CATS.filter(function (c) { return ms.byCat[c] && ms.byCat[c].some(function (v) { return Math.abs(v) >= 50; }); });
    var ths = E.MONTHS_SHORT.map(function (m) { return tpl("<th class='n'>{m}</th>", { m: m }); }).join(""), td = function (v, cls) { return tpl("<td class='n{c}'>{v}</td>", { c: cls ? " " + cls : "", v: v }); };
    html += tpl("<details class='section sh-more'><summary><h2>Твоя доля по категориям, € · {y}</h2><span class='small muted'>таблица по месяцам</span></summary><div class='tbl-wrap tbl-scroll'><table class='t'><thead><tr><th>Категория</th>{!ths}<th class='n'>Год</th></tr></thead><tbody>", { y: st.year, ths: ths });
    var colTot = new Array(12).fill(0);
    catsUsed.forEach(function (c) {
      var arr = ms.byCat[c], t = 0, cells = arr.map(function (v, i) { t += v; colTot[i] += v; return td(Math.abs(v) >= 50 ? E.fmt(rnd(v)) : ""); }).join("");
      html += tpl("<tr><td>{n}</td>{!cells}<td class='n'><b>{t}</b></td></tr>", { n: catLabel(c), cells: cells, t: E.fmt(rnd(t)) });
    });
    html += tpl("<tr class='total'><td>Итого</td>{!cells}<td class='n'>{t}</td></tr></tbody></table></div></details>", { cells: colTot.map(function (v) { return td(E.fmt(rnd(v))); }).join(""), t: E.fmt(rnd(colTot.reduce(function (a, b) { return a + b; }, 0))) });

    if (myState.years[st.year]) {
      var cov = S.coverage(myState, calc, st.year);
      html += "<details class='section sh-more'><summary><h2>Общие и личный план: еда и развлечения</h2><span class='small muted'>сравнение по месяцам</span></summary><p class='small muted' style='margin-top:-6px'>Еда = продукты и доставка. Развлечения = события, кафе, рестораны и такси. «Вне общего счёта» — сколько из личных сумм на продукты и развлечения ушло мимо общих трат.</p>" +
        tpl("<div class='tbl-wrap tbl-scroll'><table class='t'><thead><tr><th></th>{!ths}</tr></thead><tbody>{!r1}{!r2}{!r3}<tr><td>Вне общего счёта</td>{!out}</tr><tr class='total'><td>Покрытие</td>{!cov}</tr></tbody></table></div></details>", {
          ths: ths, r1: covRow("Общие: еда домой", cov, "sharedFood"), r2: covRow("Общие: развлечения", cov, "sharedFun"), r3: covRow("Личный план: продукты + развлечения", cov, "personal"),
          out: cov.map(function (c) { return tpl("<td class='n {c}'>{v}</td>", { c: c.personal && c.outside < 0 ? "neg" : "", v: c.personal || c.shared ? E.fmt(rnd(c.outside)) : "" }); }).join(""),
          cov: cov.map(function (c) { return td(c.coverage === null ? "" : pct(c.coverage)); }).join("") });
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
      Settings.download("obshchie-traty-" + E.todayISO() + ".csv", "\ufeff" + rows.map(function (r) { return r.map(function (x) { x = String(x); return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(";"); }).join("\n"), "text/csv");
      toast("Скачано: " + (rows.length - 1) + " записей");
    };
    bindF("#fY", "year"); bindF("#fM", "month"); bindF("#fC", "cat"); bindF("#fK", "kind"); bindFxMissing();
    var more = $main.querySelector("#more"); if (more) more.onclick = function () { var y0 = window.scrollY; st.limit += 50; render(); window.scrollTo(0, y0); };
    window.sharedAdd = function () { expenseSheet(null); };
    var ua = $main.querySelector("#usAdd"); if (ua) ua.onclick = function () { Plus.plusSheet("shared"); };
    $main.querySelectorAll("[data-open]").forEach(function (el) {
      el.onclick = function () { var e = exps.find(function (x) { return x.id === el.dataset.open; }); if (e) expenseSheet(e); };
    });
    // категория: меняем сразу на экране, сохраняем в фоне, можно отменить
    $main.querySelectorAll("[data-cat]").forEach(function (btn) {
      btn.onclick = function () {
        var e = exps.find(function (x) { return x.id === btn.dataset.cat; }), prev = e.cat, prevLearned = learned[S.norm(e.desc)];
        catPicker(S.catOf(e, learned), function (c) {
          if (c === S.catOf(e, learned)) return;
          e.cat = c; learn(e.desc, c); btn.textContent = c;
          Store.updateShared(e.id, { category: c }).catch(function (err) { toast("Не сохранилось: " + err.message + ". Проверь связь"); });
          pushUndo({ label: "«" + e.desc + "» → " + c + ". Похожие траты буду относить сюда же", revert: function () {
            e.cat = prev; learn(e.desc, prevLearned || null);
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
        askConfirm("Удалить трату у вас обеих? Баланс пересчитается.", "Удалить", function () {
          var row = (sh.rows || []).find(function (r) { return r.id === b.dataset.delx; });
          Store.deleteShared(b.dataset.delx).then(function () { return reloadShared(); }).then(function () {
            if (row) pushUndo({ label: "Трата удалена", revert: function () { return Store.insertShared([row]).then(loadShared); } });
          });
        });
      };
    });
    var pp = $main.querySelector("#prepPartner");
    if (pp) {
      $main.querySelector("#prepFile").onchange = function (e) { preparePartnerBudget(sh.partner.email, partner, e.target.files[0]); e.target.value = ""; };
      Store.pendingFor(sh.partner.email).then(function (r) { if (r && pp.isConnected) pp.querySelector("span").textContent = "Обновить её таблицу · загружена " + new Date(r.created_at).toLocaleDateString("ru-RU"); });
    }
    if ($main.querySelector("#settle")) $main.querySelector("#settle").onclick = function () {
      // валюта расчёта: по умолчанию — основная с долгом; сумма подставляется по выбранной
      var cur0 = balK[0] || "EUR", v = bal[cur0] || 0;
      modal(tpl("<div class='m-body'><h2>Рассчитаться</h2><p class='muted'>Перевод между вами меняет только баланс — в расходы он не попадает.</p><div class='form-grid'>" +
        "<label class='f'>Кто переводит<select id='stW'>{!who}</select></label>{!curSel}<label class='f'>Сумма, <span id='stSign'>{sign}</span><input type='text' id='stA' value='{sum}' autofocus></label>" +
        "<label class='f'>Дата<input type='date' id='stD' value='{d}'></label></div></div>" +
        "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Записать</button></div>", {
          who: o("partner", partner + " → мне", v > 0) + o("me", "я → " + partner, v < 0), sum: (Math.abs(v) / 100).toFixed(2).replace(".", ","), d: E.todayISO(), sign: sign$(cur0),
          curSel: balK.length > 1 ? tpl("<label class='f'>Валюта<select id='stC'>{!o}</select></label>", { o: balK.map(function (k) { return o(k, sign$(k) + " · " + E.fmt(Math.abs(bal[k]), { cur: sign$(k), dec: 2 }), k === cur0); }).join("") }) : "" }), function (m) {
        m.querySelector("[data-act=cancel]").onclick = closeModal;
        var cs = m.querySelector("#stC");
        if (cs) cs.onchange = function () {
          var k = cs.value, bv2 = bal[k] || 0;
          m.querySelector("#stA").value = (Math.abs(bv2) / 100).toFixed(2).replace(".", ",");
          m.querySelector("#stSign").textContent = sign$(k);
          m.querySelector("#stW").value = bv2 < 0 ? "me" : "partner";
        };
        m.querySelector("[data-act=ok]").onclick = function () {
          var a; try { a = E.exprCents(m.querySelector("#stA").value); } catch (err) { toast("Ошибка в сумме"); return; }
          if (!a) { toast("Впиши сумму"); return; }
          var who = m.querySelector("#stW").value, cur = cs ? cs.value : cur0;
          var stl = S.makeSettlement(m.querySelector("#stD").value, who === "partner" ? a : -a, cur);
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
        modal(tpl("<div class='m-body'><h2>Импорт из Splitwise</h2><p class='muted'>Какая колонка в выгрузке — ты? Повторные записи не задвоятся.</p><label class='f'>Я в Splitwise<select id='swMe'>{!o}</select></label></div>",
          { o: cols.map(function (c) { return tpl("<option{!s}>{c}</option>", { s: c === guess ? " selected" : "", c: c }); }).join("") }) +
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
    var o = function (v, l, sel) { return tpl("<option value='{v}'{!s}>{l}</option>", { v: v, l: l, s: sel ? " selected" : "" }); };
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
      return paidByMe ? tpl("<span class='pos'>{p} должна тебе {v}</span>", { p: partner, v: money(sp.partner) }) : tpl("<span class='neg'>Ты должна {p} {v}</span>", { p: partner, v: money(sp.me) });
    }
    function draw() {
      var html;
      if (pane === "main") {
        html = tpl("<div class='sheet-head'><button class='btn ghost' data-act='cancel'>Отмена</button><b>{title}</b><button class='btn ghost save' data-act='save'>Сохранить</button></div>" +
          "<div class='m-body sheet-body'><div class='with'>С тобой: <span class='chip on'>{p}</span></div>" +
          "<label class='big-field'><span class='ic'>✎</span><input id='exDesc' placeholder='Описание' value='{desc}' autocomplete='off'></label>" +
          "<label class='big-field amount'><select id='exCur' aria-label='Валюта'>{!cur}</select><input id='exCost' inputmode='decimal' placeholder='0,00' value='{cost}'></label>" +
          "<div class='center'><button class='btn split-pill' data-act='split'>{sum}</button></div>" +
          "<div class='sheet-meta'><label class='f'>Дата<input type='date' id='exDate' value='{date}'></label><label class='f'>Категория<select id='exCat'>{!cats}</select></label>" +
          "<label class='f'>Способ<select id='exMethod'>{!meth}</select></label><label class='f' style='grid-column:1/-1'>Заметка<input id='exNote' value='{note}' placeholder='необязательно'></label></div>{!ed}</div>", {
            title: existing ? "Трата" : "Новая трата", p: partner, desc: d.desc, cost: d.cost ? String(d.cost / 100).replace(".", ",") : "", sum: summary(), date: d.date, note: d.note,
            cur: ["EUR", "RUB", "USD", "GEL"].map(function (c) { return tpl("<option{!s}>{c}</option>", { s: c === d.currency ? " selected" : "", c: c }); }).join(""),
            cats: sharedCats().map(function (c) { return o(c, catLabel(c), c === d.cat); }).join(""),
            meth: o("card", "карта", d.method !== "cash") + o("cash", "наличные", d.method === "cash"),
            ed: existing ? tpl("<div class='row' style='margin-top:14px'><label class='row small'><input type='checkbox' id='exRefund'{!on}> это возврат долга — в расходы не пойдёт</label><span class='spacer'></span><button class='btn ghost danger' data-act='delete'>Удалить</button></div>", { on: d.kind === "refund" ? " checked" : "" }) : "" });
      } else if (pane === "quick") {
        var opts = [["me", "equal", "Платила я, поровну"], ["me", "full", "Платила я, всё на " + partner], ["partner", "equal", "Платила " + partner + ", поровну"], ["partner", "full", "Платила " + partner + ", всё на мне"]];
        html = tpl("<div class='sheet-head'><button class='btn ghost' data-act='back'>‹ Назад</button><b>Как делим?</b><span style='width:70px'></span></div><div class='sheet-body'>{!opts}<div class='center' style='padding:16px'><button class='btn' data-act='more'>Больше вариантов</button></div></div>", {
          opts: opts.map(function (x, i) {
            var on = (x[0] === "me") === d.paidByMe && d.mode === x[1];
            return tpl("<button class='opt{on}' data-q='{i}'><span><b>{t}</b><br>{!owes}</span>{!chk}</button>", { on: on ? " on" : "", i: i, t: x[2], owes: owesLine(x[0] === "me", x[1]), chk: on ? "<span class='check'>✓</span>" : "" });
          }).join("") });
        pane_opts = opts;
      } else {
        var modes = [["equal", "=", "Поровну"], ["exact", "1,23", "Точные суммы"], ["percent", "%", "Проценты"], ["shares", "▥", "Доли"], ["adjust", "+/−", "Поправка"]];
        var m = d.mode === "full" ? "exact" : d.mode;
        if (d.mode === "full") { d.mode = "exact"; d.values = { me: d.paidByMe ? 0 : d.cost, partner: d.paidByMe ? d.cost : 0 }; }
        var sp = split(), unit = { exact: "€", percent: "%", shares: "доли", adjust: "+ €" }[m];
        var hint = { equal: "Сумма делится пополам.", exact: "Укажи, сколько точно должен каждый.", percent: "Проценты в сумме — 100%.", shares: "Например, 2 ночи → 2 доли.", adjust: "Укажи, кто должен больше; остальное — поровну." }[m];
        function inVal(who) {
          var v = (d.values || {})[who];
          if (v === undefined || v === null || v === "") return "";
          return (m === "exact" || m === "adjust") ? String(v / 100).replace(".", ",") : String(v).replace(".", ",");
        }
        html = tpl("<div class='sheet-head'><button class='btn ghost' data-act='quick'>‹ Назад</button><b>Деление</b><button class='btn ghost save' data-act='done'>Готово</button></div><div class='sheet-body'>" +
          "<div class='row' style='justify-content:center;margin-bottom:12px'>Платил(а): <div class='seg'><button data-payer='me' class='{a}'>{me}</button><button data-payer='partner' class='{b}'>{p}</button></div></div>" +
          "<div class='modes'>{!modes}</div><p class='center small muted'><b>{mname}</b><br>{hint}</p>{!people}<div class='split-foot {err}'>{foot}</div></div>", {
            a: d.paidByMe ? "on" : "", b: !d.paidByMe ? "on" : "", me: meName, p: partner, mname: modes.find(function (x) { return x[0] === m; })[2], hint: hint,
            err: sp.error ? "neg" : "", foot: sp.error ? sp.error : "✓ " + money(d.cost) + " распределено",
            modes: modes.map(function (x) { return tpl("<button data-mode='{0}' class='{on}' title='{2}'>{1}</button>", { 0: x[0], 1: x[1], 2: x[2], on: x[0] === m ? "on" : "" }); }).join(""),
            people: [["me", meName], ["partner", partner]].map(function (p) {
              return tpl("<div class='person'><div><b>{n}</b><div class='small muted'>{v}</div></div>{!inp}</div>", { n: p[1], v: money(sp[p[0]]),
                inp: m === "equal" ? "" : tpl("<label class='row'>{plus}<input class='pv' data-who='{who}' inputmode='decimal' placeholder='0' value='{val}'><span class='small muted'>{unit}</span></label>", { plus: m === "adjust" ? "+" : "", who: p[0], val: inVal(p[0]), unit: unit }) });
            }).join("") });
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
        askConfirm("Удалить «" + existing.desc + "» у обоих?", "Удалить", function () {
          var row = (sh.rows || []).find(function (r) { return r.id === existing.id; });
          closeModal(); Store.deleteShared(existing.id).then(loadShared).then(function () {
            render();
            if (row) pushUndo({ label: "Трата «" + existing.desc + "» удалена", revert: function () { return Store.insertShared([row]).then(loadShared); } });
          });
        });
      };
      if (q("[data-act=save]")) q("[data-act=save]").onclick = function () {
        if (!readMain(m)) return;
        if (!d.desc) { toast("Добавь описание"); q("#exDesc").focus(); return; }
        if (!d.cost) { toast("Впиши сумму"); q("#exCost").focus(); return; }
        var sp = split(); if (sp.error) { toast("Деление: " + sp.error); return; }
        var ex = S.makeExpense({ date: d.date, desc: d.desc, cost: d.cost, currency: d.currency, paidByMe: d.paidByMe, myShare: sp.me, cat: d.cat, method: d.method,
          note: d.note, kind: d.kind === "batch" ? "batch" : d.kind, split: { mode: d.mode, values: d.values || {} } });
        if (d.cat) learn(ex.desc, d.cat);
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

  function covRow(label, cov, k) { return tpl("<tr><td>{l}</td>{!cells}</tr>", { l: label, cells: cov.map(function (c) { return tpl("<td class='n'>{v}</td>", { v: c[k] ? E.fmt(rnd(c[k])) : "" }); }).join("") }); }

  // для других экранов — только это; остальное внутри модуля
  window.Us = { catIcon: catIcon, toLogCount: toLogCount, obrBreakdown: obrBreakdown, capBreakdown: capBreakdown, catLabel: catLabel, sharedCats: sharedCats, expenseSheet: expenseSheet };
})();
