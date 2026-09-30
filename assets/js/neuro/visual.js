/**
 * 神經解剖學：視覺路徑與瞳孔反射（瀏覽器與 node 的 build 共用，不依賴 three.js）。
 *
 * 視野切成 8 格（左／右半 × 上／下 × 周邊／黃斑），兩眼各 8 格，共 16 種代表纖維。
 * 每一種纖維依教科書的規則自動決定路線：
 *   - 看到某一側視野的是對側的視網膜半邊（影像左右、上下顛倒）
 *   - 鼻側視網膜（= 顳側視野）的纖維在視交叉交叉，顳側視網膜的不交叉 → 每一側視神經徑帶的是對側半邊視野
 *   - 下半視網膜（= 上半視野）的纖維在視神經徑、LGN 走外側，視放射繞進顳葉（Meyer 環），止於距狀溝下唇
 *   - 黃斑纖維止於枕葉後端，周邊纖維止於距狀溝前段
 *   - 交叉的下鼻側纖維會先往前彎進對側視神經（Wilbrand 膝），所以視神經與視交叉交界的病灶會影響對側眼的顳上方
 * 瞳孔光反射：視網膜 → 視神經徑 → 頂蓋前核（橄欖頂蓋前核）→ 兩側 Edinger-Westphal 核（交叉的經後連合）
 *   → 動眼神經 → 睫狀神經節 → 瞳孔括約肌。
 * 病灶範圍（lesions.json 的 zones[].brain 方框）切到哪些纖維，就推導出視野缺損與瞳孔反射的變化。
 */

var SIDES = ["R", "L"];
var OTHER = { R: "L", L: "R" };
var SG = { R: -1, L: 1 };
export var CELL_IDS = ["LUP", "LUM", "LDP", "LDM", "RUP", "RUM", "RDP", "RDM"];

function P(side, lat, y, z) { return { x: SG[side] * lat, y: y, z: z }; }
function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * 依 visual.json 建出所有纖維與反射路線。model 需要 nucPath、nervePoints、hemiMedialX。
 */
