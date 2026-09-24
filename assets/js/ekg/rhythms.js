/**
 * 心電圖節律引擎：節律條（strip.js）與 3D 心臟（heart3d.js）共用同一份定義，
 * 所以文字、圖、動畫三者的時間點一定對得上。
 *
 * 單位：時間 ms、振幅 mV。一個節律是一段會循環播放的時間軸（長度 L），
 * 裡面是一拍一拍的事件（beat）：
 *   p    心房去極化（P 波）   { t, dur, shape, origin }
 *   qrs  心室去極化（QRS）   { t, morph }
 *   cond 3D 用的傳導時間點（AV node 進出、His、是否阻斷、Kent bundle）
 * 波形是用高斯曲線組合出來的示意圖，不是從 3D 模型算出來的。
 */

/* ------------------------------ 小工具 ------------------------------ */

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 高斯波；w2 有給就是左右不對稱（左寬 w、右寬 w2）。 */
function g(t, a, c, w, w2) {
  var d = t - c;
  var s = d > 0 && w2 ? w2 : w;
  if (d * d > 36 * s * s) return 0;
  return a * Math.exp(-(d * d) / (2 * s * s));
}

function smooth(e0, e1, x) {
  var k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
}

/* ------------------------------ 波形模板 ------------------------------ */

export var LEADS = ["II", "V1", "V6"];

// P 波：[振幅, 中心, 左寬, 右寬]，時間相對於 P 波起點
var P_SHAPES = {
  sinus:   { dur: 100, II: [[0.15, 50, 20, 18]], V1: [[0.08, 34, 12], [-0.06, 70, 13]], V6: [[0.1, 50, 20]] },
  ectopic: { dur: 90,  II: [[0.1, 40, 12], [0.07, 68, 12]], V1: [[-0.07, 45, 15]], V6: [[0.08, 45, 15]] },
  ectopic2:{ dur: 90,  II: [[0.09, 30, 11], [-0.07, 66, 12]], V1: [[0.06, 40, 14]], V6: [[0.05, 40, 14]] },
  ectopic3:{ dur: 80,  II: [[0.22, 40, 11]], V1: [[0.1, 40, 12]], V6: [[0.12, 40, 12]] },
  retro:   { dur: 80,  II: [[-0.13, 40, 14]], V1: [[0.06, 40, 14]], V6: [[-0.06, 40, 14]] },
  rae:     { dur: 100, II: [[0.3, 45, 14, 16]], V1: [[0.16, 34, 12], [-0.03, 72, 12]], V6: [[0.15, 45, 15]] },
  lae:     { dur: 130, II: [[0.12, 35, 15], [0.13, 88, 17]], V1: [[0.05, 28, 12], [-0.15, 82, 20]], V6: [[0.1, 35, 15], [0.1, 88, 17]] }
};

// QRS：時間相對於 QRS 起點；t = T 波振幅（依導程）。dur 是 QRS 寬度，3D 心室活化也用這個長度。
var QRS = {
  normal: {
    dur: 90,
    II: [[-0.08, 12, 5], [1.1, 38, 10], [-0.25, 64, 9]],
    V1: [[0.22, 20, 8], [-0.95, 50, 13]],
    V6: [[-0.1, 12, 5], [1.25, 40, 11], [-0.15, 68, 8]],
    t: { II: 0.3, V1: 0.06, V6: 0.35 }
  },
  rbbb: {
    dur: 140,
    II: [[-0.06, 10, 5], [1.0, 36, 10], [-0.3, 96, 22]],
    V1: [[0.3, 20, 8], [-0.4, 52, 9], [1.0, 98, 16]],
    V6: [[-0.1, 12, 5], [1.1, 40, 11], [-0.4, 100, 22]],
    t: { II: 0.25, V1: -0.25, V6: 0.3 }
  },
  lbbb: {
    dur: 160,
    II: [[0.55, 50, 18], [0.6, 108, 22]],
    V1: [[0.1, 14, 7], [-1.5, 80, 30]],
    V6: [[0.95, 52, 20], [1.1, 112, 22]],
    t: { II: 0.05, V1: 0.45, V6: -0.4 }
  },
  pvc: {
    dur: 160,
    II: [[1.45, 75, 32]],
    V1: [[1.15, 75, 30]],
    V6: [[-1.1, 75, 30]],
    t: { II: -0.55, V1: -0.4, V6: 0.45 }
  },
  vt: {
    dur: 160,
    II: [[1.5, 70, 34], [-0.35, 150, 26]],
    V1: [[1.25, 70, 32], [-0.3, 150, 26]],
    V6: [[-1.2, 70, 32], [0.3, 150, 26]],
    t: { II: -0.5, V1: -0.4, V6: 0.4 }
  },
  wpw: {
    dur: 120,
    // delta wave：一開始緩慢爬升的斜坡（左寬右窄），接著才是正常的 R 波
    II: [[0.4, 48, 30, 10], [0.85, 70, 10], [-0.22, 96, 9]],
    V1: [[0.35, 50, 30, 12], [0.5, 72, 11], [-0.25, 100, 10]],
    V6: [[0.45, 48, 30, 10], [1.05, 72, 11], [-0.12, 98, 8]],
    t: { II: -0.12, V1: -0.1, V6: -0.15 }
  }
};

