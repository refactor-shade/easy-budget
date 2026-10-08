/* Easy Budget — запуск: роутер, вход, первый запуск. Остальное — в ui/*.js (общие переменные — в ui/core.js). */
"use strict";
// ---------- роутер ----------
function render() {
  var route = (location.hash || "#home").slice(1);
  if (!routes[route]) route = "home";
  document.body.classList.remove("auth");
  $main.classList.toggle("wide", route === "year");
  document.querySelectorAll("#nav a").forEach(function (a) { a.classList.toggle("active", a.dataset.route === route); });
  var tl = document.getElementById("navToLog");
  if (tl) { var n = myState && !RO() ? toLogCount() : 0; tl.querySelector(".cnt").textContent = n ? String(n) : ""; }
  var extra = document.querySelector("#nav a.x[data-route='" + route + "']");
  document.getElementById("navMore").classList.toggle("active", !!extra);
  profileBar();
  try {
    if (RO() && route !== "shared" && route !== "help" && route !== "tolog") {
      if (view.level === "totals" && view.summary) return partnerTotals();
      if (!state) { $main.innerHTML = "<div class='card'><h2>" + esc(view.name) + " закрыла доступ к своему бюджету</h2><p class='muted'>Она может открыть его в своих настройках.</p></div>"; return; }
      if (/^(recon|recurring|settings)$/.test(route)) {
        $main.innerHTML = "<div class='card'><h2>Это раздел для своего бюджета</h2><p class='muted'>Сейчас открыт чужой бюджет (" + esc(view.name) + ") — только просмотр.</p><button class='btn primary' id='backMe'>Вернуться к своему</button></div>";
        $main.querySelector("#backMe").onclick = function () { switchTo("me"); };
        return;
      }
    }
    routes[route]();
  }
  catch (err) { console.error(err); $main.innerHTML = "<div class='alert'>Этот экран не открылся: " + esc(err.message) + ". Обнови страницу — данные не пропали.</div>"; }
}
window.addEventListener("hashchange", function () { closeModal(); if (myState) render(); window.scrollTo(0, 0); });

