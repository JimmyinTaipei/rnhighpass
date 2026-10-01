/**
 * 心電向量運算核心：節點激動時間 → 每個節點的膜電位 → 偶極子 → 導程電位。
 * 不碰 DOM，網頁與 Node 測試（scripts/ekg/test-vector.mjs）共用。
 *
 * 模型（教學用的簡化版）：
 *   1. 激動時間：在節點圖上做最短路徑（Dijkstra），邊的時間 = 距離 ÷ 傳導速度。
 *      心房從 SA node 出發；心室由束支末端（左側中膈、LAF、LPF、RBB）在各自的時間點起搏，
 *      束支阻滯就是拿掉對應的起搏點。
 *   2. 復極：動作電位時程（APD）心內膜長、心外膜短，心尖短、心底長 → 復極由心外膜、心尖先開始，
 *      T 波才會和 QRS 同方向。
 *   3. 導程：均勻無限導體中的偶極子，φ(電極) = −Σ 體積 · ∇Vm · (x_電極 − x) / r³。
 *      ∇Vm 用鄰居的最小平方法估計，整個式子對 Vm 是線性的，所以每個電極先算好一組權重 K，
 *      之後每個時間點只要一次內積。
 *   4. 12 導程：Wilson 中心端 = (RA + LA + LL) / 3。肢體導程與胸前導程各用一個校正係數換成 mV
 *      （無限導體裡肢體電極比胸前電極遠很多，真實人體的胸廓邊界效應這裡沒有算）。
 *
 * 單位：mm、ms、mV。座標 +x 病人左、+y 頭側、+z 前方。
 */

export var LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
var ELECTRODES = ["RA", "LA", "LL", "V1", "V2", "V3", "V4", "V5", "V6"];

export var DEFAULTS = {
  hr: 75,                 // bpm
  pr: 160,                // ms，P 波起點到 QRS 起點
  block: "none",          // none | lbbb | rbbb | lafb | lpfb
  cvAtrial: 0.9,          // mm/ms（= m/s）
  cvBachmann: 1.8,
  cvVent: 0.6,            // 沿著心壁（順纖維方向為主）
  cvTrans: 0.3,           // 穿過心壁（跨纖維方向）
  cvFec: 1.8,             // 心內膜下快速層（代表浦金氏纖維網）
  cvBundle: 3.0,          // 希氏束與束支
  apdVent: 235,           // 心外膜、心尖的基準 APD（ms，心率 75 時）
  apdEndoExtra: 30,       // 心內膜比心外膜長
  apdBaseExtra: 20,       // 心底比心尖長
  apdAtrial: 150
};

/* ------------------------------ 載入節點圖 ------------------------------ */

