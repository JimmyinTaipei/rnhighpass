/**
 * 神經解剖學：3D 模型與橫切面共用的幾何（不依賴 three.js，瀏覽器與 node 的 build 都用這一份）。
 *
 * 座標系與 heart3d.js 相同：+x = 病人左側、+y = 頭側、+z = 前方，單位 mm。
 * C1 的上緣在 y = 0，脊髓往 -y 延伸，腦幹與腦在 +y。
 *
 * 脊髓橫切面用「以中央管為圓心的極座標」描述：
 *   φ = 0° 是前正中、90° 是外側、180° 是後正中（左右兩半鏡像）。
 *   外輪廓 R(φ) 是橢圓；灰質 g(φ) = f(φ)·R(φ)，f 由後角、前角、側角、Clarke 核幾個瓣疊出蝴蝶形。
 *   白質裡的任一點用 (φ, r) 表示，r = 0 在灰質邊緣、r = 1 在脊髓表面。
 * 傳導路徑在每一節的位置就是 φ 範圍 × r 範圍，所以灰質形狀改變時，路徑會自動貼著白質走。
 */

import { buildVisual } from "./visual.js";
import { buildAuditory } from "./auditory.js";
import { diencSectionSVG } from "./diencephalon.js";

var DEG = Math.PI / 180;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lobe(phi, c, A, W, p) {
  if (!A) return 0;
  var d = Math.abs(phi - c) / W;
  return A * Math.exp(-Math.pow(d, p || 2.4));
}

