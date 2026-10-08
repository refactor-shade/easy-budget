/* Easy Budget — небольшие SVG-графики без библиотек. Подсказки — через data-tip (см. app.js). */
(function (root) {
  "use strict";
  var W = 720, PAD = { l: 52, r: 12, t: 12, b: 26 };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
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
  function legend(series) {
    if (series.length < 2) return "";
    return "<div class='legend'>" + series.map(function (s) {
      return "<span><i style='background:" + s.color + "'></i>" + esc(s.name) + "</span>";
    }).join("") + "</div>";
  }
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
    var svg = "<svg class='chart' viewBox='0 0 " + W + " " + h + "' role='img' aria-label='" + esc(o.title || "") + "'>" + grid(0, max, h);
    for (i = 0; i < n; i++) {
      var x0 = PAD.l + step * i, tip = o.labels[i];
      series.forEach(function (s) { tip += "\n" + s.name + ": " + fmt(s.values[i] || 0); });
      if (o.stacked) {
        var bw = Math.min(28, step * 0.56), bx = x0 + (step - bw) / 2, yTop = PAD.t + plotH;
        series.forEach(function (s, si) {
          var v = Math.max(0, s.values[i] || 0), sh = v / max * plotH;
          if (sh <= 0) return;
          yTop -= sh;
          var gap = si > 0 ? 2 : 0, isTop = series.slice(si + 1).every(function (t) { return !(t.values[i] > 0); });
          svg += isTop ? "<path d='" + barPath(bx, yTop, bw, sh - gap, 4) + "' fill='" + s.color + "'/>"
            : "<rect x='" + bx + "' y='" + yTop + "' width='" + bw + "' height='" + Math.max(0, sh - gap) + "' fill='" + s.color + "'/>";
        });
      } else {
        var gw = Math.min(40, step * 0.7), each = (gw - 2 * (series.length - 1)) / series.length;
        series.forEach(function (s, si) {
          var v = Math.max(0, s.values[i] || 0), sh = v / max * plotH;
          svg += "<path d='" + barPath(x0 + (step - gw) / 2 + si * (each + 2), PAD.t + plotH - sh, each, sh, 3) + "' fill='" + s.color + "'/>";
        });
      }
      svg += "<text x='" + (x0 + step / 2) + "' y='" + (h - 8) + "' text-anchor='middle'>" + esc(o.short ? o.short[i] : o.labels[i]) + "</text>";
      svg += "<rect class='hit' x='" + x0 + "' y='" + PAD.t + "' width='" + step + "' height='" + plotH + "' data-tip='" + esc(tip) + "'/>";
    }
    svg += "<line class='axis' x1='" + PAD.l + "' x2='" + (W - PAD.r) + "' y1='" + (PAD.t + plotH) + "' y2='" + (PAD.t + plotH) + "' stroke='var(--line-strong)'/>";
    return legend(series) + svg + "</svg>";
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
    var svg = "<svg class='chart' viewBox='0 0 " + W + " " + h + "' role='img' aria-label='" + esc(o.title || "") + "'>" + grid(min, max, h);
    var d = "", pen = false;
    vals.forEach(function (v, i) {
      if (v === null || v === undefined) { pen = false; return; }
      d += (pen ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1); pen = true;
    });
    svg += "<path d='" + d + "' fill='none' stroke='" + (o.color || "var(--series-1)") + "' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'/>";
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
    return svg + "</svg>";
  }

  root.BudgetCharts = { bars: bars, line: line };
})(window);
