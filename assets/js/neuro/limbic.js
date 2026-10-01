/**
 * 神經解剖學：邊緣系統的迴路圖（Papez 迴路與杏仁核的連結；瀏覽器與 build 共用）。
 *
 *   limbicKnock(model, zones) → { nodes: {id: "R"|"L"|"B"}, edges: {id: ...} }  病灶切到的站與纖維束
 *   limbicSVG(LM, opts)       → 迴路圖：Papez 迴路（實線、粗）與杏仁核的連結（虛線）；被切到的站打叉
 */
import { inZone, samples } from "./visual.js";

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

/** 病灶範圍切到哪些站、哪些纖維束（側別：R、L；兩側都有 = B）。 */
export function limbicKnock(model, zones) {
  var LM = model.LM, S = model.data.structures.structures, T = model.data.tracts.tracts;
  var out = { nodes: {}, edges: {} };
  if (!LM) return out;
  var bz = zones.filter(function (z) { return z.brain; }).map(function (z) { return z.brain; });
  var mark = function (m, id, side) { m[id] = m[id] && m[id] !== side ? "B" : side; };
  LM.nodes.forEach(function (n) {
    ["R", "L"].forEach(function (side) {
      var hit = n.structs.some(function (id) {
        var s = S[id];
        if (!s) return false;
        var pts = s.ell ? model.ellSamples(id, side) : s.nuc ? model.nucPath(id, side) : null;
        return pts && bz.some(function (zb) { return samples(pts).some(function (p) { return inZone(zb, p); }); });
      });
      if (hit) mark(out.nodes, n.id, side);
    });
  });
  LM.edges.forEach(function (e) {
    (e.bundles || []).forEach(function (bid) {
      Object.keys(T).forEach(function (tid) {
        T[tid].bundles.forEach(function (bd) {
          if (bd.id !== bid || !bd.brain) return;
          ["R", "L"].forEach(function (body) {
            var pts = bd.brain.map(function (w) { return { x: model.sx(w[1], body), y: w[0], z: w[2] }; });
            if (bz.some(function (zb) { return samples(pts).some(function (p) { return inZone(zb, p); }); })) mark(out.edges, e.id, body);
          });
        });
      });
    });
  });
  return out;
}

var W = 23, H = 13;
var SIDE_ZH = { R: "右", L: "左", B: "雙側" };

/** @param opts { knock: limbicKnock 的結果, label, focus: "papez" | "amygdala" | null } */
export function limbicSVG(LM, opts) {
  opts = opts || {};
  var K = opts.knock || { nodes: {}, edges: {} };
  var N = {};
  LM.nodes.forEach(function (n) { N[n.id] = n; });
  var id = "lm" + Math.random().toString(36).slice(2, 7);
  var s = '<svg class="nx-lm" viewBox="' + LM.viewBox + '" role="img" aria-label="' + esc(opts.label || "邊緣系統迴路") + '">' +
    '<defs><marker id="' + id + 'p" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="3.6" markerHeight="3.6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#0f766e"/></marker>' +
    '<marker id="' + id + 'a" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0 0L10 5L0 10z" fill="#c2410c"/></marker>' +
    '<marker id="' + id + 'x" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0 0L10 5L0 10z" fill="#adb5bd"/></marker>' +
    '<pattern id="' + id + 'h" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v3" stroke="#c92a2a" stroke-width="0.8"/></pattern></defs>';
  function straight(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var clip = function (x, y, ddx, ddy) {
      var t = Math.min(ddx ? (W / 2) / Math.abs(ddx) : 9, ddy ? (H / 2) / Math.abs(ddy) : 9);
      return [x + ddx * t, y + ddy * t];
    };
    var p = clip(a.x, a.y, dx, dy), q = clip(b.x, b.y, -dx, -dy);
    return "M" + p[0].toFixed(1) + " " + p[1].toFixed(1) + " L" + q[0].toFixed(1) + " " + q[1].toFixed(1);
  }
  LM.edges.forEach(function (e) {
    var a = N[e.from], b = N[e.to];
    var cut = K.edges[e.id], dead = !!cut || K.nodes[e.from] || K.nodes[e.to];
    var d = e.path || straight(a, b);
    var col = dead ? "#adb5bd" : e.papez ? "#0f766e" : "#c2410c";
    var mk = dead ? "x" : e.papez ? "p" : "a";
    s += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (e.papez ? 1.15 : 0.6) + '"' + (e.papez ? "" : ' stroke-dasharray="2.2 1.3"') + ' marker-end="url(#' + id + mk + ')"><title>' + esc(a.zh + " → " + b.zh + "：" + e.zh + (cut ? "（病灶切到，" + SIDE_ZH[cut] + "）" : "")) + "</title></path>";
  });
  // 連線名稱（Papez 迴路的四條 + 杏仁核的兩條）
  var LBL = { perf: [50, 59.6, "穿通路徑"], fx: [16, 49.5, "穹窿"], mtt: [33, 33.4, "乳頭視丘徑"], atr: [67, 33.4, "前視丘放射"], cgm: [84, 49.5, "扣帶束"], st: [12, 85.3, "終紋"], stH: [61, 47, "終紋・腹側徑"], vafm: [92, 62, "腹側徑"] };
  Object.keys(LBL).forEach(function (k) {
    var e = LM.edges.filter(function (x) { return x.id === k; })[0];
    if (!e) return;
    s += '<text class="nx-lm-el' + (e.papez ? " is-papez" : "") + '" x="' + LBL[k][0] + '" y="' + LBL[k][1] + '" text-anchor="' + (k === "st" ? "start" : "middle") + '">' + LBL[k][2] + "</text>";
  });
  LM.nodes.forEach(function (n) {
    var k = K.nodes[n.id], x = n.x - W / 2, y = n.y - H / 2;
    var papez = ["mb", "an", "cg", "hip", "ec"].indexOf(n.id) >= 0;
    s += '<g class="nx-lm-node' + (k ? " is-x" : "") + (papez ? " is-papez" : "") + '"><rect x="' + x + '" y="' + y + '" width="' + W + '" height="' + H + '" rx="2.2"' + (k ? ' fill="url(#' + id + 'h)"' : "") + "/>" +
      '<text x="' + n.x + '" y="' + (n.y - 0.4) + '" class="nx-lm-zh">' + esc(n.zh) + "</text>" +
      '<text x="' + n.x + '" y="' + (n.y + 3.7) + '" class="nx-lm-sub">' + esc(n.sub) + "</text>" +
      (k ? '<text x="' + (x + W - 1) + '" y="' + (y + 3.8) + '" class="nx-lm-dir">✕' + (k === "B" ? "" : SIDE_ZH[k]) + "</text>" : "") + "</g>";
  });
  return s + "</svg>";
}

export function limbicLegend() {
  return '<ul class="nx-legend nx-lm-legend"><li><i style="background:#0f766e"></i>Papez 迴路（記憶）</li><li><i class="is-dash" style="background:#c2410c"></i>杏仁核的連結（情緒）</li><li>打叉＝病灶切到</li></ul>';
}