export function createModel(data) {
  var L = data.levels, T = data.tracts, S = data.structures;
  var NV = (data.nerves && data.nerves.nerves) || {};
  var segs = L.segments.map(function (s, i) {
    var region = s.id.replace(/\d+$/, "").toUpperCase();
    if (region === "CO") region = "Co";
    return Object.assign({ idx: i, region: region }, s);
  });
  var N = segs.length;
  var segIdx = {};
  segs.forEach(function (s) { segIdx[s.id] = s.idx; });

  /* ---------- 節段的縱向位置 ---------- */
  var tops = { real: [], equal: [] };
  (function () {
    var yr = 0, ye = 0;
    segs.forEach(function (s) {
      tops.real.push(yr); tops.equal.push(ye);
      yr -= L.segLen[s.region]; ye -= L.equalLen;
    });
    tops.real.push(yr); tops.equal.push(ye);
  })();

  /** 節段 idx（可以是小數：0 = C1 上緣、1 = C1 下緣 = C2 上緣）→ y。 */
  function yAt(pos, mode) {
    var t = tops[mode === "real" ? "real" : "equal"];
    var i = clamp(Math.floor(pos), 0, N - 1), f = pos - i;
    return lerp(t[i], t[i + 1], f);
  }
  /** y → 節段 idx（小數）。只在脊髓範圍內有意義。 */
  function posAtY(y, mode) {
    var t = tops[mode === "real" ? "real" : "equal"];
    if (y >= 0) return 0;
    for (var i = 0; i < N; i++) {
      if (y >= t[i + 1]) return i + (t[i] - y) / (t[i] - t[i + 1]);
    }
    return N;
  }

  /* ---------- 橫切面參數（關鍵節段內插） ---------- */
  var keyList = Object.keys(L.keys).map(function (id) { return { pos: segIdx[id] + 0.5, p: L.keys[id] }; })
    .sort(function (a, b) { return a.pos - b.pos; });
  var PKEYS = Object.keys(keyList[0].p);

  /** pos = 節段 idx（小數，節段中央 = idx + 0.5）→ 參數。 */
  function params(pos) {
    if (pos <= keyList[0].pos) return Object.assign({}, keyList[0].p);
    var last = keyList[keyList.length - 1];
    if (pos >= last.pos) return Object.assign({}, last.p);
    for (var i = 0; i < keyList.length - 1; i++) {
      var a = keyList[i], b = keyList[i + 1];
      if (pos <= b.pos) {
        var t = (pos - a.pos) / (b.pos - a.pos), out = {};
        // 平滑一點，避免關鍵節段處出現折角
        t = t * t * (3 - 2 * t);
        PKEYS.forEach(function (k) { out[k] = lerp(a.p[k], b.p[k], t); });
        return out;
      }
    }
    return Object.assign({}, last.p);
  }

  /** 外輪廓半徑：橢圓，加上前正中裂與後正中溝的凹陷。 */
  function outlineR(p, phi) {
    var a = p.w / 2, b = p.h / 2, s = Math.sin(phi * DEG), c = Math.cos(phi * DEG);
    var R = 1 / Math.sqrt((s / a) * (s / a) + (c / b) * (c / b));
    R *= 1 - 0.34 * Math.exp(-Math.pow(phi / 2.6, 2));          // 前正中裂
    R *= 1 - 0.05 * Math.exp(-Math.pow((180 - phi) / 3, 2));    // 後正中溝
    return R;
  }

  /** 灰質半徑占外輪廓的比例。 */
  function grayF(p, phi) {
    var base = p.base * (1 - 0.3 * Math.exp(-Math.pow((180 - phi) / 10, 2)));
    var f = Math.max(
      base,
      lobe(phi, p.dh, p.dhA, p.dhW, 2.2),
      lobe(phi, p.vh, p.vhA, p.vhW, 3.2),
      lobe(phi, 95, p.lhA, 7, 2.4),
      lobe(phi, 163, p.clA, 9, 2.4)
    );
    return Math.min(f, 0.97);
  }

  function polar(p, side, phi, rho) {
    return { x: side * rho * Math.sin(phi * DEG), z: rho * Math.cos(phi * DEG) };
  }
  /** 白質中的點：(φ, r)，r = 0 灰質邊緣、1 表面。side：-1 = 病人右、+1 = 左。 */
  function white(p, side, phi, r) {
    var R = outlineR(p, phi), g = grayF(p, phi) * R;
    return polar(p, side, phi, g + clamp(r, 0, 1.02) * (R - g));
  }
  /** 灰質中的點：f = 0 中央管、1 灰質邊緣。 */
  function gray(p, side, phi, f) {
    return polar(p, side, phi, f * grayF(p, phi) * outlineR(p, phi));
  }

  /** 整圈外輪廓（從後正中開始，先病人右半、再左半）。 */
  function outlineRing(pos, n) {
    var p = params(pos), out = [];
    n = n || 96;
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * 360, side = ang < 180 ? -1 : 1, phi = ang < 180 ? 180 - ang : ang - 180;
      out.push(polar(p, side, phi, outlineR(p, phi)));
    }
    return out;
  }
  function grayRing(pos, n) {
    var p = params(pos), out = [];
    n = n || 180;
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * 360, side = ang < 180 ? -1 : 1, phi = ang < 180 ? 180 - ang : ang - 180;
      out.push(polar(p, side, phi, grayF(p, phi) * outlineR(p, phi)));
    }
    return out;
  }

  /* ---------- 傳導路徑 ---------- */
  var bundles = {};   // "tract.bundle" 與 "bundle" 都查得到
  Object.keys(T.tracts).forEach(function (tid) {
    T.tracts[tid].bundles.forEach(function (b) {
      var o = Object.assign({ tract: tid }, b);
      bundles[tid + "." + b.id] = o;
      if (!bundles[b.id]) bundles[b.id] = o;
    });
  });
  function getBundle(ref, tid) {
    if (ref.charAt(0) === "@") return bundles[ref.slice(1)];
    return bundles[tid + "." + ref] || bundles[ref];
  }

  function present(b, pos) {
    if (!b.present) return false;
    var lo = segIdx[b.present[1]], hi = segIdx[b.present[0]] + 1;   // present = [尾側, 頭側]
    return pos >= lo - 1e-6 && pos <= hi + 1e-6;
  }
  function evalAng(v, p) {
    if (typeof v === "number") return v;
    var m = /^dh([+-]\d+(?:\.\d+)?)$/.exec(v);
    if (m) return p.dh + parseFloat(m[1]);
    return parseFloat(v);
  }
  function keyed(map, pos, p, isAng) {
    var ids = Object.keys(map).filter(function (k) { return k !== "*"; });
    var ev = function (v) { return isAng ? [evalAng(v[0], p), evalAng(v[1], p)] : v.slice(); };
    if (!ids.length) return ev(map["*"]);
    var ks = ids.map(function (id) { return { pos: segIdx[id] + 0.5, v: ev(map[id]) }; })
      .sort(function (a, b) { return a.pos - b.pos; });
    if (pos <= ks[0].pos) return ks[0].v;
    if (pos >= ks[ks.length - 1].pos) return ks[ks.length - 1].v;
    for (var i = 0; i < ks.length - 1; i++) {
      if (pos <= ks[i + 1].pos) {
        var t = (pos - ks[i].pos) / (ks[i + 1].pos - ks[i].pos);
        return [lerp(ks[i].v[0], ks[i + 1].v[0], t), lerp(ks[i].v[1], ks[i + 1].v[1], t)];
      }
    }
    return ks[ks.length - 1].v;
  }
  /** 某節的路徑範圍 {phi:[a,b], r:[r0,r1]}，不存在時回傳 null。 */
  function region(b, pos) {
    if (!b.phi || !present(b, pos)) return null;
    var p = params(pos);
    return { p: p, phi: keyed(b.phi, pos, p, true), r: keyed(b.r || { "*": [0, 1] }, pos, p, false) };
  }
  /** 路徑範圍的外框（n 決定每一邊的取樣數，總點數 = 2n + 2）。 */
  function regionRing(rg, side, n) {
    n = n || 10;
    var out = [], i;
    for (i = 0; i <= n; i++) out.push(white(rg.p, side, lerp(rg.phi[0], rg.phi[1], i / n), rg.r[0]));
    for (i = n; i >= 0; i--) out.push(white(rg.p, side, lerp(rg.phi[0], rg.phi[1], i / n), rg.r[1]));
    return out;
  }
  function regionCenter(rg, side) {
    return white(rg.p, side, (rg.phi[0] + rg.phi[1]) / 2, (rg.r[0] + rg.r[1]) / 2);
  }
  /** 身體節段 → 0（C1）…1（Co1），代表「越低的身體部位」。 */
  function somT(segPos) { return clamp(segPos / (N - 1), 0, 1); }
  /** 路徑中代表某身體節段的纖維位置（依 somatotopy）。 */
  function fiberPos(b, pos, side, t) {
    var rg = region(b, pos);
    if (!rg) return null;
    var so = b.somato, phi = (rg.phi[0] + rg.phi[1]) / 2, r = (rg.r[0] + rg.r[1]) / 2;
    if (so) {
      var u = so.sacral ? t : 1 - t;
      u = 0.15 + 0.7 * u;
      if (so.axis === "phi") phi = lerp(rg.phi[0], rg.phi[1], u);
      else r = lerp(rg.r[0], rg.r[1], u);
    }
    return white(rg.p, side, phi, r);
  }

  /* ---------- 腦部 ---------- */
  /** 以「負責右側身體」為準的 X，依實際身體側轉成病人座標 x。 */
  function sx(X, bodySide) { return bodySide === "L" ? -X : X; }
  function cordSide(rel, bodySide) {
    var ipsi = bodySide === "L" ? 1 : -1;
    return rel === "contra" ? -ipsi : ipsi;
  }
  var HEMI = L.brain.hemisphere;
  var HP = 2.6;
  var HPX = 6;   // 往中線那一側的指數比較大：半球內側面接近平面（大腦縱裂）
  function hx(ax) { var d = Math.abs((ax - HEMI.c[0]) / HEMI.r[0]); return Math.pow(d, ax < HEMI.c[0] ? HPX : HP); }
  /** 大腦半球（超橢球，內側面較平）在 (|x|, z) 處的頂面高度。 */
  function hemiTop(ax, z) {
    var c = HEMI.c, r = HEMI.r;
    var u = hx(ax) + Math.pow(Math.abs((z - c[2]) / r[2]), HP);
    if (u >= 1) return c[1];
    return c[1] + r[1] * Math.pow(1 - u, 1 / HP);
  }
  /** 半球內側面在 (y, z) 處離中線的距離（距狀溝等內側面結構用）。 */
  function hemiMedialX(y, z) {
    var c = HEMI.c, r = HEMI.r;
    var u = Math.pow(Math.abs((y - c[1]) / r[1]), HP) + Math.pow(Math.abs((z - c[2]) / r[2]), HP);
    if (u >= 1) return c[0];
    return c[0] - r[0] * Math.pow(1 - u, 1 / HPX);
  }
  /** 皮質的倒立小人：身體節段 → 中央前回／後回上的點。 */
  function cortexPoint(area, segPos, bodySide) {
    var t = somT(segPos), X;
    // 薦、腰（腿）在內側；胸（軀幹）；頸膨大（上肢、手）往外；上頸（頸部）在軀幹與上肢之間
    var id = segs[clamp(Math.round(segPos), 0, N - 1)].id;
    if (/^(s|co|l)/.test(id)) X = lerp(9, 5, (t - somT(segIdx.l1)) / (1 - somT(segIdx.l1)));
    else if (/^t/.test(id)) X = id === "t1" ? 40 : lerp(24, 12, (t - somT(segIdx.t2)) / (somT(segIdx.t12) - somT(segIdx.t2)));
    else X = /^c[1-4]$/.test(id) ? 26 : lerp(44, 52, (t - somT(segIdx.c5)) / (somT(segIdx.c8) - somT(segIdx.c5)));
    var z = area === "m1" ? 4 : -9;
    return { x: sx(X, bodySide), y: hemiTop(X, z) - 3, z: z };
  }

  /* ---------- 小腦：分區與分葉 ---------- */
  var CB = L.brain.cerebellum;
  /**
   * 小腦裡的一點屬於哪一區。回傳 null（不在小腦裡或在深部白質）或
   * { zone: vermis／intermediate／lateral／fn, lobe: anterior／posterior／fn, side: R／L, s, x }。
   * 以橢球的矢狀面角度 θ（0° = 朝腦幹的前方、90° = 上、180° = 後）分葉：
   *   前葉 θ 20°–100°（原裂之前）、小葉結節葉 θ −75°～−25° 而且靠前方（後外側裂之後）、其餘是後葉。
   * 縱向分區：離中線 < 5 mm 是蚓部、5–15 mm 是中間區（蚓旁區）、再外側是外側區（Barr p.160：蚓旁區約 1–2 cm）。
   * s 是把皮質「攤開」後的位置（0 = 前葉前端 … 320 = 小葉結節葉），給攤開圖用。
   */
  function cbClassify(p) {
    var u = (p.x - CB.c[0]) / CB.r[0], v = (p.y - CB.c[1]) / CB.r[1], w = (p.z - CB.c[2]) / CB.r[2];
    var rho = Math.sqrt(u * u + v * v + w * w);
    if (rho > 1) return null;
    var th = Math.atan2(v, w) / DEG;                 // -180..180
    var lat = Math.abs(p.x - CB.c[0]);
    // 小腦腳附著處（前方中央）與深部白質不算皮質
    if (rho < 0.72) return null;
    if (th > -25 && th < 35 && lat < 18) return null;
    var fn = th >= -75 && th <= -25 && w > 0.45 && (lat < 7 || (lat > 16 && lat < 32));   // 小結在中線、絨球在外側，都靠前方
    var lobe = fn ? "fn" : th >= 20 && th <= 100 ? "anterior" : "posterior";
    var zone = fn ? "fn" : lat < 5 ? "vermis" : lat < 15 ? "intermediate" : "lateral";
    var sArc = ((th - 20) % 360 + 360) % 360;
    return { zone: zone, lobe: lobe, side: p.x < CB.c[0] ? "R" : "L", s: sArc, x: p.x - CB.c[0], rho: rho };
  }

  function other(side) { return side === "L" ? "R" : "L"; }
  /** 病人側 → x 的正負號：右 = -1、左 = +1。 */
  function sgn(side) { return side === "L" ? 1 : -1; }

  /**
   * 結構在 3D 的位置。神經核（有 nuc 路徑）取中點，side = ipsi／contra 相對於 bodySide；
   * 只有 pos 的結構沿用「負責右側身體」的 X 慣例。
   */
  function structPos(id, bodySide, rel) {
    var s = S.structures[id];
    if (!s) return null;
    if (s.nuc) {
      var side = rel === "contra" ? other(bodySide) : bodySide;
      var n = s.nuc, a = n[Math.floor((n.length - 1) / 2)], b = n[Math.ceil((n.length - 1) / 2)];
      return { x: sgn(side) * (a[1] + b[1]) / 2, y: (a[0] + b[0]) / 2, z: (a[2] + b[2]) / 2 };
    }
    if (!s.pos) {
      if (!s.ell) return null;
      var e = ellOf(id, rel === "contra" ? other(bodySide) : bodySide);
      return { x: e.x, y: e.y, z: e.z };
    }
    return { x: sx(s.pos[1], bodySide), y: s.pos[0], z: s.pos[2] };
  }
  /** 橢球形的核（視丘、下視丘各核）：structures.json 的 ell = [y, lat, z, rx, ry, rz]，side = 病人側。 */
  function ellOf(id, side) {
    var s = S.structures[id];
    if (!s || !s.ell) return null;
    var e = s.ell;
    return { x: sgn(side) * e[1], y: e[0], z: e[2], rx: e[3], ry: e[4], rz: e[5] };
  }
  /** 任何一種核（ell、nuc、vis、pos）在 side 那一側的中心點。 */
  function nucCenter(id, side) {
    var s = S.structures[id];
    if (!s) return null;
    if (s.ell) { var e = ellOf(id, side); return { x: e.x, y: e.y, z: e.z }; }
    if (s.nuc) { var np = nucPath(id, side), m = np[Math.floor(np.length / 2)]; return { x: m.x, y: m.y, z: m.z }; }
    if (s.vis) return { x: sgn(side) * s.vis.lat, y: s.vis.y, z: s.vis.z };
    if (s.pos) return { x: sgn(side) * Math.abs(s.pos[1]), y: s.pos[0], z: s.pos[2] };
    return null;
  }
  /** 橢球裡取樣的點（中心＋各軸 ±0.55 倍半徑），病灶判斷用。 */
  function ellSamples(id, side) {
    var e = ellOf(id, side);
    if (!e) return [];
    var k = 0.55, out = [{ x: e.x, y: e.y, z: e.z }];
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach(function (d) {
      out.push({ x: e.x + d[0] * e.rx * k, y: e.y + d[1] * e.ry * k, z: e.z + d[2] * e.rz * k });
    });
    return out;
  }

  /* ---------- 間腦：內囊、皮質目標區、視丘各核的連線 ---------- */
  var DI = data.diencephalon || null;
  /** 半球表面：從半球中心沿 dir = [外側, 上, 前] 找到表面的點（side = 病人側）。 */
  function hemiSurface(dir, side) {
    var c = HEMI.c, r = HEMI.r;
    var f = function (t) {
      var ax = c[0] + dir[0] * t, y = c[1] + dir[1] * t, z = c[2] + dir[2] * t;
      return hx(ax) + Math.pow(Math.abs((y - c[1]) / r[1]), HP) + Math.pow(Math.abs((z - c[2]) / r[2]), HP);
    };
    var lo = 0, hi = 200;
    for (var i = 0; i < 40; i++) { var m = (lo + hi) / 2; if (f(m) < 1) lo = m; else hi = m; }
    var t = lo * 0.97;
    return { x: sgn(side) * (c[0] + dir[0] * t), y: c[1] + dir[1] * t, z: c[2] + dir[2] * t };
  }
  function cortexArea(id, side) {
    var a = DI && DI.cortex[id];
    if (!a) return null;
    if (a.pt) return { x: sgn(side) * a.pt[1], y: a.pt[0], z: a.pt[2] };
    if (a.top) return { x: sgn(side) * a.top[0], y: hemiTop(a.top[0], a.top[1]) - 2, z: a.top[1] };
    return hemiSurface(a.dir, side);
  }
  /** 內囊在 y 高度的中心線 [{lat, z, part}]。 */
  function icLine(y) {
    if (!DI) return [];
    var I = DI.ic, d = (y - I.yRef) * I.slope;
    return I.pts.map(function (q) { return { lat: q[0] + d, z: q[1], part: q[2] }; });
  }
  function icPoint(part, side) {
    var P = DI && DI.ic.parts[part];
    return P ? { x: sgn(side) * P.at[1], y: P.at[0], z: P.at[2] } : null;
  }
  /** 視丘核的傳入與傳出連線（side = 核所在的病人側）。回傳 { in: [{zh, pts}], out: [{zh, to, pts}] }。 */
  function thalLinks(id, side) {
    var s = S.structures[id];
    if (!s || !s.thal) return { in: [], out: [] };
    var c = nucCenter(id, side);
    var P = function (w) { return { x: sgn(side) * w[1], y: w[0], z: w[2] }; };
    var ins = (s.thal.in || []).map(function (l) {
      var pts = [];
      if (l.path) pts = l.path.map(P);
      else if (l.bundle) {
        var b = getBundle(l.bundle);
        if (b) pts = b.brain.filter(function (w) { return l.until == null || w[0] >= l.until; }).map(P);
      } else if (l.from) {
        var fs = S.structures[l.from];
        var sp = fs && fs.ell ? ellOf(l.from, l.side === "contra" ? other(side) : side) : fs && fs.nuc ? (function () { var q = nucPath(l.from, side); return q[q.length - 1]; })() : structPos(l.from, side, "ipsi");
        if (sp) pts = [{ x: sp.x, y: sp.y, z: sp.z }];
      }
      pts.push(c);
      return { zh: l.zh, pts: pts };
    });
    var outs = (s.thal.out || []).map(function (l) {
      var pts = [c];
      if (l.ic) { var ip = icPoint(l.ic, side); if (ip) pts.push(ip); }
      var t = cortexArea(l.to, side);
      if (t && l.ic && l.ic !== "sub" && t.y > 110) pts.push({ x: t.x * 0.75, y: (t.y + 112) / 2, z: t.z * 0.7 });
      if (t) pts.push(t);
      return { zh: l.zh, to: l.to, pts: pts };
    });
    return { in: ins, out: outs };
  }

  /** 神經核的路徑（病人側 side），每點 {x, y, z, rx, rz}。 */
  function nucPath(id, side) {
    var s = S.structures[id];
    if (!s || !s.nuc) return null;
    return s.nuc.map(function (w) { return { x: sgn(side) * w[1], y: w[0], z: w[2], rx: w[3], rz: w[4] }; });
  }
  /** 腦神經纖維（side = 神經核所在的病人側）。 */
  function nervePoints(id, side) {
    var nv = NV[id];
    if (!nv) return [];
    return nv.path.map(function (w) { return { x: sgn(side) * w[1], y: w[0], z: w[2] }; });
  }

  /* ---------- 灰質中的特定位置 ---------- */
  function sitePoint(site, pos, side) {
    var p = params(pos);
    switch (site) {
      case "dh": return gray(p, side, p.dh + 2, 0.62);
      case "sg": return gray(p, side, p.dh, 0.86);
      case "ah": return gray(p, side, p.vh + 4, 0.66);
      case "ahm": return gray(p, side, Math.max(18, p.vh - 16), 0.62);
      case "clarke": return gray(p, side, 163, 0.82);
      case "iml": return gray(p, side, 95, 0.9);
      case "lam7": return gray(p, side, 96, 0.55);
      case "border": return gray(p, side, p.vh + 26, 0.93);
      case "awc": return { x: 0, z: grayF(p, 0) * outlineR(p, 0) * 0.55 };
      case "lissauer": return white(p, side, p.dh, 0.5);
      case "proprius": return white(p, side, 110, 0.03);
      case "entry": return white(p, side, p.dh + 3, 1.0);
      case "drg": return { x: side * (p.w / 2 + 3.4), z: -p.h * 0.18 };
      case "vroot": return { x: side * (p.w / 2 + 2.6), z: p.h * 0.34 };
      case "vexit": return white(p, side, p.vh - 4, 1.0);
    }
    return { x: 0, z: 0 };
  }

  /* ---------- 神經元鏈（代表一條纖維） ---------- */
  function segExpr(e, inPos) {
    if (typeof e !== "string") return e;
    var m = /^\$in(?:([+-])(\d+))?$/.exec(e);
    if (m) {
      var d = m[2] ? parseInt(m[2], 10) : 0;
      // "+n" = 往頭側 n 節
      return clamp(inPos + (m[1] === "-" ? d : -d), 0, N - 1);
    }
    return segIdx[e];
  }

  /**
   * 代表一條纖維的神經元鏈。inSeg：身體節段（脊髓路徑用）；variant：腦幹路徑的變化型（例如痛覺／觸覺）。
   * bodySide：這條纖維負責的身體側（水平注視路徑則代表注視方向）。
   */
  function chainFor(tid, inSeg, bodySide, mode, variant) {
    var tr = T.tracts[tid];
    bodySide = bodySide || "R";
    var inPos = tr.inputs ? (typeof inSeg === "number" ? inSeg : segIdx[inSeg || tr.inputs.default]) : 0;
    var ch = tr.chains.filter(function (c) {
      if (c.variant) return c.variant === (variant || tr.variants[0].id);
      return !c.when || (inPos >= segIdx[c.when[1]] && inPos <= segIdx[c.when[0]]);
    })[0] || tr.chains[0];
    var t = somT(inPos);
    return ch.neurons.map(function (nr) {
      var pts = [];
      nr.pts.forEach(function (q) { resolvePt(q, tid, inPos, t, bodySide, mode, pts); });
      return { order: String(nr.order), pts: pts };
    });
  }

  function add(pts, p) {
    var last = pts[pts.length - 1];
    if (last && Math.abs(last.x - p.x) + Math.abs(last.y - p.y) + Math.abs(last.z - p.z) < 0.05) return;
    pts.push(p);
  }

  function resolvePt(q, tid, inPos, t, bodySide, mode, pts) {
    var ipsi = cordSide("ipsi", bodySide);
    var pos, c;
    switch (q.at) {
      case "drg": case "entry": case "vroot": case "lissauer": case "awc":
        pos = segExpr(q.seg, inPos) + 0.5;
        c = sitePoint(q.at, pos, ipsi);
        if (q.at === "vroot") {
          var e = sitePoint("vexit", pos, ipsi);
          add(pts, { x: e.x, y: yAt(pos, mode), z: e.z });
        }
        add(pts, { x: c.x, y: yAt(pos, mode), z: c.z });
        return;
      case "gray":
        pos = segExpr(q.seg, inPos) + 0.5;
        c = sitePoint(q.site, pos, cordSide(q.side || "ipsi", bodySide));
        add(pts, { x: c.x, y: yAt(pos, mode), z: c.z });
        return;
      case "bundle": {
        var b = getBundle(q.b, tid);
        pos = segExpr(q.seg, inPos) + 0.5;
        if (q.seg === "c1") pos = 0.02;
        var side = cordSide(b.cordSide, bodySide);
        c = fiberPos(b, pos, side, t);
        if (!c) {  // 這一節沒有這條路徑：退回到最接近的存在節段
          var lo = segIdx[b.present[1]], hi = segIdx[b.present[0]];
          pos = clamp(pos, lo + 0.5, hi + 0.5);
          c = fiberPos(b, pos, side, t);
        }
        add(pts, { x: c.x, y: yAt(pos, mode), z: c.z });
        return;
      }
      case "brain": {
        var bb = getBundle(q.b, tid);
        var wps = bb.brain.slice();
        if (q.until != null) wps = wps.filter(function (w) { return w[0] >= q.until; });
        if (q.reverse) wps.reverse();
        wps.forEach(function (w) { add(pts, { x: sx(w[1], bodySide), y: w[0], z: w[2] }); });
        return;
      }
      case "structure":
        add(pts, structPos(q.id, bodySide, q.side));
        return;
      case "nerve":
        nervePoints(q.id, q.side === "contra" ? other(bodySide) : bodySide).forEach(function (p) { add(pts, p); });
        return;
      case "cortexFace": {
        var zf = q.area === "m1" ? 4 : -9;
        add(pts, { x: sx(62, bodySide), y: hemiTop(62, zf) - 3, z: zf });
        return;
      }
      case "pt":
        add(pts, { x: sx(q.p[1], bodySide), y: q.p[0], z: q.p[2] });
        return;
      case "ic": {
        // 內囊後肢：運動纖維在後半、體感覺放射在更後面（Barr p.254–255）
        var mot = q.tract === "motor";
        add(pts, { x: sx(mot ? 23.6 : 24.4, bodySide), y: 104, z: mot ? -4 : -7.5 });
        add(pts, { x: sx(mot ? 27.5 : 28.2, bodySide), y: 122, z: mot ? -4.5 : -8 });
        return;
      }
      case "cortexArea":
        add(pts, cortexArea(q.area, q.side === "ipsi" ? bodySide : other(bodySide)));
        return;
      case "cortex":
        add(pts, cortexPoint(q.area, inPos, bodySide));
        return;
      case "vis":
        visPts(q, bodySide).forEach(function (p) { add(pts, p); });
        return;
      case "aud":
        if (api.aud) api.aud.points(q, bodySide).forEach(function (p) { add(pts, p); });
        return;
    }
  }

  /**
   * 視覺路徑與瞳孔反射的點。bodySide = 哪一眼（光照哪一眼）；hemi = temporal／nasal 視網膜。
   * part：rgc（視網膜 → LGN）、rad（LGN → 視覺皮質）、pre（視網膜 → 分出往頂蓋前區的地方）、
   * branch（→ 頂蓋前核）、pc（頂蓋前核 → EW 核，to = ipsi／contra）、eff3（EW → 睫狀神經節）、cil（睫狀神經節 → 瞳孔括約肌）。
   */
  function visPts(q, eye) {
    var VS = api.vis;
    if (!VS) return [];
    var f = VS.fiberFor(eye, q.hemi || "temporal", q.fv, q.ecc);
    var pupil = q.pupil === "contra" ? other(eye) : eye;
    switch (q.part) {
      case "rgc": return f.rgc;
      case "rad": return f.rad.pts;
      case "pre": return f.pre;
      case "branch": return VS.branch[f.tract];
      case "pc": return q.to === "contra" ? VS.pc[f.tract].contra : VS.pc[f.tract].ipsi;
      case "eff3": return VS.eff[pupil].cn3;
      case "cil": return VS.eff[pupil].cil;
    }
    return [];
  }

  /* ---------- 腦幹的路徑位置（橫切面與 3D 共用） ---------- */
  /** bundle 在 y 高度的腦部位置（依路點內插），回傳 {x, z, rx, rz} 或 null。 */
  function brainAt(b, y, bodySide) {
    var w = b.brain;
    if (!w || !w.length) return null;
    for (var i = 0; i < w.length - 1; i++) {
      var a = w[i], c = w[i + 1];
      var lo = Math.min(a[0], c[0]), hi = Math.max(a[0], c[0]);
      if (y >= lo && y <= hi && hi > lo) {
        var t = (y - a[0]) / (c[0] - a[0]);
        return { x: sx(lerp(a[1], c[1], t), bodySide), z: lerp(a[2], c[2], t), rx: lerp(a[3], c[3], t), rz: lerp(a[4], c[4], t) };
      }
    }
    return null;
  }
  function brainstemAt(y) {
    var r = L.brainstem;
    if (y <= r[0].y) return r[0];
    for (var i = 0; i < r.length - 1; i++) {
      if (y <= r[i + 1].y) {
        var t = (y - r[i].y) / (r[i + 1].y - r[i].y);
        return { y: y, a: lerp(r[i].a, r[i + 1].a, t), b: lerp(r[i].b, r[i + 1].b, t), zc: lerp(r[i].zc, r[i + 1].zc, t) };
      }
    }
    return r[r.length - 1];
  }

  var api = {
    data: data, segs: segs, N: N, segIdx: segIdx,
    yAt: yAt, posAtY: posAtY, params: params, outlineR: outlineR, grayF: grayF,
    white: white, gray: gray, outlineRing: outlineRing, grayRing: grayRing,
    bundles: bundles, getBundle: getBundle, present: present, region: region, regionRing: regionRing,
    regionCenter: regionCenter, fiberPos: fiberPos, somT: somT, sitePoint: sitePoint,
    sx: sx, cordSide: cordSide, hemiTop: hemiTop, hemiMedialX: hemiMedialX, cbClassify: cbClassify, CB: CB, HEMI: HEMI, HP: HP, HPX: HPX, cortexPoint: cortexPoint,
    structPos: structPos, chainFor: chainFor, brainAt: brainAt, brainstemAt: brainstemAt,
    nucPath: nucPath, nervePoints: nervePoints, other: other, sgn: sgn, vis: null, aud: null,
    ellOf: ellOf, ellSamples: ellSamples, nucCenter: nucCenter, DI: DI, hemiSurface: hemiSurface, cortexArea: cortexArea, icLine: icLine, icPoint: icPoint, thalLinks: thalLinks
  };
  /* ---------- 基底核 ---------- */
  var BG = data.basal || null;
  /** 尾狀核的體與尾（C 字形）和水平面 y 的交點：[{lat, z, r}]（右側，左側鏡像）。 */
  api.BG = BG;
  api.LM = data.limbic || null;
  api.caudateTailAt = function (y) {
    if (!BG) return [];
    var P = BG.caudateTail.pts, out = [];
    for (var i = 0; i < P.length - 1; i++) {
      var a = P[i], b = P[i + 1];
      if ((a[0] - y) * (b[0] - y) > 0 || a[0] === b[0]) continue;
      var t = (y - a[0]) / (b[0] - a[0]);
      out.push({ lat: a[1] + (b[1] - a[1]) * t, z: a[2] + (b[2] - a[2]) * t, r: a[3] + (b[3] - a[3]) * t });
    }
    return out;
  };
  if (data.visual) api.vis = buildVisual(api, data.visual);
  if (data.auditory) api.aud = buildAuditory(api, data.auditory);
  return api;
}