export function buildVisual(model, V) {
  var fibers = [], rads = {}, byId = {};
  var E = V.eye;

  function v1Point(t, fv, ecc) {
    var c = V.calcarine, u = ecc === "M" ? c.uM : c.uP;
    var z = lerp(c.z0, c.z1, u), y = lerp(c.y0, c.y1, u) + (fv === "U" ? -c.bank : c.bank);
    return P(t, model.hemiMedialX(y, z) + 1.2, y, z);
  }
  function lgnPoint(t, fv, ecc) {
    return P(t, V.lgn.lat + (fv === "U" ? 1.1 : -1.1), V.lgn.y + (ecc === "M" ? 0.3 : 0), V.lgn.z + (ecc === "M" ? -1.6 : 1.4));
  }

  // 視放射：每一側 × 上下 × 黃斑／周邊，兩眼的纖維在 LGN 之後合在一起
  SIDES.forEach(function (t) {
    ["U", "D"].forEach(function (fv) {
      ["P", "M"].forEach(function (ecc) {
        var pts = [lgnPoint(t, fv, ecc)];
        V.radiation[fv + ecc].forEach(function (w) { pts.push(P(t, w[0], w[1], w[2])); });
        pts.push(v1Point(t, fv, ecc));
        var fs = OTHER[t];
        rads[t + fv + ecc] = { id: t + fv + ecc, side: t, fv: fv, ecc: ecc, cell: fs + fv + ecc, meyer: fv === "U", pts: pts };
      });
    });
  });

  SIDES.forEach(function (e) {
    CELL_IDS.forEach(function (cell) {
      var fs = cell[0], fv = cell[1], ecc = cell[2];
      var nasal = fs === e;              // 顳側視野 → 鼻側視網膜 → 交叉
      var t = OTHER[fs];                 // 視神經徑的側別永遠是視野的對側
      var M = ecc === "M";
      var th = (M ? 12 : 55) * Math.PI / 180, r = E.r - 0.4;
      var retina = P(e, E.lat + (nasal ? -1 : 1) * r * Math.sin(th) * 0.72, E.y + (fv === "U" ? -1 : 1) * r * Math.sin(th) * 0.69, E.z - r * Math.cos(th));
      var ox = (nasal ? -1 : 1) * (M ? 0.35 : 0.9), oy = (fv === "U" ? -1 : 1) * (M ? 0.35 : 0.9);
      var pts = [retina, P(e, E.lat - 2.6 + ox * 0.3, E.y + oy * 0.3, E.z - r * 0.97)];   // 視盤：在後極稍微偏鼻側
      V.nerve.forEach(function (w) { pts.push(P(e, w[0] + ox, w[1] + oy, w[2])); });
      var yv = oy * 0.6;
      if (!nasal) {
        pts.push(P(e, 6.0 + 0.5 * Math.abs(ox), 75.5 + yv, 21), P(e, 6.3, 76.5 + yv, 17.5));
      } else {
        pts.push(P(e, 3.8, 75.5 + yv, 22), { x: 0, y: 76 + yv, z: 20 });
        if (fv === "U" && !M) {
          // Wilbrand 膝：下鼻側的交叉纖維先往前彎進對側視神經
          pts.push(P(t, 4.0, 75 + yv, 23.5), P(t, 5.0, 75 + yv, 26), P(t, 3.6, 75.4 + yv, 21.5), P(t, 4.2, 76 + yv, 17.5));
        } else {
          pts.push(P(t, 3.8, 76.3 + yv, 17.8));
        }
      }
      var ol = (fv === "U" ? 1 : -1) * (M ? 0.35 : 0.85), ov = M ? 0.5 : 0, jz = e === t ? 0.25 : -0.25;
      var pre;
      V.tract.forEach(function (w, i) {
        pts.push(P(t, w[0] + ol, w[1] + ov, w[2] + jz));
        if (i === 3) pre = pts.slice();
      });
      pts.push(lgnPoint(t, fv, ecc));
      var f = {
        id: e + "-" + cell, eye: e, cell: cell, fs: fs, fv: fv, ecc: ecc, nasal: nasal, crossed: nasal, tract: t,
        knee: nasal && fv === "U" && !M, pre: pre, rgc: pts, rad: rads[t + fv + ecc]
      };
      fibers.push(f);
      byId[f.id] = f;
    });
  });

  var branch = {}, opn = {}, pc = {}, eff = {}, cg = {}, iris = {}, eye = {}, lgn = {}, calc = {};
  SIDES.forEach(function (s) {
    var b = V.pretectal.branch.map(function (w) { return P(s, w[0], w[1], w[2]); });
    var o = V.pretectal.opn;
    opn[s] = P(s, o[0], o[1], o[2]);
    b.push(opn[s]);
    branch[s] = b;
    pc[s] = {
      ipsi: V.pc.ipsi.map(function (w) { return P(s, w[0], w[1], w[2]); }),
      contra: V.pc.contra.map(function (w) { return P(s, w[0], w[1], w[2]); })
    };
    // 傳出端：EW 核 → 動眼神經（腦幹內與蛛網膜下腔）→ 眼眶 → 睫狀神經節 → 短睫狀神經 → 瞳孔括約肌
    var ew = model.nucPath("edinger-westphal", s) || [];
    var ewMid = ew.length ? ew[Math.floor(ew.length / 2)] : P(s, 0.5, 72, -3.9);
    var n3 = model.nervePoints("cn3", s).slice(1);
    var e3 = [{ x: ewMid.x, y: ewMid.y, z: ewMid.z }].concat(n3, V.orbit3.map(function (w) { return P(s, w[0], w[1], w[2]); }));
    var cil = V.shortCiliary.map(function (w) { return P(s, w[0], w[1], w[2]); });
    cg[s] = P(s, V.ciliaryGanglion[0], V.ciliaryGanglion[1], V.ciliaryGanglion[2]);
    iris[s] = cil[cil.length - 1];
    eff[s] = { ew: ew, cn3: e3, cil: [cg[s]].concat(cil) };
    eye[s] = { c: P(s, E.lat, E.y, E.z), r: E.r };
    lgn[s] = { c: P(s, V.lgn.lat, V.lgn.y, V.lgn.z), r: V.lgn.r };
    var up = [], lo = [];
    for (var i = 0; i <= 12; i++) {
      var u = i / 12, z = lerp(V.calcarine.z0, V.calcarine.z1, u), yc = lerp(V.calcarine.y0, V.calcarine.y1, u);
      up.push(P(s, model.hemiMedialX(yc + V.calcarine.bank, z) + 1.2, yc + V.calcarine.bank, z));
      lo.push(P(s, model.hemiMedialX(yc - V.calcarine.bank, z) + 1.2, yc - V.calcarine.bank, z));
    }
    calc[s] = { upper: up, lower: lo };
  });

  return {
    data: V, cells: V.cells, fibers: fibers, byId: byId, rads: rads,
    branch: branch, opn: opn, pc: pc, eff: eff, cg: cg, iris: iris, eye: eye, lgn: lgn, calcarine: calc,
    /** 找某一種纖維：eye = 眼、cell = 視野格。 */
    fiber: function (e, cell) { return byId[e + "-" + cell]; },
    /** 依眼與視網膜半邊（temporal／nasal）找代表纖維（預設下半視網膜 = 上半視野、周邊）。 */
    fiberFor: function (e, hemi, fv, ecc) {
      var fs = hemi === "nasal" ? e : OTHER[e];
      return byId[e + "-" + fs + (fv || "U") + (ecc || "P")];
    }
  };
}