// ---------- вход и первый запуск ----------
function showLogin(msg, mode) {
  mode = mode || "in";
  document.body.classList.add("auth");
  var titles = { "in": "Вход", up: "Регистрация", reset: "Новый пароль", forgot: "Забыла пароль" };
  var html = "<div class='login card'><div class='brand'><span class='brand-mark'>€</span><span class='brand-name'>Easy Budget</span></div><h1>" + titles[mode] + "</h1>" +
    (msg ? "<div class='" + (/^✓/.test(msg) ? "ok-box" : "alert") + " small'>" + esc(msg) + "</div>" : "");
  if (mode === "reset") {
    html += "<form id='lf' class='form-grid' style='margin-top:12px'><label class='f' style='grid-column:1/-1'>Новый пароль (от 8 символов)<input type='password' name='pw' autocomplete='new-password' minlength='8' required autofocus></label>" +
      "<button class='btn primary' type='submit'>Сохранить пароль</button></form>";
  } else {
    html += (mode === "up" ? "<p class='muted'>После регистрации придёт письмо — подтверди адрес один раз, потом входи с паролем на любом устройстве.</p>" : "") +
      (mode === "forgot" ? "<p class='muted'>Пришлю письмо со ссылкой для нового пароля.</p>" : "") +
      "<form id='lf' class='form-grid' style='margin-top:12px'><label class='f' style='grid-column:1/-1'>Email<input type='email' name='email' autocomplete='email' required autofocus></label>" +
      (mode !== "forgot" ? "<label class='f' style='grid-column:1/-1'>Пароль" + (mode === "up" ? " (от 8 символов)" : "") + "<input type='password' name='pw' autocomplete='" + (mode === "up" ? "new-password" : "current-password") + "' minlength='" + (mode === "up" ? 8 : 6) + "' required></label>" : "") +
      "<button class='btn primary' type='submit'>" + (mode === "in" ? "Войти" : mode === "up" ? "Зарегистрироваться" : "Отправить письмо") + "</button></form>" +
      "<div class='row small' style='margin-top:14px'>" +
      (mode === "in" ? "<button class='btn ghost sm' data-m='up'>Впервые здесь? Регистрация</button><span class='spacer'></span><button class='btn ghost sm' data-m='forgot'>Забыла пароль</button>"
        : "<button class='btn ghost sm' data-m='in'>‹ Ко входу</button>") + "</div>";
  }
  $main.innerHTML = html + "</div>";
  $main.querySelectorAll("[data-m]").forEach(function (b2) { b2.onclick = function () { showLogin("", b2.dataset.m); }; });
  var f = $main.querySelector("#lf");
  f.onsubmit = function (e) {
    e.preventDefault();
    var btn = f.querySelector("button[type=submit]"), label = btn.textContent;
    btn.disabled = true; btn.textContent = "Секунду…";
    var email = f.email ? f.email.value.trim().toLowerCase() : "", pw = f.pw ? f.pw.value : "";
    var fail = function (err) {
      btn.disabled = false; btn.textContent = label;
      var m = err && err.message || String(err);
      if (/invalid login/i.test(m)) m = "Неверный email или пароль";
      else if (/not confirmed/i.test(m)) m = "Email ещё не подтверждён — найди письмо от Supabase и нажми ссылку";
      else if (/already registered/i.test(m)) m = "Такой email уже зарегистрирован — войди или восстанови пароль";
      else if (/rate limit/i.test(m)) m = "Слишком много писем за час — попробуй позже";
      toast(m);
    };
    if (mode === "in") Store.signIn(email, pw).then(start).catch(fail);
    else if (mode === "up") Store.signUp(email, pw).then(function (r) {
      if (r.needsConfirm) showLogin("✓ Письмо отправлено на " + email + ". Подтверди адрес и возвращайся ко входу.", "in");
      else start();
    }).catch(fail);
    else if (mode === "forgot") Store.resetPassword(email).then(function () { showLogin("✓ Письмо со ссылкой отправлено на " + email + ".", "in"); }).catch(fail);
    else if (mode === "reset") Store.updatePassword(pw).then(function () { toast("Пароль обновлён"); location.hash = "#home"; start(); }).catch(fail);
  };
}