/* ======================================================================
   2D 橫切面（SVG 字串）
   解剖方向：後方在上；觀看者的左邊 = 病人右側（與 MRI 相同的左右慣例）。
   ====================================================================== */

var PREC = 2;
function pathOf(pts, k, close) {
  return pts.map(function (p, i) { return (i ? "L" : "M") + (p.x * k).toFixed(PREC) + " " + (p.z * k).toFixed(PREC); }).join("") + (close === false ? "" : "Z");
}

export function sectionSVG(model, segId, opts) {
  opts = opts || {};
  var T = model.data.tracts;
  var pos = model.segIdx[segId] + 0.5;
  var p = model.params(pos);
  var k = opts.scale || 22;                 // 1 mm = k 個 SVG 單位
  var W = 15 * k, H = 10.5 * k;
  var hl = opts.highlight || null;          // 只亮某幾條（tract id 陣列）
  var low = opts.detail === "low";          // 縮圖用：點數少、小數一位
  PREC = low ? 1 : 2;
  var parts = [];
  parts.push('<svg class="nx-section" viewBox="' + (-W / 2) + " " + (-H / 2) + " " + W + " " + H + '" role="img" aria-label="' + (opts.label || (segId.toUpperCase() + " 橫切面")) + '">');
  parts.push('<path class="nx-wm" d="' + pathOf(model.outlineRing(pos, low ? 64 : 160), k) + '"/>');
  // 路徑（兩側）
  T.order.forEach(function (tid) {
    var tr = T.tracts[tid];
    tr.bundles.forEach(function (b) {
      if (!b.phi) return;
      var rg = model.region(b, pos);
      if (!rg) return;
      var dim = hl && hl.indexOf(tid) < 0;
      [-1, 1].forEach(function (side) {
        var d = pathOf(model.regionRing(rg, side, low ? 5 : 12), k);
        parts.push('<path class="nx-tract' + (dim ? " is-dim" : "") + '" data-tract="' + tid + '" data-bundle="' + b.id + '" d="' + d +
          '" style="--c:' + tr.color + '">' + (low ? "" : "<title>" + b.zh + "（" + b.en + "）</title>") + "</path>");
      });
    });
  });
  parts.push('<path class="nx-gm" d="' + pathOf(model.grayRing(pos, low ? 110 : 240), k) + '"/>');
  parts.push('<circle class="nx-canal" cx="0" cy="0" r="' + (0.35 * k).toFixed(1) + '"/>');
  if (opts.lesion) parts.push(lesionShape(model, pos, opts.lesion, k));
  if (opts.fiber) {
    opts.fiber.forEach(function (f) {
      parts.push('<circle class="nx-fiber" cx="' + (f.x * k).toFixed(1) + '" cy="' + (f.z * k).toFixed(1) + '" r="' + (0.42 * k).toFixed(1) + '" style="--c:' + (f.color || "#fff") + '"/>');
    });
  }
  if (opts.labels !== false) {
    parts.push('<text class="nx-ori" x="0" y="' + (-H / 2 + 0.55 * k) + '" text-anchor="middle">後</text>');
    parts.push('<text class="nx-ori" x="0" y="' + (H / 2 - 0.25 * k) + '" text-anchor="middle">前</text>');
    parts.push('<text class="nx-ori" x="' + (-W / 2 + 0.3 * k) + '" y="0">右</text>');
    parts.push('<text class="nx-ori" x="' + (W / 2 - 0.3 * k) + '" y="0" text-anchor="end">左</text>');
  }
  parts.push("</svg>");
  PREC = 2;
  return parts.join("");
}