/* ======================================================================
   病灶判斷（lesion.js 也用這兩個函式）
   ====================================================================== */
export function inZone(zb, p) {
  if (p.y < zb.y[0] || p.y > zb.y[1]) return false;
  var side = p.x < 0 ? "R" : "L";
  if (zb.side !== "both" && zb.side !== side) return false;
  var lat = Math.abs(p.x);
  return zb.boxes.some(function (b) { return lat >= b.lat[0] && lat <= b.lat[1] && p.z >= b.z[0] && p.z <= b.z[1]; });
}
/** 折線每隔 0.4 mm 取樣。 */
export function samples(pts) {
  var out = [];
  for (var i = 0; i < pts.length - 1; i++) {
    var a = pts[i], b = pts[i + 1];
    var d = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y) + (b.z - a.z) * (b.z - a.z));
    var n = Math.max(1, Math.ceil(d / 0.4));
    for (var j = 0; j <= n; j++) {
      var t = j / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  if (pts.length === 1) out.push(pts[0]);
  return out;
}
function cutBy(zbs) {
  return function (pts) {
    if (!pts || !pts.length) return false;
    var s = samples(pts);
    return zbs.some(function (zb) { return s.some(function (p) { return inZone(zb, p); }); });
  };
}

/**
 * 病灶對視覺與瞳孔的影響。zones：lesions.json 的 zones（只看有 brain 方框的）。
 * 回傳 { lost: {R: [cell…], L: […]}, cutFibers: {id: true}, cutRads: {id: true}, pupil, any }
 */
