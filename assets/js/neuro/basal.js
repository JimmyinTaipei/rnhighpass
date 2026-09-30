/**
 * 神經解剖學：基底核的直接／間接路徑（瀏覽器與 build 共用）。
 *
 *   bgActivity(BG, knock)  → 每個節點的活性（受損節點 = 0），依 basal.json 的權重由上往下算
 *   bgCompare(BG, knock)   → 和正常比較：每個節點 ↑ ↓ 或不變，以及視丘輸出的結論（運動減少／過多）
 *   bgKnock(model, zones)  → 病灶切到哪些核 → 哪些迴路節點失去功能
 *   circuitSVG(BG, opts)   → 迴路圖：實線箭頭＝興奮、虛線平頭＝抑制，線的粗細＝來源節點的活性
 */
import { inZone, samples } from "./visual.js";

var EPS = 0.1;

export function bgActivity(BG, knock) {
  var C = BG.circuit, a = {}, off = {};
  (knock || []).forEach(function (k) { off[k] = 1; });
  C.order.forEach(function (id) {
    var n = C.nodes.filter(function (x) { return x.id === id; })[0];
    if (off[id]) { a[id] = 0; return; }
    var v = n.base;
    C.edges.forEach(function (e) { if (e.to === id && e.w && a[e.from] != null) v += e.w * a[e.from]; });
    a[id] = Math.max(0, v);
  });
  return a;
}

export function bgCompare(BG, knock) {
  var n0 = bgActivity(BG, []), n1 = bgActivity(BG, knock), dir = {};
  Object.keys(n1).forEach(function (id) {
    var d = n1[id] - n0[id];
    dir[id] = (knock || []).indexOf(id) >= 0 ? "x" : d > EPS ? "up" : d < -EPS ? "down" : "same";
  });
  var th = dir.th;
  return {
    normal: n0, act: n1, dir: dir,
    motor: th === "down" ? "hypo" : th === "up" ? "hyper" : "normal",
    motorZh: th === "down" ? "視丘 VA、VL 被抑制得更多 → 運動皮質興奮減少 → 運動減少（hypokinetic）" : th === "up" ? "視丘 VA、VL 被抑制得較少 → 運動皮質興奮增加 → 不自主運動過多（hyperkinetic）" : "直接與間接路徑平衡"
  };
}