export function createModel(data) {
  var n = data.vol.length;
  var pos = Float64Array.from(data.pos);
  var region = Uint8Array.from(data.region);
  var flags = Uint8Array.from(data.flags);
  var vol = Float64Array.from(data.vol);
  var trans = Float64Array.from(data.trans);
  var ab = Float64Array.from(data.apicobasal);
  var wall = Float64Array.from(data.wall);

  // 鄰接表（CSR）
  var e = data.edges, m = e.length / 2;
  var deg = new Uint32Array(n);
  for (var k = 0; k < m; k++) { deg[e[2 * k]]++; deg[e[2 * k + 1]]++; }
  var off = new Uint32Array(n + 1);
  for (var i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
  var nbr = new Uint32Array(2 * m), len = new Float64Array(2 * m), fill = off.slice(0, n);
  for (k = 0; k < m; k++) {
    var a = e[2 * k], b = e[2 * k + 1];
    var d = dist(pos, a, b);
    nbr[fill[a]] = b; len[fill[a]++] = d;
    nbr[fill[b]] = a; len[fill[b]++] = d;
  }

  var model = {
    n: n, pos: pos, region: region, flags: flags, vol: vol, trans: trans, ab: ab, wall: wall,
    off: off, nbr: nbr, len: len, tcos: transmuralCos(off, nbr, len, trans, wall, n), seeds: data.seeds, bundle: data.bundle_mm,
    electrodes: data.electrodes, landmarks: data.landmarks, paths: data.paths
  };
  model.grad = gradientOperator(model);
  model.K = {};
  ELECTRODES.forEach(function (name) { model.K[name] = leadWeights(model, data.electrodes[name]); });
  model.D = dipoleWeights(model);
  return model;
}

/** 每條邊「穿過心壁」成分的 cos：|Δtransmural × 壁厚| ÷ 邊長。 */
function transmuralCos(off, nbr, len, trans, wall, n) {
  var c = new Float64Array(nbr.length);
  for (var i = 0; i < n; i++) {
    for (var q = off[i]; q < off[i + 1]; q++) {
      var j = nbr[q], w = (wall[i] + wall[j]) / 2;
      c[q] = Math.min(1, Math.abs(trans[j] - trans[i]) * w / len[q]);
    }
  }
  return c;
}

function dist(p, a, b) {
  var dx = p[3 * a] - p[3 * b], dy = p[3 * a + 1] - p[3 * b + 1], dz = p[3 * a + 2] - p[3 * b + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** 每個節點 ∇V ≈ Σ_j g_ij (V_j − V_i)，g_ij = M⁻¹ (x_j − x_i)，M = Σ (x_j − x_i)(x_j − x_i)ᵀ。 */
function gradientOperator(md) {
  var g = new Float64Array(3 * md.nbr.length), p = md.pos;
  for (var i = 0; i < md.n; i++) {
    var M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var q = md.off[i]; q < md.off[i + 1]; q++) {
      var j = md.nbr[q];
      var dx = p[3 * j] - p[3 * i], dy = p[3 * j + 1] - p[3 * i + 1], dz = p[3 * j + 2] - p[3 * i + 2];
      M[0] += dx * dx; M[1] += dx * dy; M[2] += dx * dz;
      M[4] += dy * dy; M[5] += dy * dz; M[8] += dz * dz;
    }
    M[3] = M[1]; M[6] = M[2]; M[7] = M[5];
    var Mi = inv3(M);
    for (q = md.off[i]; q < md.off[i + 1]; q++) {
      j = md.nbr[q];
      dx = p[3 * j] - p[3 * i]; dy = p[3 * j + 1] - p[3 * i + 1]; dz = p[3 * j + 2] - p[3 * i + 2];
      g[3 * q] = Mi[0] * dx + Mi[1] * dy + Mi[2] * dz;
      g[3 * q + 1] = Mi[3] * dx + Mi[4] * dy + Mi[5] * dz;
      g[3 * q + 2] = Mi[6] * dx + Mi[7] * dy + Mi[8] * dz;
    }
  }
  return g;
}

function inv3(m) {
  var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], k = m[8];
  var A = e * k - f * h, B = -(d * k - f * g), C = d * h - e * g;
  var det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-9) det = det < 0 ? -1e-9 : 1e-9;
  var s = 1 / det;
  return [A * s, -(b * k - c * h) * s, (b * f - c * e) * s,
          B * s, (a * k - c * g) * s, -(a * f - c * d) * s,
          C * s, -(a * h - b * g) * s, (a * e - b * d) * s];
}

/** 電極權重：φ_e = Σ_k K_k V_k，K 由 −vol_i · (∇V_i · (x_e − x_i)/r³) 展開。 */
function leadWeights(md, xe) {
  var K = new Float64Array(md.n), p = md.pos, g = md.grad;
  for (var i = 0; i < md.n; i++) {
    var rx = xe[0] - p[3 * i], ry = xe[1] - p[3 * i + 1], rz = xe[2] - p[3 * i + 2];
    var r2 = rx * rx + ry * ry + rz * rz, r3 = r2 * Math.sqrt(r2);
    var zx = rx / r3, zy = ry / r3, zz = rz / r3;
    for (var q = md.off[i]; q < md.off[i + 1]; q++) {
      var c = -md.vol[i] * (g[3 * q] * zx + g[3 * q + 1] * zy + g[3 * q + 2] * zz);
      K[md.nbr[q]] += c;
      K[i] -= c;
    }
  }
  return K;
}