// 3D 心室活化模式：QRS 型態 → 心室從哪裡開始去極化
export var VENT_MODE = {
  normal: "normal", rbbb: "rbbb", lbbb: "lbbb", pvc: "ectopicV", vt: "ectopicV", wpw: "wpw"
};

export function qrsDur(morph) { return (QRS[morph] || QRS.normal).dur; }
export function pDur(shape) { return (P_SHAPES[shape] || P_SHAPES.sinus).dur; }

/* ------------------------------ 產生節律 ------------------------------ */

/**
 * 依 P 波與 QRS 的時間補上 3D 用的傳導時間點。
 *   av.t0 ~ av.t1：電流在 AV node 裡慢慢爬（對應 PR segment）
 *   his：通過 His bundle、分成左右束支的時間
 *   block：'av' 卡在 AV node、'his' 卡在 His 以下
 */
function withConduction(b, opts) {
  var p = b.p, q = b.qrs;
  var cond = { av: null, his: null, block: null, kent: null };
  if (p && p.origin !== "retro") {
    var arrive = p.t + (p.origin === "sa" ? 40 : 30);
    if (q && !opts.dissociated && VENT_MODE[q.morph] !== "ectopicV") {
      cond.av = { t0: arrive, t1: q.t - 30 };
      // WPW：AV node 照常慢慢傳，但 Kent bundle 先一步把電流送進心室
      if (q.morph === "wpw") { cond.av = { t0: arrive, t1: arrive + 90 }; cond.kent = { t0: arrive, t1: q.t }; }
    } else if (!q) {
      // 沒有下傳：Mobitz I / 3° 卡在 AV node，Mobitz II 通過 AV node 後卡在 His 以下
      if (b.blockAt === "his") { cond.av = { t0: arrive, t1: arrive + 80 }; cond.block = "his"; }
      else { cond.av = { t0: arrive, t1: arrive + 130 }; cond.block = "av"; }
    } else if (opts.dissociated) {
      cond.av = { t0: arrive, t1: arrive + 130 }; cond.block = "av";
    }
  }
  // AF / AFL：心房亂跳，偶爾有一個衝動穿過 AV node 下傳
  if (!p && q && !q.junctional && VENT_MODE[q.morph] !== "ectopicV") cond.av = { t0: q.t - 110, t1: q.t - 30 };
  if (q && VENT_MODE[q.morph] !== "ectopicV") cond.his = cond.av && q.morph === "wpw" ? cond.av.t1 : q.t - 30;
  if (q && q.junctional) cond.his = q.t - 20;
  b.cond = cond;
  return b;
}

function mk(rhythm) {
  rhythm.beats.forEach(function (b) { withConduction(b, rhythm); });
  rhythm.beats.sort(function (a, b) { return beatStart(a) - beatStart(b); });
  return rhythm;
}

function beatStart(b) { return b.p ? b.p.t : b.qrs.t; }

