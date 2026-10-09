/* Easy Budget — «Настройки», бэкапы, импорт, профиль партнёра. */
"use strict";
// ===== НАСТРОЙКИ =====
routes.settings = function () {
  var s = state.settings;
  var cloud = Store.mode === "cloud", u = Store.user() || {};
  var html = "<div class='page-head'><div><h1>Настройки</h1><div class='sub'>" + (cloud ? "Данные в облаке: " + esc(u.email || "") + ". Бэкап в файл — по желанию." : "Данные хранятся только в этом браузере. Делай бэкап в файл время от времени.") + "</div></div>" +
    (cloud ? "<button class='btn ghost' id='signOut'>Выйти</button>" : "") + "</div>";
  // профиль и доступ
  html += "<div class='grid2'><div class='card'><h2>Профиль</h2><form id='setProfile' class='form-grid'><label class='f'>Моё имя<input name='name' value='" + esc(u.name || "") + "' placeholder='Катя' required></label>" +
    "<button class='btn' type='submit'>Сохранить</button></form>";
  if (cloud) {
    html += "<h3 style='margin-top:16px'>Кто что видит в моём бюджете</h3>";
    if (!people.length) html += "<p class='small muted'>Когда партнёр войдёт в общее пространство (экран «Общие»), здесь можно будет выбрать, что ей видно.</p>";
    people.forEach(function (p) {
      html += "<label class='f' style='margin-top:6px'>" + esc(p.name) + "<select data-vis='" + esc(p.userId) + "'>" +
        [["full", "видит полностью"], ["totals", "видит только итоги за месяц"], ["hidden", "не видит"]].map(function (o) { return "<option value='" + o[0] + "'" + (p.myLevel === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>";
    });
    html += "<p class='small muted'>Личные категории (галочка «личная» ниже) не видны никому, даже при полном доступе.</p>";
  }
  html += "</div>";
  html += "<div class='card'><h2>Основное</h2><form id='setMain' class='form-grid'>" +
    "<label class='f'>Курс: ₽ за 1 €<input type='text' name='rate' value='" + esc(s.rate) + "' inputmode='decimal'></label>" +
    "<label class='f'>Расхождение, после которого тревожиться, €<input type='text' name='alert' value='" + esc(-s.diffAlert / 100) + "' inputmode='decimal'></label>" +
    "<label class='f'>Курс GEL за 1 €<input type='text' name='gel' value='" + esc(s.fx.GEL) + "'></label>" +
    "<label class='f'>Курс USD за 1 €<input type='text' name='usd' value='" + esc(s.fx.USD) + "'></label>" +
    "<button class='btn primary' type='submit'>Сохранить</button></form>" +
    (s.rateHistory && s.rateHistory.length ? "<p class='small muted'>История курса: " + s.rateHistory.slice(-5).map(function (h) { return esc(h.date) + " — " + esc(h.rate); }).join(" · ") + "</p>" : "") + "</div></div>";

  // старт годов
  html += "<div class='card section'><h2>Старт года</h2>";
  activeYears().forEach(function (y) {
    var yr = state.years[y], st = E.startOf(state, y);
    html += "<h3 style='margin-top:10px'>" + y + "</h3>";
    if (yr.fromPrev) html += "<p class='small muted' style='margin:0 0 6px'>Считается из остатков 31.12." + (Number(y) - 1) + ": в обращении " + eur(rnd(st.obr), { dec: 0 }) + ", накопления " + eur(rnd(st.sav + st.inv + st.cash), { dec: 0 }) +
      ". <button class='btn sm ghost' data-manual='" + y + "'>Задать вручную</button></p>";
    else {
      html += "<form class='form-grid' data-start='" + y + "'><label class='f'>в обращении €<input name='obr' value='" + esc(st.obr / 100) + "'></label>";
      E.CAPITAL_ROWS.forEach(function (cr) { html += "<label class='f'>" + cr.name + "<input name='" + cr.key + "' value='" + esc(st[cr.key] / 100) + "'></label>"; });
      html += "<button class='btn' type='submit'>Сохранить</button>" + (state.years[String(Number(y) - 1)] && !state.years[String(Number(y) - 1)].archived ? "<button class='btn ghost' type='button' data-auto='" + y + "'>Из прошлого года</button>" : "") + "</form>";
    }
  });
  html += "</div>";

  // счета
  html += "<div class='section'><h2>Счета в обращении</h2><div class='tbl-wrap'><table class='t mcard'><thead><tr><th>Название</th><th>Тип</th><th>Считать в факте с</th><th></th></tr></thead><tbody>" +
    state.accounts.slice().sort(function (a, b) { return a.sort - b.sort; }).map(function (a) {
      return "<tr" + (a.archived ? " class='muted'" : "") + "><td class='mc-title'><input type='text' data-acc='" + a.id + "' data-f='name' value='" + esc(a.name) + "' aria-label='Название счёта'></td>" +
        "<td data-l='Тип'><select data-acc='" + a.id + "' data-f='kind'><option value='cash_flow'" + (a.kind === "cash_flow" ? " selected" : "") + ">в обращении</option><option value='info'" + (a.kind === "info" ? " selected" : "") + ">для справки</option></select></td>" +
        "<td data-l='Считать в факте с'><input type='date' data-acc='" + a.id + "' data-f='countsFrom' value='" + esc(a.countsFrom || "") + "'></td>" +
        "<td class='n mc-act'><button class='btn sm ghost' data-accarch='" + a.id + "'>" + (a.archived ? "вернуть" : "в архив") + "</button></td></tr>";
    }).join("") + "</tbody></table></div><div class='row' style='margin-top:8px'><button class='btn' id='addAcc'>+ счёт</button></div></div>";

  // категории
  html += "<div class='section'><h2>Категории</h2><div class='tbl-wrap'><table class='t mcard'><thead><tr><th>Название</th><th>Блок</th><th>Валюта</th><th>Налоги и обязательные</th><th title='развлечения, путешествия, одежда, уход, хобби — для структуры трат в «Выводах»'>На радость</th><th title='не видна партнёру ни в деталях, ни в итогах'>Личная</th><th>Счёт в капитале</th><th></th></tr></thead><tbody>";
  E.BLOCKS.forEach(function (b) {
    var inBlock = cats().filter(function (c) { return c.block === b.id; });
    if (inBlock.length) html += "<tr class='mc-group'><td colspan='8'>" + esc(b.name) + "</td></tr>";
    inBlock.forEach(function (c) {
      html += "<tr" + (c.archived ? " class='muted'" : "") + "><td class='mc-title'><input type='text' data-cat2='" + c.id + "' data-f='name' value='" + esc(c.name) + "' aria-label='Название категории'></td>" +
        "<td data-l='Блок'><select data-cat2='" + c.id + "' data-f='block'>" + E.BLOCKS.map(function (x) { return "<option value='" + x.id + "'" + (x.id === c.block ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></td>" +
        "<td data-l='Валюта'><select data-cat2='" + c.id + "' data-f='currency'><option" + (c.currency === "EUR" ? " selected" : "") + ">EUR</option><option" + (c.currency === "RUB" ? " selected" : "") + ">RUB</option></select></td>" +
        "<td class='mc-chk'><label class='chk'><input type='checkbox' data-cat2='" + c.id + "' data-f='mandatory'" + (c.mandatory ? " checked" : "") + "><span>налоги и обязательные траты</span></label></td>" +
        "<td class='mc-chk'>" + (c.block === "income" || c.block === "savings" ? "" : "<label class='chk'><input type='checkbox' data-cat2='" + c.id + "' data-f='joy'" + (window.BudgetInsights.isJoy(c) ? " checked" : "") + "><span>на радость</span></label>") + "</td>" +
        "<td class='mc-chk'><label class='chk'><input type='checkbox' data-cat2='" + c.id + "' data-f='private'" + (c.private ? " checked" : "") + "><span>личная — не видна партнёру</span></label></td>" +
        "<td" + (c.block === "savings" ? " data-l='Счёт в капитале'" : " class='mc-empty'") + ">" + (c.block === "savings" ? "<select data-cat2='" + c.id + "' data-f='link'><option value=''>—</option>" + E.CAPITAL_ROWS.filter(function (x) { return x.key !== "card_rub"; }).map(function (x) { return "<option value='" + x.key + "'" + (c.link === x.key ? " selected" : "") + ">" + x.name + "</option>"; }).join("") + "</select>" : "") + "</td>" +
        "<td class='n mc-act'><button class='btn sm ghost' data-up='" + c.id + "' aria-label='Поднять выше' title='Поднять выше'>↑</button><button class='btn sm ghost' data-catarch='" + c.id + "'>" + (c.archived ? "вернуть" : "в архив") + "</button></td></tr>";
    });
  });
  html += "</tbody></table></div><form id='addCat' class='row' style='margin-top:8px'><input type='text' name='name' placeholder='Новая категория' required><select name='block'>" +
    E.BLOCKS.map(function (x) { return "<option value='" + x.id + "'>" + esc(x.name) + "</option>"; }).join("") + "</select><select name='cur'><option>EUR</option><option>RUB</option></select><button class='btn' type='submit'>+ категория</button></form></div>";

  html += "<div class='section card'><h2>Резервные копии</h2><p class='muted' style='margin-top:-4px'>Копия бюджета сохраняется сама — после сверки, раз в неделю, и перед заменой бюджета. Хранятся последние 12. Общие траты в копию не входят: они хранятся отдельно, у вас обеих.</p>" +
    "<div id='snapList' class='small muted'>Загружаю…</div><div class='row' style='margin-top:10px'><button class='btn' id='snapNow'>Сделать копию сейчас</button></div></div>";
  var rm = state.settings.reminder;
  html += "<div class='section card'><h2>Google Таблица</h2><div id='gsBox' class='muted small'>" + (cloud ? "Проверяю…" : "Работает в облачной версии.") + "</div></div>";
  html += "<div class='section card'><h2>Напоминание о сверке</h2><p class='muted' style='margin-top:-4px'>" + (rm && rm.off ? "Выключено." : rm ? "Настроено: " + (rm.day === "MO" ? "по понедельникам" : "по воскресеньям") + " в " + esc(rm.time) + (rm.push ? " — уведомлением на телефон." : ". Если удалила событие из календаря — добавь заново.") :
    (Store.mode === "cloud" ? "Уведомление на телефон или событие в календаре каждую неделю, со ссылкой на сверку." : "Событие в календаре каждую неделю, со ссылкой на сверку.")) + "</p><button class='btn' id='remBtn'>" + (rm ? "Изменить" : "Настроить") + "</button></div>";
  // данные
  html += "<div class='section card'><h2>Данные</h2><div class='row'><label class='btn primary'>Импорт из Excel / Google Sheets (.xlsx)<input type='file' id='xlsx' accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' hidden></label>" +
    "<button class='btn' id='exp'>Скачать бэкап (Excel)</button><label class='btn'>Загрузить бэкап<input type='file' id='imp' accept='.xlsx,.json,application/json' hidden></label>" +
    "<button class='btn' id='expCsv'>Год в CSV</button><span class='spacer'></span>" + (window.SEED && !cloud ? "<button class='btn ghost danger' id='reseed'>Заново из seed.js</button>" : "") +
    "<button class='btn ghost danger' id='wipe'>Начать с нуля</button></div><p class='small muted'>Google Sheets: Файл → Скачать → Microsoft Excel (.xlsx), затем «Импорт». Подходят листы «Мой_ГГГГ» и «ГГГГ_€ REAL».</p></div>";
  $main.innerHTML = html;

  $main.querySelector("#setMain").onsubmit = function (e) {
    e.preventDefault();
    var f = e.target, rate = Number(String(f.rate.value).replace(",", "."));
    if (!(rate > 0)) { toast("Курс должен быть числом"); return; }
    if (rate !== s.rate) { s.rateHistory = s.rateHistory || []; s.rateHistory.push({ date: E.todayISO(), rate: rate, prev: s.rate }); s.rate = rate; s.fx.RUB = rate; }
    s.diffAlert = -Math.abs(Math.round(Number(String(f.alert.value).replace(",", ".")) * 100)) || -5000;
    s.fx.GEL = Number(String(f.gel.value).replace(",", ".")) || s.fx.GEL; s.fx.USD = Number(String(f.usd.value).replace(",", ".")) || s.fx.USD;
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
    el.onchange = function () { var a = state.accounts.find(function (x) { return x.id === el.dataset.acc; }); a[el.dataset.f] = el.value || null; changed(true); toast("Сохранено"); };
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
      try { var d = JSON.parse(t); if (!d.years || !d.categories) throw new Error("не похоже на бэкап"); if (!confirm("Заменить мой бюджет бэкапом?")) return; replaceMine(d); toast("Бэкап загружен"); }
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
  if (rs) rs.onclick = function () { if (!confirm("Заменить бюджет данными из seed.js?")) return; replaceMine(fromSeed()); };
  $main.querySelector("#wipe").onclick = function () { if (!confirm("Стереть мой бюджет и начать с пустого года? Общие траты не тронутся.")) return; replaceMine(blank()); };
  $main.querySelector("#xlsx").onchange = function (e) { var f = e.target.files[0]; if (f) importXlsxFile(f); };
  $main.querySelector("#remBtn").onclick = reminderModal;
  if (cloud) drawSheetBox();
  function drawSnaps() {
    var box = $main.querySelector("#snapList"); if (!box) return;
    Store.listSnapshots().then(function (l) {
      if (!box.isConnected) return;
      box.className = "";
      box.innerHTML = l.length ? "<ul class='snap-list'>" + l.map(function (x) {
        return "<li><span><b>" + esc(new Date(x.created_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })) + "</b><small>" + esc(x.reason || "") + (x.local ? " · на этом устройстве" : "") + "</small></span>" +
          "<button class='btn sm' data-snapdl='" + x.id + "'>Скачать</button><button class='btn sm' data-snapre='" + x.id + "'>Восстановить</button></li>";
      }).join("") + "</ul>" : "<p class='small muted'>Копий пока нет — первая появится после ближайшей сверки.</p>";
      box.querySelectorAll("[data-snapdl]").forEach(function (b) { b.onclick = function () { Store.getSnapshot(b.dataset.snapdl).then(function (d) { download("easy-budget-copy-" + E.todayISO() + ".json", JSON.stringify(d), "application/json"); }); }; });
      box.querySelectorAll("[data-snapre]").forEach(function (b) {
        b.onclick = function () {
          var x = l.find(function (q) { return String(q.id) === b.dataset.snapre; });
          if (!confirm("Вернуть бюджет к копии от " + new Date(x.created_at).toLocaleString("ru-RU") + "? Текущее состояние сначала сохранится отдельной копией — к нему можно будет вернуться.")) return;
          Store.getSnapshot(x.id).then(function (d) { if (!d) { toast("Копия не нашлась"); return; } replaceMine(d); toast("Бюджет восстановлен из копии"); });
        };
      });
    }).catch(function () { box.textContent = "Не получилось загрузить список копий."; });
  }
  drawSnaps();
  $main.querySelector("#snapNow").onclick = function () { backupNow("вручную").then(function () { changed(true); toast("Копия сохранена"); drawSnaps(); }); };
  // оглавление: настройки длинные
  var heads = $main.querySelectorAll("h2"), toc = "";
  heads.forEach(function (h, i) { h.id = "set-" + i; h.style.scrollMarginTop = "16px"; toc += "<button type='button' class='chip' data-goto='set-" + i + "'>" + esc(h.textContent.replace(/\s*\(.*$/, "")) + "</button>"; });
  $main.querySelector(".page-head").insertAdjacentHTML("afterend", "<nav class='chips set-toc' aria-label='Разделы настроек'>" + toc + "</nav>");
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
};

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
    modal("<div class='m-body'><h2>Импорт таблицы</h2><p class='muted'>Нашла: годы " + ys.map(function (y) { return y + (st.years[y].archived ? " (архив)" : ""); }).join(", ") +
      "; категорий " + st.categories.filter(function (c) { return !c.archived; }).length + "; счетов " + st.accounts.length + "; записей " + nEntries + "; курс " + String(st.settings.rate).replace(".", ",") + " ₽/€.</p>" +
      (res.warnings.length ? "<div class='hint small'>" + res.warnings.map(esc).join("<br>") + "</div>" : "") +
      "<div class='alert small'>Мой бюджет будет заменён данными из таблицы. Общие траты не тронутся.</div></div>" +
      "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Заменить мой бюджет</button></div>", function (m) {
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
  modal("<div class='m-body'><h2>Восстановить из бэкапа</h2><p class='muted'>Копия от " + (when && !isNaN(when) ? when.toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "неизвестной даты") +
    ": годы " + ys.join(", ") + ", категорий " + st.categories.length + ".</p><div class='alert small'>Мой бюджет будет заменён этой копией. Текущий сначала попадёт в резервные копии. Общие траты не тронутся.</div></div>" +
    "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Восстановить</button></div>", function (m) {
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
  var html = "<div class='page-head'><div><h1>" + esc(view.name) + ": итоги " + esc(y || "") + "</h1><div class='sub'>" + esc(view.name) + " открыла только итоги по месяцам" +
    (sm.hasPrivate ? " · есть скрытые личные категории" : "") + ". Обновлено " + esc(new Date(sm.updatedAt).toLocaleString("ru-RU")) + ".</div></div>" +
    "<div class='chips'>" + ys.map(function (x) { return "<button class='chip" + (x === y ? " on" : "") + "' data-y='" + x + "'>" + x + "</button>"; }).join("") + "</div></div>";
  if (!y) { $main.innerHTML = html + "<p class='empty'>Пока нет данных.</p>"; return; }
  var d = sm.years[y], t = d.total, ms = d.months;
  html += "<div class='kpis'>" + kpi("Доходы за год", eur(rnd(t.income), { dec: 0 })) + kpi("Расходы за год", eur(rnd(t.total), { dec: 0 })) +
    kpi("На жизнь в месяц", eur(rnd(t.living / 12), { dec: 0 })) + kpi("Капитал на конец года", t.cap === null || t.cap === undefined ? "—" : eur(rnd(t.cap), { dec: 0 })) + "</div>";
  html += monthTable(ms, t);
  $main.innerHTML = html;
  $main.querySelectorAll("[data-y]").forEach(function (b2) { b2.onclick = function () { ui.anYear = b2.dataset.y; render(); }; });
}
function monthTable(ms, t) {
  var rowsDef = [["Доходы", "income"], ["Базовые расходы", "base"], ["Периодические", "periodic"], ["Подписки ES", "subs_es"], ["Подписки RU (в €)", "subs_ru"],
    ["Расходы итого", "total", 1], ["  на жизнь (без налогов)", "living"], ["Доходы − расходы", "net", 1], ["Отложено в накопления", "saved"], ["Капитал на конец месяца", "cap", 1], ["Изменение капитала", "dcap"], ["Доля сбережений", "rate"]];
  var html = "<div class='section'><h2>По месяцам</h2><div class='tbl-wrap'><table class='t'><thead><tr><th></th>" + E.MONTHS_SHORT.map(function (m) { return "<th class='n'>" + m + "</th>"; }).join("") + "<th class='n'>Год</th></tr></thead><tbody>";
  rowsDef.forEach(function (d) {
    var k = d[1];
    var cell = function (v) {
      if (v === null || v === undefined) return "<td class='n'></td>";
      if (k === "rate") return "<td class='n'>" + pct(v) + "</td>";
      return "<td class='n " + ((k === "net" || k === "dcap") ? sign(v) : "") + "'>" + E.fmt(rnd(v)) + "</td>";
    };
    html += "<tr class='" + (d[2] ? "total" : "") + "'><td>" + d[0] + "</td>" + ms.map(function (m) { return cell(m[k]); }).join("") + cell(t[k]) + "</tr>";
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
    box.innerHTML = "<p style='margin-top:-4px'><b>Подключено.</b> <span class='muted'>Данные для таблицы обновлены: " + esc(when) + ". Таблица забирает их раз в час или по кнопке «Easy Budget → Обновить сейчас».</span></p>" +
      "<label class='f' style='max-width:520px;margin:0 0 10px'>Ссылка на таблицу — появится кнопка «Открыть в Google Таблице» на экране «Год»<input type='url' id='gsUrl' placeholder='https://docs.google.com/spreadsheets/…' value='" + esc(state.settings.sheetUrl || "") + "'></label>" +
      "<div class='row'><button class='btn' id='gsSteps'>Как подключить таблицу</button><button class='btn' id='gsPush'>Отправить сейчас</button><button class='btn ghost' id='gsNew'>Новый ключ</button><button class='btn ghost danger' id='gsOff'>Отключить</button></div>";
    box.querySelector("#gsSteps").onclick = function () { sheetSteps(row.token); };
    box.querySelector("#gsUrl").onchange = function () {
      var v = this.value.trim();
      if (v && !/^https:\/\/docs\.google\.com\//.test(v)) { toast("Это не похоже на ссылку Google Таблицы"); return; }
      state.settings.sheetUrl = v || undefined; changed(true); toast(v ? "Ссылка сохранена" : "Ссылка убрана");
    };
    box.querySelector("#gsPush").onclick = function () { scheduleSheetPush(true); toast("Отправила — в таблице нажми «Easy Budget → Обновить сейчас»"); setTimeout(drawSheetBox, 1500); };
    box.querySelector("#gsNew").onclick = function () {
      if (!confirm("Выпустить новый ключ? Старый перестанет работать — в таблице нужно будет вставить новый.")) return;
      Store.sheetConnect(sheetModel()).then(function (token) { sheetLink = { token: token, updated_at: new Date().toISOString() }; drawSheetBox(); sheetSteps(token); });
    };
    box.querySelector("#gsOff").onclick = function () {
      if (!confirm("Отключить Google Таблицу? Ключ перестанет работать, таблица больше не будет обновляться (листы в ней останутся).")) return;
      Store.sheetDisconnect().then(function () { sheetLink = null; drawSheetBox(); toast("Отключено"); });
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
