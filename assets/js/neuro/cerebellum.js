/**
 * 神經解剖學：小腦的攤開圖（SVG 字串，瀏覽器與 build 共用）。
 *
 * 像 Haines Fig. 27.5 那樣把小腦皮質「攤開」：上面是前葉，往下經原裂、後葉、後外側裂，最下面是小葉結節葉；
 * 左右方向是縱向分區（中間蚓部、兩旁中間區、外側區）。下方一排是三對小腦核，顏色和對應的皮質區相同。
 * 位置與 geometry.js 的 cbClassify 使用同一套座標（x = 離中線、s = 攤開後的位置），
 * 所以病灶方框裡被判定為皮質的點，可以直接畫在圖上。
 */
import { inZone, samples } from "./visual.js";

var KX = 2, KS = 0.9;             // x 每 mm 2 個單位；s 每度 0.9 個單位
var S_PF = 80, S_PLF = 265;       // 原裂、後外側裂在攤開圖上的位置
var LOBE_COLOR = { anterior: "#f28b82", posterior: "#8ab4f8", fn: "#f2a65a" };
var NUC_ROW = 318;

function f1(v) { return (Math.round(v * 10) / 10).toString(); }
function rect(x0, x1, s0, s1, cls, style, title) {
  return '<rect class="' + cls + '" x="' + f1(x0 * KX) + '" y="' + f1(s0 * KS) + '" width="' + f1((x1 - x0) * KX) + '" height="' + f1((s1 - s0) * KS) + '"' +
    (style ? ' style="' + style + '"' : "") + ">" + (title ? "<title>" + title + "</title>" : "") + "</rect>";
}

/**
 * opts.color：zone（縱向分區，預設）或 lobe（分葉）
 * opts.zones：病灶（lesions.json 的 zones），被切到的皮質畫紅點、小腦核加紅框
 * opts.hl：{ zones:[…], lobes:[…], nuclei:[…] } 要強調的部分（其他變淡）
 */
