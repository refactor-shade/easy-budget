/**
 * Easy Budget → Google Таблица.
 * Таблица сама забирает данные из приложения раз в час (и по кнопке) и рисует листы в виде исходного Excel:
 * «Мой_ГГГГ» с формулами, «Выводы», «Общие траты», «Анализ», «Регулярные траты», «Наличка», архивные годы.
 *
 * Как подключить (один раз):
 * 1. В этой таблице: Расширения → Apps Script. Удали всё в редакторе, вставь этот код, нажми «Сохранить».
 * 2. Вернись в таблицу и обнови страницу — появится меню «Easy Budget».
 * 3. Easy Budget → «Подключить» → вставь ключ из приложения (Настройки → Google Таблица).
 *    Google попросит разрешение: скрипту нужен доступ к этой таблице и к интернету (чтобы забрать данные).
 *    После «Разрешить» нажми «Подключить» ещё раз — Google не продолжает команду сам.
 *
 * Правки в листах Easy Budget перезаписываются при обновлении — вноси их в приложении.
 * Свои листы с другими названиями скрипт не трогает.
 */
var FEED = 'https://skthzznlkrgdmlmqwdnx.supabase.co/functions/v1/sheet-feed';
var PROPS = PropertiesService.getDocumentProperties();

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Easy Budget')
    .addItem('Обновить сейчас', 'refreshNow')
    .addItem('Подключить (вставить ключ)', 'connect')
    .addItem('Проверить подключение', 'check')
    .addSeparator()
    .addItem('Отключить автообновление', 'disconnect')
    .addToUi();
}

function connect() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Easy Budget', 'Вставь ключ из приложения (Настройки → Google Таблица):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var token = String(res.getResponseText() || '').trim();
  if (!/^[a-f0-9]{48,128}$/.test(token)) { ui.alert('Похоже, ключ скопирован не целиком. Скопируй его в приложении ещё раз.'); return; }
  PROPS.setProperty('TOKEN', token);
  PROPS.deleteProperty('LAST');
  installTrigger_();
  if (refresh_(true)) ui.alert('Готово! Листы нарисованы. Дальше таблица обновляется сама раз в час, сразу — Easy Budget → «Обновить сейчас».');
}

function check() {
  var ui = SpreadsheetApp.getUi(), token = PROPS.getProperty('TOKEN');
  if (!token) { ui.alert('Ключ не вставлен. Easy Budget → «Подключить».'); return; }
  var resp = UrlFetchApp.fetch(FEED + '?token=' + token, { muteHttpExceptions: true }), code = resp.getResponseCode(), msg = '';
  try { var d = JSON.parse(resp.getContentText()); msg = d.error || ('листов: ' + d.model.sheets.length + ', данные от ' + String(d.model.generatedAt).slice(0, 16).replace('T', ' ')); } catch (e) { msg = 'непонятный ответ'; }
  var trig = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'refreshAuto'; }).length;
  ui.alert('Easy Budget', 'Ответ сервера: ' + code + ' — ' + msg + '\nАвтообновление раз в час: ' + (trig ? 'включено' : 'выключено') + '\nПоследнее обновление: ' + (PROPS.getProperty('LAST') || 'ещё не было'), ui.ButtonSet.OK);
}

function disconnect() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'refreshAuto') ScriptApp.deleteTrigger(t); });
  PROPS.deleteProperty('TOKEN');
  SpreadsheetApp.getUi().alert('Автообновление выключено. Листы остаются как есть.');
}

function installTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'refreshAuto') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshAuto').timeBased().everyHours(1).create();
}

function refreshNow() { if (!PROPS.getProperty('TOKEN')) return connect(); refresh_(true); }
function refreshAuto() { refresh_(false); }

function refresh_(force) {
  try { return refreshInner_(force); }
  catch (e) { if (force) SpreadsheetApp.getUi().alert('Не получилось обновить: ' + (e && e.message ? e.message : e)); else console.error(e); return false; }
}
function refreshInner_(force) {
  var token = PROPS.getProperty('TOKEN');
  if (!token) { if (force) SpreadsheetApp.getUi().alert('Сначала подключи таблицу: Easy Budget → «Подключить».'); return false; }
  var last = PROPS.getProperty('LAST') || '';
  var url = FEED + '?token=' + token + (force || !last ? '' : '&since=' + encodeURIComponent(last));
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var data = {};
  try { data = JSON.parse(resp.getContentText()); } catch (e) { data = { error: 'Сервер ответил непонятно (' + resp.getResponseCode() + ')' }; }
  if (data.unchanged) return true;
  if (data.error || !data.model) { if (force) SpreadsheetApp.getUi().alert('Не получилось обновить: ' + (data.error || resp.getResponseCode())); return false; }
  var ss = SpreadsheetApp.getActive(), model = data.model;
  model.sheets.forEach(function (s, i) { draw_(ss, s, i); });
  SpreadsheetApp.flush();
  PROPS.setProperty('LAST', model.generatedAt);
  ss.toast('Обновлено из Easy Budget', 'Easy Budget', 4);
  return true;
}