export function visualLoss(model, zones) {
  var VS = model.vis;
  var zbs = zones.filter(function (z) { return z.brain; }).map(function (z) { return z.brain; });
  var cut = cutBy(zbs);
  var lost = { R: [], L: [] }, cutFibers = {}, cutRads = {};
  if (!VS) return { lost: lost, cutFibers: cutFibers, cutRads: cutRads, pupil: null, any: false };
  Object.keys(VS.rads).forEach(function (k) { if (cut(VS.rads[k].pts)) cutRads[k] = true; });
  VS.fibers.forEach(function (f) {
    if (cut(f.rgc)) cutFibers[f.id] = true;
    if (cutFibers[f.id] || cutRads[f.rad.id]) lost[f.eye].push(f.cell);
  });
  // 瞳孔
  var opnOK = {}, brOK = {}, effOK = {}, conn = {};
  SIDES.forEach(function (s) {
    opnOK[s] = !cut([VS.opn[s]]) && !cut(model.nucPath("opn", s) || []);
    brOK[s] = !cut(VS.branch[s]);
    effOK[s] = !cut(VS.eff[s].ew) && !cut(VS.eff[s].cn3) && !cut(VS.eff[s].cil);
    conn[s] = { R: false, L: false };
    conn[s][s] = !cut(VS.pc[s].ipsi);
    conn[s][OTHER[s]] = !cut(VS.pc[s].contra);
  });
  function aff(e, s) {
    return opnOK[s] && brOK[s] && VS.fibers.some(function (f) { return f.eye === e && f.tract === s && !cut(f.pre); });
  }
  var light = {};
  SIDES.forEach(function (e) {
    light[e] = {};
    SIDES.forEach(function (p) {
      light[e][p] = effOK[p] && SIDES.some(function (s) { return aff(e, s) && conn[s][p]; });
    });
  });
  var pupil = { light: light, near: { R: effOK.R, L: effOK.L }, eff: effOK };
  var any = Object.keys(cutFibers).length > 0 || Object.keys(cutRads).length > 0 ||
    SIDES.some(function (e) { return SIDES.some(function (p) { return !light[e][p]; }); }) || !effOK.R || !effOK.L;
  return { lost: lost, cutFibers: cutFibers, cutRads: cutRads, pupil: pupil, any: any };
}

/* ---------- 把缺損的格子整理成名稱 ---------- */
var SZH = { R: "右", L: "左" };
function has(set, c) { return set.indexOf(c) >= 0; }
function remove(set, cells) { return set.filter(function (c) { return cells.indexOf(c) < 0; }); }

/**
 * 視野缺損與瞳孔變化 → [{ key, kind, side, text }]。
 * key 用來和 lesions.json 的 expect 比對，例如 hh:L、hh:L:ms、quad:L:U、bitemporal、blind:R、rapd:R、lnd。
 */