/**
 * 病灶在某一節橫切面上的範圍（多邊形陣列，每個多邊形是 {x, z} 點列）。3D 與 2D 共用。
 * lesion = { side: "R" | "L" | "both", parts: [...] }
 */
export function lesionPolys(model, pos, lesion) {
  var p = model.params(pos), out = [];
  var sides = lesion.side === "both" ? [-1, 1] : [lesion.side === "L" ? 1 : -1];
  function wedge(side, a, b, r0, r1) {
    var pts = [], i, n = 18;
    for (i = 0; i <= n; i++) pts.push(model.white(p, side, a + (b - a) * i / n, r0));
    for (i = n; i >= 0; i--) pts.push(model.white(p, side, a + (b - a) * i / n, r1));
    return pts;
  }
  function grayWedge(side, a, b, f0, f1) {
    var pts = [], i, n = 18;
    for (i = 0; i <= n; i++) pts.push(model.gray(p, side, a + (b - a) * i / n, f1));
    for (i = n; i >= 0; i--) pts.push(model.gray(p, side, a + (b - a) * i / n, f0));
    return pts;
  }
  function half(side) {   // 整個半邊：後正中 → 沿表面 → 前正中 → 沿中線回來
    var pts = [{ x: 0, z: -model.outlineR(p, 180) }];
    for (var i = 0; i <= 60; i++) pts.push(model.white(p, side, 180 - i * 3, 1));
    return pts;
  }
  sides.forEach(function (side) {
    if (lesion.parts.indexOf("all") >= 0) { out.push(half(side)); return; }
    lesion.parts.forEach(function (part) {
      var shape = null;
      if (part === "dc") shape = wedge(side, p.dh + 4, 179.5, 0, 1);
      else if (part === "lf") shape = wedge(side, 60, p.dh - 3, 0, 1);
      else if (part === "af") shape = wedge(side, 2, 60, 0, 1);
      else if (part === "ah") shape = grayWedge(side, p.vh - p.vhW, p.vh + p.vhW, 0.35, 1);
      else if (part === "dh") shape = grayWedge(side, p.dh - p.dhW, p.dh + p.dhW, 0.35, 1);
      else if (part === "awc") shape = grayWedge(side, 0, 40, 0, 0.55);
      else if (part === "lcst-medial") shape = wedge(side, 100, p.dh - 6, 0.05, 0.32);
      else if (part === "droot") shape = wedge(side, p.dh - 2, p.dh + 12, 0.4, 1);
      else if (part === "iml") shape = null;
      else {
        var b = model.bundles[part];
        var rg = b && model.region(b, pos);
        if (rg) shape = model.regionRing(rg, side, 10);
      }
      if (shape) out.push(shape);
    });
  });
  return out;
}