/** 心臟總向量 D = Σ −vol ∇Vm，同樣展開成每個節點的 3 個權重（方向 = 電流前進方向）。 */
function dipoleWeights(md) {
  var D = new Float64Array(3 * md.n), g = md.grad;
  for (var i = 0; i < md.n; i++) {
    for (var q = md.off[i]; q < md.off[i + 1]; q++) {
      var j = md.nbr[q];
      for (var c = 0; c < 3; c++) {
        var w = -md.vol[i] * g[3 * q + c];
        D[3 * j + c] += w;
        D[3 * i + c] -= w;
      }
    }
  }
  return D;
}

/* ------------------------------ 激動與復極 ------------------------------ */

/** 多起點 Dijkstra。starts = [[節點, 時間], ...]；allow(i) 決定哪些節點可走；cv(i, j) 傳導速度。 */
function dijkstra(md, starts, allow, cv) {
  var t = new Float64Array(md.n).fill(Infinity);
  var heap = new MinHeap();
  starts.forEach(function (s) { if (s[1] < t[s[0]]) { t[s[0]] = s[1]; heap.push(s[1], s[0]); } });
  while (heap.size) {
    var top = heap.pop(), i = top[1];
    if (top[0] > t[i]) continue;
    for (var q = md.off[i]; q < md.off[i + 1]; q++) {
      var j = md.nbr[q];
      if (!allow(j)) continue;
      var tj = t[i] + md.len[q] / cv(i, j, q);
      if (tj < t[j]) { t[j] = tj; heap.push(tj, j); }
    }
  }
  return t;
}

function MinHeap() { this.k = []; this.v = []; this.size = 0; }
MinHeap.prototype.push = function (key, val) {
  var k = this.k, v = this.v, i = this.size++;
  k[i] = key; v[i] = val;
  while (i > 0) {
    var p = (i - 1) >> 1;
    if (k[p] <= k[i]) break;
    swap(k, v, i, p); i = p;
  }
};
MinHeap.prototype.pop = function () {
  var k = this.k, v = this.v, out = [k[0], v[0]], n = --this.size;
  k[0] = k[n]; v[0] = v[n];
  var i = 0;
  for (;;) {
    var l = 2 * i + 1, r = l + 1, s = i;
    if (l < n && k[l] < k[s]) s = l;
    if (r < n && k[r] < k[s]) s = r;
    if (s === i) break;
    swap(k, v, i, s); i = s;
  }
  return out;
};
function swap(k, v, a, b) { var t = k[a]; k[a] = k[b]; k[b] = t; t = v[a]; v[a] = v[b]; v[b] = t; }

/**
 * 算出一拍的時間表。回傳：
 *   at / rt：每個節點的激動、復極時間（ms，SA node 放電 = 0）
 *   events：AV node、希氏束、各束支到達時間；rr：一拍長度
 */