// Партнёр заранее загрузил мою таблицу — предложить начать с неё
function showPending(p) {
  document.body.classList.add("auth");
  var d = p.data, ys = Object.keys(d.years || {}).sort();
  $main.innerHTML = "<div class='login card' style='max-width:560px'><div class='brand'><span class='brand-mark'>€</span><span class='brand-name'>Easy Budget</span></div>" +
    "<h1>Твой бюджет уже здесь</h1><p class='muted'>Таблицу загрузили заранее: " + (ys.length ? "годы " + ys.join(", ") + ", " : "") + d.categories.filter(function (c) { return !c.archived; }).length + " категорий, " +
    d.accounts.length + " счетов. Проверь цифры на «Главной» — если что-то не так, таблицу можно загрузить заново в «Настройках».</p>" +
    "<form id='pnF' class='form-grid' style='margin-top:12px'><label class='f' style='grid-column:1/-1'>Как тебя зовут<input name='name' value='" + esc((Store.user() || {}).name || "") + "' required></label>" +
    "<button class='btn primary' type='submit'>Начать с этим бюджетом</button></form>" +
    "<div class='row small' style='margin-top:12px'><button class='btn ghost sm' id='pnOther'>Начать по-другому</button></div></div>";
  $main.querySelector("#pnF").onsubmit = function (e) {
    e.preventDefault();
    var n = e.target.name.value.trim(); if (!n) return;
    if (n !== (Store.user() || {}).name) Store.updateProfileName(n).catch(function () {});
    myState = state = migrate(JSON.parse(JSON.stringify(d)));
    boot(); save();
    Store.deletePending().catch(function () {});
    toast("Бюджет на месте");
  };
  $main.querySelector("#pnOther").onclick = showOnboarding;
}
// Загрузить таблицу партнёра заранее: она заберёт её при первом входе
function preparePartnerBudget(email, name, file) {
  (function () {
    if (!file) return;
    toast("Читаю таблицу…");
    file.arrayBuffer().then(function (buf) {
      var res;
      try { res = window.BudgetImporter.importArrayBuffer(buf); } catch (err) { toast("Не получилось прочитать: " + err.message); return; }
      var st = res.state, ys = Object.keys(st.years).sort();
      modal("<div class='m-body'><h2>Бюджет партнёра: " + esc(name) + "</h2><p class='muted'>Нашла: годы " + ys.join(", ") + "; категорий " + st.categories.filter(function (c) { return !c.archived; }).length + "; счетов " + st.accounts.length + "; курс " + String(st.settings.rate).replace(".", ",") + " ₽/€.</p>" +
        (res.warnings.length ? "<div class='hint small'>" + res.warnings.map(esc).join("<br>") + "</div>" : "") +
        "<p class='small muted'>Когда " + esc(name) + " войдёт с <b>" + esc(email) + "</b>, приложение предложит начать с этим бюджетом. До этого его видишь только ты.</p></div>" +
        "<div class='m-foot'><button class='btn ghost' data-act='cancel'>Отмена</button><button class='btn primary' data-act='ok'>Сохранить бюджет</button></div>", function (m) {
        m.querySelector("[data-act=cancel]").onclick = closeModal;
        m.querySelector("[data-act=ok]").onclick = function () {
          st.settings.myName = name; st.settings.tourDone = false;
          Store.savePendingFor(email, st).then(function () { closeModal(); toast("Готово: " + name + " увидит бюджет при первом входе"); render(); })
            .catch(function (err) { toast(/pending_budgets|relation|schema/i.test(err.message) ? "Сначала добавь таблицу в базу: SQL из файла supabase/pending_budget.sql" : "Не сохранилось: " + err.message); });
        };
      });
    });
  })();
}

function showOnboarding() {
  document.body.classList.add("auth");
  var u = Store.user() || {};
  $main.innerHTML = "<div class='login card' style='max-width:620px'><h1>Добро пожаловать</h1><p class='muted'>Бюджета пока нет. С чего начнём?</p>" +
    "<form id='obName' class='form-grid'><label class='f' style='grid-column:1/-1'>Как тебя зовут<input name='name' value='" + esc(u.name || "") + "' required placeholder='Рита'></label></form>" +
    "<div class='grid2' style='margin-top:12px'><label class='card' style='cursor:pointer'><b>Импорт таблицы</b><p class='small muted'>Excel или Google Sheets (Файл → Скачать → .xlsx). Подходят листы «Мой_ГГГГ» и «ГГГГ_€ REAL».</p>" +
    "<span class='btn primary'>Выбрать .xlsx</span><input type='file' id='obX' accept='.xlsx' hidden></label>" +
    "<div class='card'><b>С чистого листа</b><p class='small muted'>Пустой год с базовыми категориями — настроишь под себя.</p><button class='btn' id='obBlank'>Начать</button>" +
    "<label class='btn ghost' style='margin-top:6px'>Из бэкапа (JSON)<input type='file' id='obJ' accept='.json' hidden></label></div></div></div>";
  function withName() {
    var n = $main.querySelector("#obName").name.value.trim();
    if (!n) { toast("Напиши имя"); $main.querySelector("#obName").name.focus(); return false; }
    if (Store.mode === "cloud" && n !== u.name) Store.updateProfileName(n).catch(function () {});
    return true;
  }
  $main.querySelector("#obBlank").onclick = function () { if (withName()) { myState = state = migrate(blank()); boot(); save(); } };
  $main.querySelector("#obX").onchange = function (e) {
    if (!withName()) return;
    var file = e.target.files[0]; if (!file) return;
    file.arrayBuffer().then(function (buf) {
      try { var res = window.BudgetImporter.importArrayBuffer(buf); myState = state = migrate(res.state); boot(); save(); toast("Таблица импортирована: " + Object.keys(res.state.years).join(", ")); }
      catch (err) { toast("Не получилось: " + err.message); }
    });
  };
  $main.querySelector("#obJ").onchange = function (e) {
    if (!withName()) return;
    e.target.files[0].text().then(function (t) {
      try { var d = JSON.parse(t); if (!d.years) throw new Error("не похоже на бэкап"); myState = state = migrate(d); boot(); save(); } catch (err) { toast("Не получилось: " + err.message); }
    });
  };
}

