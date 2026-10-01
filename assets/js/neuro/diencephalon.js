/**
 * 神經解剖學：間腦的水平切面（SVG 字串，瀏覽器與 build 共用）。
 *
 * 模型的 y 軸就是腦幹的長軸，所以腦幹的橫切面往上延伸，到間腦就是大腦的水平切面：
 * 視丘各核、下視丘各核、內囊（前肢、膝部、後肢、後豆狀部）、尾狀核、豆狀核都依 structures.json 的 ell（橢球）
 * 與 diencephalon.json 的內囊中心線切出來。方向和腦幹切面相同：後方在上、觀看者的左邊 = 病人右側。
 */

var SEQ = 0;
function f1(v) { return (Math.round(v * 10) / 10).toString(); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
/** 圖上的簡稱：有縮寫用縮寫，否則用中文名稱去掉括號。 */
export function shortName(s) {
  if (s.abbr) return s.abbr;
  return s.zh.replace(/（.*?）/g, "").replace(/^視丘/, "");
}

/** y 高度被切到的橢球核：[{id, side, x, z, rx, rz}]。 */
export function ellAt(model, y) {
  var S = model.data.structures.structures, out = [];
  Object.keys(S).forEach(function (id) {
    var e = S[id].ell;
    if (!e || Math.abs(y - e[0]) >= e[4]) return;
    var k = Math.sqrt(1 - Math.pow((y - e[0]) / e[4], 2));
    [["R", -1], ["L", 1]].forEach(function (sd) {
      out.push({ id: id, side: sd[0], x: sd[1] * e[1], z: e[2], rx: Math.max(0.15, e[3] * k), rz: Math.max(0.15, e[5] * k), big: e[3] * e[5] });
    });
  });
  // 大的先畫，小的蓋在上面
  return out.sort(function (a, b) { return b.big - a.big; });
}

/**
 * opts：scale、highlight（路徑 id 陣列）、nucleus（要強調的核）、brainLesion、label、labels（false = 不寫字）
 */
export function diencSectionSVG(model, y, opts) {
  opts = opts || {};
  var S = model.data.structures.structures, T = model.data.tracts, DI = model.DI;
  var k = opts.scale || 11, X0 = 40, Z0 = -30, Z1 = 40;
  var W = 2 * X0 * k, H = (Z1 - Z0) * k;
  var f = function (v) { return f1(v * k); };
  var hl = opts.highlight || null, hot = opts.nucleus || null;
  var id = "nxdi" + (++SEQ);
  var p = ['<svg class="nx-section nx-dsection" viewBox="' + f1(-X0 * k) + " " + f1(Z0 * k) + " " + f1(W) + " " + f1(H) + '" role="img" aria-label="' + esc(opts.label || "間腦水平切面") + '">'];
  p.push('<defs><clipPath id="' + id + '"><rect x="' + f1(-X0 * k) + '" y="' + f1(Z0 * k) + '" width="' + f1(W) + '" height="' + f1(H) + '"/></clipPath></defs><g clip-path="url(#' + id + ')">');

  // 大腦半球的切面（外框）。胼胝體以下間腦把兩側連起來，所以中線不留縱裂
  var Hm = model.HEMI, dy = Math.pow(Math.abs((y - Hm.c[1]) / Hm.r[1]), model.HP);
  var joined = y < 106;
  if (joined) {
    var right = [], left = [];
    for (var zz = Hm.c[2] - Hm.r[2]; zz <= Hm.c[2] + Hm.r[2] + 1e-6; zz += 2) {
      var rr = 1 - dy - Math.pow(Math.abs((zz - Hm.c[2]) / Hm.r[2]), model.HP);
      if (rr <= 0) continue;
      var ox = Hm.c[0] + Hm.r[0] * Math.pow(rr, 1 / model.HP);
      right.push([-ox, zz]); left.unshift([ox, zz]);
    }
    if (right.length > 1) p.push('<path class="nx-di-hemi" d="M' + right.concat(left).map(function (q) { return f(q[0]) + " " + f(q[1]); }).join("L") + 'Z"/>');
  }
  [-1, 1].forEach(function (sd) {
    if (joined) return;
    var outer = [], inner = [];
    for (var z = Hm.c[2] - Hm.r[2]; z <= Hm.c[2] + Hm.r[2] + 1e-6; z += 2) {
      var rest = 1 - dy - Math.pow(Math.abs((z - Hm.c[2]) / Hm.r[2]), model.HP);
      if (rest <= 0) continue;
      outer.push([Hm.c[0] + Hm.r[0] * Math.pow(rest, 1 / model.HP), z]);
      inner.push([Hm.c[0] - Hm.r[0] * Math.pow(rest, 1 / model.HPX), z]);
    }
    if (outer.length < 2) return;
    var ring = outer.concat(inner.reverse());
    p.push('<path class="nx-di-hemi" d="M' + ring.map(function (q) { return f(sd * q[0]) + " " + f(q[1]); }).join("L") + 'Z"/>');
  });

  // 第三腦室
  if (DI && y >= DI.third.y0 && y <= DI.third.y1) {
    p.push('<rect class="nx-di-vent" x="' + f(-DI.third.half) + '" y="' + f(DI.third.z0) + '" width="' + f(2 * DI.third.half) + '" height="' + f(DI.third.z1 - DI.third.z0) + '" rx="' + f(DI.third.half) + '"/>');
  }
  // 視丘與下視丘的外形（虛線）
  var LB = model.data.levels.brain;
  [["thalamus", LB.thalamus], ["hypothalamus", LB.hypothalamus]].forEach(function (d) {
    var e = d[1], t = (y - e.c[1]) / e.r[1];
    if (Math.abs(t) >= 1) return;
    var kk = Math.sqrt(1 - t * t);
    [-1, 1].forEach(function (sd) {
      p.push('<ellipse class="nx-di-shell" cx="' + f(sd * e.c[0]) + '" cy="' + f(e.c[2]) + '" rx="' + f(e.r[0] * kk) + '" ry="' + f(e.r[2] * kk) + '"/>');
    });
  });

  // 內囊（依段上色）
  var icParts = DI ? DI.ic.parts : {};
  if (DI && y >= DI.ic.y0 && y <= DI.ic.y1) {
    var line = model.icLine(y);
    [-1, 1].forEach(function (sd) {
      for (var i = 0; i < line.length - 1; i++) {
        var a = line[i], b = line[i + 1], part = b.part === "genu" || a.part === "genu" ? "genu" : b.part;
        var pc = part === "posterior" && b.z < -3 ? "posterior-s" : part;
        p.push('<line class="nx-di-ic" x1="' + f(sd * a.lat) + '" y1="' + f(a.z) + '" x2="' + f(sd * b.lat) + '" y2="' + f(b.z) + '" style="--c:' + icParts[pc].color + ";stroke-width:" + f1(2 * DI.ic.half * k) + '"><title>內囊' + icParts[pc].zh + "</title></line>");
      }
    });
  }
  if (DI && y >= 82.5 && y <= 88) {   // 豆狀核下部（聽放射、部分視放射）
    [-1, 1].forEach(function (sd) {
      p.push('<line class="nx-di-ic" x1="' + f(sd * 23) + '" y1="' + f(-10) + '" x2="' + f(sd * 32) + '" y2="' + f(-10.5) + '" style="--c:' + icParts.sub.color + ";stroke-width:" + f1(2.4 * k) + '"><title>內囊豆狀核下部</title></line>');
    });
  }

  // 橢球核
  var cut = ellAt(model, y);
  cut.forEach(function (n) {
    var s = S[n.id], col = s.color || "#b9b2c8";
    var cls = "nx-di-nuc" + (hot ? (hot === n.id ? " is-hot" : " is-dim") : "") + (/^(claustrum)$/.test(n.id) ? " is-ctx" : "");
    p.push('<ellipse class="' + cls + '" data-structure="' + n.id + '" cx="' + f(n.x) + '" cy="' + f(n.z) + '" rx="' + f(n.rx) + '" ry="' + f(n.rz) + '" style="--c:' + col + '"><title>' + esc(s.zh) + "（" + esc(s.en) + "）</title></ellipse>");
  });
  // 尾狀核的體與尾（C 字形的管子和這一層的交點）
  if (model.caudateTailAt && S.caudate) {
    model.caudateTailAt(y).forEach(function (q) {
      [-1, 1].forEach(function (sd) {
        p.push('<ellipse class="nx-di-nuc' + (hot ? (hot === "caudate" ? " is-hot" : " is-dim") : "") + '" data-structure="caudate" cx="' + f(sd * q.lat) + '" cy="' + f(q.z) + '" rx="' + f(q.r) + '" ry="' + f(q.r) + '" style="--c:' + (S.caudate.color || "#b9b2c8") + '"><title>' + esc(S.caudate.zh) + "（體、尾）</title></ellipse>");
      });
    });
  }
  // 其他形狀的核：nuc（例如內側膝狀體）與外側膝狀體
  Object.keys(S).forEach(function (sid) {
    var s = S[sid];
    if (s.nuc && s.region !== "cerebellum" && y >= s.nuc[0][0] && y <= s.nuc[s.nuc.length - 1][0] && y > 79) {
      // 沿著 nuc 路徑內插出這一層的位置（海馬這種斜著走的核才會跟著切面移動）
      var a = s.nuc[0];
      for (var qi = 0; qi < s.nuc.length - 1; qi++) {
        var q0 = s.nuc[qi], q1 = s.nuc[qi + 1];
        if (y >= q0[0] && y <= q1[0] && q1[0] > q0[0]) {
          var tt = (y - q0[0]) / (q1[0] - q0[0]);
          a = q0.map(function (v, k) { return v + (q1[k] - v) * tt; });
          break;
        }
      }
      [-1, 1].forEach(function (sd) {
        cut.push({ id: sid, side: sd < 0 ? "R" : "L", x: sd * a[1], z: a[2], rx: a[3], rz: a[4] });
        p.push('<ellipse class="nx-di-nuc' + (hot ? (hot === sid ? " is-hot" : " is-dim") : "") + '" data-structure="' + sid + '" cx="' + f(sd * a[1]) + '" cy="' + f(a[2]) + '" rx="' + f(a[3]) + '" ry="' + f(a[4]) + '" style="--c:' + (s.color || "#b9b2c8") + '"><title>' + esc(s.zh) + "</title></ellipse>");
      });
    }
    if (s.vis && sid === "lgn" && model.data.visual) {
      var L = model.data.visual.lgn, t = (y - L.y) / L.r[1];
      if (Math.abs(t) < 1) {
        var kk = Math.sqrt(1 - t * t);
        [-1, 1].forEach(function (sd) {
          cut.push({ id: sid, side: sd < 0 ? "R" : "L", x: sd * L.lat, z: L.z, rx: L.r[0] * kk, rz: L.r[2] * kk });
          p.push('<ellipse class="nx-di-nuc' + (hot ? (hot === sid ? " is-hot" : " is-dim") : "") + '" data-structure="lgn" cx="' + f(sd * L.lat) + '" cy="' + f(L.z) + '" rx="' + f(L.r[0] * kk) + '" ry="' + f(L.r[2] * kk) + '" style="--c:#ffb86b"><title>' + esc(s.zh) + "</title></ellipse>");
        });
      }
    }
  });

  // 經過這一層的路徑
  T.order.forEach(function (tid) {
    var tr = T.tracts[tid];
    tr.bundles.forEach(function (b) {
      ["R", "L"].forEach(function (body) {
        var at = model.brainAt(b, y, body);
        if (!at) return;
        var dim = hl && hl.indexOf(tid) < 0;
        p.push('<ellipse class="nx-tract' + (dim ? " is-dim" : "") + '" data-tract="' + tid + '" cx="' + f(at.x) + '" cy="' + f(at.z) + '" rx="' + f(Math.min(at.rx, 0.8)) + '" ry="' + f(Math.min(at.rz, 0.8)) + '" style="--c:' + tr.color + '"><title>' + esc(b.zh) + "</title></ellipse>");
      });
    });
  });

  if (opts.brainLesion) {
    var zb = opts.brainLesion;
    (zb.side === "both" ? [-1, 1] : [zb.side === "L" ? 1 : -1]).forEach(function (sd) {
      zb.boxes.forEach(function (bx) {
        var x0 = sd * bx.lat[0], x1 = sd * bx.lat[1];
        p.push('<rect class="nx-lesion" x="' + f(Math.min(x0, x1)) + '" y="' + f(bx.z[0]) + '" width="' + f(Math.abs(x1 - x0)) + '" height="' + f(bx.z[1] - bx.z[0]) + '"/>');
      });
    });
  }
  p.push("</g>");

  // 標籤：只寫在病人右側（畫面左邊）
  if (opts.labels !== false) {
    var seen = {};
    cut.forEach(function (n) {
      if (n.side !== "R" || seen[n.id] || n.rx < 1.1 || n.rz < 0.9) return;
      seen[n.id] = 1;
      p.push('<text class="nx-di-label" x="' + f(n.x) + '" y="' + f(n.z + 0.45) + '" text-anchor="middle">' + esc(shortName(S[n.id])) + "</text>");
    });
    if (DI && y >= DI.ic.y0 && y <= DI.ic.y1) {
      var ln = model.icLine(y);
      [[1, "前肢"], [3, "膝"], [5, "後肢"], [7, "後豆狀部"]].forEach(function (q) {
        var a = ln[q[0]];
        if (!a) return;
        p.push('<text class="nx-di-ic-label" x="' + f(-a.lat - 2.2) + '" y="' + f(a.z + 0.4) + '" text-anchor="end">' + q[1] + "</text>");
      });
    }
    p.push('<text class="nx-ori" x="0" y="' + f(Z0 + 1.6) + '" text-anchor="middle">後</text>');
    p.push('<text class="nx-ori" x="0" y="' + f(Z1 - 0.8) + '" text-anchor="middle">前</text>');
    p.push('<text class="nx-ori" x="' + f(-X0 + 0.8) + '" y="' + f(Z0 + 1.6) + '">右</text>');
    p.push('<text class="nx-ori" x="' + f(X0 - 0.8) + '" y="' + f(Z0 + 1.6) + '" text-anchor="end">左</text>');
  }
  p.push("</svg>");
  return p.join("");
}