/** 規則的竇性節律：pp（ms）、pr、QRS 型態、幾拍。 */
function regular(o) {
  var n = o.n || Math.max(4, Math.round(4800 / o.pp));
  var beats = [];
  for (var i = 0; i < n; i++) {
    var t = (o.start || 60) + i * o.pp;
    beats.push({
      p: o.noP ? null : { t: t, shape: o.pShape || "sinus", origin: o.pShape === "retro" ? "retro" : "sa" },
      qrs: { t: t + (o.pr || 160), morph: o.morph || "normal", junctional: o.junctional }
    });
  }
  return { L: n * o.pp, beats: beats };
}

var SEG_NAMES = { P: "P 波", PR: "PR 段", QRS: "QRS", ST: "ST 段", T: "T 波", TP: "舒張期" };

var DEFS = {
  nsr: function () { return regular({ pp: 800 }); },
  "sinus-brady": function () { return regular({ pp: 1200, n: 4 }); },
  "sinus-tachy": function () { return regular({ pp: 500, n: 10, pr: 140 }); },
  "sinus-arrhythmia": function () {
    var pps = [720, 640, 600, 640, 760, 920, 1040, 960, 840];
    return seqPP(pps, {});
  },
  "sinus-arrest": function () {
    // 竇房結突然停擺一段時間，停頓長度不是 PP 的整數倍
    return seqPP([800, 800, 2150, 800, 800], {});
  },
  "sa-block-2": function () {
    // 2° SA block type II：固定、固定、然後整拍消失，停頓剛好是兩倍 PP
    return seqPP([800, 800, 1600, 800, 800, 1600], {});
  },
  pac: function () {
    var r = { L: 0, beats: [] }, t = 60;
    [800, 800, 520, 900, 800, 800].forEach(function (pp, i) {
      var early = i === 3;
      r.beats.push({ p: { t: t, shape: early ? "ectopic" : "sinus", origin: early ? "ectopic" : "sa" }, qrs: { t: t + (early ? 150 : 160), morph: "normal" }, label: early ? "PAC" : null });
      t += pp;
    });
    r.L = t - 60;
    return r;
  },
  pjc: function () {
    var r = { L: 0, beats: [] }, t = 60;
    [800, 800, 560, 880, 800, 800].forEach(function (pp, i) {
      if (i === 3) r.beats.push({ p: { t: t + 100, shape: "retro", origin: "retro" }, qrs: { t: t + 160, morph: "normal", junctional: true }, label: "PJC" });
      else r.beats.push({ p: { t: t, shape: "sinus", origin: "sa" }, qrs: { t: t + 160, morph: "normal" } });
      t += pp;
    });
    r.L = t - 60;
    return r;
  },
  pvc: function () {
    // PVC 之後是完全代償性停頓：前後兩個竇性 P 波的距離剛好 = 2 × PP
    var r = { L: 4800, beats: [] };
    for (var i = 0; i < 6; i++) {
      var t = 60 + i * 800;
      if (i === 3) r.beats.push({ p: null, qrs: { t: t - 250, morph: "pvc" }, label: "PVC" });
      else r.beats.push({ p: { t: t, shape: "sinus", origin: "sa" }, qrs: { t: t + 160, morph: "normal" } });
    }
    return r;
  },
  bigeminy: function () {
    var r = { L: 4800, beats: [] };
    for (var i = 0; i < 6; i++) {
      var t = 60 + i * 800;
      if (i % 2) r.beats.push({ p: null, qrs: { t: t - 250, morph: "pvc" } });
      else r.beats.push({ p: { t: t, shape: "sinus", origin: "sa" }, qrs: { t: t + 160, morph: "normal" } });
    }
    return r;
  },
  avb1: function () { return regular({ pp: 900, pr: 300, n: 5 }); },
  mobitz1: function () {
    // Wenckebach 4:3：PR 160 → 260 → 320 → 掉拍，掉拍後 PR 回到最短
    var r = { L: 7200, beats: [] }, prs = [160, 260, 320, null];
    for (var i = 0; i < 8; i++) {
      var t = 60 + i * 900, pr = prs[i % 4];
      r.beats.push({ p: { t: t, shape: "sinus", origin: "sa" }, qrs: pr ? { t: t + pr, morph: "normal" } : null, blockAt: "av" });
    }
    return r;
  },
  mobitz2: function () {
    // Mobitz II 3:2：PR 固定，突然有一個 P 沒有下傳（卡在 His 以下）
    var r = { L: 5400, beats: [] };
    for (var i = 0; i < 6; i++) {
      var t = 60 + i * 900;
      r.beats.push({ p: { t: t, shape: "sinus", origin: "sa" }, qrs: i % 3 === 2 ? null : { t: t + 180, morph: "normal" }, blockAt: "his" });
    }
    return r;
  },
  avb3: function () {
    // 心房 80 bpm、心室由交界區逸搏 40 bpm，兩邊各跳各的
    var r = { L: 6000, beats: [], dissociated: true };
    for (var i = 0; i < 8; i++) r.beats.push({ p: { t: 60 + i * 750, shape: "sinus", origin: "sa" }, qrs: null });
    for (var j = 0; j < 4; j++) r.beats.push({ p: null, qrs: { t: 420 + j * 1500, morph: "normal", junctional: true } });
    return r;
  },
  rbbb: function () { return regular({ pp: 900, n: 5 }); },
  lbbb: function () { return regular({ pp: 900, n: 5 }); },
  wpw: function () { return regular({ pp: 900, n: 5, pr: 80 }); },
  lgl: function () { return regular({ pp: 900, n: 5, pr: 80 }); },
  junctional: function () { return regular({ pp: 1200, n: 4, pr: 60, pShape: "retro", junctional: true }); },
  idioventricular: function () { return regular({ pp: 1600, n: 3, noP: true, morph: "pvc" }); },
  afl: function () {
    // 心房 300 bpm（每 200 ms 一個 F 波），4:1 下傳 → 心室 75 bpm
    var r = { L: 4800, beats: [], atrial: "flutter" };
    for (var i = 0; i < 6; i++) r.beats.push({ p: null, qrs: { t: 150 + i * 800, morph: "normal" } });
    return r;
  },
  af: function () {
    var rnd = mulberry32(7), t = 100, beats = [];
    var rrs = [620, 910, 540, 780, 1040, 600, 700, 480, 860];
    rrs.forEach(function (rr) { beats.push({ p: null, qrs: { t: t, morph: "normal" } }); t += rr + Math.round(rnd() * 20); });
    return { L: t - 100, beats: beats, atrial: "fib" };
  },
  eat: function () { return regular({ pp: 420, n: 12, pr: 140, pShape: "ectopic" }); },
  mat: function () {
    var shapes = ["ectopic", "ectopic2", "ectopic3", "sinus", "ectopic2", "ectopic", "ectopic3", "ectopic2", "sinus", "ectopic3"];
    var pps = [520, 440, 600, 480, 560, 420, 540, 460, 580, 500];
    var r = { L: 0, beats: [] }, t = 60;
    pps.forEach(function (pp, i) {
      r.beats.push({ p: { t: t, shape: shapes[i], origin: "ectopic" }, qrs: { t: t + 140 + (i % 3) * 20, morph: "normal" } });
      t += pp;
    });
    r.L = t - 60;
    return r;
  },
  psvt: function () { return regular({ pp: 330, n: 15, noP: true }); },
  vt: function () { return regular({ pp: 350, n: 14, noP: true, morph: "vt" }); },
  vf: function () { return { L: 4800, beats: [], ventricular: "vf" }; },
  asystole: function () { return { L: 4800, beats: [], ventricular: "asystole" }; },
  "mi-evolution": function () {
    // 同一個導程在 MI 不同時期的樣子：高聳 T → ST 上升 → Q 波＋T 倒置 → 只剩 Q 波
    var r = regular({ pp: 1500, n: 4, start: 400 });
    var stages = [
      [{ tAmp: 2.6 }, "① T 波高聳"],
      [{ st: 0.35, stShape: "convex", tAmp: 1.3 }, "② ST 上升"],
      [{ q: -0.35, st: 0.1, tAmp: -0.9 }, "③ Q 波＋T 倒置"],
      [{ q: -0.45 }, "④ 只剩 Q 波"]
    ];
    r.beats.forEach(function (b, i) { b.mods = stages[i][0]; b.label = stages[i][1]; });
    return r;
  },
  tdp: function () { return { L: 4800, beats: [], ventricular: "tdp" }; },

  // 以下只做單導程示意（ST-T、電解質），節奏都是正常竇性
  "stemi": function () { return regular({ pp: 900, n: 5 }); },
  "st-depression": function () { return regular({ pp: 800 }); },
  "old-mi": function () { return regular({ pp: 900, n: 5 }); },
  "hyperk": function () { return regular({ pp: 800 }); },
  "hypok": function () { return regular({ pp: 1000, n: 5 }); },
  "hypoca": function () { return regular({ pp: 1000, n: 5 }); },
  "hyperca": function () { return regular({ pp: 900, n: 5 }); },
  "pericarditis": function () { return regular({ pp: 800 }); },
  "digoxin": function () { return regular({ pp: 900, n: 5 }); },
  "rae": function () { return regular({ pp: 800, pShape: "rae" }); },
  "lae": function () { return regular({ pp: 800, pShape: "lae", pr: 180 }); }
};

