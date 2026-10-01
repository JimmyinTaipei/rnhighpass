/**
 * 3D 互動心臟的真實模型：Rodero 等人 CEMRG 四腔心（CT，CC BY 4.0，健康受試者 FC9），
 * 由 scripts/ekg/heart-prep.py（Python）＋ heart-blender.py（Blender）產生。
 *
 *   assets/models/ekg/heart.glb        各心腔、瓣膜、大血管、冠狀動脈的表面（公尺）
 *   assets/data/ekg/heart-nodes.json   約 1.2 萬個心肌節點與相鄰關係、傳導路徑、標記點（毫米）
 *
 * 這裡把它們換成 heart3d.js 用的場景單位（1 單位 = 5 cm，和原本的示意模型差不多大），
 * 並算出每種活化模式下每個頂點的延遲：沿著心肌走最短路徑（不會穿過心腔），
 * 時間長度再縮放到和 rhythms.js 的波形一致（P 100 ms、QRS 90 ms …）。
 *
 * 座標：+x 病人左側、+y 頭側、+z 前方。
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/GLTFLoader.js";

var GLB_URL = "/assets/models/ekg/heart.glb";
var DATA_URL = "/assets/data/ekg/heart-nodes.json";
export var MM = 1 / 50;                     // 毫米 → 場景單位

var CV = { atrial: 0.9, bachmann: 1.8, vent: 0.6, trans: 0.3, fec: 1.8 };   // mm/ms

/** 載入模型，回傳幾何、傳導路徑、標記點與各模式的頂點延遲。 */
export function loadRealHeart() {
  var glb = new Promise(function (res, rej) { new GLTFLoader().load(GLB_URL, res, undefined, rej); });
  var data = fetch(DATA_URL).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  return Promise.all([glb, data]).then(function (r) { return build(r[0].scene, r[1]); });
}

function build(scene, data) {
  scene.updateMatrixWorld(true);
  var toUnits = new THREE.Matrix4().makeScale(1000 * MM, 1000 * MM, 1000 * MM);
  var meshes = {};
  scene.traverse(function (o) {
    if (!o.isMesh) return;
    var g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toUnits, o.matrixWorld));
    if (!g.attributes.normal) g.computeVertexNormals();
    meshes[o.name] = g;
  });

  var v3 = function (a) { return new THREE.Vector3(a[0] * MM, a[1] * MM, a[2] * MM); };
  var lm = {};
  Object.keys(data.landmarks).forEach(function (k) { lm[k] = v3(data.landmarks[k]); });
  var paths = {};
  Object.keys(data.paths).forEach(function (k) { paths[k] = data.paths[k].map(v3); });

  var graph = makeGraph(data);
  var chambers = { lv: meshes.LV, rv: meshes.RV, ra: meshes.RA, la: meshes.LA };
  var map = {};
  Object.keys(chambers).forEach(function (k) {
    map[k] = vertexNodes(chambers[k], graph, k === "ra" || k === "la");
  });

  return {
    geos: chambers,
    vessels: [meshes.Aorta, meshes.PulmArtery].filter(Boolean),
    valves: ["MitralValve", "TricuspidValve", "AorticValve", "PulmonaryValve", "AVPlane"].map(function (k) { return meshes[k]; }).filter(Boolean),
    coronary: Object.keys(meshes).filter(function (k) { return /^Coronary_/.test(k); }).map(function (k) { return meshes[k]; }),
    landmarks: lm,
    paths: paths,
    patterns: buildPatterns(graph, data.seeds, chambers, map, lm)
  };
}

/* ------------------------------ 節點圖 ------------------------------ */