export function visualItems(loss) {
  var out = [];
  if (!loss || !loss.any) return out;
  var rem = { R: loss.lost.R.slice(), L: loss.lost.L.slice() };
  var blind = {};
  SIDES.forEach(function (e) {
    if (rem[e].length === 8) {
      blind[e] = true;
      out.push({ key: "blind:" + e, kind: "blind", side: e, text: SZH[e] + "眼全盲" });
      rem[e] = [];
    }
  });
  // 同側（homonymous）：兩眼都缺同一側視野的同一格
  if (!blind.R && !blind.L) {
    ["L", "R"].forEach(function (X) {
      var common = CELL_IDS.filter(function (c) { return c[0] === X && has(rem.R, c) && has(rem.L, c); });
      if (!common.length) return;
      var up = has(common, X + "UP"), dp = has(common, X + "DP"), um = has(common, X + "UM"), dm = has(common, X + "DM");
      var o;
      if (up && dp && um && dm) o = { key: "hh:" + X, kind: "hh", text: SZH[X] + "側同側偏盲：兩眼的" + SZH[X] + "半邊視野都看不到（homonymous hemianopia）" };
      else if (up && dp && !um && !dm) o = { key: "hh:" + X + ":ms", kind: "hh", text: SZH[X] + "側同側偏盲，黃斑保留：兩眼的" + SZH[X] + "半邊看不到，但中心視野還在（macular sparing）" };
      else if (up && !dp && !dm) o = { key: "quad:" + X + ":U", kind: "quad", text: SZH[X] + "上象限盲：兩眼的" + SZH[X] + "上 1/4 視野看不到（superior quadrantanopia，pie in the sky）" };
      else if (dp && !up && !um) o = { key: "quad:" + X + ":D", kind: "quad", text: SZH[X] + "下象限盲：兩眼的" + SZH[X] + "下 1/4 視野看不到（inferior quadrantanopia，pie on the floor）" };
      else if (!up && !dp) o = { key: "scot:" + X, kind: "scot", text: SZH[X] + "側同側偏盲性中心暗點：兩眼" + SZH[X] + "半邊的中心視野看不到" };
      else o = { key: "hh:" + X + ":part", kind: "hh", text: SZH[X] + "側部分同側視野缺損" };
      o.side = X;
      out.push(o);
      rem.R = remove(rem.R, common);
      rem.L = remove(rem.L, common);
    });
  }
  // 雙顳側：右眼缺右半（顳側）、左眼缺左半（顳側），而且沒有其他缺損
  var tR = rem.R.filter(function (c) { return c[0] === "R"; }), tL = rem.L.filter(function (c) { return c[0] === "L"; });
  if (tR.length && tL.length && tR.length === rem.R.length && tL.length === rem.L.length) {
    var full = has(tR, "RUP") && has(tR, "RDP") && has(tL, "LUP") && has(tL, "LDP");
    var upOnly = !has(tR, "RDP") && !has(tL, "LDP");
    out.push(full ? { key: "bitemporal", kind: "bitemporal", side: "B", text: "雙顳側偏盲：兩眼外側（顳側）的半邊視野都看不到（bitemporal hemianopia）" }
      : upOnly ? { key: "bitemporal:U", kind: "bitemporal", side: "B", text: "雙顳側上象限盲：兩眼外上方的視野看不到（早期的腦下垂體腫瘤常見）" }
        : { key: "bitemporal:part", kind: "bitemporal", side: "B", text: "雙顳側部分視野缺損" });
    rem.R = []; rem.L = [];
  }
  // 其餘：各眼分開描述
  SIDES.forEach(function (e) {
    if (!rem[e].length) return;
    ["temporal", "nasal"].forEach(function (h) {
      var X = h === "temporal" ? e : OTHER[e];
      var cs = rem[e].filter(function (c) { return c[0] === X; });
      if (!cs.length) return;
      var hz = h === "temporal" ? "顳側" : "鼻側";
      var up = has(cs, X + "UP"), dp = has(cs, X + "DP");
      if (up && dp) out.push({ key: "hemi:" + e + ":" + h, kind: "vf", side: e, text: SZH[e] + "眼" + hz + "偏盲：" + SZH[e] + "眼" + (h === "temporal" ? "外側" : "內側") + "的半邊視野看不到" });
      else if (up) out.push({ key: "qeye:" + e + ":" + h + ":U", kind: "vf", side: e, text: SZH[e] + "眼" + hz + "上象限缺損" });
      else if (dp) out.push({ key: "qeye:" + e + ":" + h + ":D", kind: "vf", side: e, text: SZH[e] + "眼" + hz + "下象限缺損" });
      else out.push({ key: "cscot:" + e, kind: "vf", side: e, text: SZH[e] + "眼中心暗點" });
    });
  });
  // 瞳孔
  var pu = loss.pupil;
  if (pu) {
    SIDES.forEach(function (p) {
      if (!pu.eff[p]) out.push({ key: "pupil-eff:" + p, kind: "pupil-eff", side: p, text: SZH[p] + "側瞳孔放大：光照哪一眼，" + SZH[p] + "瞳孔都不縮（直接、間接光反射都消失），看近物也不縮（瞳孔的副交感傳出端）" });
    });
    var anyLight = SIDES.some(function (e) { return SIDES.some(function (p) { return pu.light[e][p]; }); });
    var seeing = SIDES.some(function (e) { return loss.lost[e].length < 8; });
    if (!anyLight && pu.eff.R && pu.eff.L && seeing) {
      out.push({ key: "lnd", kind: "lnd", side: "B", text: "兩側瞳孔對光反射消失，但看近物時會縮小（光—近反射分離，light-near dissociation）" });
    } else {
      SIDES.forEach(function (e) {
        var o = OTHER[e];
        var none = SIDES.every(function (p) { return !pu.eff[p] || !pu.light[e][p]; }) && (pu.eff.R || pu.eff.L);
        var otherOK = SIDES.some(function (p) { return pu.light[o][p]; });
        if (none && otherOK) out.push({ key: "rapd:" + e, kind: "rapd", side: e, text: SZH[e] + "眼傳入性瞳孔缺損（Marcus Gunn）：光照" + SZH[e] + "眼兩側瞳孔都不縮，照" + SZH[o] + "眼兩側都縮；擺動手電筒從" + SZH[o] + "眼移到" + SZH[e] + "眼時，兩側瞳孔反而放大" });
      });
    }
  }
  return out;
}

