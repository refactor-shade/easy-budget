/* Easy Budget — небольшие SVG-графики без библиотек. Подсказки — через data-tip (см. app.js). */
(function (root) {
  "use strict";
  var W = 720, PAD = { l: 52, r: 12, t: 12, b: 26 };

  // атрибуты здесь в одинарных кавычках (data-tip='…'), поэтому экранируем и «'» — иначе имя вроде «D'Arcy» ломает разметку
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function short(v) {
    var a = Math.abs(v);
    if (a >= 1000) return (v / 1000).toFixed(a >= 10000 ? 0 : 1).replace(".", ",") + "k";
    return String(Math.round(v));
  }
  function grid(min, max, h) {
    var out = "<g class='grid'>", ticks = 4;
    for (var i = 0; i <= ticks; i++) {
      var v = min + (max - min) * i / ticks, y = PAD.t + (h - PAD.t - PAD.b) * (1 - i / ticks);
      out += "<line x1='" + PAD.l + "' x2='" + (W - PAD.r) + "' y1='" + y + "' y2='" + y + "'/>" +
        "<text x='" + (PAD.l - 8) + "' y='" + (y + 4) + "' text-anchor='end'>" + short(v) + "</text>";
    }
    return out + "</g>";
  }
  function legend(series, hasPlan) {
    if (series.length < 2 && !hasPlan) return "";
    return "<div class='legend'>" + (series.length < 2 ? "" : series.map(function (s) {
      return "<span><i style='background:" + s.color + "'></i>" + esc(s.name) + "</span>";
    }).join("")) + (hasPlan ? "<span class='lg-plan'><i class='hatch'></i>заштриховано — план</span>" : "") + "</div>";
  }
  // штриховка для будущих (плановых) столбиков: план отличается от факта не только цветом
  var HATCH = "<defs><pattern id='ebHatch' width='6' height='6' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><rect width='2.2' height='6' fill='var(--surface)' fill-opacity='.85'/></pattern></defs>";
  var ST_TXT = { plan: " (план)", mixed: " (факт + план)" };
  // столбик со скруглённым верхом, основанием на оси
  function barPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    if (h <= 0) return "";
    return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) +
      "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
  }

  // Столбики: grouped или stacked. values — в евро (не центы).
  function bars(o) {
    var h = o.height || 240, n = o.labels.length, series = o.series, fmt = o.fmt || short;
    var max = 0;
    for (var i = 0; i < n; i++) {
      if (o.stacked) max = Math.max(max, series.reduce(function (a, s) { return a + Math.max(0, s.values[i] || 0); }, 0));
      else series.forEach(function (s) { max = Math.max(max, s.values[i] || 0); });
    }
    if (max <= 0) return "<p class='empty'>Пока нет данных — график появится, когда в плане будут суммы.</p>";
    max = niceMax(max);
    var plotH = h - PAD.t - PAD.b, step = (W - PAD.l - PAD.r) / n;
    // o.status[i]: "fact" | "mixed" (идёт сейчас) | "plan" (впереди)
    var st = o.status || [], hasPlan = st.some(function (x) { return x === "plan" || x === "mixed"; });
    var firstPlan = st.indexOf("plan"), aria = (o.title || "") + (firstPlan >= 0 ? ". План: " + o.labels[firstPlan] + (firstPlan < n - 1 ? "–" + o.labels[n - 1] : "") : "");
    var svg = "<svg class='chart' viewBox='0 0 " + W + " " + h + "' role='img' aria-label='" + esc(aria) + "'>" + (hasPlan ? HATCH : "") + grid(0, max, h);
    for (i = 0; i < n; i++) {
      var x0 = PAD.l + step * i, tip = o.labels[i] + (ST_TXT[st[i]] || ""), isPlan = st[i] === "plan" || st[i] === "mixed";
      var op = st[i] === "plan" ? " fill-opacity='.45'" : "", hatch = function (d) { return isPlan ? "<path d='" + d + "' fill='url(#ebHatch)'/>" : ""; };
      series.forEach(function (s) { tip += "\n" + s.name + ": " + fmt(s.values[i] || 0); });
      if (o.stacked) {
        var bw = Math.min(28, step * 0.56), bx = x0 + (step - bw) / 2, yTop = PAD.t + plotH;
        series.forEach(function (s, si) {
          var v = Math.max(0, s.values[i] || 0), sh = v / max * plotH;
          if (sh <= 0) return;
          yTop -= sh;
          var gap = si > 0 ? 2 : 0, isTop = series.slice(si + 1).every(function (t) { return !(t.values[i] > 0); });
          var bd = isTop ? barPath(bx, yTop, bw, sh - gap, 4) : "M" + bx + "," + yTop + "h" + bw + "v" + Math.max(0, sh - gap) + "h" + (-bw) + "Z";
          svg += "<path d='" + bd + "' fill='" + s.color + "'" + op + "/>" + hatch(bd);
        });
      } else {
        var gw = Math.min(40, step * 0.7), each = (gw - 2 * (series.length - 1)) / series.length;
        series.forEach(function (s, si) {
          var v = Math.max(0, s.values[i] || 0), sh = v / max * plotH;
          var bd = barPath(x0 + (step - gw) / 2 + si * (each + 2), PAD.t + plotH - sh, each, sh, 3);
          svg += "<path d='" + bd + "' fill='" + s.color + "'" + op + "/>" + hatch(bd);
        });
      }
      svg += "<text x='" + (x0 + step / 2) + "' y='" + (h - 8) + "' text-anchor='middle'>" + esc(o.short ? o.short[i] : o.labels[i]) + "</text>";
      svg += "<rect class='hit' x='" + x0 + "' y='" + PAD.t + "' width='" + step + "' height='" + plotH + "' data-tip='" + esc(tip) + "'/>";
    }
    svg += "<line class='axis' x1='" + PAD.l + "' x2='" + (W - PAD.r) + "' y1='" + (PAD.t + plotH) + "' y2='" + (PAD.t + plotH) + "' stroke='var(--line-strong)'/>";
    return legend(series, hasPlan) + svg + "</svg>";
  }

  // Линия (одна серия), с перекрестьем при наведении. Пропуски — null.
  function line(o) {
    var h = o.height || 220, vals = o.values, n = vals.length, fmt = o.fmt || short;
    var real = vals.filter(function (v) { return v !== null && v !== undefined; });
    if (!real.length || real.every(function (v) { return !v; })) return "<p class='empty'>Пока нет данных — график появится, когда в плане будут суммы.</p>";
    var lo = Math.min.apply(null, real), hi = Math.max.apply(null, real);
    var min = lo >= 0 && lo / (hi || 1) < 0.4 ? 0 : Math.floor(lo * 0.9 / 1000) * 1000;
    var max = niceMax(hi - min) + min;
    var plotH = h - PAD.t - PAD.b, step = (W - PAD.l - PAD.r) / Math.max(1, n - 1);
    var X = function (i) { return PAD.l + step * i; }, Y = function (v) { return PAD.t + plotH * (1 - (v - min) / (max - min)); };
    var svg = "<svg class='chart' viewBox='0 0 " + W + " " + h + "' role='img' aria-label='" + esc((o.title || "") + (o.planFrom !== undefined && o.planFrom !== null && o.planFrom < n ? ". Пунктир — план, с точки «" + o.labels[o.planFrom] + "»" : "")) + "'>" + grid(min, max, h);
    // o.planFrom: с этой точки — план, линия пунктиром (как на Главной)
    var pf = o.planFrom === undefined || o.planFrom === null ? n : o.planFrom, d = "", dp = "", pen = false, penP = false;
    vals.forEach(function (v, i) {
      if (v === null || v === undefined) { pen = false; penP = false; return; }
      var pt = X(i).toFixed(1) + "," + Y(v).toFixed(1);
      if (i <= pf) { d += (pen ? "L" : "M") + pt; pen = true; }
      if (i >= pf) { dp += (penP ? "L" : "M") + pt; penP = true; }
    });
    svg += "<path d='" + d + "' fill='none' stroke='" + (o.color || "var(--series-1)") + "' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'/>";
    if (dp) svg += "<path d='" + dp + "' fill='none' stroke='" + (o.color || "var(--series-1)") + "' stroke-width='2' stroke-dasharray='5 4' stroke-linecap='round'/>";
    (o.marks || []).forEach(function (m) {
      svg += "<line x1='" + X(m.i) + "' x2='" + X(m.i) + "' y1='" + PAD.t + "' y2='" + (PAD.t + plotH) + "' stroke='var(--line-strong)' stroke-dasharray='3 3'/>" +
        "<text x='" + (X(m.i) + 4) + "' y='" + (PAD.t + 10) + "'>" + esc(m.label) + "</text>";
    });
    vals.forEach(function (v, i) {
      if (o.tickEvery && i % o.tickEvery === 0) svg += "<text x='" + X(i) + "' y='" + (h - 8) + "' text-anchor='middle'>" + esc(o.short ? o.short[i] : o.labels[i]) + "</text>";
      if (v === null || v === undefined) return;
      var hx = X(i) - step / 2;
      svg += "<rect class='hit' x='" + hx + "' y='" + PAD.t + "' width='" + step + "' height='" + plotH + "' data-tip='" + esc(o.labels[i] + "\n" + fmt(v)) + "'/>" +
        "<g class='hl' style='opacity:0'><line x1='" + X(i) + "' x2='" + X(i) + "' y1='" + PAD.t + "' y2='" + (PAD.t + plotH) + "' stroke='var(--line-strong)'/>" +
        "<circle cx='" + X(i) + "' cy='" + Y(v) + "' r='4.5' fill='" + (o.color || "var(--series-1)") + "' stroke='var(--surface)' stroke-width='2'/></g>";
    });
    return (pf < n ? "<div class='legend'><span class='lg-plan'><i class='dash'></i>пунктир — план</span></div>" : "") + svg + "</svg>";
  }

  root.BudgetCharts = { bars: bars, line: line };
})(window);
