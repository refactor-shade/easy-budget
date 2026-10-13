/* Easy Budget — «Настройки», бэкапы, импорт, профиль партнёра. */
(function () {
  "use strict";
  // ===== НАСТРОЙКИ =====
  routes.settings = function () {
    var s = state.settings;
    var cloud = Store.mode === "cloud", u = Store.user() || {};
    var html = tpl("<div class='page-head'><div><h1>Настройки</h1><div class='sub'>{sub}</div></div>{!out}</div>", {
      sub: cloud ? "Данные в облаке: " + (u.email || "") + ". Бэкап в файл — по желанию." : "Данные хранятся только в этом браузере. Делай бэкап в файл время от времени.",
      out: cloud ? "<button class='btn ghost' id='signOut'>Выйти</button>" : "" });
    // профиль и доступ
    html += tpl("<div class='grid2'><div class='card'><h2>Профиль</h2><form id='setProfile' class='form-grid'><label class='f'>Моё имя<input name='name' value='{n}' placeholder='Аня' required></label>" +
      "<button class='btn' type='submit'>Сохранить</button></form>", { n: u.name || "" });
    if (cloud) {
      html += "<h3 style='margin-top:16px'>Кто что видит в моём бюджете</h3>";
      if (!people.length) html += "<p class='small muted'>Когда партнёр войдёт в общее пространство (экран «Общие»), здесь можно будет выбрать, что ей видно.</p>";
      people.forEach(function (p) {
        html += tpl("<label class='f' style='margin-top:6px'>{n}<select data-vis='{id}'>{!o}</select></label>", { n: p.name, id: p.userId,
          o: [["full", "видит полностью"], ["totals", "видит только итоги за месяц"], ["hidden", "не видит"]].map(function (o) { return tpl("<option value='{0}'{!s}>{1}</option>", { 0: o[0], 1: o[1], s: p.myLevel === o[0] ? " selected" : "" }); }).join("") });
      });
      html += "<p class='small muted'>Личные категории (галочка «личная» ниже) не видны никому, даже при полном доступе.</p>";
    }
    html += "</div>";
    html += tpl("<div class='card'><h2>Основное</h2><form id='setMain' class='form-grid'>" +
      "<label class='f'>Курс: ₽ за 1 €<input type='text' name='rate' value='{rate}' inputmode='decimal'></label>" +
      "<label class='f'>Расхождение, после которого тревожиться, €<input type='text' name='alert' value='{alert}' inputmode='decimal'></label>" +
      "<label class='f'>Курс GEL за 1 €<input type='text' name='gel' value='{gel}' inputmode='decimal'></label>" +
      "<label class='f'>Курс USD за 1 €<input type='text' name='usd' value='{usd}' inputmode='decimal'></label>{!extra}" +
      "<button class='btn primary' type='submit'>Сохранить</button></form>{!live}{!hist}</div></div>", {
        // другие валюты: те, что встретились в общих тратах без курса, и уже заданные вручную
        extra: extraFx(s).map(function (c) {
          var live = window.BudgetFx && BudgetFx.live() && BudgetFx.live().all ? BudgetFx.live().all[c] : null;
          return tpl("<label class='f'>Курс {c} за 1 €{!miss}<input type='text' data-fxc='{c}' value='{v}' placeholder='{ph}' inputmode='decimal'></label>", {
            c: c, v: s.fx[c] > 0 ? numShow(String(s.fx[c])) : "", ph: live ? "сегодня " + numShow(String(live)) : "",
            miss: s.fx[c] > 0 ? "" : tpl(" <small class='neg'>не задан — траты в {c} не входят в итоги</small>", { c: c }) });
        }).join(""),
        rate: numShow(String(s.rate)), alert: -s.diffAlert / 100, gel: numShow(String(s.fx.GEL)), usd: numShow(String(s.fx.USD)), live: fxLiveHtml(),
        hist: s.rateHistory && s.rateHistory.length ? tpl("<p class='small muted'>История курса: {!h}</p>", { h: s.rateHistory.slice(-5).reverse().map(function (h) {
          return tpl("<span class='nw'>{d}: {prev}{rate}</span>{src}", { d: h.date.slice(8, 10) + "." + h.date.slice(5, 7) + "." + h.date.slice(2, 4), prev: h.prev ? numShow(String(h.prev)) + "\u00A0→\u00A0" : "", rate: numShow(String(h.rate)), src: h.src === "auto" ? " (рыночный)" : "" });
        }).join(" · ") }) : "" });

    // старт годов
    html += "<div class='card section'><h2>Старт года</h2>";
    activeYears().forEach(function (y) {
      var yr = state.years[y], st = E.startOf(state, y);
      html += tpl("<h3 style='margin-top:10px'>{y}</h3>", { y: y });
      if (yr.fromPrev) html += tpl("<p class='small muted' style='margin:0 0 6px'>Считается из остатков 31.12.{py}: в обращении {obr}, накопления {sav}. <button class='btn sm ghost' data-manual='{y}'>Задать вручную</button></p>",
        { py: Number(y) - 1, obr: eur(rnd(st.obr), { dec: 0 }), sav: eur(rnd(st.sav + st.inv + st.cash), { dec: 0 }), y: y });
      else {
        html += tpl("<form class='form-grid' data-start='{y}'><label class='f'>в обращении €<input name='obr' value='{v}'></label>", { y: y, v: st.obr / 100 });
        E.CAPITAL_ROWS.forEach(function (cr) { html += tpl("<label class='f'>{n}<input name='{k}' value='{v}'></label>", { n: cr.name, k: cr.key, v: st[cr.key] / 100 }); });
        html += "<button class='btn' type='submit'>Сохранить</button>" + (state.years[String(Number(y) - 1)] && !state.years[String(Number(y) - 1)].archived ? tpl("<button class='btn ghost' type='button' data-auto='{y}'>Из прошлого года</button>", { y: y }) : "") + "</form>";
      }
    });
    html += "</div>";

    // счета
    html += "<div class='section'><h2>Счета в обращении</h2><div class='tbl-wrap'><table class='t mcard'><thead><tr><th>Название</th><th>Тип</th><th>Валюта</th><th>Считать в факте с</th><th></th></tr></thead><tbody>" +
      state.accounts.slice().sort(function (a, b) { return a.sort - b.sort; }).map(function (a) {
        var o = function (v, l, sel) { return tpl("<option value='{v}'{!s}>{l}</option>", { v: v, l: l, s: sel ? " selected" : "" }); };
        return tpl("<tr{!m}><td class='mc-title'><input type='text' data-acc='{id}' data-f='name' value='{name}' aria-label='Название счёта'></td>" +
          "<td data-l='Тип'><select data-acc='{id}' data-f='kind'>{!kind}</select></td><td data-l='Валюта'><select data-acc='{id}' data-f='cur'>{!cur}</select></td>" +
          "<td data-l='Считать в факте с'><input type='date' data-acc='{id}' data-f='countsFrom' value='{from}'></td>" +
          "<td class='n mc-act'><button class='btn sm ghost' data-accarch='{id}'>{arch}</button></td></tr>", {
            m: a.archived ? " class='muted'" : "", id: a.id, name: a.name, from: a.countsFrom || "", arch: a.archived ? "вернуть" : "в архив",
            kind: o("cash_flow", "в обращении", a.kind === "cash_flow") + o("info", "для справки", a.kind === "info"),
            cur: [["EUR", "€"], ["RUB", "₽ по курсу"], ["USD", "$ по курсу"]].map(function (x) { return o(x[0], x[1], E.accCur(a) === x[0]); }).join("") });
      }).join("") + "</tbody></table></div><p class='small muted' style='margin:8px 0 0'>Счёт в ₽ или $: в Сверке пишешь сумму в этой валюте, приложение переводит по курсу и добавляет в «в обращении». С даты «Считать в факте с» рублёвая карта или доллары из накоплений переезжают сюда — капитал не меняется.</p>" +
      "<div class='row' style='margin-top:8px'><button class='btn' id='addAcc'>+ счёт</button></div></div>";

    // категории
    html += "<div class='section'><h2>Категории</h2><div class='tbl-wrap'><table class='t mcard'><thead><tr><th>Название</th><th>Блок</th><th>Валюта</th><th>Налоги и обязательные</th><th title='развлечения, путешествия, одежда, уход, хобби — для структуры трат в «Выводах»'>На радость</th><th title='не видна партнёру ни в деталях, ни в итогах'>Личная</th><th>Счёт в капитале</th><th></th></tr></thead><tbody>";
    E.BLOCKS.forEach(function (b) {
      var inBlock = cats().filter(function (c) { return c.block === b.id; });
      if (inBlock.length) html += tpl("<tr class='mc-group'><td colspan='8'>{n}</td></tr>", { n: b.name });
      inBlock.forEach(function (c) {
        var o = function (v, l, sel) { return tpl("<option value='{v}'{!s}>{l}</option>", { v: v, l: l, s: sel ? " selected" : "" }); };
        var chk = function (f, label, on) { return tpl("<label class='chk'><input type='checkbox' data-cat2='{id}' data-f='{f}'{!on}><span>{l}</span></label>", { id: c.id, f: f, on: on ? " checked" : "", l: label }); };
        html += tpl("<tr{!m}><td class='mc-title'><input type='text' data-cat2='{id}' data-f='name' value='{name}' aria-label='Название категории'></td>" +
          "<td data-l='Блок'><select data-cat2='{id}' data-f='block'>{!blocks}</select></td>" +
          "<td data-l='Валюта'><select data-cat2='{id}' data-f='currency'>{!cur}</select></td>" +
          "<td class='mc-chk'>{!mand}</td><td class='mc-chk'>{!joy}</td><td class='mc-chk'>{!priv}</td><td{!linkAttr}>{!link}</td>" +
          "<td class='n mc-act'><button class='btn sm ghost' data-up='{id}' aria-label='Поднять выше' title='Поднять выше'>↑</button><button class='btn sm ghost' data-catarch='{id}'>{arch}</button></td></tr>", {
            m: c.archived ? " class='muted'" : "", id: c.id, name: c.name, arch: c.archived ? "вернуть" : "в архив",
            blocks: E.BLOCKS.map(function (x) { return o(x.id, x.name, x.id === c.block); }).join(""),
            cur: tpl("<option{!a}>EUR</option><option{!b}>RUB</option>", { a: c.currency === "EUR" ? " selected" : "", b: c.currency === "RUB" ? " selected" : "" }),
            mand: chk("mandatory", "налоги и обязательные траты", c.mandatory),
            joy: c.block === "income" || c.block === "savings" ? "" : chk("joy", "на радость", window.BudgetInsights.isJoy(c)),
            priv: chk("private", "личная — не видна партнёру", c.private),
            linkAttr: c.block === "savings" ? " data-l='Счёт в капитале'" : " class='mc-empty'",
            link: c.block === "savings" ? tpl("<select data-cat2='{id}' data-f='link'><option value=''>—</option>{!o}</select>", { id: c.id, o: E.CAPITAL_ROWS.filter(function (x) { return x.key !== "card_rub"; }).map(function (x) { return o(x.key, x.name, c.link === x.key); }).join("") }) : "" });
      });
    });
    html += "</tbody></table></div><form id='addCat' class='row' style='margin-top:8px'><input type='text' name='name' placeholder='Новая категория' required><select name='block'>" +
      E.BLOCKS.map(function (x) { return tpl("<option value='{id}'>{n}</option>", { id: x.id, n: x.name }); }).join("") + "</select><select name='cur'><option>EUR</option><option>RUB</option></select><button class='btn' type='submit'>+ категория</button></form></div>";

    html += "<div class='section card'><h2>Резервные копии</h2><p class='muted' style='margin-top:-4px'>Копия бюджета сохраняется сама — после сверки, раз в неделю, и перед заменой бюджета. Хранятся последние 12. Общие траты в копию не входят: они хранятся отдельно, у вас обеих.</p>" +
      "<div id='snapList' class='small muted'>Загружаю…</div><div class='row' style='margin-top:10px'><button class='btn' id='snapNow'>Сделать копию сейчас</button></div></div>";
    var rm = state.settings.reminder;
    html += tpl("<div class='section card'><h2>Google Таблица</h2><div id='gsBox' class='muted small'>{t}</div></div>", { t: cloud ? "Проверяю…" : "Работает в облачной версии." });
    html += tpl("<div class='section card'><h2>Напоминание о сверке</h2><p class='muted' style='margin-top:-4px'>{t}</p><button class='btn' id='remBtn'>{b}</button></div>", {
      t: rm && rm.off ? "Выключено." : rm ? "Настроено: " + (rm.day === "MO" ? "по понедельникам" : "по воскресеньям") + " в " + rm.time + (rm.push ? " — уведомлением на телефон." : ". Если удалила событие из календаря — добавь заново.") :
        (Store.mode === "cloud" ? "Уведомление на телефон или событие в календаре каждую неделю, со ссылкой на сверку." : "Событие в календаре каждую неделю, со ссылкой на сверку."),
      b: rm ? "Изменить" : "Настроить" });
    // данные
    html += "<div class='section card'><h2>Данные</h2><div class='row data-acts'><label class='btn primary'>Импорт из Excel / Google Sheets (.xlsx)<input type='file' id='xlsx' accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' hidden></label>" +
      "<button class='btn' id='exp'>Скачать бэкап (Excel)</button><label class='btn'>Загрузить бэкап<input type='file' id='imp' accept='.xlsx,.json,application/json' hidden></label>" +
      "<button class='btn' id='expCsv'>Год в CSV</button><span class='spacer'></span>" + (window.SEED && !cloud ? "<button class='btn ghost danger' id='reseed'>Заново из seed.js</button>" : "") +
      "<button class='btn ghost danger' id='wipe'>Начать с нуля</button></div><p class='small muted'>Google Sheets: Файл → Скачать → Microsoft Excel (.xlsx), затем «Импорт». Подходят листы «Мой_ГГГГ» и «ГГГГ_€ REAL».</p></div>";
    $main.innerHTML = html;

    bindFx();
    $main.querySelector("#setMain").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, rate = Number(String(f.rate.value).replace(",", "."));
      if (!(rate > 0)) { toast("Курс должен быть числом"); return; }
      if (rate !== s.rate) {
        var hist = s.rateHistory = s.rateHistory || [], last = hist[hist.length - 1];
        if (last && last.date === E.todayISO()) { last.rate = rate; delete last.src; } else hist.push({ date: E.todayISO(), rate: rate, prev: s.rate });
        s.rate = rate; s.fx.RUB = rate;
      }
      s.diffAlert = -Math.abs(Math.round(Number(String(f.alert.value).replace(",", ".")) * 100)) || -5000;
      s.fx.GEL = Number(String(f.gel.value).replace(",", ".")) || s.fx.GEL; s.fx.USD = Number(String(f.usd.value).replace(",", ".")) || s.fx.USD;
      f.querySelectorAll("[data-fxc]").forEach(function (inp) { var v = Number(String(inp.value).replace(",", ".")); if (v > 0) s.fx[inp.dataset.fxc] = v; });
      changed(); toast("Сохранено");
    };
    $main.querySelectorAll("[data-start]").forEach(function (f) {
      f.onsubmit = function (e) {
        e.preventDefault();
        var y = f.dataset.start, st = {};
        try { ["obr"].concat(E.CAPITAL_ROWS.map(function (x) { return x.key; })).forEach(function (k) { st[k] = E.exprCents(f[k].value) || 0; }); } catch (err) { toast("Ошибка: " + err.message); return; }
        state.years[y].start = st; state.years[y].fromPrev = false; changed(); toast("Старт " + y + " сохранён");
      };
    });
    $main.querySelectorAll("[data-manual]").forEach(function (b) { b.onclick = function () { var y = b.dataset.manual; state.years[y].start = E.startOf(state, y); state.years[y].fromPrev = false; changed(); }; });
    $main.querySelectorAll("[data-auto]").forEach(function (b) { b.onclick = function () { state.years[b.dataset.auto].fromPrev = true; changed(); }; });
    $main.querySelectorAll("[data-acc]").forEach(function (el) {
      el.onchange = function () {
        var a = state.accounts.find(function (x) { return x.id === el.dataset.acc; }); a[el.dataset.f] = el.value || null;
        if (el.dataset.f === "cur") {
          if (a.cur === "EUR") delete a.cur;
          // ₽ / $ без даты — с начала текущей недели, чтобы прошлые недели не пересчитались
          var wk = E.weekOfDate(E.todayISO());
          if (a.cur && !a.countsFrom && wk) a.countsFrom = E.genWeeks(wk.year)[wk.idx].from;
          changed(); toast(a.cur ? "«" + a.name + "» — в обращении с " + a.countsFrom.slice(8, 10) + "." + a.countsFrom.slice(5, 7) + ", по курсу" : "Сохранено");
          return;
        }
        changed(true); toast("Сохранено");
      };
    });
    $main.querySelectorAll("[data-accarch]").forEach(function (b) { b.onclick = function () { var a = state.accounts.find(function (x) { return x.id === b.dataset.accarch; }); a.archived = !a.archived; changed(); }; });
    $main.querySelector("#addAcc").onclick = function () {
      var n = prompt("Название счёта"); if (!n) return;
      state.accounts.push({ id: E.uid("a"), name: n.trim(), kind: "cash_flow", sort: Math.max.apply(null, state.accounts.map(function (a) { return a.sort; }).concat([0])) + 1 });
      changed();
    };
    $main.querySelectorAll("[data-cat2]").forEach(function (el) {
      el.onchange = function () {
        var c = state.categories.find(function (x) { return x.id === el.dataset.cat2; });
        c[el.dataset.f] = el.type === "checkbox" ? el.checked : (el.value || null);
        changed(el.dataset.f === "name"); toast("Сохранено");
      };
    });
    $main.querySelectorAll("[data-catarch]").forEach(function (b) { b.onclick = function () { var c = state.categories.find(function (x) { return x.id === b.dataset.catarch; }); c.archived = !c.archived; changed(); }; });
    $main.querySelectorAll("[data-up]").forEach(function (b) {
      b.onclick = function () {
        var c = state.categories.find(function (x) { return x.id === b.dataset.up; });
        var same = cats().filter(function (x) { return x.block === c.block; }), i = same.indexOf(c);
        if (i > 0) { var t = same[i - 1].sort; same[i - 1].sort = c.sort; c.sort = t; changed(); }
      };
    });
    $main.querySelector("#addCat").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, inBlock = state.categories.filter(function (c) { return c.block === f.block.value; });
      var sort = inBlock.length ? Math.max.apply(null, inBlock.map(function (c) { return c.sort; })) + 0.01 : 999;
      state.categories.push({ id: E.uid("c"), name: f.name.value.trim(), block: f.block.value, currency: f.cur.value, mandatory: false, link: null, sort: sort, archived: false });
      changed(); toast("Категория добавлена");
    };
    $main.querySelector("#exp").onclick = function () {
      backupDownload();
    };
    $main.querySelector("#imp").onchange = function (e) {
      var file = e.target.files[0]; if (!file) return;
      if (/\.xlsx$/i.test(file.name)) return importXlsxFile(file);
      file.text().then(function (t) {
        try { var d = JSON.parse(t); if (!d.years || !d.categories) throw new Error("не похоже на бэкап"); askConfirm("Заменить мой бюджет бэкапом?", "Заменить", function () { replaceMine(d); toast("Бэкап загружен"); }); }
        catch (err) { toast("Не получилось: " + err.message); }
      });
    };
    $main.querySelector("#expCsv").onclick = function () {
      var y = ui.year, r = E.compute(state, y), rows = [["категория", "блок"].concat(r.weeks.map(function (w) { return E.MONTHS_SHORT[w.month - 1] + " " + w.label; }))];
      cats().forEach(function (c) { rows.push([c.name, c.block].concat(r.cells[c.id].map(function (x) { return x ? (x.cents / 100).toFixed(2).replace(".", ",") : ""; }))); });
      rows.push(["В обращении", ""].concat(r.obr.map(function (v) { return (v / 100).toFixed(2).replace(".", ","); })));
      rows.push(["Факт", ""].concat(r.fact.map(function (v) { return v === null ? "" : (v / 100).toFixed(2).replace(".", ","); })));
      rows.push(["Капитал", ""].concat(r.cap.map(function (v) { return (v / 100).toFixed(2).replace(".", ","); })));
      download("easy-budget-" + y + ".csv", "﻿" + rows.map(function (r) { return r.map(function (x) { return /[;"\n]/.test(x) ? '"' + String(x).replace(/"/g, '""') + '"' : x; }).join(";"); }).join("\n"), "text/csv");
    };
    var rs = $main.querySelector("#reseed");
    if (rs) rs.onclick = function () { askConfirm("Заменить бюджет данными из seed.js?", "Заменить", function () { replaceMine(fromSeed()); }); };
    $main.querySelector("#wipe").onclick = function () { askConfirm("Стереть мой бюджет и начать с пустого года? Общие траты не тронутся.", "Стереть", function () { replaceMine(blank()); }); };
    $main.querySelector("#xlsx").onchange = function (e) { var f = e.target.files[0]; if (f) importXlsxFile(f); };
    $main.querySelector("#remBtn").onclick = reminderModal;
    if (cloud) drawSheetBox();
    function drawSnaps() {
      var box = $main.querySelector("#snapList"); if (!box) return;
      Store.listSnapshots().then(function (l) {
        if (!box.isConnected) return;
        box.className = "";
        box.innerHTML = l.length ? "<ul class='snap-list'>" + l.map(function (x) {
          return tpl("<li><span><b>{d}</b><small>{r}{loc}</small></span><button class='btn sm' data-snapdl='{id}'>Скачать</button><button class='btn sm' data-snapre='{id}'>Восстановить</button></li>", {
            d: new Date(x.created_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }), r: x.reason || "", loc: x.local ? " · на этом устройстве" : "", id: x.id });
        }).join("") + "</ul>" : "<p class='small muted'>Копий пока нет — первая появится после ближайшей сверки.</p>";
        box.querySelectorAll("[data-snapdl]").forEach(function (b) { b.onclick = function () { Store.getSnapshot(b.dataset.snapdl).then(function (d) { download("easy-budget-copy-" + E.todayISO() + ".json", JSON.stringify(d), "application/json"); }); }; });
        box.querySelectorAll("[data-snapre]").forEach(function (b) {
          b.onclick = function () {
            var x = l.find(function (q) { return String(q.id) === b.dataset.snapre; });
            askConfirm("Вернуть бюджет к копии от " + new Date(x.created_at).toLocaleString("ru-RU") + "? Текущее состояние сначала сохранится отдельной копией — к нему можно будет вернуться.", "Вернуть", function () {
              Store.getSnapshot(x.id).then(function (d) { if (!d) { toast("Копия не нашлась"); return; } replaceMine(d); toast("Бюджет восстановлен из копии"); });
            });
          };
        });
      }).catch(function () { box.textContent = "Не получилось загрузить список копий."; });
    }
    drawSnaps();
    $main.querySelector("#snapNow").onclick = function () { backupNow("вручную").then(function () { changed(true); toast("Копия сохранена"); drawSnaps(); }); };
    // оглавление: настройки длинные
    var heads = $main.querySelectorAll("h2"), toc = "";
    heads.forEach(function (h, i) { h.id = "set-" + i; h.style.scrollMarginTop = "16px"; toc += tpl("<button type='button' class='chip' data-goto='set-{i}'>{t}</button>", { i: i, t: h.textContent.replace(/\s*\(.*$/, "") }); });
    $main.querySelector(".page-head").insertAdjacentHTML("afterend", tpl("<nav class='chips set-toc' aria-label='Разделы настроек'>{!toc}</nav>", { toc: toc }));
    $main.querySelectorAll("[data-goto]").forEach(function (b) { b.onclick = function () { document.getElementById(b.dataset.goto).scrollIntoView({ behavior: "smooth", block: "start" }); }; });
    $main.querySelector("#setProfile").onsubmit = function (e) {
      e.preventDefault();
      var n = e.target.name.value.trim();
      Store.updateProfileName(n).then(function () { profileBar(); toast("Имя сохранено"); }).catch(function (err) { toast("Ошибка: " + err.message); });
    };
    $main.querySelectorAll("[data-vis]").forEach(function (el) {
      el.onchange = function () {
        Store.setVisibility(el.dataset.vis, el.value).then(function () { return loadPeople(); }).then(function () { toast("Доступ обновлён"); })
          .catch(function (err) { toast("Ошибка: " + err.message); });
      };
    });
    var so = $main.querySelector("#signOut");
    if (so) so.onclick = function () {
      if (pending || saving) { toast("Подожди, сохраняю…"); return; }
      Store.signOut().then(function () { location.hash = ""; location.reload(); });
    };
    settingsHub();
  };

  // валюты кроме ₽, $ и лари, для которых нужен курс: без курса в общих тратах + уже заданные
  function extraFx(s) {
    var out = missingFx().map(function (x) { return x.cur; });
    Object.keys(s.fx || {}).forEach(function (c) { if (["RUB", "USD", "GEL", "EUR"].indexOf(c) < 0 && typeof s.fx[c] === "number" && out.indexOf(c) < 0) out.push(c); });
    return out.sort();
  }
  // резервная копия: после сверки — не чаще раза в неделю; перед заменой бюджета — всегда
  function backupNow(reason) {
    if (!myState || RO()) return Promise.resolve();
    var data = JSON.parse(JSON.stringify(myState)); delete data._ver;
    myState.settings.lastBackupAt = new Date().toISOString();
    return Store.saveSnapshot(data, reason).catch(function () {});
  }
  function maybeWeeklyBackup(reason) {
    var last = myState.settings.lastBackupAt ? new Date(myState.settings.lastBackupAt).getTime() : 0;
    if (Date.now() - last > 6 * 864e5) return backupNow(reason);
    return Promise.resolve();
  }
  function replaceMine(data) {
    backupNow("перед заменой бюджета");
    myState = migrate(JSON.parse(JSON.stringify(data)));
    state = myState; view = { who: "me", level: "full", name: "", summary: null };
    var d = defaultYearWeek(); ui.year = d.year; ui.week = d.week; ui.gridYear = null;
    changed();
  }

  // Импорт .xlsx (Excel или Google Sheets): предпросмотр → заменить бюджет
  function importXlsxFile(file) {
    toast("Читаю таблицу…");
    file.arrayBuffer().then(function (buf) {
      var res, bk = null;
      try {
        var wb = window.XLSX.read(buf, { type: "array", cellFormula: true, cellDates: false });
        bk = window.BudgetBackup.fromWorkbook(wb);
        if (!bk) res = window.BudgetImporter.importWorkbook(wb);
      } catch (err) { toast("Не получилось: " + err.message); return; }
      if (bk) return restoreBackupModal(bk);
      var st = res.state, ys = Object.keys(st.years).sort();
      var nEntries = 0; ys.forEach(function (y) { Object.keys(st.years[y].entries).forEach(function (c) { nEntries += Object.keys(st.years[y].entries[c]).length; }); });
      modal(tpl("<div class='m-body'><h2>Импорт таблицы</h2><p class='muted'>Нашла: годы {ys}; категорий {nc}; счетов {na}; записей {ne}; курс {rate} ₽/€.</p>{!warn}" +
        "<div class='alert small'>Мой бюджет будет заменён данными из таблицы. Общие траты не тронутся.</div></div>" +
        "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Заменить мой бюджет</button></div>", {
          ys: ys.map(function (y) { return y + (st.years[y].archived ? " (архив)" : ""); }).join(", "), nc: st.categories.filter(function (c) { return !c.archived; }).length,
          na: st.accounts.length, ne: nEntries, rate: String(st.settings.rate).replace(".", ","),
          warn: res.warnings.length ? tpl("<div class='hint small'>{!w}</div>", { w: res.warnings.map(esc).join("<br>") }) : "" }), function (m) {
        m.querySelector("[data-act=cancel]").onclick = closeModal;
        m.querySelector("[data-act=ok]").onclick = function () {
          var keep = myState && myState.settings;
          if (keep) { st.settings.diffAlert = keep.diffAlert; st.settings.fx = Object.assign({}, keep.fx, { RUB: st.settings.rate }); }
          closeModal();
          if (view.who !== "me") switchTo("me");
          replaceMine(st); toast("Таблица импортирована");
        };
      });
    });
  }
  // бэкап в Excel: весь бюджет (восстанавливается один в один) + листы для чтения
  function backupDownload() {
    if (!window.XLSX || !window.BudgetBackup) { toast("Секунду — загружаю Excel-модуль, попробуй ещё раз"); return; }
    var exps = sh ? sh.expenses.map(function (e) { return Object.assign({}, e, { catName: e.kind === "batch" && !e.cat ? "Сводные суммы" : S.catOf(e, sh.learned) }); }) : [];
    var buf = window.BudgetBackup.toArrayBuffer(myState, { expenses: exps, partnerName: sh && sh.partner ? sh.partner.name : "" });
    download("easy-budget-backup-" + E.todayISO() + ".xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (!RO()) { myState.settings.lastFileBackupAt = new Date().toISOString(); changed(true); }
    toast("Бэкап скачан — сохрани файл в iCloud или Google Drive");
  }
  function restoreBackupModal(bk) {
    var st = bk.state, ys = Object.keys(st.years).sort(), when = bk.createdAt ? new Date(bk.createdAt) : null;
    modal(tpl("<div class='m-body'><h2>Восстановить из бэкапа</h2><p class='muted'>Копия от {when}: годы {ys}, категорий {nc}.</p><div class='alert small'>Мой бюджет будет заменён этой копией. Текущий сначала попадёт в резервные копии. Общие траты не тронутся.</div></div>" +
      "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Восстановить</button></div>", {
        when: when && !isNaN(when) ? when.toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "неизвестной даты", ys: ys.join(", "), nc: st.categories.length }), function (m) {
      m.querySelector("[data-act=cancel]").onclick = closeModal;
      m.querySelector("[data-act=ok]").onclick = function () { closeModal(); if (view.who !== "me") switchTo("me"); replaceMine(st); toast("Бюджет восстановлен из бэкапа"); };
    });
  }
  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- профиль партнёра: только итоги / скрыто ----------
  function partnerTotals() {
    var sm = view.summary, ys = Object.keys(sm.years || {}).sort();
    var y = ui.anYear && sm.years[ui.anYear] ? ui.anYear : (ys.filter(function (x) { return x <= String(new Date().getFullYear()); }).pop() || ys[ys.length - 1]);
    var html = tpl("<div class='page-head'><div><h1>{n}: итоги {y}</h1><div class='sub'>{n} открыла только итоги по месяцам{priv}. Обновлено {upd}.</div></div><div class='chips'>{!chips}</div></div>", {
      n: view.name, y: y || "", priv: sm.hasPrivate ? " · есть скрытые личные категории" : "", upd: new Date(sm.updatedAt).toLocaleString("ru-RU"),
      chips: ys.map(function (x) { return tpl("<button class='chip{on}' data-y='{y}'>{y}</button>", { on: x === y ? " on" : "", y: x }); }).join("") });
    if (!y) { $main.innerHTML = html + "<p class='empty'>Пока нет данных.</p>"; return; }
    var d = sm.years[y], t = d.total, ms = d.months;
    html += "<div class='kpis'>" + Plan.kpi("Доходы за год", eur(rnd(t.income), { dec: 0 })) + Plan.kpi("Расходы за год", eur(rnd(t.total), { dec: 0 })) +
      Plan.kpi("На жизнь в месяц", eur(rnd(t.living / 12), { dec: 0 })) + Plan.kpi("Капитал на конец года", t.cap === null || t.cap === undefined ? "—" : eur(rnd(t.cap), { dec: 0 })) + "</div>";
    html += monthTable(ms, t);
    $main.innerHTML = html;
    $main.querySelectorAll("[data-y]").forEach(function (b2) { b2.onclick = function () { ui.anYear = b2.dataset.y; render(); }; });
  }
  function monthTable(ms, t) {
    var rowsDef = [["Доходы", "income"], ["Базовые расходы", "base"], ["Периодические", "periodic"], ["Подписки ES", "subs_es"], ["Подписки RU (в €)", "subs_ru"],
      ["Расходы итого", "total", 1], ["  на жизнь (без налогов)", "living"], ["Доходы − расходы", "net", 1], ["Отложено в накопления", "saved"], ["Капитал на конец месяца", "cap", 1], ["Изменение капитала", "dcap"], ["Доля сбережений", "rate"]];
    var html = tpl("<div class='section'><h2>По месяцам</h2><div class='tbl-wrap'><table class='t'><thead><tr><th></th>{!ths}<th class='n'>Год</th></tr></thead><tbody>",
      { ths: E.MONTHS_SHORT.map(function (m) { return tpl("<th class='n'>{m}</th>", { m: m }); }).join("") });
    rowsDef.forEach(function (d) {
      var k = d[1];
      var cell = function (v) {
        if (v === null || v === undefined) return "<td class='n'></td>";
        if (k === "rate") return tpl("<td class='n'>{v}</td>", { v: pct(v) });
        return tpl("<td class='n {c}'>{v}</td>", { c: (k === "net" || k === "dcap") ? sign(v) : "", v: E.fmt(rnd(v)) });
      };
      html += tpl("<tr class='{c}'><td>{name}</td>{!cells}</tr>", { c: d[2] ? "total" : "", name: d[0], cells: ms.map(function (m) { return cell(m[k]); }).join("") + cell(t[k]) });
    });
    return html + "</tbody></table></div></div>";
  }

  // ---------- Настройки → Google Таблица ----------
  function drawSheetBox() {
    var box = $main.querySelector("#gsBox"); if (!box) return;
    loadSheetLink().then(function (row) {
      if (!box.isConnected) return;
      if (!row) {
        box.className = "";
        box.innerHTML = "<p class='muted' style='margin-top:-4px'>Твоя Google Таблица будет сама подтягивать изменения из приложения — раз в час и по кнопке. Листы как в твоём Excel: «Мой_ГГГГ» с формулами, сверка по счетам, «Анализ», «Выводы», «Общие траты».</p>" +
          "<button class='btn primary' id='gsOn'>Подключить Google Таблицу</button>";
        box.querySelector("#gsOn").onclick = function () {
          var b = this; b.disabled = true; b.textContent = "Готовлю…";
          var model; try { model = sheetModel(); } catch (e) { toast("Не получилось собрать таблицу: " + e.message); b.disabled = false; return; }
          Store.sheetConnect(model).then(function (token) { sheetLink = { token: token, updated_at: new Date().toISOString() }; sheetLastKey = sheetKey(); drawSheetBox(); sheetSteps(token); })
            .catch(function (e) { toast("Не получилось: " + e.message); b.disabled = false; b.textContent = "Подключить Google Таблицу"; });
        };
        return;
      }
      var when = row.updated_at ? new Date(row.updated_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "—";
      box.className = "";
      box.innerHTML = tpl("<p style='margin-top:-4px'><b>Подключено.</b> <span class='muted'>Данные для таблицы обновлены: {when}. Таблица забирает их раз в час или по кнопке «Easy Budget → Обновить сейчас».</span></p>{!hint}" +
        "<label class='f' style='max-width:520px;margin:0 0 10px'>Адрес таблицы<input type='url' id='gsUrl' placeholder='https://docs.google.com/spreadsheets/…' value='{url}'></label>" +
        "<div class='row'><button class='btn' id='gsSteps'>Как подключить таблицу</button><button class='btn' id='gsPush'>Отправить сейчас</button><button class='btn ghost' id='gsNew'>Новый ключ</button><button class='btn ghost danger' id='gsOff'>Отключить</button></div>", {
          when: when, url: state.settings.sheetUrl || "",
          hint: state.settings.sheetUrl ? "" : "<div class='hint small' style='margin:0 0 8px'>Последний шаг: открой свою таблицу, скопируй адрес из строки браузера и вставь ниже — тогда «Google Таблица ↗» в «Плане» будет открывать её. Сама таблица свой адрес приложению не сообщает.</div>" });
      box.querySelector("#gsSteps").onclick = function () { sheetSteps(row.token); };
      box.querySelector("#gsUrl").onchange = function () {
        var v = this.value.trim();
        if (v && !/^https:\/\/docs\.google\.com\//.test(v)) { toast("Это не похоже на ссылку Google Таблицы"); return; }
        state.settings.sheetUrl = v || undefined; changed(true); toast(v ? "Ссылка сохранена" : "Ссылка убрана");
      };
      box.querySelector("#gsPush").onclick = function () { scheduleSheetPush(true); toast("Отправила — в таблице нажми «Easy Budget → Обновить сейчас»"); setTimeout(drawSheetBox, 1500); };
      box.querySelector("#gsNew").onclick = function () {
        askConfirm("Выпустить новый ключ? Старый перестанет работать — в таблице нужно будет вставить новый.", "Выпустить ключ", function () {
          Store.sheetConnect(sheetModel()).then(function (token) { sheetLink = { token: token, updated_at: new Date().toISOString() }; drawSheetBox(); sheetSteps(token); });
        });
      };
      box.querySelector("#gsOff").onclick = function () {
        askConfirm("Отключить Google Таблицу? Ключ перестанет работать, таблица больше не будет обновляться (листы в ней останутся).", "Отключить", function () {
          Store.sheetDisconnect().then(function () { sheetLink = null; drawSheetBox(); toast("Отключено"); });
        });
      };
    });
  }
  function sheetSteps(token) {
    modal("<div class='m-body'><h2>Подключить Google Таблицу</h2><ol class='install-steps'>" +
      "<li>Открой <a href='https://sheets.new' target='_blank' rel='noopener'>новую Google Таблицу</a> (или ту, где хочешь видеть бюджет).</li>" +
      "<li>В ней: <b>Расширения → Apps Script</b>. Удали всё в редакторе, вставь код и нажми «Сохранить» (дискета). <button class='btn sm' id='gsCode'>Скопировать код</button></li>" +
      "<li>Вернись в таблицу и обнови страницу — появится меню <b>Easy Budget</b>.</li>" +
      "<li><b>Easy Budget → Подключить</b> и вставь ключ. <button class='btn sm' id='gsKey'>Скопировать ключ</button><br><small class='muted'>Google спросит разрешение: скрипту нужен доступ к этой таблице и к интернету, чтобы забирать данные. После «Разрешить» нажми «Подключить» ещё раз — Google не продолжает команду сам.</small></li>" +
      "<li>Через несколько секунд появятся листы. Не появились — <b>Easy Budget → Проверить подключение</b> покажет, в чём дело.</li></ol>" +
      "<p class='small muted'>Ключ — как пароль к копии бюджета: не пересылай его. Если он утёк — «Новый ключ», и старый перестанет работать.</p></div>" +
      "<div class='m-foot'><span class='spacer'></span><button class='btn primary' data-act='ok'>Готово</button></div>", function (m) {
      function copy(text, label) {
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(label + " скопирован"); }, function () { window.prompt("Скопируй вручную:", text); });
      }
      m.querySelector("#gsKey").onclick = function () { copy(token, "Ключ"); };
      // код загружаем заранее: копировать в буфер можно только сразу по нажатию
      var code = null;
      fetch("gsheet/EasyBudget.gs", { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) { code = t; }).catch(function () {});
      m.querySelector("#gsCode").onclick = function () { if (code) copy(code, "Код"); else toast("Секунду — загружаю код, нажми ещё раз"); };
      m.querySelector("[data-act=ok]").onclick = closeModal;
    });
  }


  // ===== Настройки: плитки, внутри — нужные разделы =====
  var SET_TILES = [
    ["money", "Деньги", "счета, категории, курсы валют", ["Основное", "Счета в обращении"], "<rect x='3' y='6' width='18' height='12' rx='2'/><circle cx='12' cy='12' r='2.5'/>"],
    ["year", "План года", "старт года, остатки на 1 января", ["Старт года", "По месяцам"], "<rect x='3' y='4' width='18' height='17' rx='2'/><path d='M3 9h18M8 2v4M16 2v4'/>"],
    ["us", "Мы и доступ", "кто что видит, общие траты", ["Профиль"], "<circle cx='9' cy='8' r='3.2'/><circle cx='16.5' cy='9.5' r='2.6'/><path d='M3 19c.7-3.2 3.1-5 6-5s5.3 1.8 6 5'/>"],
    ["data", "Данные", "Google Таблица, резервная копия, импорт", ["Google Таблица", "Резервные копии", "Данные"], "<path d='M12 3v12M7 10l5 5 5-5M4 19h16'/>"],
    ["remind", "Напоминания", "сверка раз в неделю", ["Напоминание о сверке"], "<path d='M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4'/>"],
  ];
  function settingsHub() {
    var cloud = Store.mode === "cloud", u = Store.user() || {}, sec = ui.setSec;
    var blocks = [];
    $main.querySelectorAll("h2").forEach(function (h) {
      var el = h.closest(".section, .card"); if (!el || el.closest("dialog")) return;
      var t = h.textContent.trim(); el.dataset.sec = t; blocks.push(el);
    });
    var head = $main.querySelector(".page-head");
    var tile = SET_TILES.find(function (x) { return x[0] === sec; });
    if (!tile) {
      blocks.forEach(function (b) { b.hidden = true; });
      if (head) head.hidden = true;
      var hub = tpl("<div class='set-hub'><h1>Настройки</h1><button type='button' class='card set-prof' data-st='us'><span class='sp-av'>{av}</span><span class='sp-tx'><b>{name}</b><small>{sub}</small></span><span class='arr'>›</span></button>" +
        "<div class='set-tiles'>{!tiles}<a class='card set-tile' href='#help'><span class='st-ic'>?</span><b>Как это работает</b><small>справка и словарь терминов</small></a></div>{!out}</div>", {
          av: (u.name || state.settings.myName || "Я").charAt(0), name: u.name || state.settings.myName || "Профиль", sub: cloud ? "профиль и вход · " + (u.email || "") : "данные только в этом браузере",
          out: cloud ? "<button class='btn ghost set-out' id='signOut2'>Выйти</button>" : "",
          // x[4] — SVG-иконка плитки из SET_TILES выше (свой код)
          tiles: SET_TILES.map(function (x) { return tpl("<button type='button' class='card set-tile' data-st='{0}'><span class='st-ic'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'>{!4}</svg></span><b>{1}</b><small>{2}</small></button>", x); }).join("") });
      $main.insertAdjacentHTML("afterbegin", hub);
      $main.querySelectorAll("[data-st]").forEach(function (b) { b.onclick = function () { ui.setSec = b.dataset.st; render(); window.scrollTo(0, 0); }; });
      var so = $main.querySelector("#signOut2"), so1 = $main.querySelector("#signOut"); if (so && so1) so.onclick = function () { so1.click(); };
      return;
    }
    blocks.forEach(function (b) { b.hidden = tile[3].indexOf(b.dataset.sec) < 0; });
    if (head) head.hidden = true;
    $main.insertAdjacentHTML("afterbegin", tpl("<div class='set-bar'><button type='button' class='back-link linkish' id='setBack'>‹ Настройки</button></div><h1 class='set-h1'>{1}</h1>", tile));
    if (sec === "money") {
      var open = ui.catOpen || (ui.catOpen = {});
      var ch = "<div class='card section cat2'><h2>Категории</h2><p class='small muted' style='margin-top:-6px'>Нажми на категорию, чтобы изменить. Чтобы переставить — потяни за <b>⋮⋮</b> слева.</p>";
      E.BLOCKS.forEach(function (b, bi) {
        var list = cats().filter(function (c) { return c.block === b.id; }), isOpen = open[b.id] !== undefined ? open[b.id] : bi < 2;
        ch += tpl("<div class='c2-group'><button type='button' class='c2-gh' data-cg='{id}'><span>{arr}{name} · {n}</span><span class='linkish' data-cadd='{id}'>+ категория</span></button>", {
          id: b.id, arr: isOpen ? "▾ " : "▸ ", name: b.name, n: list.filter(function (c) { return !c.archived; }).length });
        if (isOpen) ch += list.map(function (c) {
          var badges = (c.mandatory ? "<span class='c2-b'>обязательная</span>" : "") + (window.BudgetInsights.isJoy(c) && c.block !== "income" && c.block !== "savings" ? "<span class='c2-b joy'>на радость</span>" : "") + (c.private ? "<span class='c2-b priv'>личная</span>" : "") + (c.archived ? "<span class='c2-b'>в архиве</span>" : "") + (c.currency === "RUB" ? "<span class='c2-b'>₽</span>" : "");
          return tpl("<button type='button' class='c2-row{a}' data-cedit='{id}'><span class='drag-h' aria-label='Перетащить' title='Потяни, чтобы переставить'><svg width='14' height='14' viewBox='0 0 24 24' fill='currentColor'><circle cx='9' cy='6' r='1.7'/><circle cx='15' cy='6' r='1.7'/><circle cx='9' cy='12' r='1.7'/><circle cx='15' cy='12' r='1.7'/><circle cx='9' cy='18' r='1.7'/><circle cx='15' cy='18' r='1.7'/></svg></span><span class='c2-n'>{name}</span>{!badges}<span class='arr'>›</span></button>",
            { a: c.archived ? " arch" : "", id: c.id, name: c.name, badges: badges });
        }).join("");
        ch += "</div>";
      });
      ch += "</div>";
      $main.insertAdjacentHTML("beforeend", ch);
      $main.querySelectorAll("[data-cg]").forEach(function (b) { b.onclick = function (e) { if (e.target.closest("[data-cadd]")) return; var id = b.dataset.cg, bi = E.BLOCKS.findIndex(function (x) { return x.id === id; }); open[id] = !(open[id] !== undefined ? open[id] : bi < 2); render(); }; });
      $main.querySelectorAll("[data-cadd]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); var bl = b.dataset.cadd; textModal("Новая категория", "", function (n) { if (!n) return; var inBlock = state.categories.filter(function (c) { return c.block === bl; }); state.categories.push({ id: E.uid("c"), name: n, block: bl, currency: "EUR", mandatory: false, link: null, sort: inBlock.length ? Math.max.apply(null, inBlock.map(function (c) { return c.sort; })) + 0.01 : 999, archived: false }); open[bl] = true; changed(); toast("Категория добавлена"); }, "например, Животные"); }; });
      $main.querySelectorAll("[data-cedit]").forEach(function (b) { b.onclick = function (e) { if (e.target.closest(".drag-h")) return; catEditSheet(b.dataset.cedit); }; });
      $main.querySelectorAll(".c2-group").forEach(function (g) { dragSort(g, ".c2-row", "data-cedit", function (ids) { reorderCats(ids); changed(); toast("Порядок сохранён"); }); });
    }
    if (sec === "us" && sh && !RO()) {
      var hidden = sh.space.settings.hiddenCats || [], custom = sh.space.settings.customCats || [];
      var all = S.SHARED_CATS.filter(function (c) { return c !== "Сводные суммы"; }).concat(custom.filter(function (c) { return S.SHARED_CATS.indexOf(c) < 0; }));
      $main.insertAdjacentHTML("beforeend", tpl("<div class='card section sc-card'><h2>Категории общих трат</h2><p class='small muted' style='margin-top:-6px'>Общие для вас обеих: изменения видят и ты, и {p}. Скрытая категория не показывается при вводе, старые траты в ней остаются. «Как делите» подставится сам при вводе одной фразой.</p>" +
        "<div class='sc-list'>{!rows}</div><button type='button' class='btn' id='scAdd'>+ Новая категория</button></div>", { p: partnerName(), rows: all.map(function (c) {
          var isHidden = hidden.indexOf(c) >= 0, sp = catSplitOf(c);
          return tpl("<button type='button' class='sc-row{off}' data-scedit='{c}'>{!ic}<span class='sc-n'>{name}</span><span class='c2-b{priv}'>{badge}</span><span class='arr'>›</span></button>", {
            off: isHidden ? " off" : "", c: c, ic: Us.catIcon(c), name: Us.catLabel(c), priv: !isHidden && (sp === "theirs" || sp === "mine") ? " priv" : "",
            badge: isHidden ? "скрыта" : sp === "theirs" ? "в основном " + partnerName() : sp === "mine" ? "в основном я" : "½" });
        }).join("") }));
      var saveSp = function () { Store.saveSpaceSettings(sh.space.id, sh.space.settings).catch(function (e) { toast("Не сохранилось: " + e.message); }); render(); };
      $main.querySelectorAll("[data-scedit]").forEach(function (b) {
        b.onclick = function () {
          var c = b.dataset.scedit, isCustom = S.SHARED_CATS.indexOf(c) < 0, set2 = sh.space.settings, sp = catSplitOf(c), hid = (set2.hiddenCats || []).indexOf(c) >= 0;
          modal(tpl("<form class='m-body' id='scF'><h2>Категория общих трат</h2><label class='f' style='margin-top:10px'>Название<input name='n' value='{name}' required></label>{!was}" +
            "<div class='small muted' style='margin-top:12px'>Как делите по умолчанию</div><div class='tg-row' style='margin-top:6px'>{!tgs}</div><button type='submit' hidden></button></form>" +
            "<div class='m-foot'><button class='btn ghost' data-act='hide'>{hide}</button><span class='spacer'></span><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", {
              name: Us.catLabel(c), was: Us.catLabel(c) !== c ? tpl("<p class='small muted' style='margin:4px 0 0'>Было: {c}</p>", { c: c }) : "", hide: hid ? "Показать при вводе" : "Скрыть",
              tgs: [["equal", "пополам"], ["theirs", "в основном " + partnerName()], ["mine", "в основном я"]].map(function (o) { return tpl("<button type='button' class='tg{on}' data-sp='{v}'>{l}</button>", { on: sp === o[0] ? " on" : "", v: o[0], l: (sp === o[0] ? "✓ " : "") + o[1] }); }).join("") }), function (m) {
            var f = m.querySelector("#scF"), chosen = sp;
            m.querySelector("[data-act=cancel]").onclick = closeModal;
            m.querySelectorAll("[data-sp]").forEach(function (t) { t.onclick = function () { chosen = t.dataset.sp; m.querySelectorAll("[data-sp]").forEach(function (u) { var on = u.dataset.sp === chosen; u.classList.toggle("on", on); u.textContent = (on ? "✓ " : "") + u.textContent.replace(/^✓ /, ""); }); }; });
            var ok = function (e) {
              if (e) e.preventDefault();
              var n = f.n.value.trim();
              if (n && n !== Us.catLabel(c)) { if (isCustom) set2.customCats = (set2.customCats || []).map(function (x) { return x === c ? n : x; }); else { set2.catNames = set2.catNames || {}; if (n === c) delete set2.catNames[c]; else set2.catNames[c] = n; } }
              set2.catSplit = set2.catSplit || {}; var key = isCustom && n ? n : c, sv = catSplitValue(chosen); delete set2.catSplit[c]; if (sv) set2.catSplit[key] = sv; else delete set2.catSplit[key];
              closeModal(); saveSp(); toast("Сохранено");
            };
            f.onsubmit = ok; m.querySelector("[data-act=ok]").onclick = ok;
            m.querySelector("[data-act=hide]").onclick = function () { var h = set2.hiddenCats || []; set2.hiddenCats = hid ? h.filter(function (x) { return x !== c; }) : h.concat([c]); closeModal(); saveSp(); };
          });
        };
      });
      $main.querySelector("#scAdd").onclick = function () { textModal("Новая категория общих трат", "", function (n) { if (!n) return; if (all.indexOf(n) >= 0) { toast("Такая уже есть"); return; } sh.space.settings.customCats = (sh.space.settings.customCats || []).concat([n]); saveSp(); }, "например, «Животные»"); };
    }
    $main.querySelector("#setBack").onclick = function () { ui.setSec = null; render(); window.scrollTo(0, 0); };
  }

  // правка категории в панели: название, группа, валюта, отметки, порядок, архив
  function catEditSheet(id) {
    var c = state.categories.find(function (x) { return x.id === id; }); if (!c) return;
    var isSpend = c.block !== "income" && c.block !== "savings";
    var tg = function (f, label, on) { return tpl("<button type='button' class='tg{on}' data-tg='{f}'>{l}</button>", { on: on ? " on" : "", f: f, l: (on ? "✓ " : "") + label }); };
    var o = function (v, l, sel) { return tpl("<option value='{v}'{!s}>{l}</option>", { v: v, l: l, s: sel ? " selected" : "" }); };
    modal(tpl("<form class='m-body' id='ceF'><h2>Категория</h2><label class='f' style='margin-top:10px'>Название<input name='n' value='{name}' required></label>" +
      "<div class='form-grid' style='margin-top:10px'><label class='f'>Группа<select name='b'>{!blocks}</select></label><label class='f'>Валюта<select name='cur'>{!cur}</select></label></div>{!link}" +
      "<div class='tg-row'>{!tgs}</div><div class='row small ce-pos' style='margin-top:10px'><button type='button' class='btn sm' data-mv='-1'>↑ выше</button><button type='button' class='btn sm' data-mv='1'>↓ ниже</button><span class='muted' id='cePos'></span></div><button type='submit' hidden></button></form>" +
      "<div class='m-foot'><button class='btn ghost danger' data-act='arch'>{arch}</button><span class='spacer'></span><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить</button></div>", {
        name: c.name, arch: c.archived ? "Вернуть из архива" : "В архив",
        blocks: E.BLOCKS.map(function (x) { return o(x.id, x.name, x.id === c.block); }).join(""),
        cur: tpl("<option{!a}>EUR</option><option{!b}>RUB</option>", { a: c.currency !== "RUB" ? " selected" : "", b: c.currency === "RUB" ? " selected" : "" }),
        link: c.block === "savings" ? tpl("<label class='f' style='margin-top:10px'>Счёт в капитале<select name='lk'><option value=''>—</option>{!o}</select></label>", { o: E.CAPITAL_ROWS.filter(function (x) { return x.key !== "card_rub"; }).map(function (x) { return o(x.key, x.name, c.link === x.key); }).join("") }) : "",
        tgs: (isSpend ? tg("joy", "на радость", window.BudgetInsights.isJoy(c)) : "") + tg("mandatory", "налоги и обязательные", !!c.mandatory) + tg("private", "личная — партнёр не видит", !!c.private) }), function (m) {
      var f = m.querySelector("#ceF"), flags = { joy: window.BudgetInsights.isJoy(c), mandatory: !!c.mandatory, private: !!c.private };
      m.querySelectorAll("[data-tg]").forEach(function (b) { b.onclick = function () { var k = b.dataset.tg; flags[k] = !flags[k]; b.classList.toggle("on", flags[k]); b.textContent = (flags[k] ? "✓ " : "") + b.textContent.replace(/^✓ /, ""); }; });
      // место в группе меняется только по «Сохранить»
      var same = cats().filter(function (x) { return x.block === c.block; }), pos = same.indexOf(c), pos0 = pos;
      var showPos = function () { m.querySelector("#cePos").textContent = "место " + (pos + 1) + " из " + same.length; };
      showPos();
      m.querySelectorAll("[data-mv]").forEach(function (b) { b.onclick = function () { var j = pos + Number(b.dataset.mv); if (j < 0 || j >= same.length) return; pos = j; showPos(); }; });
      m.querySelector("[data-act=cancel]").onclick = closeModal;
      var ok = function (e) {
        if (e) e.preventDefault();
        var n = f.n.value.trim(); if (n) c.name = n;
        if (pos !== pos0 && f.b.value === c.block) { var ids = same.map(function (x) { return x.id; }); ids.splice(pos0, 1); ids.splice(pos, 0, c.id); reorderCats(ids); }
        c.block = f.b.value; c.currency = f.cur.value; if (isSpend) c.joy = flags.joy; c.mandatory = flags.mandatory; c.private = flags.private; if (f.lk) c.link = f.lk.value || null;
        closeModal(); changed(); toast("Сохранено");
      };
      f.onsubmit = ok; m.querySelector("[data-act=ok]").onclick = ok;
      m.querySelector("[data-act=arch]").onclick = function () { c.archived = !c.archived; closeModal(); changed(); toast(c.archived ? "В архиве" : "Вернула"); };
    });
  }

  // для других экранов — только это; остальное внутри модуля
  window.Settings = { maybeWeeklyBackup: maybeWeeklyBackup, backupDownload: backupDownload, download: download, partnerTotals: partnerTotals, catEditSheet: catEditSheet };
})();