function lesionShape(model, pos, lesion, k) {
  return lesionPolys(model, pos, lesion).map(function (pts) {
    return '<path class="nx-lesion" d="' + pathOf(pts, k) + '"/>';
  }).join("");
}

/** 腦幹在 y 高度的腦室（中央管、第四腦室、導水管），回傳 {cx, cz, rx, rz}。 */
export function ventricleAt(model, y) {
  var bs = model.brainstemAt(y), back = bs.zc - bs.b;
  if (y < 12) return { cz: -1.4, rx: 0.35, rz: 0.35 };                         // 閉合延髓：中央管
  if (y < 31) { var t = (y - 12) / 19; return { cz: back + 0.8 + t * 0.2, rx: 1.2 + t * 3.8, rz: 0.7 + t * 0.4 }; }
  if (y < 57) { var u = y < 45 ? 1 : 1 - (y - 45) / 14; return { cz: back + 1.2, rx: 1.4 + 3.8 * u, rz: 1.0 }; }
  if (y < 81) return { cz: -5.4, rx: 0.9, rz: 0.9 };                          // 中腦導水管
  return null;
}

/** 神經核在 y 高度的截面（兩側都回傳），[{id, side, x, z, rx, rz}]。 */
export function nucleiAt(model, y) {
  var S = model.data.structures.structures, out = [];
  Object.keys(S).forEach(function (id) {
    var n = S[id].nuc;
    if (!n || S[id].region === "cerebellum") return;   // 小腦核不在腦幹切面裡
    for (var i = 0; i < n.length - 1; i++) {
      var a = n[i], b = n[i + 1];
      if (y >= a[0] && y <= b[0]) {
        var t = b[0] === a[0] ? 0 : (y - a[0]) / (b[0] - a[0]);
        var lat = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
        var rx = a[3] + (b[3] - a[3]) * t, rz = a[4] + (b[4] - a[4]) * t;
        [["R", -1], ["L", 1]].forEach(function (sd) { out.push({ id: id, side: sd[0], x: sd[1] * lat, z: z, rx: rx, rz: rz }); });
        return;
      }
    }
  });
  return out;
}

