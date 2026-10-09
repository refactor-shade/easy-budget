/* Easy Budget — экран «Наличка». */
"use strict";
// ===== НАЛИЧКА =====
function cashState() { state.cash = state.cash || { pockets: [], tx: [], sharedMap: {}, since: null, defaultPocket: null }; return state.cash; }
function pocketName(id) { if (id === "bank") return "карта"; var p = (state.cash.pockets || []).find(function (x) { return x.id === id; }); return p ? p.name : "—"; }
function pocketCur(id) { var p = (state.cash.pockets || []).find(function (x) { return x.id === id; }); return p && p.cur === "RUB" ? "₽" : p && p.cur === "USD" ? "$" : "€"; }
function cashLines() { var c = state.cash; return c && c.since && sh && !RO() ? K.sharedLines(c, sh.expenses) : []; }
function cashToEur(cents, cur) { var fx = state.settings.fx || {}; return cur === "RUB" ? cents / (fx.RUB || state.settings.rate || 95) : cur === "USD" ? cents / (fx.USD || 1.08) : cents; }
function cashEurTotal() {
  var c = state.cash; if (!c || !c.pockets.length) return null;
  var b = K.balances(c, cashLines()), t = 0;
  c.pockets.filter(function (p) { return !p.archived; }).forEach(function (p) { t += cashToEur(b[p.id] || 0, p.cur); });
  return Math.round(t);
}