// 各節律的 QRS 型態與 ST-T 修飾
var MODS = {
  rbbb: { morph: "rbbb" }, lbbb: { morph: "lbbb" }, wpw: { morph: "wpw" },
  stemi: { st: 0.3, stShape: "convex", tAmp: 1.4 },
  "st-depression": { st: -0.18, tAmp: -0.5 },
  "old-mi": { q: -0.45, tAmp: -0.6 },
  hyperk: { tPeaked: 0.95 },
  hypok: { tAmp: 0.3, u: 0.14, st: -0.04 },
  hypoca: { qt: 520 },
  hyperca: { qt: 300 },
  pericarditis: { st: 0.16, stShape: "concave", pr: -0.06 },
  digoxin: { st: -0.14, stShape: "scoop", tAmp: 0.4, qt: 330 }
};

function seqPP(pps, o) {
  var r = { L: 0, beats: [] }, t = 60;
  pps.forEach(function (pp) {
    r.beats.push({ p: { t: t, shape: "sinus", origin: "sa" }, qrs: { t: t + (o.pr || 160), morph: "normal" } });
    t += pp;
  });
  r.L = t - 60;
  return r;
}

var cache = {};

/** 取得節律（有快取）。 */
export function getRhythm(id) {
  if (cache[id]) return cache[id];
  var make = DEFS[id];
  if (!make) throw new Error("未知的節律：" + id);
  var r = make();
  var mod = MODS[id] || {};
  r.id = id;
  r.mods = mod;
  if (mod.morph) r.beats.forEach(function (b) { if (b.qrs && b.qrs.morph === "normal") b.qrs.morph = mod.morph; });
  r.atrial = r.atrial || "normal";
  r.ventricular = r.ventricular || "normal";
  mk(r);
  prepare(r);
  cache[id] = r;
  return r;
}