/** 腦神經纖維在 y 附近（±tol）的片段：[{id, side, pts:[{x,z}]}]。 */
export function nervesAt(model, y, tol) {
  var NV = (model.data.nerves && model.data.nerves.nerves) || {}, out = [];
  tol = tol == null ? 1.2 : tol;
  Object.keys(NV).forEach(function (id) {
    ["R", "L"].forEach(function (side) {
      var pts = model.nervePoints(id, side), cur = [];
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (Math.abs(p.y - y) <= tol) cur.push({ x: p.x, z: p.z });
        else {
          // 線段剛好穿過 y：取交點
          var q = pts[i - 1];
          if (q && (q.y - y) * (p.y - y) < 0) {
            var t = (y - q.y) / (p.y - q.y);
            cur.push({ x: q.x + (p.x - q.x) * t, z: q.z + (p.z - q.z) * t });
          }
          if (cur.length) { out.push({ id: id, side: side, pts: cur }); cur = []; }
        }
      }
      if (cur.length) out.push({ id: id, side: side, pts: cur });
    });
  });
  return out;
}

var CLIP_ID = 0;
/**
 * 腦幹切面（延髓、橋腦、中腦）的示意 SVG：外形、腦室、傳導路徑、神經核（依功能分類上色）、腦神經纖維。
 * opts.highlight：只亮某幾條路徑；opts.nucleus：要強調的神經核 id；opts.nerve：要強調的腦神經；
 * opts.brainLesion：lesions.json 的 zones[].brain，畫成紅色斜線範圍。
 */