routes.cash = function () {
  var c = cashState(), ro = RO();
  var html = "<div class='page-head'><div><h1>Наличка</h1><div class='sub'>Сколько где лежит наличными. Пиши своими словами — приложение поймёт. Можно надиктовать микрофоном на клавиатуре телефона.</div></div></div>";
  if (!c.pockets.length) {
    if (ro) { $main.innerHTML = html + "<p class='empty'>Учёт налички ещё не начат.</p>"; return; }
    html += "<div class='card' style='max-width:560px'><h2>С чего начнём</h2><p class='muted' style='margin-top:-4px'>Назови свои кошельки и конверты и впиши, сколько в них сейчас. Потом можно добавить ещё.</p><form id='cashSetup'>" +
      [["Кошелёк", ""], ["Конверт 1", ""], ["Конверт 2", ""]].map(function (x, i) { return "<div class='cash-row'><input name='n" + i + "' value='" + x[0] + "' placeholder='Название'><input name='v" + i + "' inputmode='decimal' placeholder='0 €'></div>"; }).join("") +
      "<div id='moreRows'></div><div class='row' style='margin-top:12px'><button type='button' class='btn ghost' id='addRow'>+ ещё один</button><span class='spacer'></span><button class='btn primary' type='submit'>Начать учёт</button></div></form></div>";
    $main.innerHTML = html;
    var n = 3;
    $main.querySelector("#addRow").onclick = function () { $main.querySelector("#moreRows").insertAdjacentHTML("beforeend", "<div class='cash-row'><input name='n" + n + "' placeholder='Название'><input name='v" + n + "' inputmode='decimal' placeholder='0 €'></div>"); n++; };
    $main.querySelector("#cashSetup").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, list = [];
      for (var i = 0; i < n; i++) {
        var nm = f["n" + i] && f["n" + i].value.trim(); if (!nm) continue;
        var v = 0; try { v = E.exprCents(f["v" + i].value || "0") || 0; } catch (err) { toast(nm + ": " + err.message); return; }
        list.push({ id: E.uid("p"), name: nm, cur: "EUR", start: v, sort: list.length + 1 });
      }
      if (!list.length) { toast("Добавь хотя бы кошелёк"); return; }
      c.pockets = list; c.since = E.todayISO(); c.defaultPocket = list[0].id;
      changed(); toast("Учёт налички начат");
    };
    return;
  }
  var lines = cashLines(), bal = K.balances(c, lines), pockets = c.pockets.filter(function (p) { return !p.archived; }).sort(function (a, b) { return a.sort - b.sort; });
  var total = cashEurTotal();
  if (!ro) html += "<div class='card cash-input' hidden><form id='cashQ' autocomplete='off'><div class='cash-q'><input name='q' placeholder='кофе 4,5 из кошелька' aria-label='Что произошло с наличкой'>" +
    
    "</div><div class='chips cash-ex'>" + ["такси 12 из кошелька", "переложила 100 из конверта 1 в кошелёк", "сняла 200", "положила 300 на карту"].map(function (x) { return "<button type='button' class='chip' data-ex='" + esc(x) + "'>" + esc(x) + "</button>"; }).join("") + "</div>" +
    "<div id='cashPv'></div></form></div>";
  html = html.replace(/<div class='page-head'>[\s\S]*?<\/div><\/div>/, "<div class='page-head cash-head'><h1>Наличка</h1><span class='small muted'>всего " + E.eur(total, { dec: 2 }) + "</span></div>");
  html += "<div class='cash-wrap'><div class='cash-l'><div class='pk-grid'>" + pockets.map(function (p) {
    return "<div class='pk-tile'><button type='button' class='pk-main' data-recount='" + p.id + "'" + (ro ? " disabled" : "") + "><span class='pk-n'>" + esc(p.name) + "</span><b>" + E.fmt(bal[p.id] || 0, { cur: pocketCur(p.id) }) + "</b>" + (ro ? "" : "<small>пересчитать ›</small>") + "</button>" +
      (ro ? "" : "<button type='button' class='pk-more' data-pk='" + p.id + "' aria-label='Настроить карман'>⋯</button>") + "</div>";
  }).join("") + "</div>";
  if (!ro) html += "<div class='pk-acts'><button type='button' class='btn primary sm' id='cashAdd'>+ Трата</button><button type='button' class='btn sm' id='cashMove'>Перенести</button><button type='button' class='btn sm' id='addPocket'>+ Карман</button></div>";

  // история по дням
  var all = (c.tx || []).map(function (t) { return Object.assign({ own: true }, t); }).concat(lines).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0); });
  var today = E.todayISO(), yday = E.addDays(today, -1), lastD = null;
  var dayT = function (d) { return d === today ? "Сегодня" : d === yday ? "Вчера, " + new Date(d + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : new Date(d + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); };
  html += "<div class='card cash-sum'><div class='small muted'>Всего наличными</div><div class='cs-v'>" + E.eur(total, { dec: 2 }) + "</div><div class='small muted'>учёт с " + esc(c.since.slice(8, 10) + "." + c.since.slice(5, 7) + "." + c.since.slice(0, 4)) + " · траты из «Мы», которые ты платила наличными, попадают сюда сами</div></div></div><div class='cash-r'>";
  html += "<h2 class='cash-h2'>История</h2>" + (all.length ? "<ul class='card cash-hist'>" + all.slice(0, ui.cashLimit || 60).map(function (t) {
    var flow = t.kind === "move" ? "из " + pocketName(t.from) + " в " + pocketName(t.to) : t.kind === "in" ? "с карты в " + pocketName(t.to) : t.kind === "out" ? "из " + pocketName(t.from) + " на карту" :
      t.kind === "ext" ? "в " + pocketName(t.to) : t.kind === "adjust" ? "пересчёт · " + pocketName(t.to) : pocketName(t.from);
    var sgn = t.kind === "spend" || t.kind === "out" ? -1 : t.kind === "move" ? 0 : 1, v = t.kind === "adjust" ? t.cents : sgn * t.cents;
    var ic = t.kind === "move" ? "⇄" : t.kind === "adjust" ? "=" : v > 0 ? "+" : "−";
    var title = t.shared ? esc(t.shared.desc) + " <span class='badge'>общая</span>" : esc(t.note || (K.KINDS.find(function (k) { return k.id === t.kind; }) || { name: "пересчёт" }).name);
    var sub = t.shared && pockets.length > 1 && !ro ? "<select data-shp='" + esc(t.shared.id) + "' aria-label='Из какого кармана'>" + pockets.map(function (p) { return "<option value='" + p.id + "'" + (p.id === t.from ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + "</select>" : esc(flow);
    var head = t.date !== lastD ? "<li class='ch-day'>" + esc(dayT(t.date)) + "</li>" : ""; lastD = t.date;
    return head + "<li class='ch-row'><span class='ch-ic'>" + ic + "</span><span class='ch-tx'><span class='ch-t'>" + title + "</span><small>" + sub + "</small></span>" +
      "<span class='ch-v " + (v > 0 ? "pos" : "") + "'>" + (v === 0 ? E.fmt(t.cents, { cur: pocketCur(t.from) }) : E.fmt(v, { cur: pocketCur(t.from || t.to), plus: v > 0 })) + "</span>" +
      (t.own && !ro ? "<button class='ch-del' data-deltx='" + t.id + "' aria-label='Удалить'>✕</button>" : "") + "</li>";
  }).join("") + "</ul>" + (all.length > (ui.cashLimit || 60) ? "<button class='btn ghost sm' id='cashMore'>Показать ещё</button>" : "") : "<p class='empty'>Пока пусто. Наличные траты из «Мы», которые платила ты, появятся здесь сами.</p>") + "</div></div>";
  $main.innerHTML = html;
  if (ro) return;

  // быстрый ввод
  var f = $main.querySelector("#cashQ"), pv = $main.querySelector("#cashPv"), cur = null;
  function pocketOpts(sel, withBank) { return (withBank ? "<option value='bank'" + (sel === "bank" ? " selected" : "") + ">карта / банк</option>" : "") + "<option value=''" + (!sel ? " selected" : "") + ">—</option>" + pockets.map(function (p) { return "<option value='" + p.id + "'" + (p.id === sel ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join(""); }
  function drawPv() {
    if (!cur) { pv.innerHTML = ""; return; }
    var k = cur.kind, needFrom = k === "spend" || k === "move" || k === "out", needTo = k === "move" || k === "in" || k === "ext";
    pv.innerHTML = "<div class='cash-pv'><div class='seg'>" + K.KINDS.map(function (x) { return "<button type='button' class='" + (x.id === k ? "on" : "") + "' data-k='" + x.id + "'>" + x.name + "</button>"; }).join("") + "</div>" +
      "<div class='form-grid'><label class='f'>Сумма<input name='pc' inputmode='decimal' value='" + (cur.cents ? String(cur.cents / 100).replace(".", ",") : "") + "' placeholder='0'></label>" +
      (needFrom ? "<label class='f'>Откуда<select name='pf'>" + pocketOpts(cur.from, false) + "</select></label>" : "") +
      (needTo ? "<label class='f'>Куда<select name='pt'>" + pocketOpts(cur.to, false) + "</select></label>" : "") +
      "<label class='f'>Дата<input type='date' name='pd' value='" + (cur.date || E.todayISO()) + "'></label>" +
      "<label class='f' style='grid-column:1/-1'>Что это<input name='pn' value='" + esc(cur.note || "") + "' placeholder='например, рынок'></label>" +
      (k === "spend" ? "<label class='row small' style='grid-column:1/-1'><input type='checkbox' name='pp'> Внести и в личный план, в категорию <select name='pcat'>" + catOptions(defaultCat()) + "</select></label>" : "") +
      "</div><div class='row' style='margin-top:10px'><span class='small muted'>" + esc(previewText()) + "</span><span class='spacer'></span><button type='button' class='btn ghost' id='pvX'>Отмена</button><button type='submit' class='btn primary'>Сохранить</button></div></div>";
    pv.querySelectorAll("[data-k]").forEach(function (b) { b.onclick = function () { readPv(); cur.kind = b.dataset.k; if (cur.kind === "in" || cur.kind === "ext") cur.to = cur.to || cur.from || c.defaultPocket; drawPv(); }; });
    pv.querySelector("#pvX").onclick = function () { cur = null; f.q.value = ""; drawPv(); };
    pv.querySelectorAll("input,select").forEach(function (el) { el.addEventListener("change", function () { readPv(); pv.querySelector(".row .muted").textContent = previewText(); }); });
  }
  function readPv() {
    if (!cur) return;
    var g = function (n) { var el = pv.querySelector("[name=" + n + "]"); return el ? el.value : undefined; };
    try { var v = E.exprCents(g("pc") || ""); cur.cents = v === null ? null : Math.abs(v); } catch (e) { cur.cents = null; }
    if (g("pf") !== undefined) cur.from = g("pf") || null;
    if (g("pt") !== undefined) cur.to = g("pt") || null;
    cur.date = g("pd") || E.todayISO(); cur.note = g("pn") || "";
  }
  function previewText() {
    if (!cur) return "";
    var a = cur.cents ? E.fmt(cur.cents, { cur: pocketCur(cur.from || cur.to) }) : "?";
    return cur.kind === "spend" ? "Трата " + a + " из «" + pocketName(cur.from) + "»" : cur.kind === "move" ? a + ": «" + pocketName(cur.from) + "» → «" + pocketName(cur.to) + "»" :
      cur.kind === "in" ? "Сняла " + a + " с карты в «" + pocketName(cur.to) + "»" : cur.kind === "out" ? a + " из «" + pocketName(cur.from) + "» на карту" : "Получила " + a + " в «" + pocketName(cur.to) + "»";
  }
  var t0 = null;
  f.q.addEventListener("input", function () { clearTimeout(t0); t0 = setTimeout(function () { if (!f.q.value.trim()) { cur = null; drawPv(); return; } cur = K.parse(f.q.value, pockets, c.defaultPocket); cur.date = E.todayISO(); drawPv(); }, 250); });
  $main.querySelectorAll("[data-ex]").forEach(function (b) { b.onclick = function () { f.q.value = b.dataset.ex; f.q.dispatchEvent(new Event("input")); f.q.focus(); }; });
  f.onsubmit = function (e) {
    e.preventDefault();
    if (!cur) { if (f.q.value.trim()) { cur = K.parse(f.q.value, pockets, c.defaultPocket); drawPv(); } return; }
    readPv();
    var k = cur.kind;
    if (!cur.cents) { toast("Укажи сумму"); return; }
    if ((k === "spend" || k === "move" || k === "out") && !cur.from) { toast("Откуда?"); return; }
    if ((k === "move" || k === "in" || k === "ext") && !cur.to) { toast("Куда?"); return; }
    if (k === "move" && cur.from === cur.to) { toast("Откуда и куда — одно и то же"); return; }
    var tx = { id: E.uid("t"), ts: Date.now(), date: cur.date, kind: k, cents: cur.cents, from: k === "in" || k === "ext" ? null : cur.from, to: k === "spend" || k === "out" ? null : cur.to, note: cur.note };
    var pp = pv.querySelector("[name=pp]");
    if (pp && pp.checked) {
      var wk = E.weekOfDate(cur.date), ys = wk && String(wk.year), cat = pv.querySelector("[name=pcat]").value;
      if (!wk || !state.years[ys] || state.years[ys].archived) { toast("Плана на эту дату нет — в личный план не вношу"); }
      else { addToCell(ys, cat, wk.idx, String(cur.cents / 100), (cur.note || "") + " (нал)"); tx.plan = { year: ys, week: wk.idx, cat: cat }; state.settings.lastCat = cat; }
    }
    var msg = previewText();
    c.tx.push(tx); cur = null; f.q.value = "";
    toast("Записано: " + msg.charAt(0).toLowerCase() + msg.slice(1)); changed();
  };
  $main.querySelectorAll("[data-shp]").forEach(function (sel) { sel.onchange = function () { c.sharedMap = c.sharedMap || {}; c.sharedMap[sel.dataset.shp] = sel.value; changed(); }; });
  $main.querySelectorAll("[data-deltx]").forEach(function (b) {
    b.onclick = function () {
      var t = c.tx.find(function (x) { return x.id === b.dataset.deltx; });
      if (!confirm("Удалить запись «" + ((t && t.note) || "без описания") + "»?" + (t && t.plan ? " Сумма в личном плане останется — поправь её на экране «Неделя», если нужно." : " Баланс пересчитается."))) return;
      c.tx = c.tx.filter(function (x) { return x.id !== b.dataset.deltx; }); changed();
    };
  });
  $main.querySelectorAll("[data-recount]").forEach(function (b) {
    b.onclick = function () {
      var id = b.dataset.recount, now = bal[id] || 0;
      modal("<div class='m-body'><h2>Сколько в «" + esc(pocketName(id)) + "» на самом деле?</h2><p class='small muted' style='margin:2px 0 0'>По учёту — " + E.fmt(now, { cur: pocketCur(id) }) + ". Впиши, сколько насчитала, и баланс выровняется.</p>" +
        "<div class='form-grid' style='margin-top:12px'><label class='f'>Сейчас<input id='rcV' inputmode='decimal' autofocus value='" + String(now / 100).replace(".", ",") + "'></label></div><div class='kv rc-diff'><span>Разница</span><b id='rcD'>0</b></div><p class='small muted' style='margin:4px 0 0'>Запишется как «пересчёт», без категории. Не нужно вспоминать каждую мелочь :)</p></div>" +
        "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", function (m) {
        m.querySelector("[data-act=cancel]").onclick = closeModal;
        var inp = m.querySelector("#rcV"), dEl = m.querySelector("#rcD"), upd = function () { var v; try { v = E.exprCents(inp.value); } catch (e) { v = null; } dEl.textContent = v === null ? "—" : E.fmt(v - now, { cur: pocketCur(id), plus: true }); };
        inp.addEventListener("input", upd); upd();
        m.querySelector("[data-act=ok]").onclick = function () {
          var v; try { v = E.exprCents(m.querySelector("#rcV").value); } catch (err) { toast(err.message); return; }
          if (v === null) return;
          if (v !== now) c.tx.push({ id: E.uid("t"), ts: Date.now(), date: E.todayISO(), kind: "adjust", to: id, cents: v - now, note: "пересчёт: " + (v > now ? "больше" : "меньше") + " на " + E.fmt(Math.abs(v - now)) });
          closeModal(); changed(); toast(v === now ? "Всё сходится" : "Баланс поправлен");
        };
      });
    };
  });
  $main.querySelectorAll("[data-pk]").forEach(function (b) {
    b.onclick = function () {
      var p = c.pockets.find(function (x) { return x.id === b.dataset.pk; });
      modal("<div class='m-body'><h2>" + esc(p.name) + "</h2><div class='form-grid' style='margin-top:12px'><label class='f'>Название<input id='pkN' value='" + esc(p.name) + "'></label>" +
        "<label class='f'>Валюта<select id='pkC'>" + ["EUR", "USD", "RUB"].map(function (x) { return "<option" + (x === (p.cur || "EUR") ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></label>" +
        "<label class='row small' style='grid-column:1/-1'><input type='checkbox' id='pkD'" + (p.id === c.defaultPocket ? " checked" : "") + "> По умолчанию: сюда идут траты, где не указано откуда, и наличные из «Общих»</label></div></div>" +
        "<div class='m-foot'><button class='btn ghost danger' data-act='del'>Убрать «" + esc(p.name) + "»</button><span class='spacer'></span><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", function (m) {
        m.querySelector("[data-act=cancel]").onclick = closeModal;
        m.querySelector("[data-act=del]").onclick = function () {
          if ((bal[p.id] || 0) !== 0 && !confirm("Тут ещё " + E.fmt(bal[p.id], { cur: pocketCur(p.id) }) + ". Всё равно убрать? История сохранится.")) return;
          p.archived = true; if (c.defaultPocket === p.id) { var o = c.pockets.find(function (x) { return !x.archived; }); c.defaultPocket = o ? o.id : null; }
          closeModal(); changed();
        };
        m.querySelector("[data-act=ok]").onclick = function () {
          p.name = m.querySelector("#pkN").value.trim() || p.name; p.cur = m.querySelector("#pkC").value;
          if (m.querySelector("#pkD").checked) c.defaultPocket = p.id;
          closeModal(); changed();
        };
      });
    };
  });
  $main.querySelector("#addPocket").onclick = function () {
    modal("<form class='m-body' id='pkF'><h2>Новый карман</h2><div class='form-grid' style='margin-top:12px'><label class='f'>Название<input name='n' placeholder='например, Конверт на отпуск' required></label>" +
      "<label class='f'>Сколько в нём сейчас<input name='v' inputmode='decimal' placeholder='0'></label><label class='f'>Валюта<select name='c'><option>EUR</option><option>USD</option><option>RUB</option></select></label></div><button type='submit' hidden></button></form>" +
      "<div class='m-foot'><button class='btn ghost' data-act='x'>Отмена</button><button class='btn primary' data-act='ok'>Добавить</button></div>", function (m) {
      var f = m.querySelector("#pkF");
      var ok = function (e) {
        if (e) e.preventDefault();
        var nm = f.n.value.trim(); if (!nm) { f.n.focus(); return; }
        var cents = 0; try { cents = E.exprCents(f.v.value || "0") || 0; } catch (err) { toast(err.message); return; }
        c.pockets.push({ id: E.uid("p"), name: nm, cur: f.c.value, start: 0, sort: c.pockets.length + 1 });
        if (cents) c.tx.push({ id: E.uid("t"), ts: Date.now(), date: E.todayISO(), kind: "adjust", to: c.pockets[c.pockets.length - 1].id, cents: cents, note: "начальный остаток" });
        closeModal(); changed(); toast("Карман «" + nm + "» добавлен");
      };
      f.onsubmit = ok; m.querySelector("[data-act=ok]").onclick = ok; m.querySelector("[data-act=x]").onclick = closeModal;
    });
  };
  $main.querySelector("#cashAdd").onclick = function () { plusSheet("cash"); };
  $main.querySelector("#cashMove").onclick = function () { plusSheet("cash"); setTimeout(function () { var q = document.getElementById("plusQ"); if (q) { q.value = "переложила  из " + (pockets[1] ? pockets[1].name.toLowerCase() : "конверта") + " в " + pockets[0].name.toLowerCase(); q.setSelectionRange(11, 11); q.dispatchEvent(new Event("input")); } }, 120); };
  var cm = $main.querySelector("#cashMore"); if (cm) cm.onclick = function () { ui.cashLimit = (ui.cashLimit || 60) + 100; render(); };
};
