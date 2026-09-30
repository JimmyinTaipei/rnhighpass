/**
 * 神經解剖學：聽覺與前庭（瀏覽器與 node 的 build 共用，不依賴 three.js）。
 *
 * 每一耳的聽覺訊息有三條代表路線（Barr p.328–330；Haines p.312–316）：
 *   - 單耳：背側（後）耳蝸神經核 → 背側聽紋交叉 → 對側外側蹄系 → 下丘 → 內側膝狀體 → 聽覺皮質
 *   - 雙耳・對側：腹側（前）耳蝸神經核 → 斜方體交叉 → 對側上橄欖核 → 對側外側蹄系 → …
 *   - 雙耳・同側：腹側耳蝸神經核 → 同側上橄欖核 → 同側外側蹄系 → …
 * 三條路線都被切斷的那一耳才會聾；只切到一部分（耳蝸神經核以上的單側病灶）兩耳都還聽得到，
 * 只會影響聲音方向的判斷（Barr p.321, 330；Haines p.312, 317）。
 * 前庭：半規管、耳石器、前庭神經被切到 → 同側前庭功能喪失（Barr p.340, 378）。
 */
import { inZone, samples } from "./visual.js";

var SIDES = ["R", "L"];
var OTHER = { R: "L", L: "R" };