// ---------- отрисовка одного листа ----------
function draw_(ss, s, index) {
  var sh = ss.getSheetByName(s.name);
  if (!sh) sh = ss.insertSheet(s.name, index);
  var H = Math.max(1, s.rows.length), W = Math.max(1, s.width);
  // размер и очистка
  if (sh.getMaxRows() < H) sh.insertRowsAfter(sh.getMaxRows(), H - sh.getMaxRows());
  if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());
  sh.setFrozenRows(0); sh.setFrozenColumns(0);
  var all = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns());
  all.breakApart(); all.clear(); all.clearNote();
  var rng = sh.getRange(1, 1, H, W);

  // значения: формулы потом, построчно смежными кусками (setFormulas всегда в синтаксисе en-US)
  var values = [], formulas = [];
  for (var r = 0; r < H; r++) {
    var row = s.rows[r], vr = [];
    for (var c = 0; c < W; c++) {
      var v = row[c];
      if (v === null || v === undefined || typeof v === 'object') v = '';
      if (typeof v === 'string' && v.charAt(0) === '=') { formulas.push([r, c, v]); vr.push(''); } else vr.push(v);
    }
    values.push(vr);
  }
  rng.setValues(values);
  writeFormulas_(sh, formulas);

  // оформление: собираем матрицы и ставим одним вызовом
  var bg = mat_(H, W, null), color = mat_(H, W, null), weight = mat_(H, W, 'normal'), style = mat_(H, W, 'normal'), nf = mat_(H, W, 'General'), wrap = mat_(H, W, false);
  var borders = [], aligns = [];
  (s.styles || []).forEach(function (st) {
    if (st.borderLeft) { borders.push(st); return; }
    if (st.align) aligns.push(st);
    for (var i = st.r - 1; i < Math.min(H, st.r - 1 + st.h); i++) for (var j = st.c - 1; j < Math.min(W, st.c - 1 + st.w); j++) {
      if (st.bg && !(st.keepBg && bg[i][j])) bg[i][j] = st.bg;
      if (st.color) color[i][j] = st.color;
      if (st.bold) weight[i][j] = 'bold';
      if (st.italic) style[i][j] = 'italic';
      if (st.nf) nf[i][j] = st.nf;
      if (st.wrap) wrap[i][j] = true;
    }
  });
  rng.setBackgrounds(bg).setFontColors(color).setFontWeights(weight).setFontStyles(style).setNumberFormats(nf).setWraps(wrap);
  aligns.forEach(function (a) { sh.getRange(a.r, a.c, Math.min(a.h, H - a.r + 1), Math.min(a.w, W - a.c + 1)).setHorizontalAlignment(a.align); });
  borders.forEach(function (b) { sh.getRange(b.r, b.c, Math.min(b.h, H), 1).setBorder(null, true, null, null, null, null, '#b9b7ae', SpreadsheetApp.BorderStyle.SOLID); });
  (s.merges || []).forEach(function (m) { sh.getRange(m[0], m[1], m[2], m[3]).merge(); });
  (s.notes || []).forEach(function (n) { if (n[0] <= H && n[1] <= W) sh.getRange(n[0], n[1]).setNote(String(n[2])); });
  Object.keys(s.widths || {}).forEach(function (k) { sh.setColumnWidth(Number(k), s.widths[k]); });
  if (s.frozen) { if (s.frozen.rows) sh.setFrozenRows(s.frozen.rows); if (s.frozen.cols) sh.setFrozenColumns(s.frozen.cols); }
  // лишние строки/столбцы после данных — убрать, чтобы лист не рос
  if (sh.getMaxRows() > H + 20) sh.deleteRows(H + 21, sh.getMaxRows() - H - 20);
  if (sh.getMaxColumns() > W + 2) sh.deleteColumns(W + 3, sh.getMaxColumns() - W - 2);
}

function writeFormulas_(sh, list) {
  // группы: одна строка, подряд идущие столбцы
  var i = 0;
  while (i < list.length) {
    var r = list[i][0], c0 = list[i][1], seg = [list[i][2]], j = i + 1;
    while (j < list.length && list[j][0] === r && list[j][1] === c0 + seg.length) { seg.push(list[j][2]); j++; }
    sh.getRange(r + 1, c0 + 1, 1, seg.length).setFormulas([seg]);
    i = j;
  }
}

function mat_(h, w, v) { var m = []; for (var i = 0; i < h; i++) { var r = []; for (var j = 0; j < w; j++) r.push(v); m.push(r); } return m; }