function boot() {
  state = myState; view = { who: "me", level: "full", name: "", summary: null }; resetUndoBase();
  var d = defaultYearWeek(); ui.year = d.year; ui.week = d.week;
  render();
}

function start() {
  $main.innerHTML = "<p class='loading'>Загружаю…</p>";
  return Promise.all([
    Store.loadMyBudget(),
    loadShared().catch(function (e) { console.warn(e); }),
    loadPeople(),
  ]).then(function (x) {
    var b = x[0];
    if (!b) {
      if (Store.mode === "local" && window.SEED) return seedLocal();
      return Store.loadPending().then(function (p) { return p ? showPending(p) : showOnboarding(); }, function () { return showOnboarding(); });
    }
    myState = migrate(b.data);
    boot();
    if (b.offline) toast("Нет связи — показываю копию с этого устройства");
    if (b.pendingLocal) save(); // изменения, сделанные без сети, — отправить
    else showOutbox();
    if (b.conflictLocal) {
      Store.saveSnapshot(b.conflictLocal.data, "изменения без сети до конфликта").catch(function () {});
      toast("Пока не было связи, бюджет изменили на другом устройстве. Взяла свежую версию, а твои изменения сохранила в резервных копиях (Настройки)");
    }
  }).catch(function (err) {
    $main.innerHTML = "<div class='alert'>Не удалось загрузить: " + esc(err.message) + "</div>";
  });
}

// Локальный режим разработки: данные из data/seed.js + выгрузка Splitwise
function seedLocal() {
  myState = migrate(fromSeed());
  boot(); save();
  if (sh || !window.SEED_SPLITWISE_CSV) return;
  var set = window.SEED.settings;
  Store.createSpace("Общие траты", set.myName, (set.partnerName || "").split(" ")[0]).then(function (sp) {
    var meP = sp.people[0].id, pP = sp.people[1].id;
    var rows = S.importSplitwise(window.SEED_SPLITWISE_CSV, { myName: set.myName }).expenses.map(function (e) { return SU.toRow(e, meP, pP, sp.space.id); });
    return Store.insertShared(rows);
  }).then(loadShared).then(function () { toast("Данные импортированы из Excel и Splitwise"); render(); });
}

// подсказки графиков
var $tip = document.getElementById("tip");
document.addEventListener("mouseover", function (e) {
  var el = e.target.closest && e.target.closest("[data-tip]");
  if (!el) { $tip.classList.remove("on"); return; }
  $tip.textContent = el.getAttribute("data-tip"); $tip.classList.add("on");
});
document.addEventListener("mousemove", function (e) {
  if (!$tip.classList.contains("on")) return;
  var x = e.clientX + 14, y = e.clientY + 14, w = $tip.offsetWidth, h = $tip.offsetHeight;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
  if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
  $tip.style.left = x + "px"; $tip.style.top = y + "px";
});

Store.init().then(function (r) {
  if (!r.user) return showLogin();
  return start();
}).catch(function (err) { showLogin("Ошибка подключения: " + err.message); });
if (Store.onAuthChange) Store.onAuthChange(function (ev) {
  if (ev === "PASSWORD_RECOVERY") { setTimeout(function () { showLogin("", "reset"); }, 0); return; }
  if (ev === "SIGNED_IN" && !myState && document.body.classList.contains("auth") && !$main.querySelector("#obName") && !$main.querySelector("#lf input[name=pw][autocomplete=new-password]")) setTimeout(start, 0);
});
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});