function add3(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
/** 與 n 垂直的一組單位向量（在 [y, X, z] 空間裡算，最後才換成病人的左右）。 */
function basis(n) {
  n = norm(n);
  var ref = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  var u = norm(cross(n, ref));
  return [u, cross(n, u)];
}

/**
 * 依 auditory.json 建出內耳、聽覺路線與前庭路線。model 需要 sx、nervePoints、nucPath、getBundle。
 */
export function buildAuditory(model, A) {
  var LB = A.labyrinth;
  /** [y, X, z]（X 相對於 ear；X < 0 = 同側）→ 病人座標。mirror = 換到另一側。 */
  function P(ear, w, mirror) { return { x: model.sx(mirror ? -w[1] : w[1], ear), y: w[0], z: w[2] }; }
  function PL(ear, list, mirror) { return list.map(function (w) { return P(ear, w, mirror); }); }

  /* ---------- 內耳 ---------- */
  function spiralW(t) {
    var C = LB.cochlea, ax = norm(C.axis), b = basis(ax);
    var a = t * C.turns * Math.PI * 2, r = C.r0 + (C.r1 - C.r0) * t;
    var p = add3(C.base, ax, C.height * Math.pow(t, 0.8));
    p = add3(p, b[0], r * Math.cos(a));
    return add3(p, b[1], r * Math.sin(a));
  }
  /** 耳蝸的螺旋（t = 0 底部＝高頻、1 頂部＝低頻）。 */
  function spiral(ear, n) {
    n = n || 90;
    var out = [];
    for (var i = 0; i <= n; i++) { var p = P(ear, spiralW(i / n)); p.t = i / n; out.push(p); }
    return out;
  }
  function ringW(c, r, n, k) {
    var b = basis(n), out = [];
    for (var i = 0; i <= k; i++) {
      var a = (i / k) * Math.PI * 2;
      out.push(add3(add3(c, b[0], r * Math.cos(a)), b[1], r * Math.sin(a)));
    }
    return out;
  }
  function canals(ear) {
    return Object.keys(LB.canals).map(function (id) {
      var c = LB.canals[id];
      return { id: id, zh: c.zh, pts: PL(ear, ringW(c.c, c.r, c.n, 48)), amp: P(ear, c.amp) };
    });
  }
  function blobs(ear) {
    return [["vestibule", LB.vestibule], ["utricle", LB.utricle], ["saccule", LB.saccule]].map(function (d) {
      return { id: d[0], c: P(ear, d[1].c), r: d[1].r };
    });
  }

  /* ---------- 神經 ---------- */
  /** cn8 主幹由外往內（最後一點是前庭、耳蝸神經核之間的入口）。 */
  function trunkIn(ear) { return model.nervePoints("cn8", ear).slice().reverse(); }
  function cochlearNerve(ear) {
    var t = trunkIn(ear);
    return PL(ear, A.nerve.cochlear).concat(t.slice(1, t.length - 1));
  }
  function vestibularNerve(ear) {
    var t = trunkIn(ear);
    return PL(ear, A.nerve.vestibular).concat(t.slice(1));
  }

  /* ---------- 中樞：用 tracts.json 的 auditory 路徑 bundle ---------- */
  function bundle(id, ear, mirror) {
    var b = model.getBundle("@auditory." + id);
    return b ? b.brain.map(function (w) { return P(ear, w, mirror); }) : [];
  }
  function nucOr(id, ear, w, mirror) {
    // 有 nuc 的結構用整段路徑判斷病灶；w 是代表點（[y, X, z]，X > 0 = 對側）
    var side = mirror ? ear : OTHER[ear];
    var np = model.nucPath && model.nucPath(id, side);
    return np && np.length ? np.map(function (p) { return { x: p.x, y: p.y, z: p.z }; }) : [P(ear, w, mirror)];
  }
  function heschl(ear, mirror) { return PL(ear, A.heschl.pts, mirror); }
  /** 聽覺皮質上某一頻率的位置（t = 0 高頻、1 低頻）。 */
  function heschlAt(ear, t, mirror) {
    var h = A.heschl.pts, f = Math.max(0, Math.min(1, t)) * (h.length - 1), i = Math.min(h.length - 2, Math.floor(f)), k = f - i;
    var w = [h[i][0] + (h[i + 1][0] - h[i][0]) * k, h[i][1] + (h[i + 1][1] - h[i][1]) * k, h[i][2] + (h[i + 1][2] - h[i][2]) * k];
    return P(ear, w, mirror);
  }
  /** 上行的後半段（外側蹄系 → 聽覺皮質），mirror = 走同側。 */
  function upper(ear, mirror) {
    return [
      { stage: "ll", pts: bundle("ll", ear, mirror) },
      { stage: "ic", pts: nucOr("inferior-colliculus", ear, A.ic, mirror) },
      { stage: "bic", pts: bundle("bic", ear, mirror) },
      { stage: "mgn", pts: nucOr("mgn", ear, A.mgn, mirror) },
      { stage: "ar", pts: bundle("ar", ear, mirror) },
      { stage: "a1", pts: heschl(ear, mirror) }
    ];
  }
  function routes(ear) {
    var head = [{ stage: "cochlea", pts: spiral(ear, 40) }, { stage: "cnerve", pts: cochlearNerve(ear) }];
    return [
      { id: "dcn", segs: head.concat([{ stage: "cn", pts: PL(ear, A.root.dcn) }, { stage: "das", pts: bundle("das", ear) }], upper(ear, false)) },
      { id: "vcn-c", segs: head.concat([{ stage: "cn", pts: PL(ear, A.root.vcn) }, { stage: "tb", pts: bundle("tb", ear) }, { stage: "soc", pts: nucOr("superior-olive", ear, A.soc, false) }], upper(ear, false)) },
      { id: "vcn-i", segs: head.concat([{ stage: "cn", pts: PL(ear, A.root.vcn) }, { stage: "soc", pts: PL(ear, A.vcnToSoc).concat(nucOr("superior-olive", ear, A.soc, true)) }], upper(ear, true)) }
    ];
  }
  function vestibularParts(ear) {
    var lab = [];
    canals(ear).forEach(function (c) { lab = lab.concat(c.pts); });
    blobs(ear).forEach(function (b) { lab.push(b.c); });
    return [{ stage: "vlab", pts: lab }, { stage: "vnerve", pts: vestibularNerve(ear) }];
  }

  /** 神經元鏈用的點（geometry.js 的 resolvePt case "aud"）。ear = 這一耳（或 VOR 的轉頭方向）。 */
  function points(q, ear) {
    var mirror = q.side === "ipsi";
    switch (q.part) {
      case "hair": return [P(ear, spiralW(q.t == null ? 0.3 : q.t))];
      case "cnerve": {
        // 從 Corti 器沿螺旋回到蝸軸的螺旋神經節，再經耳蝸神經進腦幹
        return [P(ear, LB.spiralGanglion)].concat(cochlearNerve(ear).slice(1));
      }
      case "root": return PL(ear, A.root[q.which]);
      case "vcn-soc": return PL(ear, A.vcnToSoc);
      case "b": return bundle(q.b, ear, mirror);
      case "soc": return [P(ear, A.soc, mirror)];
      case "ic": return [P(ear, A.ic, mirror)];
      case "mgn": return [P(ear, A.mgn, mirror)];
      case "heschl": return [heschlAt(ear, q.t == null ? 0.5 : q.t, mirror)];
      case "canal": return [P(ear, LB.canals[q.id || "lateral"].amp)];
      case "vnerve": return PL(ear, A.nerve.vestibular).slice(1).concat(trunkIn(ear).slice(1));
      case "vn": return [P(ear, A.vor.vn)];
      case "pivc": return [P(ear, A.pivc, mirror)];
    }
    return [];
  }

  return {
    A: A, P: P, spiral: spiral, canals: canals, blobs: blobs, heschl: heschl, heschlAt: heschlAt,
    cochlearNerve: cochlearNerve, vestibularNerve: vestibularNerve, routes: routes, vestibularParts: vestibularParts, points: points,
    scarpa: function (ear) { return P(ear, LB.scarpa); }, spiralGanglion: function (ear) { return P(ear, LB.spiralGanglion); },
    pivc: function (side) { return { x: model.sx(A.pivc[1], OTHER[side]), y: A.pivc[0], z: A.pivc[2] }; }
  };
}

/* ======================================================================
   病灶 → 聽覺與前庭的缺損
   ====================================================================== */
var PERIPH = { cochlea: 1, cnerve: 1, cn: 1 };
var CAUDAL = { tb: 1, das: 1, soc: 1 };   // 橋腦下段：臨床上通常不明顯

/**
 * zones：lesions.json 的 zones（只看有 brain 方框的）。
 * 回傳 { deaf: {R: [stage…]}, central: {R: [stage…]}, vest: {R: [stage…]}, routes: {R: {dcn: stage|null, …}} }
 */
export function auditoryLoss(model, zones) {
  var AU = model.aud;
  var out = { deaf: {}, central: {}, vest: {}, routes: {} };
  if (!AU) return out;
  var zbs = zones.filter(function (z) { return z.brain; }).map(function (z) { return z.brain; });
  if (!zbs.length) return out;
  function firstHit(pts) {
    if (!pts || !pts.length) return null;
    var s = samples(pts);
    for (var i = 0; i < s.length; i++) if (zbs.some(function (zb) { return inZone(zb, s[i]); })) return s[i];
    return null;
  }
  SIDES.forEach(function (ear) {
    var rs = AU.routes(ear), cutAt = {}, periph = [], central = [];
    rs.forEach(function (r) {
      cutAt[r.id] = null;
      for (var i = 0; i < r.segs.length; i++) {
        var p = firstHit(r.segs[i].pts);
        if (!p) continue;
        if (!cutAt[r.id]) cutAt[r.id] = { stage: r.segs[i].stage, side: p.x < 0 ? "R" : "L", also: [] };
        else if ((p.x < 0 ? "R" : "L") === cutAt[r.id].side) cutAt[r.id].also.push(r.segs[i].stage);   // 同一條路線後面也被切到的站（只用在描述）
      }
    });
    out.routes[ear] = cutAt;
    var all = rs.every(function (r) { return cutAt[r.id]; });
    rs.forEach(function (r) {
      var c = cutAt[r.id];
      if (!c) return;
      if (PERIPH[c.stage]) periph.push(c.stage);
      else central.push(c);
    });
    if (all && periph.length === rs.length) out.deaf[ear] = uniq(periph);
    else if (all) out.deaf[ear] = uniq(periph.concat(central.map(function (c) { return c.stage; })));
    else central.forEach(function (c) { out.central[c.side] = (out.central[c.side] || []).concat([c.stage], c.also); });
    var vs = [];
    AU.vestibularParts(ear).forEach(function (seg) { if (firstHit(seg.pts)) vs.push(seg.stage); });
    if (vs.length) out.vest[ear] = vs;
  });
  Object.keys(out.central).forEach(function (s) { out.central[s] = uniq(out.central[s]); });
  return out;
}
function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

export var STAGE_ZH = {
  cochlea: "耳蝸", cnerve: "耳蝸神經", cn: "耳蝸神經核", das: "背側聽紋", tb: "斜方體", soc: "上橄欖核",
  ll: "外側蹄系", ic: "下丘", bic: "下丘臂", mgn: "內側膝狀體", ar: "聽放射", a1: "聽覺皮質", vlab: "半規管與耳石器", vnerve: "前庭神經"
};
var ORDER = ["cochlea", "cnerve", "cn", "das", "tb", "soc", "ll", "ic", "bic", "mgn", "ar", "a1"];
function vias(list) {
  return list.slice().sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); }).map(function (s) { return STAGE_ZH[s]; }).join("、");
}