function makeGraph(d) {
  var n = d.region.length, e = d.edges, m = e.length / 2, pos = d.pos;
  var deg = new Uint32Array(n);
  for (var k = 0; k < m; k++) { deg[e[2 * k]]++; deg[e[2 * k + 1]]++; }
  var off = new Uint32Array(n + 1);
  for (var i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
  var nbr = new Uint32Array(2 * m), len = new Float32Array(2 * m), tcos = new Float32Array(2 * m), fill = off.slice(0, n);
  for (k = 0; k < m; k++) {
    var a = e[2 * k], b = e[2 * k + 1];
    var dx = pos[3 * a] - pos[3 * b], dy = pos[3 * a + 1] - pos[3 * b + 1], dz = pos[3 * a + 2] - pos[3 * b + 2];
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // 穿過心壁的成分（心室的穿壁傳導較慢）
    var c = Math.min(1, Math.abs(d.trans[a] - d.trans[b]) * (d.wall[a] + d.wall[b]) / 2 / l);
    nbr[fill[a]] = b; len[fill[a]] = l; tcos[fill[a]++] = c;
    nbr[fill[b]] = a; len[fill[b]] = l; tcos[fill[b]++] = c;
  }
  return { n: n, pos: pos, region: d.region, flags: d.flags, off: off, nbr: nbr, len: len, tcos: tcos };
}

/** 多起點最短路徑。starts = [[節點, 時間]]；allow(i)；cv(i, j, q) 回傳速度（mm/ms）。 */
function dijkstra(g, starts, allow, cv) {
  var t = new Float32Array(g.n).fill(Infinity), hk = [], hv = [], size = 0;
  var push = function (key, val) {
    var i = size++;
    hk[i] = key; hv[i] = val;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (hk[p] <= hk[i]) break;
      var tk = hk[p]; hk[p] = hk[i]; hk[i] = tk; var tv = hv[p]; hv[p] = hv[i]; hv[i] = tv; i = p;
    }
  };
  var pop = function () {
    var out = hv[0], key = hk[0];
    size--; hk[0] = hk[size]; hv[0] = hv[size];
    var i = 0;
    for (;;) {
      var l = 2 * i + 1, r = l + 1, s = i;
      if (l < size && hk[l] < hk[s]) s = l;
      if (r < size && hk[r] < hk[s]) s = r;
      if (s === i) break;
      var tk = hk[s]; hk[s] = hk[i]; hk[i] = tk; var tv = hv[s]; hv[s] = hv[i]; hv[i] = tv; i = s;
    }
    return [key, out];
  };
  starts.forEach(function (s) { if (s[1] < t[s[0]]) { t[s[0]] = s[1]; push(s[1], s[0]); } });
  while (size) {
    var top = pop(), i = top[1];
    if (top[0] > t[i]) continue;
    for (var q = g.off[i]; q < g.off[i + 1]; q++) {
      var j = g.nbr[q];
      if (!allow(j)) continue;
      var tj = t[i] + g.len[q] / cv(i, j, q);
      if (tj < t[j]) { t[j] = tj; push(tj, j); }
    }
  }
  return t;
}

/* ------------------------------ 頂點 ↔ 節點 ------------------------------ */

/** 每個頂點對應最近的節點（心房頂點只找心房節點），並建立網格鄰接表供平滑用。 */
function vertexNodes(geo, g, atrial) {
  var cell = 6, map = new Map(), key = function (x, y, z) { return x + "," + y + "," + z; };
  for (var i = 0; i < g.n; i++) {
    if ((g.region[i] >= 2) !== atrial) continue;
    var k = key(Math.floor(g.pos[3 * i] / cell), Math.floor(g.pos[3 * i + 1] / cell), Math.floor(g.pos[3 * i + 2] / cell));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  }
  var p = geo.attributes.position, n = p.count, idx = new Uint32Array(n);
  for (var v = 0; v < n; v++) {
    var x = p.getX(v) / MM, y = p.getY(v) / MM, z = p.getZ(v) / MM;
    var cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell), best = -1, bd = Infinity;
    for (var r = 1; r <= 4 && best < 0; r++) {
      for (var dx = -r; dx <= r; dx++) for (var dy = -r; dy <= r; dy++) for (var dz = -r; dz <= r; dz++) {
        var list = map.get(key(cx + dx, cy + dy, cz + dz));
        if (!list) continue;
        for (var j = 0; j < list.length; j++) {
          var q = list[j], ex = g.pos[3 * q] - x, ey = g.pos[3 * q + 1] - y, ez = g.pos[3 * q + 2] - z, d = ex * ex + ey * ey + ez * ez;
          if (d < bd) { bd = d; best = q; }
        }
      }
    }
    idx[v] = best < 0 ? 0 : best;
  }
  return { idx: idx, adj: adjacency(geo) };
}