export function simulate(md, opts) {
  var o = Object.assign({}, DEFAULTS, opts || {});
  var rr = 60000 / o.hr;
  var vent = function (i) { return md.region[i] < 2; };
  var atrial = function (i) { return md.region[i] >= 2; };

  // 心房
  var atA = dijkstra(md, [[md.seeds.SA, 0]], atrial, function (i, j) {
    return (md.flags[i] & 2) && (md.flags[j] & 2) ? o.cvBachmann : o.cvAtrial;
  });

  // 房室結 → 希氏束 → 束支：PR 決定心室最早被激動的時間，往回推各段
  var tAVN = atA[md.seeds.AVN];
  var tSeptal = o.pr;                                        // 左側中膈最早
  var tBif = tSeptal - 3;
  var tHis = tBif - md.bundle.His / o.cvBundle;
  var arrive = {
    LAF: tBif + md.bundle.LAF / o.cvBundle,
    LPF: tBif + md.bundle.LPF / o.cvBundle,
    RBB: tBif + md.bundle.RBB / o.cvBundle,
    RVSeptal: tBif + md.bundle.RVSeptal / o.cvBundle,      // 右束支沿途激動的右側中膈面
    Septal: tSeptal
  };
  var blocked = {
    lbbb: ["Septal", "LAF", "LPF"], rbbb: ["RBB", "RVSeptal"], lafb: ["LAF"], lpfb: ["LPF"], none: []
  }[o.block] || [];
  var starts = [];
  Object.keys(arrive).forEach(function (k) {
    if (blocked.indexOf(k) < 0) starts.push([md.seeds[k], arrive[k]]);
  });
  // 浦金氏網（FEC 快速層）只能由自己的束支進入：
  //   束支阻滯 → 那一側的快速層當一般心肌；
  //   分支阻滯 → 那條分支負責的區域（左心室心內膜上離它比離其他起點近的部分）當一般心肌。
  var slowSide = { lbbb: 0, rbbb: 1 }[o.block];
  var slowFascicle = { lafb: "LAF", lpfb: "LPF" }[o.block];
  var territory = slowFascicle ? fascicleTerritory(md, slowFascicle) : null;
  var fast = function (i) {
    return (md.flags[i] & 1) && md.region[i] !== slowSide && !(territory && territory[i]);
  };
  // 心肌異向傳導：穿壁方向慢（橢圓速度面），快速層內不分方向
  var atV = dijkstra(md, starts, vent, function (i, j, q) {
    if (fast(i) && fast(j)) return o.cvFec;
    var c = md.tcos[q], s2 = 1 - c * c;
    return 1 / Math.sqrt(c * c / (o.cvTrans * o.cvTrans) + s2 / (o.cvVent * o.cvVent));
  });

  // 復極：APD 依位置調整，再依心率（Bazett，√RR）縮放
  var scale = Math.sqrt(rr / 800);
  var at = new Float64Array(md.n), rt = new Float64Array(md.n);
  for (var i = 0; i < md.n; i++) {
    if (vent(i)) {
      at[i] = atV[i];
      rt[i] = at[i] + scale * (o.apdVent + o.apdEndoExtra * (1 - md.trans[i]) + o.apdBaseExtra * md.ab[i]);
    } else {
      at[i] = atA[i];
      rt[i] = at[i] + scale * o.apdAtrial;
    }
  }
  return {
    at: at, rt: rt, rr: rr, opts: o,
    events: { AVN: tAVN, His: tHis, Bifurcation: tBif, branches: arrive, blocked: blocked }
  };
}

/** 左心室心內膜節點中，離 name 這個起搏點比離其他左側起搏點近的那些。 */
function fascicleTerritory(md, name) {
  var others = ["LAF", "LPF", "Septal"], p = md.pos, mark = new Uint8Array(md.n);
  var d2 = function (i, s) {
    var j = md.seeds[s], dx = p[3 * i] - p[3 * j], dy = p[3 * i + 1] - p[3 * j + 1], dz = p[3 * i + 2] - p[3 * j + 2];
    return dx * dx + dy * dy + dz * dz;
  };
  for (var i = 0; i < md.n; i++) {
    if (md.region[i] !== 0 || !(md.flags[i] & 1)) continue;
    var best = others.reduce(function (b, s) { return d2(i, s) < d2(i, b) ? s : b; }, others[0]);
    mark[i] = best === name ? 1 : 0;
  }
  return mark;
}

/* ------------------------------ 膜電位與導程 ------------------------------ */

var UP_W = 2.5;      // 去極化上升的時間寬度（ms）
var DOWN_W = 14;     // 復極下降的時間寬度（ms）