/* ======================================================================
   2D：視野圖與路徑俯視圖（SVG 字串）
   ====================================================================== */
function f1(v) { return (Math.round(v * 10) / 10).toString(); }
function sector(cx, cy, r0, r1, a0, a1) {
  var rad = Math.PI / 180, p = function (r, a) { return f1(cx + r * Math.cos(a * rad)) + " " + f1(cy - r * Math.sin(a * rad)); };
  if (r0 <= 0) return "M" + f1(cx) + " " + f1(cy) + "L" + p(r1, a0) + "A" + r1 + " " + r1 + " 0 0 0 " + p(r1, a1) + "Z";
  return "M" + p(r1, a0) + "A" + r1 + " " + r1 + " 0 0 0 " + p(r1, a1) + "L" + p(r0, a1) + "A" + r0 + " " + r0 + " 0 0 1 " + p(r0, a0) + "Z";
}
var QUAD = { RU: [0, 90], LU: [90, 180], LD: [180, 270], RD: [270, 360] };

/**
 * 兩眼的視野圖（病人看出去的方向：左眼畫在左邊）。lost = {R: [cell…], L: […]}。
 * opts.cells（visual.json 的 cells）有的話，正常的格子用淡色塗上對應纖維的顏色；opts.hot = 要強調的格子。
 */
export function fieldSVG(lost, opts) {
  opts = opts || {};
  lost = lost || { R: [], L: [] };
  var R = 40, rm = 14, gap = 22, W = 4 * R + gap + 8, H = 2 * R + 30;
  var cells = opts.cells || {};
  var h = ['<svg class="nx-vf" viewBox="' + (-W / 2) + " " + (-R - 22) + " " + W + " " + H + '" role="img" aria-label="' + (opts.label || "視野圖") + '">'];
  [["L", -(R + gap / 2)], ["R", R + gap / 2]].forEach(function (d) {
    var e = d[0], cx = d[1];
    h.push('<text class="nx-vf-eye" x="' + cx + '" y="' + (-R - 8) + '" text-anchor="middle">' + (e === "L" ? "左眼" : "右眼") + "</text>");
    Object.keys(QUAD).forEach(function (q) {
      var a = QUAD[q];
      ["P", "M"].forEach(function (ecc) {
        var id = q[0] + q[1] + ecc;
        var isLost = (lost[e] || []).indexOf(id) >= 0;
        var col = cells[id] ? cells[id].color : "#9aa3ad";
        var cls = "nx-vf-cell" + (isLost ? " is-lost" : "") + (opts.hot && opts.hot.indexOf(id) >= 0 ? " is-hot" : "");
        h.push('<path class="' + cls + '" data-cell="' + id + '" data-eye="' + e + '" style="--c:' + col + '" d="' + sector(cx, 0, ecc === "M" ? 0 : rm, ecc === "M" ? rm : R, a[0], a[1]) + '"><title>' + (e === "L" ? "左眼" : "右眼") + "・" + (cells[id] ? cells[id].zh : id) + (isLost ? "（看不到）" : "") + "</title></path>");
      });
    });
    h.push('<circle class="nx-vf-ring" cx="' + cx + '" cy="0" r="' + R + '"/><circle class="nx-vf-ring" cx="' + cx + '" cy="0" r="' + rm + '"/>');
    h.push('<path class="nx-vf-axis" d="M' + (cx - R) + " 0H" + (cx + R) + "M" + cx + " " + (-R) + "V" + R + '"/>');
    if (opts.sides !== false) {
      h.push('<text class="nx-vf-side" x="' + (cx - R + 2) + '" y="' + (R + 5) + '">' + (e === "L" ? "顳" : "鼻") + "</text>");
      h.push('<text class="nx-vf-side" x="' + (cx + R - 2) + '" y="' + (R + 5) + '" text-anchor="end">' + (e === "L" ? "鼻" : "顳") + "</text>");
    }
  });
  h.push("</svg>");
  return h.join("");
}