function adjacency(geo) {
  var n = geo.attributes.position.count, ix = geo.index ? geo.index.array : null;
  if (!ix) return null;
  var deg = new Uint32Array(n);
  for (var i = 0; i < ix.length; i++) deg[ix[i]] += 2;
  var off = new Uint32Array(n + 1);
  for (i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
  var nb = new Uint32Array(off[n]), fill = off.slice(0, n);
  for (i = 0; i < ix.length; i += 3) {
    var a = ix[i], b = ix[i + 1], c = ix[i + 2];
    nb[fill[a]++] = b; nb[fill[a]++] = c; nb[fill[b]++] = a; nb[fill[b]++] = c; nb[fill[c]++] = a; nb[fill[c]++] = b;
  }
  return { off: off, nb: nb };
}

/** 節點時間 → 頂點時間（沿網格平滑兩次，節點間距約 3 mm，不平滑會一顆一顆的）。 */
function toVertices(t, m) {
  var n = m.idx.length, x = new Float32Array(n), tmp = new Float32Array(n);
  for (var i = 0; i < n; i++) x[i] = t[m.idx[i]];
  for (var it = 0; it < 2 && m.adj; it++) {
    for (i = 0; i < n; i++) {
      if (!isFinite(x[i])) { tmp[i] = x[i]; continue; }
      var s = x[i], c = 1;
      for (var q = m.adj.off[i]; q < m.adj.off[i + 1]; q++) {
        var v = x[m.adj.nb[q]];
        if (isFinite(v)) { s += v; c++; }
      }
      tmp[i] = s / c;
    }
    x.set(tmp);
  }
  for (i = 0; i < n; i++) if (!isFinite(x[i])) x[i] = 1e6;
  return x;
}

/* ------------------------------ 活化模式 ------------------------------ */

function maxOf(arrs) {
  var m = 0;
  arrs.forEach(function (a) { for (var i = 0; i < a.length; i++) if (a[i] < 1e5 && a[i] > m) m = a[i]; });
  return m;
}

function scaleTo(arrs, target) {
  var k = target / maxOf(arrs);
  arrs.forEach(function (a) { for (var i = 0; i < a.length; i++) if (a[i] < 1e5) a[i] *= k; });
}

/**
 * 每種模式、每個心腔的頂點延遲（ms），格式和原本示意模型相同：
 *   atria: sa / ectopicA / retro / flutter → { ra, la, max }
 *   vent:  normal / rbbb / lbbb / ectopicV / wpw → { lv, rv, max }
 */
function buildPatterns(g, seeds, geos, map, lm) {
  var atrial = function (i) { return g.region[i] >= 2; };
  var vent = function (i) { return g.region[i] < 2; };
  var cvA = function (i, j) { return (g.flags[i] & 2) && (g.flags[j] & 2) ? CV.bachmann : CV.atrial; };
  // 心室：快速層（浦金氏）＋穿壁較慢的異向傳導；slow = 不能用快速層的心室（0 LV、1 RV、"all"）
  var cvV = function (slow) {
    return function (i, j, q) {
      var fi = (g.flags[i] & 1) && slow !== "all" && g.region[i] !== slow;
      var fj = (g.flags[j] & 1) && slow !== "all" && g.region[j] !== slow;
      if (fi && fj) return CV.fec;
      var c = g.tcos[q];
      return 1 / Math.sqrt(c * c / (CV.trans * CV.trans) + (1 - c * c) / (CV.vent * CV.vent));
    };
  };

  var pat = { atria: {}, vent: {} };
  var aPat = function (starts, dur) {
    var t = dijkstra(g, starts, atrial, cvA);
    var ra = toVertices(t, map.ra), la = toVertices(t, map.la);
    if (dur) scaleTo([ra, la], dur);
    return { ra: ra, la: la, max: dur || maxOf([ra, la]) };
  };
  pat.atria.sa = aPat([[seeds.SA, 0]], 100);
  pat.atria.ectopicA = aPat([[seeds.EctopicA, 0]], 90);
  pat.atria.retro = aPat([[seeds.AVN, 0]], 80);
  // 心房撲動：右心房依繞三尖瓣環的角度決定時間（一圈 200 ms），左心房由 Bachmann bundle 接過去
  (function () {
    var c = lm.TV_center, nrm = lm.TV_normal.clone().normalize();
    var u = new THREE.Vector3(0, 1, 0).sub(nrm.clone().multiplyScalar(nrm.y)).normalize();
    var w = new THREE.Vector3().crossVectors(nrm, u);
    var pos = geos.ra.attributes.position, ra = new Float32Array(pos.count), p = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).sub(c);
      var ang = Math.atan2(p.dot(w), p.dot(u));
      ra[i] = ((ang / (Math.PI * 2) + 1) % 1) * 200;
    }
    var la = toVertices(dijkstra(g, [[seeds.LAentry, 60]], atrial, cvA), map.la);
    for (var j = 0; j < la.length; j++) la[j] = Math.min(la[j], 60 + (la[j] - 60) * 0.5) % 200;
    pat.atria.flutter = { ra: ra, la: la, max: 200 };
  })();

  var vPat = function (starts, slow, dur) {
    var t = dijkstra(g, starts, vent, cvV(slow));
    var lv = toVertices(t, map.lv), rv = toVertices(t, map.rv);
    if (dur) scaleTo([lv, rv], dur);
    return { lv: lv, rv: rv, max: maxOf([lv, rv]) };
  };
  // 束支末端：左側中膈最早，左前／左後分支、右側中膈、右束支（調節束）依序
  var LEFT = [[seeds.Septal, 0], [seeds.LAF, 8], [seeds.LPF, 8]];
  var RIGHT = [[seeds.RVSeptal, 10], [seeds.RBB, 16]];
  var shift = function (list, s) { return list.map(function (x) { return [x[0], x[1] + s]; }); };
  pat.vent.normal = vPat(LEFT.concat(RIGHT), null, 90);
  pat.vent.rbbb = vPat(LEFT, 1, 140);
  pat.vent.lbbb = vPat(RIGHT, 0, 160);
  pat.vent.ectopicV = vPat([[seeds.PVC, 0]], "all", 160);
  // WPW：Kent bundle 先從左側房室溝慢慢激動心室，80 ms 後正常的 His–Purkinje 才趕到
  (function () {
    var pre = dijkstra(g, [[seeds.Kent, 0]], vent, cvV("all"));
    var nor = dijkstra(g, shift(LEFT.concat(RIGHT), 80), vent, cvV(null));
    var t = new Float32Array(g.n);
    for (var i = 0; i < g.n; i++) t[i] = Math.min(pre[i], nor[i]);
    var lv = toVertices(t, map.lv), rv = toVertices(t, map.rv);
    pat.vent.wpw = { lv: lv, rv: rv, max: maxOf([lv, rv]) };
  })();
  return pat;
}