export function brainSectionSVG(model, y, opts) {
  opts = opts || {};
  // 間腦以上改畫大腦的水平切面（同寬：80 mm 的畫面縮成和腦幹切面 34 mm 一樣大）
  if (y > 80.2 && model.DI) return diencSectionSVG(model, y, Object.assign({}, opts, { scale: (opts.scale || 11) * 0.43 }));
  var T = model.data.tracts, S = model.data.structures.structures;
  var COL = (model.data.nerves && model.data.nerves.columns) || {};
  var NV = (model.data.nerves && model.data.nerves.nerves) || {};
  var bs = model.brainstemAt(y), k = opts.scale || 11;
  var W = 34 * k, H = 28 * k;
  var hl = opts.highlight || null;
  var clip = "nxclip" + (++CLIP_ID);
  var f = function (v) { return (v * k).toFixed(1); };
  var parts = ['<svg class="nx-section nx-bsection" viewBox="' + (-W / 2) + " " + (-H / 2) + " " + W + " " + H + '" role="img" aria-label="' + (opts.label || "腦幹橫切面") + '">'];
  parts.push('<defs><clipPath id="' + clip + '"><ellipse cx="0" cy="' + f(bs.zc) + '" rx="' + f(bs.a) + '" ry="' + f(bs.b) + '"/></clipPath></defs>');
  parts.push('<ellipse class="nx-wm" cx="0" cy="' + f(bs.zc) + '" rx="' + f(bs.a) + '" ry="' + f(bs.b) + '"/>');
  var v = ventricleAt(model, y);
  if (v) parts.push('<ellipse class="nx-vent" cx="0" cy="' + f(v.cz) + '" rx="' + f(v.rx) + '" ry="' + f(v.rz) + '"/>');
  parts.push('<g clip-path="url(#' + clip + ')">');
  // 傳導路徑
  T.order.forEach(function (tid) {
    var tr = T.tracts[tid];
    tr.bundles.forEach(function (b) {
      ["R", "L"].forEach(function (body) {
        var at = model.brainAt(b, y, body);
        if (!at) return;
        var dim = hl && hl.indexOf(tid) < 0;
        parts.push('<ellipse class="nx-tract' + (dim ? " is-dim" : "") + '" data-tract="' + tid + '" data-bundle="' + b.id + '" cx="' + f(at.x) + '" cy="' + f(at.z) + '" rx="' + f(at.rx) + '" ry="' + f(at.rz) + '" style="--c:' + tr.color + '"><title>' + b.zh + "（" + b.en + "）</title></ellipse>");
      });
    });
  });
  // 神經核
  nucleiAt(model, y).forEach(function (n) {
    var s = S[n.id], col = s.color || (s.col && COL[s.col] ? COL[s.col].color : "#b9b2c8");
    var hot = opts.nucleus === n.id ? " is-hot" : "";
    var dim = opts.nucleus && !hot ? " is-dim" : "";
    parts.push('<ellipse class="nx-nuc' + hot + dim + '" data-structure="' + n.id + '" cx="' + f(n.x) + '" cy="' + f(n.z) + '" rx="' + f(n.rx) + '" ry="' + f(n.rz) + '" style="--c:' + col + '"><title>' + s.zh + "（" + s.en + "）</title></ellipse>");
  });
  // 腦神經纖維
  nervesAt(model, y).forEach(function (seg) {
    var nv = NV[seg.id];
    var hot = opts.nerve === seg.id ? " is-hot" : "";
    var t = "<title>" + nv.zh + "（" + nv.num + "）</title>";
    if (seg.pts.length > 1) {
      parts.push('<polyline class="nx-nerve' + hot + '" data-nerve="' + seg.id + '" points="' + seg.pts.map(function (p) { return f(p.x) + "," + f(p.z); }).join(" ") + '">' + t + "</polyline>");
    } else {
      parts.push('<circle class="nx-nerve-dot' + hot + '" data-nerve="' + seg.id + '" cx="' + f(seg.pts[0].x) + '" cy="' + f(seg.pts[0].z) + '" r="' + f(0.55) + '">' + t + "</circle>");
    }
  });
  if (opts.brainLesion) {
    var zb = opts.brainLesion;
    var sides = zb.side === "both" ? [-1, 1] : [zb.side === "L" ? 1 : -1];
    sides.forEach(function (sd) {
      zb.boxes.forEach(function (bx) {
        var x0 = sd * bx.lat[0], x1 = sd * bx.lat[1];
        parts.push('<rect class="nx-lesion" x="' + f(Math.min(x0, x1)) + '" y="' + f(bx.z[0]) + '" width="' + f(Math.abs(x1 - x0)) + '" height="' + f(bx.z[1] - bx.z[0]) + '"/>');
      });
    });
  }
  parts.push("</g>");
  // 腦神經出腦幹處的標籤（外側的纖維會超出外形）
  nervesAt(model, y, 0.6).forEach(function (seg) {
    if (seg.side !== "R") return;
    var p = seg.pts[seg.pts.length - 1];
    if (Math.abs(p.x) < bs.a * 0.7 && p.z < bs.zc + bs.b * 0.7) return;
    parts.push('<text class="nx-nlabel" x="' + f(p.x - 0.4) + '" y="' + f(p.z + 1.4) + '" text-anchor="end">' + NV[seg.id].num + "</text>");
  });
  if (opts.labels !== false) {
    parts.push('<text class="nx-ori" x="0" y="' + (-H / 2 + 1.1 * k) + '" text-anchor="middle">後</text>');
    parts.push('<text class="nx-ori" x="0" y="' + (H / 2 - 0.5 * k) + '" text-anchor="middle">前</text>');
    parts.push('<text class="nx-ori" x="' + (-W / 2 + 0.6 * k) + '" y="0">右</text>');
    parts.push('<text class="nx-ori" x="' + (W / 2 - 0.6 * k) + '" y="0" text-anchor="end">左</text>');
  }
  parts.push("</svg>");
  return parts.join("");
}
