/* Easy Budget — экран «Наличка». */
(function () {
  "use strict";
  // ===== НАЛИЧКА =====
  function cashState() { state.cash = state.cash || { pockets: [], tx: [], sharedMap: {}, since: null, defaultPocket: null }; return state.cash; }
  function pocketName(id) { if (id === "bank") return "карта"; var p = (state.cash.pockets || []).find(function (x) { return x.id === id; }); return p ? p.name : "—"; }
  function pocketCur(id) { var p = (state.cash.pockets || []).find(function (x) { return x.id === id; }); return p && p.cur === "RUB" ? "₽" : p && p.cur === "USD" ? "$" : "€"; }
  // наличные траты из общих: свои — где платила я; в бюджете партнёра — где платила она (иначе её итог не сойдётся с её же пересчётом)
  // открыт бюджет того, с кем у меня общие траты
  function isPartnerView() { return !!(sh && sh.partner && view.who !== "me" && (view.who === sh.partner.userId || view.who === sh.partnerId)); }
  function cashLines() {
    var c = state.cash;
    if (!c || !c.since || !sh) return [];
    if (!RO()) return K.sharedLines(c, sh.expenses);
    // view.who — id аккаунта, а sh.partnerId — id участника общего пространства; сравниваем аккаунт партнёра
    if (!isPartnerView()) return [];
    return K.sharedLines(c, sh.expenses, true);
  }
  function cashToEur(cents, cur) { var fx = state.settings.fx || {}; return cur === "RUB" ? cents / (fx.RUB || state.settings.rate || 95) : cur === "USD" ? cents / (fx.USD || 1.08) : cents; }
  function cashEurTotal() {
    var c = state.cash; if (!c || !c.pockets.length) return null;
    var b = K.balances(c, cashLines()), t = 0;
    // только евро-карманы: рубли и доллары видны в своих плитках, в итог € не входят
    c.pockets.filter(function (p) { return !p.archived && (!p.cur || p.cur === "EUR"); }).forEach(function (p) { t += b[p.id] || 0; });
    return Math.round(t);
  }

  routes.cash = function () {
    var c = cashState(), ro = RO();
    var html = "<div class='page-head'><div><h1>Наличка</h1><div class='sub'>Сколько где лежит наличными. Пиши своими словами — приложение поймёт. Можно надиктовать микрофоном на клавиатуре телефона.</div></div></div>";
    if (!c.pockets.length) {
      if (ro) { $main.innerHTML = html + "<p class='empty'>Учёт налички ещё не начат.</p>"; return; }
      html += "<div class='card' style='max-width:560px'><h2>С чего начнём</h2><p class='muted' style='margin-top:-4px'>Назови свои кошельки и конверты и впиши, сколько в них сейчас. Потом можно добавить ещё.</p><form id='cashSetup'>" +
        [["Кошелёк", ""], ["Конверт 1", ""], ["Конверт 2", ""]].map(function (x, i) { return tpl("<div class='cash-row'><input name='n{i}' value='{v}' placeholder='Название'><input name='v{i}' inputmode='decimal' placeholder='0 €'></div>", { i: i, v: x[0] }); }).join("") +
        "<div id='moreRows'></div><div class='row' style='margin-top:12px'><button type='button' class='btn ghost' id='addRow'>+ ещё один</button><span class='spacer'></span><button class='btn primary' type='submit'>Начать учёт</button></div></form></div>";
      $main.innerHTML = html;
      var n = 3;
      $main.querySelector("#addRow").onclick = function () { $main.querySelector("#moreRows").insertAdjacentHTML("beforeend", tpl("<div class='cash-row'><input name='n{n}' placeholder='Название'><input name='v{n}' inputmode='decimal' placeholder='0 €'></div>", { n: n })); n++; };
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

      "</div><div class='chips cash-ex'>" + ["такси 12 из кошелька", "переложила 100 из конверта 1 в кошелёк", "сняла 200", "положила 300 на карту"].map(function (x) { return tpl("<button type='button' class='chip' data-ex='{x}'>{x}</button>", { x: x }); }).join("") + "</div>" +
      "<div id='cashPv'></div></form></div>";
    html = html.replace(/<div class='page-head'>[\s\S]*?<\/div><\/div>/, "<div class='page-head cash-head'><h1>Наличка</h1></div>");
    html += tpl("<div class='cash-wrap'><div class='cash-l'><div class='card cash-sum'><div class='small muted'>Всего наличными</div><div class='cs-v'>{tot}</div><div class='small muted'>учёт с {since}</div></div><div class='pk-grid'>{!tiles}</div>", {
      tot: E.eur(total, { dec: 2 }), since: c.since.slice(8, 10) + "." + c.since.slice(5, 7) + "." + c.since.slice(0, 4),
      tiles: pockets.map(function (p) {
        return tpl("<div class='pk-tile'><button type='button' class='pk-main' data-recount='{id}'{!dis}><span class='pk-n'>{name}</span><b>{bal}</b>{!sm}</button>{!more}</div>", {
          id: p.id, dis: ro ? " disabled" : "", name: p.name, bal: E.fmt(bal[p.id] || 0, { cur: pocketCur(p.id) }), sm: ro ? "" : "<small>пересчитать ›</small>",
          more: ro ? "" : tpl("<button type='button' class='pk-more' data-pk='{id}' aria-label='Настроить карман'>⋯</button>", { id: p.id }) });
      }).join("") });
    if (!ro) html += "<div class='pk-acts'><button type='button' class='btn primary sm' id='cashAdd'>+ Трата</button><button type='button' class='btn sm' id='cashMove'>Перенести</button><button type='button' class='btn sm' id='addPocket'>+ Карман</button></div>";

    // история по дням
    var all = (c.tx || []).map(function (t) { return Object.assign({ own: true }, t); }).concat(lines).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0); });
    var today = E.todayISO(), yday = E.addDays(today, -1), lastD = null;
    var dayT = function (d) { return d === today ? "Сегодня" : d === yday ? "Вчера, " + new Date(d + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : new Date(d + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); };
    html += "<p class='small muted cash-note'>Наличные траты из «Мы», где платила ты, попадают сюда сами. Нажми на такую, чтобы выбрать карман или убрать.</p></div><div class='cash-r'>";
    if (!ro) {
      var np = cashNotInPlan(E.addDays(E.todayISO(), -60) > c.since ? E.addDays(E.todayISO(), -60) : c.since, E.todayISO());
      html += np.length ? cashPlanCardHtml(np) : "<div class='us-plan us-plan-ok cash-np-ok'><span><b>Наличка и твой план</b><span class='small muted'>всё заметное (от 20 €) уже в плане ✓</span></span></div>";
      var sc = sharedCandidates();
      if (sc.length) html += tpl("<div class='card cash-np cash-sc'><h2>Похоже на общие</h2><p class='small muted' style='margin:-4px 0 10px'>Записаны только в наличку — в «Мы» их нет, и в баланс с {p} они не попали.</p><ul class='lg-list'>{!li}</ul></div>", {
        p: sh.partner ? sh.partner.name : "партнёр",
        li: sc.map(function (t) {
          return tpl("<li class='lg' data-sc='{id}'><div class='lg-main'><b>{note}</b><span class='small muted'>{date} · {pocket}</span></div><div class='lg-val'>{sum}</div><div class='lg-act'>" +
            "<button type='button' class='btn sm primary' data-sca='move'>Перенести в общие</button><button type='button' class='btn sm ghost' data-sca='skip'>Это личная</button></div></li>", {
              id: t.id, note: t.note || "без описания", date: t.date.slice(8, 10) + "." + t.date.slice(5, 7), pocket: pocketName(t.from), sum: E.fmt(t.cents, { cur: "€" }) });
        }).join("") });
    }
    html += "<h2 class='cash-h2'>История</h2>" + (all.length ? "<ul class='card cash-hist'>" + all.slice(0, ui.cashLimit || 60).map(function (t) {
      var flow = t.kind === "move" ? "из " + pocketName(t.from) + " в " + pocketName(t.to) : t.kind === "in" ? "с карты в " + pocketName(t.to) : t.kind === "out" ? "из " + pocketName(t.from) + " на карту" :
        t.kind === "ext" ? "в " + pocketName(t.to) : t.kind === "adjust" ? "пересчёт · " + pocketName(t.to) : pocketName(t.from);
      var sgn = t.kind === "spend" || t.kind === "out" ? -1 : t.kind === "move" ? 0 : 1, v = t.kind === "adjust" ? t.cents : sgn * t.cents;
      var ic = t.kind === "move" ? "⇄" : t.kind === "adjust" ? "=" : v > 0 ? "+" : "−";
      var title = t.shared ? tpl("{d} <span class='badge'>общая</span>", { d: t.shared.desc }) : esc(t.note || (K.KINDS.find(function (k) { return k.id === t.kind; }) || { name: "пересчёт" }).name);
      var head = t.date !== lastD ? tpl("<li class='ch-day'>{d}</li>", { d: dayT(t.date) }) : ""; lastD = t.date;
      var edAttr = ro ? "" : t.own ? tpl(" ch-edit' data-edtx='{id}' tabindex='0' role='button", { id: t.id }) : t.shared ? tpl(" ch-edit' data-edsh='{id}' tabindex='0' role='button", { id: t.shared.id }) : "";
      return head + tpl("<li class='ch-row{!ed}'><span class='ch-ic'>{ic}</span><span class='ch-tx'><span class='ch-t'>{!title}</span><small>{sub}</small></span><span class='ch-v {c}'>{v}</span>{!del}</li>", {
        ed: edAttr, ic: ic, title: title, sub: flow, c: v > 0 ? "pos" : "",
        v: v === 0 ? E.fmt(t.cents, { cur: pocketCur(t.from) }) : E.fmt(v, { cur: pocketCur(t.from || t.to), plus: v > 0 }),
        del: t.own && !ro ? tpl("<button class='ch-del' data-deltx='{id}' aria-label='Удалить'>✕</button>", { id: t.id }) : t.shared && !ro ? tpl("<button class='ch-del' data-unsh='{id}' aria-label='Убрать из налички'>✕</button>", { id: t.shared.id }) : "" });
    }).join("") + "</ul>" + (all.length > (ui.cashLimit || 60) ? "<button class='btn ghost sm' id='cashMore'>Показать ещё</button>" : "") : "<p class='empty'>Пока пусто. Наличные траты из «Мы», которые платила ты, появятся здесь сами.</p>") + "</div></div>";
    $main.innerHTML = html;
    if (ro) return;

    // быстрый ввод
    var f = $main.querySelector("#cashQ"), pv = $main.querySelector("#cashPv"), cur = null;
    function pocketOpts(sel, withBank) {
      return (withBank ? tpl("<option value='bank'{!s}>карта / банк</option>", { s: sel === "bank" ? " selected" : "" }) : "") + tpl("<option value=''{!s}>—</option>", { s: !sel ? " selected" : "" }) +
        pockets.map(function (p) { return tpl("<option value='{id}'{!s}>{name}</option>", { id: p.id, s: p.id === sel ? " selected" : "", name: p.name }); }).join("");
    }
    function drawPv() {
      if (!cur) { pv.innerHTML = ""; return; }
      var k = cur.kind, needFrom = k === "spend" || k === "move" || k === "out", needTo = k === "move" || k === "in" || k === "ext";
      pv.innerHTML = tpl("<div class='cash-pv'><div class='seg'>{!seg}</div><div class='form-grid'><label class='f'>Сумма<input name='pc' inputmode='decimal' value='{sum}' placeholder='0'></label>{!from}{!to}" +
        "<label class='f'>Дата<input type='date' name='pd' value='{date}'></label><label class='f' style='grid-column:1/-1'>Что это<input name='pn' value='{note}' placeholder='например, рынок'></label>{!plan}" +
        "</div><div class='row' style='margin-top:10px'><span class='small muted'>{pv}</span><span class='spacer'></span><button type='button' class='btn ghost' id='pvX'>Отмена</button><button type='submit' class='btn primary'>Сохранить</button></div></div>", {
          seg: K.KINDS.map(function (x) { return tpl("<button type='button' class='{c}' data-k='{id}'>{name}</button>", { c: x.id === k ? "on" : "", id: x.id, name: x.name }); }).join(""),
          sum: cur.cents ? String(cur.cents / 100).replace(".", ",") : "",
          from: needFrom ? tpl("<label class='f'>Откуда<select name='pf'>{!o}</select></label>", { o: pocketOpts(cur.from, false) }) : "",
          to: needTo ? tpl("<label class='f'>Куда<select name='pt'>{!o}</select></label>", { o: pocketOpts(cur.to, false) }) : "",
          date: cur.date || E.todayISO(), note: cur.note || "",
          plan: k === "spend" ? tpl("<label class='row small' style='grid-column:1/-1'><input type='checkbox' name='pp'> Внести и в личный план, в категорию <select name='pcat'>{!o}</select></label>", { o: catOptions(defaultCat()) }) : "",
          pv: previewText() });
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
      if (!cur.cents) { toast("Впиши сумму"); return; }
      if ((k === "spend" || k === "move" || k === "out") && !cur.from) { toast("Откуда?"); return; }
      if ((k === "move" || k === "in" || k === "ext") && !cur.to) { toast("Куда?"); return; }
      if (k === "move" && cur.from === cur.to) { toast("Откуда и куда — одно и то же"); return; }
      var tx = { id: E.uid("t"), ts: Date.now(), date: cur.date, kind: k, cents: cur.cents, from: k === "in" || k === "ext" ? null : cur.from, to: k === "spend" || k === "out" ? null : cur.to, note: cur.note };
      var pp = pv.querySelector("[name=pp]");
      if (pp && pp.checked) {
        var wk = E.weekOfDate(cur.date), ys = wk && String(wk.year), cat = pv.querySelector("[name=pcat]").value;
        if (!wk || !state.years[ys] || state.years[ys].archived) { toast("Плана на эту дату нет — в личный план не вношу"); }
        else { tx.plan = cashToPlan(ys, cat, wk.idx, cur.cents, (cur.note || "") + " (нал)", "in"); state.settings.lastCat = cat; }
      }
      var msg = previewText();
      c.tx.push(tx); cur = null; f.q.value = "";
      toast("Записано: " + msg.charAt(0).toLowerCase() + msg.slice(1)); changed();
    };
    var unShared = function (id) { c.sharedMap = c.sharedMap || {}; c.sharedMap[id] = "none"; changed(); toast("Убрала из налички — в общих тратах она осталась"); };
    $main.querySelectorAll("[data-unsh]").forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); var t = lines.find(function (x) { return x.shared.id === b.dataset.unsh; }); askConfirm("Убрать «" + (t ? t.shared.desc : "") + "» из налички? В общих тратах она останется.", "Убрать", function () { unShared(b.dataset.unsh); }); };
    });
    $main.querySelectorAll("[data-edsh]").forEach(function (li) {
      li.onclick = function (e) {
        if (e.target.closest("button")) return;
        var t = lines.find(function (x) { return x.shared.id === li.dataset.edsh; }); if (!t) return;
        var ex = t.shared, act = pockets.filter(function (p) { return !p.archived || p.id === t.from; });
        modal(tpl("<div class='m-body'><h2>{desc}</h2><p class='small muted' style='margin:2px 0 0'>Общая трата · {date} · {cost}{why}.</p>" +
          "<label class='f' style='margin-top:14px'>Откуда деньги<select id='shP'>{!opts}<option value='none'>не из налички — с карты</option></select></label>" +
          "<p class='small muted' style='margin:10px 0 0'>Сумма, дата и описание — в самой общей трате. <button type='button' class='linkish' data-act='ex'>Изменить общую трату ›</button></p></div>" +
          "<div class='m-foot'><span class='spacer'></span><button class='btn ghost' data-act='x'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", {
            desc: ex.desc, date: ex.date.slice(8, 10) + "." + ex.date.slice(5, 7), cost: E.fmt(ex.cost, { cur: ex.currency && ex.currency !== "EUR" ? ex.currency : "€" }),
            why: ex.method === "cash" ? "" : ". Попала сюда из-за «нал / кеш» в описании",
            opts: act.map(function (p) { return tpl("<option value='{id}'{!s}>{name}</option>", { id: p.id, s: p.id === t.from ? " selected" : "", name: p.name }); }).join("") }), function (m) {
          m.querySelector("[data-act=x]").onclick = closeModal;
          m.querySelector("[data-act=ex]").onclick = function () { closeModal(); Us.expenseSheet(ex); };
          m.querySelector("[data-act=ok]").onclick = function () {
            var v = m.querySelector("#shP").value; closeModal();
            if (v === "none") { unShared(ex.id); return; }
            c.sharedMap = c.sharedMap || {}; c.sharedMap[ex.id] = v; changed(); toast("Сохранено");
          };
        });
      };
      li.onkeydown = function (e) { if (e.key === "Enter") li.onclick(e); };
    });
    bindCashPlanRows();
    $main.querySelectorAll("[data-sc]").forEach(function (li) {
      var t = c.tx.find(function (x) { return x.id === li.dataset.sc; }); if (!t) return;
      li.querySelector("[data-sca=skip]").onclick = function () { t.sharedSkip = true; changed(); };
      li.querySelector("[data-sca=move]").onclick = function () { moveToShared(t); };
    });
    $main.querySelectorAll("[data-edtx]").forEach(function (li) {
      li.onclick = function (e) { if (e.target.closest("button,select")) return; cashEditModal(c.tx.find(function (x) { return x.id === li.dataset.edtx; })); };
      li.onkeydown = function (e) { if (e.key === "Enter") li.onclick(e); };
    });
    $main.querySelectorAll("[data-deltx]").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var t = c.tx.find(function (x) { return x.id === b.dataset.deltx; });
        askConfirm(cashDelText(t), "Удалить", function () {
          var inPlan = unplanCash(t);
          c.tx = c.tx.filter(function (x) { return x.id !== b.dataset.deltx; }); changed(); toast(inPlan ? "Удалено — и из Плана" : "Запись удалена");
        });
      };
    });
    $main.querySelectorAll("[data-recount]").forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.recount, now = bal[id] || 0;
        modal(tpl("<div class='m-body'><h2>Сколько в «{name}» на самом деле?</h2><p class='small muted' style='margin:2px 0 0'>По учёту — {now}. Впиши, сколько насчитала, и баланс выровняется.</p>" +
          "<div class='form-grid' style='margin-top:12px'><label class='f'>Сейчас<input id='rcV' inputmode='decimal' autofocus value='{v}'></label></div><div class='kv rc-diff'><span>Разница</span><b id='rcD'>0</b></div><p class='small muted' style='margin:4px 0 0'>Запишется как «пересчёт», без категории. Не нужно вспоминать каждую мелочь :)</p></div>" +
          "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", { name: pocketName(id), now: E.fmt(now, { cur: pocketCur(id) }), v: String(now / 100).replace(".", ",") }), function (m) {
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
        modal(tpl("<div class='m-body'><h2>{name}</h2><div class='form-grid' style='margin-top:12px'><label class='f'>Название<input id='pkN' value='{name}'></label>" +
          "<label class='f'>Валюта<select id='pkC'>{!cur}</select></label>" +
          "<label class='row small' style='grid-column:1/-1'><input type='checkbox' id='pkD'{!def}> По умолчанию: сюда идут траты, где не указано откуда, и наличные из «Общих»</label></div></div>" +
          "<div class='m-foot'><button class='btn ghost danger' data-act='del'>Убрать «{name}»</button><span class='spacer'></span><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", {
            name: p.name, def: p.id === c.defaultPocket ? " checked" : "",
            cur: ["EUR", "USD", "RUB"].map(function (x) { return tpl("<option{!s}>{x}</option>", { s: x === (p.cur || "EUR") ? " selected" : "", x: x }); }).join("") }), function (m) {
          m.querySelector("[data-act=cancel]").onclick = closeModal;
          m.querySelector("[data-act=del]").onclick = function () {
            var doRemove = function () {
              p.archived = true; if (c.defaultPocket === p.id) { var o = c.pockets.find(function (x) { return !x.archived; }); c.defaultPocket = o ? o.id : null; }
              closeModal(); changed();
            };
            if ((bal[p.id] || 0) !== 0) askConfirm("Тут ещё " + E.fmt(bal[p.id], { cur: pocketCur(p.id) }) + ". Всё равно убрать? История сохранится.", "Убрать", doRemove); else doRemove();
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
    $main.querySelector("#cashAdd").onclick = function () { Plus.plusSheet("cash"); };
    $main.querySelector("#cashMove").onclick = function () { Plus.plusSheet("cash"); setTimeout(function () { var q = document.getElementById("plusQ"); if (q) { q.value = "переложила  из " + (pockets[1] ? pockets[1].name.toLowerCase() : "конверта") + " в " + pockets[0].name.toLowerCase(); q.setSelectionRange(11, 11); q.dispatchEvent(new Event("input")); } }, 120); };
    var cm = $main.querySelector("#cashMore"); if (cm) cm.onclick = function () { ui.cashLimit = (ui.cashLimit || 60) + 100; render(); };
  };

  // Текст подтверждения удаления: если трата внесена в План — сказать, откуда она уйдёт
  function cashDelText(t) {
    var what = "Удалить «" + ((t && t.note) || "без описания") + "»" + (t ? " " + E.fmt(Math.abs(t.cents), { cur: "€" }) : "") + "?";
    var p = t && t.plan;
    if (p && p.inside !== undefined && state.years[p.year] && !state.years[p.year].archived) {
      var over = Math.abs(t.cents) - p.inside;
      return what + " Она была уже в плане недели" + (p.term && over > 0 ? ", сверх плана было " + E.fmt(over, { cur: "€" }) + " — это уйдёт из Плана." : " — План не изменится.") + " Баланс кармана пересчитается.";
    }
    if (p && state.years[p.year] && !state.years[p.year].archived) return what + " Она есть в Плане («" + catName(p.cat) + "», " + shortWeek(p.year, p.week) + ") — уберу и оттуда. Баланс кармана пересчитается.";
    return what + " Баланс кармана пересчитается.";
  }
  // Правка записи налички: сумма, карманы, дата, описание. Если трата уже в плане — разница по сумме идёт туда же.
  function cashEditModal(t) {
    if (!t) return;
    var c = cashState(), pockets = c.pockets.filter(function (p) { return !p.archived || p.id === t.from || p.id === t.to; });
    var k = t.kind, needFrom = k === "spend" || k === "move" || k === "out", needTo = k === "move" || k === "in" || k === "ext" || k === "adjust";
    var opts = function (sel) { return pockets.map(function (p) { return tpl("<option value='{id}'{!s}>{name}</option>", { id: p.id, s: p.id === sel ? " selected" : "", name: p.name }); }).join(""); };
    var kind = (K.KINDS.find(function (x) { return x.id === k; }) || { name: "пересчёт" }).name;
    modal(tpl("<div class='m-body'><h2>{kind}</h2><div class='form-grid' style='margin-top:10px'><label class='f'>Сумма<input name='ec' inputmode='decimal' value='{sum}'></label>{!from}{!to}" +
      "<label class='f'>Дата<input type='date' name='ed' value='{date}'></label><label class='f' style='grid-column:1/-1'>Что это<input name='en' value='{note}'></label></div>{!plan}" +
      "</div><div class='m-foot'><button class='btn ghost danger' data-act='del'>Удалить</button><span class='spacer'></span><button class='btn ghost' data-act='x'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", {
        kind: kind.charAt(0).toUpperCase() + kind.slice(1), sum: String(t.cents / 100).replace(".", ","), date: t.date, note: t.note || "",
        from: needFrom ? tpl("<label class='f'>Откуда<select name='ef'>{!o}</select></label>", { o: opts(t.from) }) : "",
        to: needTo ? tpl("<label class='f'>Куда<select name='et'>{!o}</select></label>", { o: opts(t.to) }) : "",
        plan: t.plan ? tpl("<p class='small muted' style='margin:10px 0 0'>Эта трата в плане: «{cat}», {wk}. Новая сумма поправит и план.</p>", { cat: catName(t.plan.cat), wk: shortWeek(t.plan.year, t.plan.week) }) : "" }), function (m) {
      var g = function (n) { var el = m.querySelector("[name=" + n + "]"); return el ? el.value : undefined; };
      m.querySelector("[data-act=x]").onclick = closeModal;
      m.querySelector("[data-act=del]").onclick = function () {
        askConfirm(cashDelText(t), "Удалить", function () {
          var inPlan = unplanCash(t);
          c.tx = c.tx.filter(function (x) { return x.id !== t.id; }); closeModal(); changed(); toast(inPlan ? "Удалено — и из Плана" : "Запись удалена");
        });
      };
      m.querySelector("[data-act=ok]").onclick = function () {
        var v; try { v = E.exprCents(g("ec") || ""); } catch (e) { v = null; }
        if (!v) { toast("Впиши сумму"); return; }
        v = k === "adjust" ? v : Math.abs(v);
        if (k === "move" && g("ef") === g("et")) { toast("Откуда и куда — одно и то же"); return; }
        var delta = v - t.cents;
        if (t.plan && delta && state.years[t.plan.year] && !state.years[t.plan.year].archived) {
          if (t.plan.inside !== undefined) replanCash(t, v); // уже в плане: остаток конверта и то, что сверх, пересчитываются
          else shiftCell(t.plan.year, t.plan.cat, t.plan.week, -delta, "правка налички");
        }
        t.cents = v; t.date = g("ed") || t.date; t.note = g("en") || "";
        if (g("ef") !== undefined) t.from = g("ef"); if (g("et") !== undefined) t.to = g("et");
        closeModal(); changed(); toast("Сохранено");
      };
    });
  }

  // Сдвинуть ячейку плана на signed cents (минус — больше трат, плюс — меньше), дописав к формуле
  function shiftCell(year, catId, w, cents, note) {
    var r = E.compute(state, year), cell = r.cells[catId][w], entry = (state.years[year].entries[catId] || {})[w];
    var baseExpr = entry ? entry.expr : (cell ? String(cell.cents / 100) : "");
    var add = (cents < 0 ? "-" : "+") + String(Math.abs(cents) / 100);
    var n = entry && entry.note ? entry.note + (note ? "; " + note : "") : (note || "");
    E.setEntry(state, year, catId, String(w), baseExpr ? baseExpr + add : add.replace(/^\+/, ""), n);
  }

  // Записи налички, похожие на общие («пополам», «с Сашей»): только трата из евро-кармана после начала учёта,
  // иначе после переноса карман бы не сошёлся (общие до начала учёта в наличку не попадают)
  function looksShared(t) { var c = state.cash; return !!(sh && c && c.since && !t.sharedSkip && t.date >= c.since && pocketCur(t.from) === "€" && Plus.sharedSignal(t.note || "")); }
  function sharedCandidates() {
    var c = state.cash; if (!sh || !c || !c.tx || !c.since) return [];
    return c.tx.filter(function (t) { return t.kind === "spend" && looksShared(t); })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  // Перенести запись налички в общие: одна общая трата «наличными» из того же кармана, запись налички удаляется — остаток кармана тот же.
  // Если запись уже была в личном плане целиком — в плане остаётся твоя доля
  function moveToShared(t) {
    var c = cashState(), f = Plus.sharedFromNote(t.note, t.cents), pName = sh.partner ? sh.partner.name : "партнёр", owe = t.cents - f.mine;
    var how = { equal: "пополам", theirs: "всё на " + pName, mine: "всё на тебе" }[f.mode] || "пополам";
    var planOk = t.plan && state.years[t.plan.year] && !state.years[t.plan.year].archived, planIn = planOk && t.plan.inside !== undefined;
    // «Перенести «Такси» в общие?» — описание уже без «пополам» и имени; карман и сумма не меняются
    askConfirm("Перенести «" + f.desc + "» в общие? " + E.fmt(t.cents, { cur: "€" }) + " из «" + pocketName(t.from) + "», " + how + (owe > 0 ? ": " + pName + " должна " + E.fmt(owe, { cur: "€" }) : "") + "." +
      (planOk && !planIn && owe > 0 ? " В личном плане останется твоя доля — " + E.fmt(f.mine, { cur: "€" }) + " вместо " + E.fmt(t.cents, { cur: "€" }) + "." : ""), "Перенести", function () {
      var ex = S.makeExpense({ date: t.date, desc: f.desc, cost: t.cents, currency: "EUR", paidByMe: true, myShare: f.mine, cat: f.cat, method: "cash", note: "", kind: "expense", split: f.split });
      var row = SU.toRow(ex, sh.meId, sh.partnerId, sh.space.id);
      Store.insertShared([row]).then(function () { return loadShared(); }).then(function () {
        c.tx = c.tx.filter(function (x) { return x.id !== t.id; });
        c.sharedMap = c.sharedMap || {}; if (row.id) c.sharedMap[row.id] = t.from;
        // была «уже в плане»: из личного плана убираем, твою долю учтёт «Общие траты и твой план» за месяц
        if (planIn) unplanCash(t);
        else if (planOk) {
          if (owe > 0) shiftCell(t.plan.year, t.plan.cat, t.plan.week, owe, "общая: доля " + pName);
          // доля уже в плане — «Общие траты и твой план» не предлагает её второй раз
          if (row.id) { state.settings.sharedLog = state.settings.sharedLog || {}; state.settings.sharedLog[row.id] = "added"; }
        }
        changed(); toast("Перенесла в «Мы»" + (owe > 0 ? ": " + pName + " должна " + E.fmt(owe, { cur: "€" }) : ""));
      }).catch(function (err) { toast("Не сохранилось: " + err.message); });
    });
  }

  // Траты наличными от порога (20 €), которых нет в плане: за период [from, to]
  function cashNotInPlan(from, to) {
    var c = state.cash; if (!c || !c.tx) return [];
    var min = state.settings.cashPlanMin !== undefined ? state.settings.cashPlanMin : 2000;
    // похожие на общие ждут решения в карточке «Похоже на общие» — в план их долю внесут уже как общую
    return c.tx.filter(function (t) { return t.kind === "spend" && !t.plan && !t.planSkip && t.cents >= min && t.date >= from && t.date <= to && pocketCur(t.from) === "€" && !looksShared(t); })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function cashPlanCardHtml(list, title) {
    return tpl("<div class='card cash-np'><h2>{t}</h2><ul class='lg-list'>{!li}</ul></div>", { t: title || "Наличкой, не в плане", li: list.map(function (t) {
      var ci = Plus.phCat(Plus.phParse(t.note || "").words, false);
      return tpl("<li class='lg' data-cnp='{id}'><div class='lg-main'><b>{note}</b><span class='small muted'>{date} · {pocket}</span></div><div class='lg-val'>{sum}</div><div class='lg-act'><select aria-label='Категория плана'>{!opts}</select>" +
        "<button type='button' class='btn sm primary' data-cnpa='add'>В план</button><button type='button' class='btn sm' data-cnpa='had'>Уже есть</button><button type='button' class='btn sm ghost' data-cnpa='skip'>Не нужно</button></div></li>", {
          id: t.id, note: t.note || "без описания", date: t.date.slice(8, 10) + "." + t.date.slice(5, 7), pocket: pocketName(t.from), sum: E.fmt(t.cents, { cur: "€" }),
          opts: catOptions(ci ? ci.id : defaultCat(), function (x) { return x.block !== "income" && x.block !== "savings"; }) });
    }).join("") });
  }
  // before() — что сделать до перерисовки (например, остаться на шаге Сверки)
  function bindCashPlanRows(before) {
    $main.querySelectorAll("[data-cnp]").forEach(function (li) {
      var t = cashState().tx.find(function (x) { return x.id === li.dataset.cnp; }); if (!t) return;
      li.querySelectorAll("[data-cnpa]").forEach(function (b) {
        b.onclick = function () {
          var a = b.dataset.cnpa;
          if (a === "add") {
            var cat = li.querySelector("select").value, wk = E.weekOfDate(t.date), ys = wk && String(wk.year);
            if (!wk || !state.years[ys] || state.years[ys].archived) { toast("Плана на эту дату нет"); return; }
            var pn = (t.note || "") + " (нал)", pr = addToCell(ys, cat, wk.idx, String(t.cents / 100), pn) || {}; t.plan = { year: ys, week: wk.idx, cat: cat, term: pr.term, base: pr.base, fresh: pr.fresh, note: pn };
            toast(E.fmt(t.cents, { cur: "€" }) + " → «" + catName(cat) + "», " + shortWeek(ys, wk.idx));
          } else { t.planSkip = a; }
          if (before) before(); changed();
        };
      });
    });
  }

  // для других экранов — только это; остальное внутри модуля
  window.Cash = { cashState: cashState, pocketName: pocketName, pocketCur: pocketCur, cashLines: cashLines, cashEurTotal: cashEurTotal, cashNotInPlan: cashNotInPlan, cashPlanCardHtml: cashPlanCardHtml, bindCashPlanRows: bindCashPlanRows };
})();