/**
 * 視覺路徑的俯視圖（從頭頂往下看：前方在上、病人左側在左，和 Barr Fig. 20-8 相同）。
 * opts.zones：病灶（lesions.json 的 zones）；opts.cut：visualLoss 的結果（被切到的纖維畫成灰色）；
 * opts.pupil：畫出瞳孔反射路線；opts.mark：{lat, z, r, side} 標出某個結構；opts.labels：文字標籤。
 */
export function pathwaySVG(model, opts) {
  opts = opts || {};
  var VS = model.vis, k = opts.scale || 3;
  var X = function (p) { return f1(-p.x * k); }, Y = function (p) { return f1(-p.z * k); };
  var line = function (pts) { return pts.map(function (p, i) { return (i ? "L" : "M") + X(p) + " " + Y(p); }).join(""); };
  var x0 = -50 * k, y0 = -104 * k, W = 100 * k, H = 188 * k;
  var h = ['<svg class="nx-vpath" viewBox="' + f1(x0) + " " + f1(y0) + " " + f1(W) + " " + f1(H) + '" role="img" aria-label="' + (opts.label || "視覺路徑（由上往下看）") + '">'];
  // 大腦半球輪廓（最寬處）與腦幹
  var H0 = model.HEMI;
  SIDES.forEach(function (s) {
    var pts = [];
    for (var i = 0; i <= 96; i++) {
      var a = (i / 96) * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a);
      // 往中線那一邊比較平（HPX），往外側是 HP
      var medial = (s === "L" && cx < 0) || (s === "R" && cx > 0);
      var ex = medial ? model.HPX : model.HP;
      var dx = Math.sign(cx) * Math.pow(Math.abs(cx), 2 / ex) * H0.r[0], dz = Math.sign(sz) * Math.pow(Math.abs(sz), 2 / model.HP) * H0.r[2];
      pts.push({ x: SG[s] * H0.c[0] + dx, z: H0.c[2] + dz });
    }
    h.push('<path class="nx-vp-hemi" d="' + line(pts) + 'Z"/>');
  });
  var bs = model.brainstemAt(74);
  h.push('<ellipse class="nx-vp-bs" cx="0" cy="' + f1(-bs.zc * k) + '" rx="' + f1(bs.a * k) + '" ry="' + f1(bs.b * k) + '"/>');
  // 腦下垂體
  var pit = VS.data.pituitary;
  h.push('<ellipse class="nx-vp-pit" cx="0" cy="' + f1(-pit.c[2] * k) + '" rx="' + f1(pit.r[0] * k) + '" ry="' + f1(pit.r[2] * k) + '"><title>腦下垂體（在視交叉下方）</title></ellipse>');
  // 眼球、LGN
  SIDES.forEach(function (s) {
    var e = VS.eye[s];
    h.push('<circle class="nx-vp-eye" cx="' + X(e.c) + '" cy="' + Y(e.c) + '" r="' + f1(e.r * k) + '"/>');
    var l = VS.lgn[s];
    h.push('<ellipse class="nx-vp-lgn" cx="' + X(l.c) + '" cy="' + Y(l.c) + '" rx="' + f1(l.r[0] * k * 1.2) + '" ry="' + f1(l.r[2] * k * 1.1) + '"><title>外側膝狀核</title></ellipse>');
    h.push('<path class="nx-vp-v1" d="' + line(VS.calcarine[s].upper) + '"><title>初級視覺皮質（距狀溝）</title></path>');
  });
  // 纖維
  var cutF = (opts.cut && opts.cut.cutFibers) || {}, cutR = (opts.cut && opts.cut.cutRads) || {};
  var hot = opts.hot || null;
  var dimOf = function (cell) { return hot && hot.indexOf(cell) < 0 ? " is-dim" : ""; };
  Object.keys(VS.rads).forEach(function (id) {
    var r = VS.rads[id];
    var isCut = cutR[id] || VS.fibers.every(function (f) { return f.rad.id !== id || cutF[f.id]; });
    h.push('<path class="nx-vp-fiber' + (isCut ? " is-cut" : "") + dimOf(r.cell) + '" style="--c:' + VS.cells[r.cell].color + '" d="' + line(r.pts) + '"/>');
  });
  VS.fibers.forEach(function (f) {
    h.push('<path class="nx-vp-fiber' + (cutF[f.id] ? " is-cut" : "") + dimOf(f.cell) + '" style="--c:' + VS.cells[f.cell].color + '" d="' + line(f.rgc) + '"><title>' + (f.eye === "R" ? "右眼" : "左眼") + (f.nasal ? "鼻側" : "顳側") + "視網膜 → " + VS.cells[f.cell].zh + "視野</title></path>");
  });
  if (opts.pupil) {
    SIDES.forEach(function (s) {
      h.push('<path class="nx-vp-pupil" d="' + line(VS.branch[s]) + '"/>');
      h.push('<path class="nx-vp-pupil" d="' + line(VS.pc[s].contra) + '"/>');
      h.push('<path class="nx-vp-eff" d="' + line(VS.eff[s].cn3.concat(VS.eff[s].cil)) + '"/>');
      h.push('<circle class="nx-vp-cg" cx="' + X(VS.cg[s]) + '" cy="' + Y(VS.cg[s]) + '" r="' + f1(1.1 * k) + '"><title>睫狀神經節</title></circle>');
    });
  }
  // 病灶
  (opts.zones || []).forEach(function (z) {
    if (!z.brain) return;
    var zb = z.brain, sides = zb.side === "both" ? ["R", "L"] : [zb.side];
    sides.forEach(function (s) {
      zb.boxes.forEach(function (b) {
        var xa = SG[s] * b.lat[0], xb = SG[s] * b.lat[1];
        h.push('<rect class="nx-lesion" x="' + f1(-Math.max(xa, xb) * k) + '" y="' + f1(-b.z[1] * k) + '" width="' + f1(Math.abs(xb - xa) * k) + '" height="' + f1((b.z[1] - b.z[0]) * k) + '"/>');
      });
    });
  });
  if (opts.mark) {
    var m = opts.mark;
    (m.side === "both" ? ["R", "L"] : [m.side || "R"]).forEach(function (s) {
      h.push('<circle class="nx-vp-mark" cx="' + f1(-SG[s] * m.lat * k) + '" cy="' + f1(-m.z * k) + '" r="' + f1((m.r || 4) * k) + '"/>');
    });
  }
  if (opts.labels !== false) {
    var T = function (x, z, s, anchor) { h.push('<text class="nx-vp-label" x="' + f1(-x * k) + '" y="' + f1(-z * k) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : "") + ">" + s + "</text>"); };
    T(0, 99, "前", "middle");
    T(-31, 68, "右眼", "middle"); T(31, 68, "左眼", "middle");
    T(-15, 50, "視神經", "end");
    T(0, 29, "視交叉", "middle");
    T(-12, 12, "視神經徑", "end");
    T(-24, -12, "外側膝狀核", "end");
    T(-33, 12, "Meyer 環", "end");
    T(-30, -40, "視放射", "end");
    T(-9, -80, "視覺皮質", "middle");
    T(-46, -88, "右");
    T(46, -88, "左", "end");
  }
  h.push("</svg>");
  return h.join("");
}