/** 節點在時間 t 的膜電位（0 = 靜止、1 = 平台期）。 */
export function vm(sim, i, t) {
  var a = sim.at[i];
  if (!isFinite(a)) return 0;
  var up = 1 / (1 + Math.exp(-(t - a) / UP_W));
  var down = 1 / (1 + Math.exp(-(t - sim.rt[i]) / DOWN_W));
  return up * (1 - down);
}

/**
 * 整拍的 12 導程（每 dt ms 一點）與心臟向量。
 * cal = { limb, chest } 是換成 mV 的係數；沒給就用這一拍自己校正（正常拍用）。
 */
export function ecg(md, sim, dt, cal) {
  dt = dt || 1;
  var ns = Math.ceil(sim.rr / dt), n = md.n;
  var raw = {}, V = new Float64Array(n);
  ELECTRODES.forEach(function (e) { raw[e] = new Float64Array(ns); });
  var vec = new Float64Array(3 * ns);
  for (var s = 0; s < ns; s++) {
    var t = s * dt;
    for (var i = 0; i < n; i++) V[i] = vm(sim, i, t);
    for (var k = 0; k < ELECTRODES.length; k++) {
      var K = md.K[ELECTRODES[k]], sum = 0;
      for (i = 0; i < n; i++) sum += K[i] * V[i];
      raw[ELECTRODES[k]][s] = sum;
    }
    var dx = 0, dy = 0, dz = 0, D = md.D;
    for (i = 0; i < n; i++) { dx += D[3 * i] * V[i]; dy += D[3 * i + 1] * V[i]; dz += D[3 * i + 2] * V[i]; }
    vec[3 * s] = dx; vec[3 * s + 1] = dy; vec[3 * s + 2] = dz;
  }
  // 扣掉靜止時的基線（t = 0 時全部靜止，理論上是 0，數值上保險）
  var leads = {};
  var RA = raw.RA, LA = raw.LA, LL = raw.LL;
  var lead = function (f) { var out = new Float64Array(ns); for (var s = 0; s < ns; s++) out[s] = f(s); return out; };
  leads.I = lead(function (s) { return LA[s] - RA[s]; });
  leads.II = lead(function (s) { return LL[s] - RA[s]; });
  leads.III = lead(function (s) { return LL[s] - LA[s]; });
  leads.aVR = lead(function (s) { return RA[s] - (LA[s] + LL[s]) / 2; });
  leads.aVL = lead(function (s) { return LA[s] - (RA[s] + LL[s]) / 2; });
  leads.aVF = lead(function (s) { return LL[s] - (RA[s] + LA[s]) / 2; });
  for (var v = 1; v <= 6; v++) {
    (function (x) { leads["V" + v] = lead(function (s) { return x[s] - (RA[s] + LA[s] + LL[s]) / 3; }); })(raw["V" + v]);
  }
  if (!cal) cal = calibrate(leads, sim);
  LEADS.forEach(function (L) {
    var k = /^V/.test(L) ? cal.chest : cal.limb, x = leads[L];
    for (var s = 0; s < ns; s++) x[s] *= k;
  });
  return { leads: leads, vector: vec, dt: dt, n: ns, cal: cal };
}

/** 校正：讓正常拍 II 導程 QRS 峰對峰 ≈ 1.4 mV、V2 ≈ 2.4 mV（成人常見值）。 */
function calibrate(leads, sim) {
  var q0 = Math.floor(sim.opts.pr), q1 = Math.floor(sim.opts.pr + 120);
  var p2p = function (x) {
    var lo = Infinity, hi = -Infinity;
    for (var s = q0; s < Math.min(q1, x.length); s++) { if (x[s] < lo) lo = x[s]; if (x[s] > hi) hi = x[s]; }
    return hi - lo;
  };
  return { limb: 1.4 / p2p(leads.II), chest: 2.4 / p2p(leads.V2) };
}