/** 缺損清單（格式和 lesion.js 的 deficits 相同）。 */
export function auditoryItems(loss) {
  var items = [], ZH = { R: "右", L: "左" };
  SIDES.forEach(function (e) {
    if (loss.deaf[e]) items.push({ key: "hearing:" + e, kind: "hearing", side: e, minor: false, text: ZH[e] + "耳聽力喪失（感音性；" + vias(loss.deaf[e]) + "）" });
  });
  SIDES.forEach(function (s) {
    var st = loss.central[s];
    if (!st) return;
    var minor = st.every(function (x) { return CAUDAL[x]; });
    items.push({
      key: "aud-central:" + s, kind: "aud-central", side: s, minor: minor,
      text: ZH[s] + "側中樞聽覺路徑受損（" + vias(st) + "）：兩耳都還聽得到（耳蝸神經核以上雙側上傳），但不容易判斷" + ZH[OTHER[s]] + "側聲音的方向" + (minor ? "，臨床上常不明顯" : "")
    });
  });
  SIDES.forEach(function (e) {
    var v = loss.vest[e];
    if (!v) return;
    items.push({ key: "vestib-periph:" + e, kind: "vestib-periph", side: e, minor: false, text: ZH[e] + "側前庭功能喪失：眩暈、眼球震顫、噁心嘔吐，容易往" + ZH[e] + "側倒（" + v.map(function (x) { return STAGE_ZH[x]; }).join("、") + "）" });
  });
  return items;
}