export function cbMapSVG(model, opts) {
  opts = opts || {};
  var ST = model.data.structures.structures;
  var ZC = {
    vermis: ST.vermis ? ST.vermis.color : "#c9b8e8", intermediate: ST["intermediate-zone"] ? ST["intermediate-zone"].color : "#6fcf97",
    lateral: ST["lateral-zone"] ? ST["lateral-zone"].color : "#6aa7ff", fn: ST["flocculonodular-lobe"] ? ST["flocculonodular-lobe"].color : "#f2a65a"
  };
  var hl = opts.hl || null;
  var byLobe = opts.color === "lobe";
  var h = ['<svg class="nx-cbmap" viewBox="-118 -26 236 ' + (NUC_ROW + 54) + '" role="img" aria-label="' + (opts.label || "小腦攤開圖") + '">'];
  function dim(zone, lobe) {
    if (!hl) return "";
    var on = (hl.zones && hl.zones.indexOf(zone) >= 0) || (hl.lobes && hl.lobes.indexOf(lobe) >= 0) || hl.all;
    return on ? " is-hot" : " is-dim";
  }
  // 前葉與後葉：依縱向分區畫成直條
  var strips = [["vermis", 0, 5], ["intermediate", 5, 15], ["lateral", 15, 50]];
  [["anterior", 0, S_PF], ["posterior", S_PF, S_PLF]].forEach(function (lb) {
    strips.forEach(function (st) {
      [-1, 1].forEach(function (sd) {
        var x0 = sd < 0 ? -st[2] : st[1], x1 = sd < 0 ? -st[1] : st[2];
        var s0 = lb[1];
        // 前方中央是小腦腳的附著處（不是皮質）
        if (lb[0] === "anterior" && st[2] <= 18) s0 = 15;
        var col = byLobe ? LOBE_COLOR[lb[0]] : ZC[st[0]];
        h.push(rect(x0, x1, s0, lb[2], "nx-cb-cell" + dim(st[0], lb[0]), "--c:" + col, (lb[0] === "anterior" ? "前葉" : "後葉") + "・" + { vermis: "蚓部", intermediate: "中間區", lateral: "外側區" }[st[0]]));
      });
    });
    if (lb[0] === "anterior") h.push(rect(-15, 15, 15, 15.01, "nx-cb-line", "", ""));
  });
  // 小葉結節葉：中間的小結、兩側的絨球
  var fnCol = byLobe ? LOBE_COLOR.fn : ZC.fn;
  h.push(rect(-7, 7, S_PLF, 320, "nx-cb-cell" + dim("fn", "fn"), "--c:" + fnCol, "小結（小葉結節葉）"));
  [-1, 1].forEach(function (sd) {
    h.push(rect(sd < 0 ? -32 : 16, sd < 0 ? -16 : 32, S_PLF, 305, "nx-cb-cell" + dim("fn", "fn"), "--c:" + fnCol, "絨球（小葉結節葉）"));
  });
  // 裂與標籤
  h.push('<path class="nx-cb-fissure" d="M' + (-50 * KX) + " " + f1(S_PF * KS) + "H" + 50 * KX + '"/>');
  h.push('<path class="nx-cb-fissure" d="M' + (-50 * KX) + " " + f1(S_PLF * KS) + "H" + 50 * KX + '"/>');
  if (opts.labels !== false) {
    var T = function (x, y, t, a, cls) { h.push('<text class="' + (cls || "nx-cb-label") + '" x="' + f1(x) + '" y="' + f1(y) + '"' + (a ? ' text-anchor="' + a + '"' : "") + ">" + t + "</text>"); };
    T(0, -14, "前（小腦腳附著處）", "middle", "nx-cb-small");
    T(0, 6, "小腦腳", "middle", "nx-cb-small");
    T(-102, 40 * KS, "前葉", "start");
    T(-102, 170 * KS, "後葉", "start");
    T(102, S_PF * KS - 3, "原裂", "end", "nx-cb-small");
    T(102, S_PLF * KS - 3, "後外側裂", "end", "nx-cb-small");
    T(0, 272, "小結", "middle", "nx-cb-small");
    T(-48, 262, "絨球", "middle", "nx-cb-small");
    T(48, 262, "絨球", "middle", "nx-cb-small");
    T(-110, -14, "左", "start", "nx-cb-small");
    T(110, -14, "右", "end", "nx-cb-small");
  }
  // 病灶：方框裡被判定為皮質的點
  var hitNuc = {};
  if (opts.zones) {
    opts.zones.forEach(function (z) {
      if (!z.brain) return;
      var zb = z.brain;
      (zb.side === "both" ? [-1, 1] : [zb.side === "L" ? 1 : -1]).forEach(function (sd) {
        zb.boxes.forEach(function (b) {
          for (var y = zb.y[0]; y <= zb.y[1] + 1e-6; y += 1.5)
            for (var lat = b.lat[0]; lat <= b.lat[1] + 1e-6; lat += 1.5)
              for (var zz = b.z[0]; zz <= b.z[1] + 1e-6; zz += 1.5) {
                var c = model.cbClassify({ x: sd * lat, y: y, z: zz });
                if (!c) continue;
                // 攤開圖：病人右側畫在右邊
                h.push('<circle class="nx-cb-hit" cx="' + f1(-c.x * KX) + '" cy="' + f1(Math.min(c.s, 320) * KS) + '" r="1.6"/>');
              }
        });
      });
      Object.keys(ST).forEach(function (id) {
        if (ST[id].region !== "cerebellum" || !ST[id].nuc) return;
        ["R", "L"].forEach(function (s) {
          if (samples(model.nucPath(id, s)).some(function (p) { return inZone(zb, p); })) hitNuc[id + s] = true;
        });
      });
    });
  }
  // 小腦核
  var NUC = [["fastigial", 2.8, 3.2, "vermis", "頂核"], ["interposed", 8, 3.8, "intermediate", "中間核"], ["dentate", 16.5, 6.5, "lateral", "齒狀核"]];
  var showLab = opts.labels !== false;
  if (showLab) h.push('<text class="nx-cb-small" x="0" y="' + (NUC_ROW - 10) + '" text-anchor="middle">小腦核（顏色與對應的皮質區相同）</text>');
  NUC.forEach(function (n) {
    [-1, 1].forEach(function (sd) {
      var side = sd > 0 ? "R" : "L";   // 病人右側在右
      var on = !hl || (hl.nuclei && hl.nuclei.indexOf(n[0]) >= 0) || hl.all;
      var cls = "nx-cb-nuc" + (hl ? (on ? " is-hot" : " is-dim") : "") + (hitNuc[n[0] + side] ? " is-hit" : "");
      h.push('<ellipse class="' + cls + '" data-structure="' + n[0] + '" cx="' + f1(sd * n[1] * KX * 2.4) + '" cy="' + NUC_ROW + '" rx="' + f1(n[2] * 1.6) + '" ry="' + f1(n[2] * 1.1) + '" style="--c:' + ZC[n[3]] + '"><title>' + n[4] + "</title></ellipse>");
    });
    if (showLab && n[0] !== "fastigial") {   // 頂核太靠近中線，文字寫在上面那行說明裡就好
      h.push('<text class="nx-cb-small" x="' + f1(n[1] * KX * 2.4) + '" y="' + (NUC_ROW + 20) + '" text-anchor="middle">' + n[4] + "</text>");
      h.push('<text class="nx-cb-small" x="' + f1(-n[1] * KX * 2.4) + '" y="' + (NUC_ROW + 20) + '" text-anchor="middle">' + n[4] + "</text>");
    }
    if (showLab && n[0] === "fastigial") h.push('<text class="nx-cb-small" x="0" y="' + (NUC_ROW + 20) + '" text-anchor="middle">頂核</text>');
  });
  h.push("</svg>");
  return h.join("");
}

/** 小腦的縱向分區與分葉顏色（3D 用）。 */
export function cbColors(model) {
  var ST = model.data.structures.structures;
  return {
    zone: { vermis: ST.vermis.color, intermediate: ST["intermediate-zone"].color, lateral: ST["lateral-zone"].color, fn: ST["flocculonodular-lobe"].color },
    lobe: LOBE_COLOR
  };
}