export var RHYTHM_IDS = Object.keys(DEFS);

/** 算出每拍的 T 波位置（依心跳速率調整 QT）與循環邊界的鄰拍。 */
function prepare(r) {
  var qrsBeats = r.beats.filter(function (b) { return b.qrs; });
  qrsBeats.forEach(function (b, i) {
    var next = qrsBeats[(i + 1) % qrsBeats.length];
    var rr = next.qrs.t - b.qrs.t;
    if (rr <= 0) rr += r.L;
    var qt = r.mods.qt || Math.min(420, Math.max(260, 400 * Math.sqrt(rr / 1000)));
    if (b.qrs.morph === "pvc" || b.qrs.morph === "vt") qt = Math.min(qt + 30, rr - 30);
    b.qrs.rr = rr;
    b.qrs.qt = qt;
    b.qrs.dur = qrsDur(b.qrs.morph);
    b.qrs.tPeak = qt - 75;
    b.qrs.tEnd = qt;
  });
  r.beats.forEach(function (b) { if (b.p) b.p.dur = pDur(b.p.shape); });
  // 事先準備 AF 的 f 波與 VF 的隨機相位（整數倍頻率 → 可以無縫循環）
  var rnd = mulberry32(r.id.length * 97 + 13);
  r.noise = [];
  for (var k = 0; k < 6; k++) r.noise.push({ n: Math.round(r.L / 1000 * (4 + rnd() * 4)), ph: rnd() * 6.283, a: 0.5 + rnd() * 0.5 });
}