/** 病灶切到的核 → 失去功能的迴路節點（紋狀體受損算在 D2：Huntington 病早期先死間接路徑的神經元）。 */
export function bgKnock(model, zones) {
  var BG = model.data.basal, S = model.data.structures.structures, out = [];
  if (!BG) return out;
  var bz = zones.filter(function (z) { return z.brain; }).map(function (z) { return z.brain; });
  BG.circuit.nodes.forEach(function (n) {
    var hit = n.structs.some(function (id) {
      var s = S[id];
      if (!s) return false;
      return ["R", "L"].some(function (side) {
        var pts = s.ell ? model.ellSamples(id, side) : s.nuc ? model.nucPath(id, side) : null;
        return pts && bz.some(function (zb) { return samples(pts).some(function (p) { return inZone(zb, p); }); });
      });
    });
    // 視丘 VA、VL 受損不是基底核疾病，不算
    if (hit && n.id !== "th") out.push(n.id);
  });
  return out;
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

var COL = { exc: "#2f9e44", inh: "#d6336c", da: "#b8336a" };
var W = 24, H = 13;

/**
 * @param opts { knock: [節點], cond: basal.json conditions 的 id, path: "direct" | "indirect" | "nigro", label, compact }
 */
export function circuitSVG(BG, opts) {
  opts = opts || {};
  var C = BG.circuit;
  var cond = opts.cond ? C.conditions.filter(function (c) { return c.id === opts.cond; })[0] : null;
  var knock = opts.knock || (cond ? cond.knock : []);
  var cmp = bgCompare(BG, knock);
  var N = {};
  C.nodes.forEach(function (n) { N[n.id] = n; });
  var id = "bg" + Math.random().toString(36).slice(2, 7);
  var s = '<svg class="nx-bg" viewBox="0 0 100 100" role="img" aria-label="' + esc(opts.label || "基底核迴路") + '">' +
    '<defs><marker id="' + id + 'e" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="' + COL.exc + '"/></marker>' +
    '<marker id="' + id + 'i" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="3.4" markerHeight="3.4" orient="auto"><path d="M4 0h2v10h-2z" fill="' + COL.inh + '"/></marker>' +
    '<marker id="' + id + 'd" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0 0L10 5L0 10z" fill="' + COL.da + '"/></marker>' +
    '<pattern id="' + id + 'x" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v3" stroke="#c92a2a" stroke-width="0.8"/></pattern></defs>';
  // 連線：從來源方框的邊緣到目標方框的邊緣
  function edgePts(a, b) {
    var ax = a.x, ay = a.y, bx = b.x, by = b.y;
    var dx = bx - ax, dy = by - ay;
    var clip = function (x, y, ddx, ddy) {
      var t = Math.min(ddx ? (W / 2) / Math.abs(ddx) : 9, ddy ? (H / 2) / Math.abs(ddy) : 9);
      return [x + ddx * t, y + ddy * t];
    };
    var p = clip(ax, ay, dx, dy), q = clip(bx, by, -dx, -dy);
    return [p, q];
  }
  var ROUTE = {
    "ctx>stn": "M68 8 H97 V78 H94",
    "th>ctx": "M29 90 H3 V8 H44",
    "snc>d2": "M15 27.5 Q15 20 41 20 Q71 20 71 27.5"
  };
  C.edges.forEach(function (e) {
    var a = N[e.from], b = N[e.to];
    var on = !opts.path || e.path.indexOf(opts.path) >= 0 || (opts.path === "nigro" && e.from === "snc");
    var src = cmp.act[e.from], dead = knock.indexOf(e.from) >= 0 || knock.indexOf(e.to) >= 0;
    var sign = e.nt === "DA" ? "da" : e.w < 0 ? "inh" : "exc";
    var wdt = dead ? 0.35 : 0.35 + Math.min(1.1, src * 0.6);
    var d = ROUTE[e.from + ">" + e.to];
    if (!d) { var pq = edgePts(a, b); d = "M" + pq[0][0].toFixed(1) + " " + pq[0][1].toFixed(1) + " L" + pq[1][0].toFixed(1) + " " + pq[1][1].toFixed(1); }
    var mk = sign === "inh" ? "i" : sign === "da" ? "d" : "e";
    var dash = sign === "inh" ? ' stroke-dasharray="2.2 1.3"' : dead ? ' stroke-dasharray="1 1.2"' : "";
    s += '<path class="nx-bg-edge' + (on ? "" : " is-dim") + '" d="' + d + '" fill="none" stroke="' + (dead ? "#adb5bd" : COL[sign]) + '" stroke-width="' + wdt.toFixed(2) + '"' + dash + ' marker-end="url(#' + id + mk + ')"><title>' + esc(N[e.from].zh + " → " + N[e.to].zh + "：" + e.via + "（" + e.nt + "，" + (e.w < 0 || e.nt === "DA" && e.w < 0 ? "抑制" : "興奮") + "）") + "</title></path>";
    if (e.nt === "DA") {
      var lx = e.to === "d1" ? 28 : 56, ly = e.to === "d1" ? 26.2 : 18.6;
      s += '<text class="nx-bg-da" x="' + lx + '" y="' + ly + '">' + (e.w > 0 ? "D1 +" : "D2 −") + "</text>";
    }
  });
  // 節點
  C.nodes.forEach(function (n) {
    var dir = cmp.dir[n.id], x = n.x - W / 2, y = n.y - H / 2;
    var cls = "nx-bg-node is-" + dir;
    s += '<g class="' + cls + '"><rect x="' + x + '" y="' + y + '" width="' + W + '" height="' + H + '" rx="2.2"' + (dir === "x" ? ' fill="url(#' + id + 'x)"' : "") + "/>" +
      '<text x="' + n.x + '" y="' + (n.y - 0.6) + '" class="nx-bg-zh">' + esc(n.zh) + "</text>" +
      '<text x="' + n.x + '" y="' + (n.y + 3.6) + '" class="nx-bg-sub">' + esc(n.sub) + "</text>" +
      (knock.length && n.id !== "ctx" ? '<text x="' + (x + W - 1.2) + '" y="' + (y + 3.6) + '" class="nx-bg-dir">' + (dir === "up" ? "↑" : dir === "down" ? "↓" : dir === "x" ? "✕" : "") + "</text>" : "") +
      "</g>";
  });
  s += "</svg>";
  return s;
}

/** 迴路圖下方的圖例。 */
export function circuitLegend() {
  return '<ul class="nx-legend nx-bg-legend"><li><i style="background:' + COL.exc + '"></i>興奮（麩胺酸）</li><li><i class="is-dash" style="background:' + COL.inh + '"></i>抑制（GABA）</li><li><i style="background:' + COL.da + '"></i>多巴胺</li><li>線越粗＝來源越活躍；↑↓ 和正常比較</li></ul>';
}
