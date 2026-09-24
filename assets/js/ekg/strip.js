/**
 * 節律條：把 <figure class="ekg-strip" data-rhythm="mobitz1"> 畫成心電圖方格紙上的 SVG。
 *
 * data-rhythm   節律 id（見 rhythms.js）
 * data-lead     導程，預設 II；可以寫 "V1 V6" 一次畫兩條
 * data-seconds  顯示秒數，預設 6
 * data-annotate 標註，空白分隔：pr（標 PR 格數）、drop（標未下傳的 P）、p（標出每個 P 波）、label（拍子名稱）
 *
 * 標準走紙速度 25 mm/s、10 mm/mV：1 小格 = 1 mm = 40 ms = 0.1 mV。
 */
import { getRhythm, sample } from "./rhythms.js";

var MM = 4;           // 每 mm 幾個 SVG 單位
var MS_PER_MM = 40;
var NS = "http://www.w3.org/2000/svg";

function node(tag, attrs, text) {
  var n = document.createElementNS(NS, tag);
  if (tag === "text" && /ekg-mark-text/.test(attrs.class || "")) n.setAttribute("text-anchor", "middle");
  for (var k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

function drawLead(r, lead, seconds, annotate) {
  var dur = seconds * 1000;
  var widthMm = dur / MS_PER_MM;
  var step = 4; // ms
  var pts = [], min = 0, max = 0;
  for (var t = 0; t <= dur; t += step) {
    var v = sample(r, lead, t);
    pts.push(v);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // 上下各留一點空間，對齊到大格（5 mm）
  var extra = annotate.some(function (a) { return a !== "label"; }) ? 8 : 0;
  var topMm = Math.ceil((max * 10 + 3 + (annotate.indexOf("label") >= 0 ? 3 : 0)) / 5) * 5;
  var botMm = Math.ceil((-min * 10 + 3 + extra) / 5) * 5;
  var heightMm = Math.max(20, topMm + botMm);
  var W = widthMm * MM, H = heightMm * MM, y0 = topMm * MM;

  var svg = node("svg", { viewBox: "0 0 " + W + " " + H, class: "ekg-svg", role: "img" });
  var grid = node("g", { class: "ekg-grid" });
  var d1 = "", d5 = "";
  for (var x = 0; x <= widthMm; x++) (x % 5 ? (d1 += "M" + x * MM + " 0V" + H) : (d5 += "M" + x * MM + " 0V" + H));
  for (var y = 0; y <= heightMm; y++) (y % 5 ? (d1 += "M0 " + y * MM + "H" + W) : (d5 += "M0 " + y * MM + "H" + W));
  grid.appendChild(node("path", { d: d1, class: "ekg-grid-minor" }));
  grid.appendChild(node("path", { d: d5, class: "ekg-grid-major" }));
  svg.appendChild(grid);

  var d = "";
  for (var i = 0; i < pts.length; i++) {
    var px = (i * step / MS_PER_MM) * MM, py = y0 - pts[i] * 10 * MM;
    d += (i ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1);
  }
  svg.appendChild(node("path", { d: d, class: "ekg-trace" }));
  svg.appendChild(node("text", { x: 6, y: 16, class: "ekg-lead" }, lead));

  var X = function (ms) { return ms / MS_PER_MM * MM; };
  var L = r.L;
  // 標註：只看畫面內的拍子（循環播放的節律要把下一輪也算進來）
  var beats = [];
  for (var k = 0; k * L < dur; k++) {
    r.beats.forEach(function (b) { beats.push({ b: b, off: k * L }); });
  }
  var yLow = H - 5 * MM; // 下方標註區：括號在這條線，文字在它下面
  var has = function (k) { return annotate.indexOf(k) >= 0; };
  beats.forEach(function (o) {
    var b = o.b, off = o.off;
    if (has("pr") && b.p && b.qrs && b.qrs.t + off <= dur) {
      var a = b.p.t + off, c = b.qrs.t + off;
      svg.appendChild(node("path", { d: "M" + X(a) + " " + (yLow - 6) + "v6H" + X(c) + "v-6", class: "ekg-mark" }));
      svg.appendChild(node("text", { x: (X(a) + X(c)) / 2, y: yLow + 3.8 * MM, class: "ekg-mark-text" }, (Math.round((c - a) / 40 * 2) / 2) + " 格"));
    }
    if (has("drop") && b.p && !b.qrs && !r.dissociated && X(b.p.t + off + 50) < W) {
      var xp = X(b.p.t + off + 50);
      svg.appendChild(node("text", { x: xp, y: y0 - 6 * MM, class: "ekg-mark-text ekg-mark-alert" }, "沒有 QRS"));
      svg.appendChild(node("path", { d: "M" + xp + " " + (y0 - 5 * MM) + "v" + 3 * MM, class: "ekg-mark ekg-mark-alert" }));
    }
    if (has("p") && b.p && X(b.p.t + off + 50) < W) {
      svg.appendChild(node("text", { x: X(b.p.t + off + 50), y: yLow + 3.8 * MM, class: "ekg-mark-text" }, "P"));
    }
    if (has("label") && b.label && b.qrs && X(b.qrs.t + off + 120) < W - 20) {
      svg.appendChild(node("text", { x: X(b.qrs.t + off + 120), y: 16, class: "ekg-mark-text ekg-mark-label" }, b.label));
    }
  });
  return svg;
}

function render(fig) {
  var r = getRhythm(fig.dataset.rhythm);
  var leads = (fig.dataset.lead || "II").split(/\s+/);
  var seconds = Number(fig.dataset.seconds || 6);
  var annotate = (fig.dataset.annotate || "").split(/\s+/).filter(Boolean);
  var box = document.createElement("div");
  box.className = "ekg-strip-scroll";
  // 每張節律條用同樣的比例尺（6 秒 = 全寬），短的就不要被拉大
  var ratio = Math.min(1, seconds / 6);
  box.style.maxWidth = (ratio * 100).toFixed(1) + "%";
  leads.forEach(function (lead) {
    var svg = drawLead(r, lead, seconds, annotate);
    svg.style.minWidth = Math.round(560 * ratio) + "px";
    box.appendChild(svg);
  });
  var label = fig.getAttribute("aria-label") || (fig.querySelector("figcaption") || {}).textContent || "心電圖節律條";
  box.firstChild.setAttribute("aria-label", label);
  fig.insertBefore(box, fig.firstChild);
}

document.querySelectorAll("figure.ekg-strip[data-rhythm]").forEach(function (fig) {
  try { render(fig); } catch (e) { console.error(e); }
});