/* ------------------------------ 取樣 ------------------------------ */

function sumComps(comps, t) {
  var v = 0;
  for (var i = 0; i < comps.length; i++) {
    var c = comps[i];
    v += g(t, c[0], c[1], c[2], c[3]);
  }
  return v;
}

function beatValue(r, b, lead, dt) {
  var v = 0, mods = b.mods ? Object.assign({}, r.mods, b.mods) : r.mods;
  if (b.p) {
    var tp = dt - (b.p.t - beatStart(b));
    if (tp > -150 && tp < 250) v += sumComps(P_SHAPES[b.p.shape][lead], tp);
    // 心包膜炎的 PR segment 壓低
    if (mods.pr && b.qrs) {
      var prEnd = b.qrs.t - b.p.t;
      v += mods.pr * smooth(b.p.dur - 10, b.p.dur + 10, tp) * (1 - smooth(prEnd - 15, prEnd, tp));
    }
  }
  if (b.qrs) {
    var q = b.qrs, tq = dt - (q.t - beatStart(b));
    if (tq < -200 || tq > 900) return v;
    var tpl = QRS[q.morph];
    v += sumComps(tpl[lead], tq);
    if (mods.q && q.morph === "normal") v += g(tq, mods.q, 18, 10) - g(tq, -0.08, 12, 5);
    var tA = tpl.t[lead];
    if (mods.tAmp) tA = lead === "II" ? tA * mods.tAmp : tA;
    if (mods.tPeaked && lead !== "V1") v += g(tq, mods.tPeaked, q.tPeak, 32, 30);
    else v += g(tq, tA, q.tPeak, 58, 40);
    if (mods.u) v += g(tq, mods.u, q.tEnd + 90, 38);
    if (mods.st) {
      var j = q.dur;
      var on = smooth(j - 12, j + 4, tq), off = 1 - smooth(q.tPeak - 10, q.tEnd + 20, tq);
      var shape = 1;
      if (mods.stShape === "convex") shape = 1 + 0.25 * Math.sin(Math.PI * Math.min(1, Math.max(0, (tq - j) / (q.tPeak - j))));
      if (mods.stShape === "concave") shape = 0.75 + 0.25 * smooth(j, q.tPeak, tq);
      if (mods.stShape === "scoop") shape = Math.sin(Math.PI * Math.min(1, Math.max(0, (tq - j + 10) / (q.tEnd - j))));
      v += mods.st * on * off * shape;
    }
  }
  return v;
}