/* ======================================================================
   2D：由前方看的聽覺路線圖（SVG 字串，build 與瀏覽器共用）
   觀看者面對病人，所以病人右側畫在左邊（和 3D 的「聽覺路徑」視角相同）。
   ====================================================================== */
var EAR_COLOR = { R: "#f59e42", L: "#8a7bf0" };
var EAR_DX = { R: -0.9, L: 0.9 };   // 兩耳的路線在同一側重疊時稍微錯開
var svgSeq = 0;
function f1(v) { return (Math.round(v * 10) / 10).toString(); }

/** opts.zones：病灶（被切斷的路線從切斷處之後變灰）；opts.label：aria-label。 */
export function auditorySVG(model, opts) {
  opts = opts || {};
  var AU = model.aud;
  if (!AU) return "";
  var K = 3, X = function (p) { return f1(p.x * K); }, Y = function (p) { return f1(-p.y * K); };
  var zbs = (opts.zones || []).filter(function (z) { return z.brain; }).map(function (z) { return z.brain; });
  var hitAt = function (p) { return zbs.some(function (zb) { return inZone(zb, p); }); };
  var fid = "nx-aud-fade" + (++svgSeq);
  var h = ['<svg class="nx-aud" viewBox="' + [-66 * K, -100 * K, 132 * K, 80 * K].join(" ") + '" role="img" aria-label="' + (opts.label || "聽覺路線圖") + '">'];
  // 大腦半球只畫下半部，往上淡出
  h.push('<defs><linearGradient id="' + fid + '-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="0.25" stop-color="#fff"/></linearGradient>' +
    '<mask id="' + fid + '"><rect x="' + (-66 * K) + '" y="' + (-100 * K) + '" width="' + (132 * K) + '" height="' + (80 * K) + '" fill="url(#' + fid + '-g)"/></mask></defs>');
  h.push('<g mask="url(#' + fid + ')">');
  [-1, 1].forEach(function (sd) {
    var H = model.HEMI, pts = [];
    for (var i = 0; i <= 60; i++) {
      var ax = H.c[0] - H.r[0] + (2 * H.r[0] * i) / 60, top = model.hemiTop(ax, -6);
      if (top > H.c[1]) pts.push([ax, top]);
    }
    var bot = pts.slice().reverse().map(function (q) { return [q[0], 2 * H.c[1] - q[1]]; });
    h.push('<path class="nx-aud-hemi" d="M' + pts.concat(bot).map(function (q) { return f1(sd * q[0] * K) + " " + f1(-q[1] * K); }).join("L") + 'Z"/>');
  });
  h.push("</g>");
  // 腦幹、視丘的外形（冠狀投影）
  var bs = [], bs2 = [];
  for (var y = 22; y <= 80; y += 2) { var b = model.brainstemAt(y); bs.push([-b.a, y]); bs2.unshift([b.a, y]); }
  h.push('<path class="nx-aud-stem" d="M' + bs.concat(bs2).map(function (q) { return f1(q[0] * K) + " " + f1(-q[1] * K); }).join("L") + 'Z"/>');
  var TH = model.data.levels.brain.thalamus;
  [-1, 1].forEach(function (sd) { h.push('<ellipse class="nx-aud-thal" cx="' + f1(sd * TH.c[0] * K) + '" cy="' + f1(-TH.c[1] * K) + '" rx="' + f1(TH.r[0] * K) + '" ry="' + f1(TH.r[1] * K) + '"/>'); });
  // 內耳
  ["R", "L"].forEach(function (ear) {
    h.push('<path class="nx-aud-coch" d="M' + AU.spiral(ear, 60).map(function (p) { return X(p) + " " + Y(p); }).join("L") + '"/>');
    AU.canals(ear).forEach(function (c) { h.push('<path class="nx-aud-canal" d="M' + c.pts.map(function (p) { return X(p) + " " + Y(p); }).join("L") + '"/>'); });
  });
  // 病灶
  zbs.forEach(function (zb) {
    (zb.side === "both" ? [-1, 1] : [zb.side === "L" ? 1 : -1]).forEach(function (sd) {
      zb.boxes.forEach(function (bx) {
        var x0 = sd < 0 ? -bx.lat[1] : bx.lat[0];
        h.push('<rect class="nx-aud-lesion" x="' + f1(x0 * K) + '" y="' + f1(-zb.y[1] * K) + '" width="' + f1((bx.lat[1] - bx.lat[0]) * K) + '" height="' + f1((zb.y[1] - zb.y[0]) * K) + '"/>');
      });
    });
  });
  // 路線：從螺旋神經節到聽覺皮質；被切斷之後畫成灰色虛線
  ["R", "L"].forEach(function (ear) {
    AU.routes(ear).forEach(function (r) {
      var pts = [];
      r.segs.forEach(function (sg) { if (sg.stage !== "cochlea") pts = pts.concat(sg.pts.length > 3 || sg.stage !== "soc" ? sg.pts : sg.pts.slice(0, 1)); });
      var s = samples(pts), cut = -1;
      if (zbs.length) for (var i = 0; i < s.length; i++) if (hitAt(s[i])) { cut = i; break; }
      var coch = r.segs[0].pts;
      if (zbs.length && coch.some(hitAt)) cut = 0;
      var dx = EAR_DX[ear] * K;
      var d = function (arr) { return "M" + arr.map(function (p) { return f1(p.x * K + dx) + " " + Y(p); }).join("L"); };
      if (cut < 0) h.push('<path class="nx-aud-route" style="--c:' + EAR_COLOR[ear] + '" d="' + d(s) + '"/>');
      else {
        if (cut > 1) h.push('<path class="nx-aud-route" style="--c:' + EAR_COLOR[ear] + '" d="' + d(s.slice(0, cut + 1)) + '"/>');
        h.push('<path class="nx-aud-route is-cut" d="' + d(s.slice(Math.max(0, cut))) + '"/>');
      }
    });
  });
  // 轉運站與標籤（標籤寫在病人右側那一半）
  var node = function (p, t, anchor, dx, dy) {
    h.push('<circle class="nx-aud-node" cx="' + X(p) + '" cy="' + Y(p) + '" r="3.2"/>');
    if (t) h.push('<text class="nx-aud-label" x="' + f1(p.x * K + (dx || 0)) + '" y="' + f1(-p.y * K + (dy || 0)) + '" text-anchor="' + (anchor || "end") + '">' + t + "</text>");
  };
  var A = AU.A;
  ["R", "L"].forEach(function (ear) {
    var lab = ear === "R";
    node(AU.P(ear, A.dcn), lab ? "耳蝸神經核" : "", "middle", -4, -9);
    node(AU.P(ear, A.soc, true), lab ? "上橄欖核" : "", "end", -5, -6);
    node(AU.P(ear, A.ic, true), lab ? "下丘" : "", "end", -6, 3);
    node(AU.P(ear, A.mgn, true), lab ? "內側膝狀體" : "", "end", -6, 3);
    node(AU.heschlAt(ear, 0.5, true), lab ? "聽覺皮質" : "", "end", -6, -6);
    var c = AU.spiral(ear, 10)[5];
    h.push('<text class="nx-aud-ear" x="' + X(c) + '" y="' + f1(-c.y * K + 24) + '" text-anchor="middle" style="fill:' + EAR_COLOR[ear] + '">' + (ear === "R" ? "右耳" : "左耳") + "</text>");
  });
  var ll = model.getBundle("@auditory.ll"), mid = ll.brain[3];
  h.push('<text class="nx-aud-label" x="' + f1(-mid[1] * K - 6) + '" y="' + f1(-mid[0] * K) + '" text-anchor="end">外側蹄系</text>');
  h.push('<text class="nx-aud-label" x="0" y="' + f1(-30.5 * K) + '" text-anchor="middle">斜方體</text>');
  h.push('<text class="nx-aud-small" x="' + f1(-64 * K) + '" y="' + f1(-96 * K) + '">病人右側</text><text class="nx-aud-small" x="' + f1(64 * K) + '" y="' + f1(-96 * K) + '" text-anchor="end">病人左側</text>');
  h.push("</svg>");
  return h.join("");
}

/** 兩耳聽不聽得到、方向判斷（病灶頁的小表）。 */
export function hearingSummary(loss) {
  var ZH = { R: "右", L: "左" };
  return ["R", "L"].map(function (e) {
    var cut = loss.routes[e] || {}, n = Object.keys(cut).filter(function (k) { return cut[k]; }).length;
    return { ear: e, zh: ZH[e] + "耳", deaf: !!loss.deaf[e], cut: n, total: Object.keys(cut).length || 3 };
  });
}