/** 某導程在時間 t（ms，會自動取循環）的電位。 */
export function sample(r, lead, t) {
  var L = r.L;
  t = ((t % L) + L) % L;
  var v = 0;
  for (var i = 0; i < r.beats.length; i++) {
    var b = r.beats[i], s = beatStart(b);
    for (var k = -1; k <= 1; k++) {
      var dt = t - (s + k * L);
      if (dt > -300 && dt < 1300) v += beatValue(r, b, lead, dt);
    }
  }
  var lf = lead === "II" ? 1 : lead === "V1" ? 0.8 : 0.5;
  if (r.atrial === "flutter") {
    // 鋸齒波：每 200 ms 一次，緩降急升（下方導程是負向的）
    var ph = (t % 200) / 200;
    var saw = ph < 0.75 ? -ph / 0.75 : -1 + (ph - 0.75) / 0.25;
    v += (lead === "V1" ? -0.12 : 0.2 * lf) * (saw + 0.5);
  }
  if (r.atrial === "fib") {
    for (var n = 0; n < 4; n++) {
      var z = r.noise[n];
      v += 0.028 * lf * z.a * Math.sin(2 * Math.PI * z.n * 1.6 * t / L + z.ph);
    }
  }
  if (r.ventricular === "asystole") {
    // 幾乎是一直線，只有一點基線飄移
    v += 0.03 * Math.sin(2 * Math.PI * 2 * t / L) + 0.012 * Math.sin(2 * Math.PI * 7 * t / L + 1);
  }
  if (r.ventricular === "vf" || r.ventricular === "tdp") {
    var w = 0;
    for (var m = 0; m < 3; m++) {
      var zz = r.noise[m];
      var n2 = r.ventricular === "tdp" ? Math.round(L / 1000 * 4) : zz.n;
      w += zz.a * Math.sin(2 * Math.PI * n2 * t / L + zz.ph + (r.ventricular === "tdp" ? 0 : Math.sin(2 * Math.PI * 3 * t / L) * 2));
    }
    if (r.ventricular === "tdp") {
      // 紡錘狀：振幅慢慢變大又變小，軸向來回扭轉
      var env = Math.sin(2 * Math.PI * 2 * t / L);
      v += 1.5 * env * Math.abs(env) * Math.sin(2 * Math.PI * Math.round(L / 1000 * 4.8) * t / L);
    } else {
      var env2 = 0.6 + 0.4 * Math.sin(2 * Math.PI * 2 * t / L + 1);
      v += 0.35 * env2 * w;
    }
  }
  return v;
}

/* ------------------------------ 時間軸查詢 ------------------------------ */

/** 時間 t 目前在哪一段（P / PR / QRS / ST / T / TP）。 */
export function segmentAt(r, t) {
  var L = r.L;
  t = ((t % L) + L) % L;
  if (r.ventricular !== "normal") return { seg: r.ventricular === "asystole" ? "TP" : "QRS" };
  var best = null;
  for (var i = 0; i < r.beats.length; i++) {
    var b = r.beats[i];
    for (var k = -1; k <= 0; k++) {
      var off = k * L;
      if (b.qrs) {
        var q0 = b.qrs.t + off;
        var st1 = q0 + b.qrs.tPeak - 60, t1 = q0 + b.qrs.tEnd + 20;
        if (t >= q0 && t < q0 + b.qrs.dur) return { seg: "QRS", beat: b, span: [q0, q0 + b.qrs.dur] };
        if (t >= q0 + b.qrs.dur && t < st1) best = { seg: "ST", beat: b, span: [q0 + b.qrs.dur, st1] };
        if (t >= st1 && t < t1) best = { seg: "T", beat: b, span: [st1, t1] };
      }
      if (b.p) {
        var p0 = b.p.t + off;
        if (t >= p0 && t < p0 + b.p.dur) return { seg: "P", beat: b, span: [p0, p0 + b.p.dur] };
        if (b.qrs && b.qrs.t > b.p.t && t >= p0 + b.p.dur && t < b.qrs.t + off) return { seg: "PR", beat: b, span: [p0 + b.p.dur, b.qrs.t + off] };
        if (!b.qrs && !r.dissociated && t >= p0 + b.p.dur && t < p0 + 500 && !best) best = { seg: "blocked", beat: b, span: [p0, p0 + 500] };
      }
    }
  }
  return best || { seg: "TP" };
}

/** 下一段的開始時間（逐段前進用）。 */
export function nextBoundary(r, t) {
  var marks = [];
  r.beats.forEach(function (b) {
    if (b.p) marks.push(b.p.t, b.p.t + b.p.dur);
    if (b.qrs) marks.push(b.qrs.t, b.qrs.t + b.qrs.dur, b.qrs.t + b.qrs.tPeak - 60, b.qrs.t + b.qrs.tEnd + 20);
  });
  if (!marks.length) return t + 300;
  marks.sort(function (a, b) { return a - b; });
  var L = r.L, base = Math.floor(t / L) * L, local = t - base;
  for (var i = 0; i < marks.length; i++) if (marks[i] > local + 1) return base + marks[i];
  return base + L + marks[0];
}

export { SEG_NAMES, beatStart };
