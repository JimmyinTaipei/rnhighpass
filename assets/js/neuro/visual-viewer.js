/**
 * 神經解剖學：視覺路徑與瞳孔反射的 3D（region/visual.html、視覺路徑與瞳孔光反射的路徑頁、視神經頁）。
 *
 * 幾何全部來自 visual.js（依 visual.json 算出的 16 種代表纖維與反射路線），這裡只負責畫與互動：
 *   - 視野：8 格視野各一個顏色，點視野圖的格子只亮那一格的纖維
 *   - 瞳孔反射：選光照哪一眼，光點沿傳入端走到兩側頂蓋前核、EW 核、動眼神經，瞳孔跟著縮小
 *   - 病灶：被切斷的纖維變灰，視野圖、瞳孔反射表與症狀跟著改變
 * 頁面上的 .nx-viewer[data-engine=visual] 用 data-mode 決定模式：region、tract（visual／plr）、nerve（cn2）。
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { createModel } from "./geometry.js";
import { deficits } from "./lesion.js";
import { visualLoss, fieldSVG, inZone, CELL_IDS } from "./visual.js";

var dataCache = null;
function loadData() {
  if (!dataCache) {
    dataCache = Promise.all(["levels", "tracts", "structures", "lesions", "nerves", "visual"].map(function (f) {
      return fetch("/assets/data/neuro/" + f + ".json").then(function (r) { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); });
    }));
    dataCache.catch(function () { dataCache = null; });
  }
  return dataCache;
}
/** 同 viewer.js：掛到 .nx-viewer，回傳 { destroy }。carry = 切換主題時要保留的狀態。 */
export function mount(el, carry, handle) {
  var life = { dead: false, raf: 0, cleanup: [] };
  handle = handle || { destroy: function () { kill(handle.life); } };
  handle.life = life;
  init(el, life, carry, handle);
  return handle;
}
function kill(life) {
  if (!life || life.dead) return;
  life.dead = true;
  cancelAnimationFrame(life.raf);
  life.cleanup.forEach(function (f) { try { f(); } catch (e) { /* 已經釋放 */ } });
  life.cleanup = [];
}
/** 換主題時整個重建：清回 build 產生的骨架。 */
function resetDom(el) {
  el.innerHTML = '<div class="nx-stage-wrap"><div class="nx-stage" aria-label="3D 模型，可拖曳旋轉、滾輪或雙指縮放"></div><div class="nx-labels" aria-hidden="true"></div><div class="nx-tip" hidden></div><p class="nx-loading">3D 模型載入中…</p></div><div class="nx-panel"></div>';
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
var SZH = { R: "右", L: "左" };
var ORDER_COLOR = { RGC: 0xffe066, LGN: 0x7dd3fc, PT: 0x8be0c9, GVE: 0xff9ec4, CG: 0xffb35c };
var ORDER_ZH = { RGC: "視網膜節細胞", LGN: "外側膝狀核神經元", PT: "頂蓋前核神經元", GVE: "EW 核（節前副交感）", CG: "睫狀神經節（節後副交感）" };
var PUPIL_COLOR = 0xffd166, EFF_COLOR = 0xe39a2d;
var ORDER_LIGHT = { RGC: 0xd19a00, LGN: 0x1c7ed6, PT: 0x0ca678, GVE: 0xe64980, CG: 0xe8590c };
/** 淺色（預設）與深色兩套；背景色在 CSS。 */
var THEMES = {
  light: { hemiLight: [0xffffff, 0x9aa3b5, 1.25], dl: 1.0, dl2: [0xc8d4ff, 0.35], hemi: [0x7d8fb0, 0.07], stem: [0x6f86ad, 0.14], thal: [0x4f7fd6, 0.12],
    pit: 0xa855c8, eye: [0xc9c4b8, 0.22], iris: 0x4a6a96, lgn: 0x1c8fd1, v1: 0xb07d98, pt: 0x0ca678, ew: 0x3a86c8, cg: 0xe8590c, pupil: 0xd19a00, eff: 0xd9821a,
    cut: 0xb8bec9, spark: 0x111827, order: ORDER_LIGHT, lesion: [0xe03131, 0x5a0a0a] },
  dark: { hemiLight: [0xdfe9ff, 0x1a2233, 1.1], dl: 1.3, dl2: [0x9fb8ff, 0.5], hemi: [0xa8b8d8, 0.05], stem: [0x9fb4d4, 0.1], thal: [0x8fb7ff, 0.1],
    pit: 0xd9a6ff, eye: [0xf4f1ea, 0.16], iris: 0x6f8fb8, lgn: 0x7dd3fc, v1: 0xc8a6b8, pt: 0x8be0c9, ew: 0x7fb7e8, cg: 0xffb35c, pupil: PUPIL_COLOR, eff: EFF_COLOR,
    cut: 0x5b6270, spark: 0xffffff, order: ORDER_COLOR, lesion: [0xff4a3d, 0x661010] }
};
function savedTheme() {
  try { return localStorage.getItem("nx-theme") === "dark" ? "dark" : "light"; } catch (e) { return "light"; }
}
var BASE = "/resources/neuro";

function init(root, life, carry, handle) {
  var mode = root.dataset.mode || "region";
  var $ = function (sel, el) { return (el || root).querySelector(sel); };
  var stage = $(".nx-stage"), labelLayer = $(".nx-labels"), tip = $(".nx-tip"), panel = $(".nx-panel");
  var params = new URLSearchParams(location.search);
  var themeName = carry && carry.theme || savedTheme(), TH = THEMES[themeName];
  root.dataset.theme = themeName;
  function oc(o) { return TH.order[o] || ORDER_COLOR[o] || 0x888888; }

  loadData().then(function (a) {
    if (life.dead) return;
    a = JSON.parse(JSON.stringify(a));
    start(createModel({ levels: a[0], tracts: a[1], structures: a[2], lesions: a[3], nerves: a[4], visual: a[5] }));
  }).catch(function (e) {
    $(".nx-loading").textContent = "3D 模型載入失敗，請重新整理頁面。";
    console.error(e);
  });

  function start(model) {
    var VS = model.vis, TR = model.data.tracts.tracts, LE = model.data.lesions, ST = model.data.structures.structures;
    var NV = model.data.nerves.nerves;
    var lesionIds = LE.order.filter(function (id) { return LE.lesions[id].region === "visual"; }).concat(["parinaud"]);
    var tractId = mode === "tract" ? root.dataset.tract : null;
    var state = {
      tab: mode !== "region" ? (tractId === "plr" ? "pupil" : "field") : params.get("lesion") ? "lesion" : params.get("tab") === "pupil" ? "pupil" : "field",
      hot: params.get("cell") && VS.cells[params.get("cell")] ? [params.get("cell")] : null,
      eye: "both",
      light: "R",
      lesion: lesionIds.indexOf(params.get("lesion")) >= 0 ? params.get("lesion") : lesionIds[0],
      variant: tractId && TR[tractId].variants ? TR[tractId].variants[0].id : null,
      side: "R",
      playing: true,
      showBrain: true, showLabels: true
    };
    if (carry && carry.state) Object.assign(state, carry.state);

    /* ---------- three.js ---------- */
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) {
      $(".nx-loading").textContent = "這個瀏覽器無法顯示 3D（WebGL 沒有開啟）。下方的圖與文字仍然可以使用。";
      return;
    }
    $(".nx-loading").remove();
    life.cleanup.push(function () { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    stage.appendChild(renderer.domElement);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(35, 1, 0.5, 3000);
    var controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 10;
    controls.maxDistance = 900;
    scene.add(new THREE.HemisphereLight(TH.hemiLight[0], TH.hemiLight[1], TH.hemiLight[2]));
    var dl = new THREE.DirectionalLight(0xffffff, TH.dl); dl.position.set(60, 160, 160); scene.add(dl);
    var dl2 = new THREE.DirectionalLight(TH.dl2[0], TH.dl2[1]); dl2.position.set(-80, -40, -120); scene.add(dl2);
    var world = new THREE.Group();
    scene.add(world);

    function V3(p) { return new THREE.Vector3(p.x, p.y, p.z); }
    function mat(color, opacity, extra) {
      return new THREE.MeshStandardMaterial(Object.assign({
        color: color, transparent: opacity < 1, opacity: opacity, roughness: 0.6, metalness: 0,
        depthWrite: opacity >= 0.6, side: THREE.DoubleSide
      }, extra || {}));
    }
    function tube(pts, r, color, opacity) {
      if (pts.length < 2) return null;
      var curve = new THREE.CatmullRomCurve3(pts.map(V3), false, "centripetal");
      var m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(32, pts.length * 10), r, 8, false), mat(color, opacity == null ? 1 : opacity));
      m.userData.curve = curve;
      return m;
    }
    function blob(c, r, color, opacity) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat(color, opacity));
      m.scale.set(r[0], r[1], r[2]);
      m.position.set(c.x, c.y, c.z);
      return m;
    }

    /* ---------- 靜態的外形 ---------- */
    var brain = new THREE.Group();
    world.add(brain);
    (function () {
      var H = model.HEMI;
      [-1, 1].forEach(function (sd) {
        var g = new THREE.SphereGeometry(1, 56, 36), a = g.attributes.position;
        for (var i = 0; i < a.count; i++) {
          var x = a.getX(i), y = a.getY(i), z = a.getZ(i);
          var px = Math.sign(x) === -sd ? model.HPX : model.HP;
          var f = function (v, p) { return Math.sign(v) * Math.pow(Math.abs(v), 2 / p); };
          a.setXYZ(i, sd * H.c[0] + H.r[0] * f(x, px), H.c[1] + H.r[1] * f(y, model.HP), H.c[2] + H.r[2] * f(z, model.HP));
        }
        g.computeVertexNormals();
        var m = new THREE.Mesh(g, mat(TH.hemi[0], TH.hemi[1], { depthWrite: false }));
        m.renderOrder = 7;
        brain.add(m);
      });
      // 腦幹
      var pos = [], idx = [], n = 48, ys = [];
      for (var y = 0; y <= 80; y += 4) ys.push(y);
      ys.forEach(function (y) {
        var b = model.brainstemAt(y);
        for (var i = 0; i < n; i++) { var t = i / n * Math.PI * 2; pos.push(-b.a * Math.sin(t), y, b.zc - b.b * Math.cos(t)); }
      });
      for (var j = 0; j < ys.length - 1; j++) for (var i = 0; i < n; i++) {
        var p0 = j * n + i, p1 = j * n + (i + 1) % n, p2 = (j + 1) * n + i, p3 = (j + 1) * n + (i + 1) % n;
        idx.push(p0, p2, p1, p1, p2, p3);
      }
      var bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      bg.setIndex(idx);
      bg.computeVertexNormals();
      var bsm = new THREE.Mesh(bg, mat(TH.stem[0], TH.stem[1], { depthWrite: false }));
      bsm.renderOrder = 5;
      brain.add(bsm);
      var B = model.data.levels.brain;
      [-1, 1].forEach(function (sd) {
        var th = blob({ x: sd * B.thalamus.c[0], y: B.thalamus.c[1], z: B.thalamus.c[2] }, B.thalamus.r, TH.thal[0], TH.thal[1]);
        th.material.depthWrite = false; th.renderOrder = 4;
        brain.add(th);
      });
    })();

    // 腦下垂體
    var pit = VS.data.pituitary;
    var pitM = blob({ x: pit.c[0], y: pit.c[1], z: pit.c[2] }, pit.r, TH.pit, 0.45);
    pitM.userData = { name: "腦下垂體（在視交叉正下方）" };
    world.add(pitM);
    var stalk = tube(pit.stalk.map(function (w) { return { x: w[0], y: w[1], z: w[2] }; }), 0.9, TH.pit, 0.45);
    world.add(stalk);

    // 眼球與虹膜
    var irises = {};
    ["R", "L"].forEach(function (s) {
      var e = VS.eye[s];
      var ball = new THREE.Mesh(new THREE.SphereGeometry(e.r, 40, 28), mat(TH.eye[0], TH.eye[1], { depthWrite: false }));
      ball.position.copy(V3(e.c));
      ball.renderOrder = 6;
      ball.userData = { structure: "retina", name: SZH[s] + "眼（視網膜）" };
      world.add(ball);
      var iris = new THREE.Mesh(new THREE.RingGeometry(1, 4.4, 40), mat(TH.iris, 0.95, { side: THREE.DoubleSide }));
      iris.position.set(e.c.x, e.c.y, e.c.z + e.r * 0.93);
      world.add(iris);
      irises[s] = { mesh: iris, r: 2.2, target: 2.2 };
    });

    // LGN、視覺皮質、頂蓋前核、EW 核、睫狀神經節
    var picks = [];
    ["R", "L"].forEach(function (s) {
      var l = VS.lgn[s];
      var lg = blob(l.c, l.r, TH.lgn, 0.55);
      lg.userData = { structure: "lgn", name: SZH[s] + "外側膝狀核" };
      world.add(lg); picks.push(lg);
      ["upper", "lower"].forEach(function (b) {
        var v1 = tube(VS.calcarine[s][b], 1.3, TH.v1, 0.55);
        v1.userData = { structure: "v1", name: SZH[s] + "初級視覺皮質（距狀溝" + (b === "upper" ? "上唇：下半視野" : "下唇：上半視野") + "）" };
        world.add(v1); picks.push(v1);
      });
      var op = blob(VS.opn[s], [1.1, 1.3, 0.9], TH.pt, 0.9);
      op.userData = { structure: "opn", name: SZH[s] + "頂蓋前核" };
      world.add(op); picks.push(op);
      var ew = model.nucPath("edinger-westphal", s);
      var ewm = tube(ew, 0.55, TH.ew, 0.95);
      ewm.userData = { structure: "edinger-westphal", name: SZH[s] + " Edinger-Westphal 核" };
      world.add(ewm); picks.push(ewm);
      var cgm = blob(VS.cg[s], [1.2, 1.2, 1.2], TH.cg, 0.95);
      cgm.userData = { structure: "ciliary-ganglion", name: SZH[s] + "睫狀神經節" };
      world.add(cgm); picks.push(cgm);
    });

    // 纖維（每次切換病灶、視野格時只改材質）
    var fiberMeshes = [], radMeshes = [], pupilMeshes = [];
    VS.fibers.forEach(function (f) {
      var m = tube(f.rgc, 0.3, new THREE.Color(VS.cells[f.cell].color), 0.9);
      m.userData = { fiber: f };
      m.renderOrder = 3;
      world.add(m); fiberMeshes.push(m);
    });
    Object.keys(VS.rads).forEach(function (k) {
      var r = VS.rads[k];
      var m = tube(r.pts, 0.42, new THREE.Color(VS.cells[r.cell].color), 0.9);
      m.userData = { rad: r };
      m.renderOrder = 3;
      world.add(m); radMeshes.push(m);
    });
    ["R", "L"].forEach(function (s) {
      [[VS.branch[s], TH.pupil, 0.34, "頂蓋前區的分支（上丘臂）"], [VS.pc[s].ipsi, TH.pt, 0.24, "頂蓋前核 → 同側 EW 核"], [VS.pc[s].contra, TH.pt, 0.24, "頂蓋前核 → 對側 EW 核（經後連合）"],
        [VS.eff[s].cn3, TH.eff, 0.42, SZH[s] + "動眼神經（EW 核的節前副交感纖維）"], [VS.eff[s].cil, TH.cg, 0.3, SZH[s] + "短睫狀神經 → 瞳孔括約肌"]].forEach(function (d) {
        var m = tube(d[0], d[2], d[1], 0.9);
        m.userData = { name: d[3] };
        world.add(m); pupilMeshes.push(m); picks.push(m);
      });
    });

    var chainGroup = new THREE.Group(), lesionGroup = new THREE.Group();
    world.add(chainGroup); world.add(lesionGroup);

    /* ---------- 狀態 → 外觀 ---------- */
    var loss = null;   // 目前病灶的 visualLoss
    function zones() { return state.tab === "lesion" ? LE.lesions[state.lesion].zones : []; }
    function applyLook() {
      loss = state.tab === "lesion" ? visualLoss(model, zones()) : null;
      var pupilTab = state.tab === "pupil";
      var hot = state.hot;
      // 路徑頁：纖維淡一點，才看得到神經元鏈；視神經頁：視放射淡一點
      var base = mode === "tract" ? 0.14 : 0.92, radBase = mode === "tract" ? 0.14 : mode === "nerve" ? 0.25 : 0.92;
      fiberMeshes.forEach(function (m) {
        var f = m.userData.fiber, mt = m.material;
        var cut = loss && loss.cutFibers[f.id];
        var on = (!hot || hot.indexOf(f.cell) >= 0) && (state.eye === "both" || state.eye === f.eye);
        mt.color.set(cut ? TH.cut : VS.cells[f.cell].color);
        mt.opacity = pupilTab ? 0.12 : cut ? 0.4 : on ? base : 0.06;
        mt.depthWrite = mt.opacity >= 0.6;
        mt.emissive = new THREE.Color(on && hot && !cut ? VS.cells[f.cell].color : 0x000000);
        mt.emissiveIntensity = on && hot && !cut ? 0.35 : 0;
      });
      radMeshes.forEach(function (m) {
        var r = m.userData.rad, mt = m.material;
        var feeding = VS.fibers.filter(function (f) { return f.rad.id === r.id && (state.eye === "both" || state.eye === f.eye); });
        var cut = loss && (loss.cutRads[r.id] || feeding.every(function (f) { return loss.cutFibers[f.id]; }));
        var on = !hot || hot.indexOf(r.cell) >= 0;
        mt.color.set(cut ? TH.cut : VS.cells[r.cell].color);
        mt.opacity = pupilTab ? 0.1 : cut ? 0.4 : on ? radBase : 0.06;
        mt.depthWrite = mt.opacity >= 0.6;
        mt.emissive = new THREE.Color(on && hot && !cut ? VS.cells[r.cell].color : 0x000000);
        mt.emissiveIntensity = on && hot && !cut ? 0.35 : 0;
      });
      pupilMeshes.forEach(function (m) {
        m.material.opacity = pupilTab || tractId === "plr" ? 0.9 : state.tab === "lesion" ? 0.6 : tractId === "visual" ? 0.1 : 0.22;
        m.material.depthWrite = m.material.opacity >= 0.6;
      });
      brain.visible = state.showBrain;
      labelEls.forEach(function (l) { l.el.hidden = !state.showLabels; });
      // 靜止時的瞳孔大小：傳出端壞掉的那一側放大
      ["R", "L"].forEach(function (s) {
        var effOK = !loss || !loss.pupil || loss.pupil.eff[s];
        irises[s].rest = effOK ? 2.2 : 3.5;
      });
      buildLesion();
      buildChain();
    }

    function buildLesion() {
      lesionGroup.clear();
      zones().forEach(function (z) {
        if (!z.brain) return;
        var zb = z.brain;
        (zb.side === "both" ? [-1, 1] : [zb.side === "L" ? 1 : -1]).forEach(function (sd) {
          zb.boxes.forEach(function (b) {
            var w = b.lat[1] - b.lat[0], h = zb.y[1] - zb.y[0], d = b.z[1] - b.z[0];
            var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(TH.lesion[0], 0.42, { depthWrite: false, emissive: new THREE.Color(TH.lesion[1]) }));
            m.position.set(sd * (b.lat[0] + w / 2), zb.y[0] + h / 2, b.z[0] + d / 2);
            m.renderOrder = 11;
            lesionGroup.add(m);
          });
        });
      });
    }

    /* ---------- 光點動畫：神經元鏈（路徑頁）或瞳孔反射（四條路線同時走） ---------- */
    var runs = [];     // { curve, len, stopAt, spark, delay }
    var chainObjs = null;
    function buildChain() {
      chainGroup.clear();
      runs = [];
      chainObjs = null;
      if (mode === "tract") {
        var ch = model.chainFor(tractId, null, state.side, "equal", state.variant);
        chainObjs = ch;
        var total = 0, segs = [];
        ch.forEach(function (nr) {
          var col = oc(nr.order);
          var m = tube(nr.pts, 0.45, col, 1);
          if (!m) return;
          m.material.emissive = new THREE.Color(col); m.material.emissiveIntensity = 0.4;
          m.renderOrder = 10;
          chainGroup.add(m);
          var soma = new THREE.Mesh(new THREE.SphereGeometry(1.2, 18, 12), mat(col, 1, { emissive: new THREE.Color(col), emissiveIntensity: 0.5 }));
          soma.position.copy(V3(nr.pts[0]));
          chainGroup.add(soma);
          var len = m.userData.curve.getLength();
          segs.push({ curve: m.userData.curve, len: len, start: total });
          total += len;
        });
        var sp = spark();
        runs.push({ segs: segs, total: total, stopAt: total, spark: sp });
        return;
      }
      zs0 = null;   // 路線換了，病灶擋住的位置要重算
      if (state.tab !== "pupil" && state.tab !== "lesion") return;
      // 光照 state.light 這一眼：兩側視神經徑 × 兩側 EW 核
      var E = state.light, zs = [];
      ["R", "L"].forEach(function (S) {
        var f = VS.fibers.filter(function (x) { return x.eye === E && x.tract === S && x.fv === "U" && x.ecc === "P"; })[0];
        ["R", "L"].forEach(function (P) {
          var pts = f.pre.concat(VS.branch[S].slice(1), VS.pc[S][S === P ? "ipsi" : "contra"].slice(1), VS.eff[P].cn3, VS.eff[P].cil);
          var curve = new THREE.CatmullRomCurve3(pts.map(V3), false, "centripetal");
          var len = curve.getLength();
          runs.push({ segs: [{ curve: curve, len: len, start: 0 }], total: len, stopAt: len, spark: spark(), pupil: P });
        });
      });
    }
    function spark() {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), new THREE.MeshBasicMaterial({ color: TH.spark }));
      m.renderOrder = 12;
      chainGroup.add(m);
      return m;
    }
    var clock = 0;

    /* ---------- 標籤 ---------- */
    var labelEls = [];
    function addLabel(text, p, group) {
      var el = document.createElement("span");
      el.className = "nx-label nx-label-key";
      el.textContent = text;
      labelLayer.appendChild(el);
      labelEls.push({ el: el, pos: new THREE.Vector3(p[0], p[1], p[2]), group: group });
    }
    // 視覺路徑的標籤放在病人右側（畫面右邊），瞳孔反射的標籤放在左側，減少重疊
    [["右眼", [-30, 74, 84]], ["左眼", [30, 74, 84]], ["視神經", [-19, 68, 52]], ["視交叉", [0, 80, 22]],
      ["視神經徑", [-18, 83, 3]], ["外側膝狀核", [-25, 86, -13]], ["Meyer 環", [-37, 77, 7]], ["視放射", [-36, 96, -34]], ["視覺皮質（距狀溝）", [-10, 108, -66]]].forEach(function (d) { addLabel(d[0], d[1], "vis"); });
    [["腦下垂體", [0, 61, 19]], ["頂蓋前核", [7, 85, -9]], ["EW 核", [3, 68, -6]], ["睫狀神經節", [30, 54, 57]], ["動眼神經", [14, 58, 36]]].forEach(function (d) { addLabel(d[0], d[1], "pupil"); });
    var tmpV = new THREE.Vector3();
    function updateLabels() {
      if (!state.showLabels) return;
      var w = stage.clientWidth, h = stage.clientHeight;
      var pupilOn = state.tab !== "field" || tractId === "plr";
      labelEls.forEach(function (l) {
        tmpV.copy(l.pos).project(camera);
        var off = tmpV.z > 1 || tmpV.x < -1.1 || tmpV.x > 1.1 || tmpV.y < -1.1 || tmpV.y > 1.1 || (l.group === "pupil" && !pupilOn);
        l.el.hidden = off;
        if (!off) l.el.style.transform = "translate(" + ((tmpV.x * 0.5 + 0.5) * w).toFixed(1) + "px," + ((-tmpV.y * 0.5 + 0.5) * h).toFixed(1) + "px)";
      });
    }

    /* ---------- 相機 ---------- */
    function look(target, pos) {
      // 直的畫面（手機）拉遠一點，才放得下兩眼到枕葉
      var f = camera.aspect < 1 ? Math.min(1.8, 0.85 / camera.aspect) : 1;
      controls.target.set(target[0], target[1], target[2]);
      camera.position.set(target[0] + (pos[0] - target[0]) * f, target[1] + (pos[1] - target[1]) * f, target[2] + (pos[2] - target[2]) * f);
      controls.update();
    }
    var VIEWS = {
      // 從頭的後上方往前看：眼睛在遠端，病人右側在畫面右側（和視野圖的方向一致）
      all: function () { look([0, 84, -2], [45, 205, -170]); },
      top: function () { look([0, 80, -5], [0, 330, -95]); },
      side: function () { look([0, 84, 0], [-300, 110, 10]); },
      chiasm: function () { look([0, 72, 42], [25, 175, -60]); },
      pupil: function () { look([0, 70, 20], [0, 250, -50]); }
    };
    function setView(v) { (VIEWS[v] || VIEWS.all)(); }

    /* ---------- 面板 ---------- */
    function cellText(cell) {
      var fs = cell[0], fv = cell[1], ecc = cell[2], t = fs === "L" ? "R" : "L";
      var ret = fv === "U" ? "下半" : "上半";
      return VS.cells[cell].zh + "視野：" + SZH[fs] + "眼的鼻側視網膜（" + ret + "，在視交叉交叉）＋" + SZH[t] + "眼的顳側視網膜（" + ret + "，不交叉）→ " +
        SZH[t] + "視神經徑 → " + SZH[t] + "外側膝狀核" + (fv === "U" ? "外側" : "內側") + " → " + (fv === "U" ? "Meyer 環（繞進顳葉）" : "頂葉的視放射") + " → " +
        SZH[t] + "距狀溝" + (fv === "U" ? "下唇（舌回）" : "上唇（楔葉）") + (ecc === "M" ? "的後端（枕極）" : "的前段") + "。";
    }
    function pupilTable(pu) {
      var yn = function (v) { return v ? '<td class="is-ok">縮小</td>' : '<td class="is-bad">不縮</td>'; };
      return '<table class="nx-table nx-table-s nx-pupil"><thead><tr><th></th><th>右瞳孔</th><th>左瞳孔</th></tr></thead><tbody>' +
        "<tr><th>光照右眼</th>" + yn(pu.light.R.R) + yn(pu.light.R.L) + "</tr><tr><th>光照左眼</th>" + yn(pu.light.L.R) + yn(pu.light.L.L) + "</tr>" +
        "<tr><th>看近物</th>" + yn(pu.near.R) + yn(pu.near.L) + "</tr></tbody></table>";
    }
    function chip(attr, val, on, text) { return '<button type="button" class="nx-chip" ' + attr + '="' + val + '" aria-pressed="' + on + '">' + text + "</button>"; }

    function renderPanel() {
      var h = [];
      if (mode === "region") {
        h.push('<div class="nx-modes" role="tablist">' + [["field", "視野"], ["pupil", "瞳孔反射"], ["lesion", "病灶"]].map(function (t) { return chip("data-tab", t[0], state.tab === t[0], t[1]); }).join("") + "</div>");
      }
      if (mode === "tract") h.push(tractPanel());
      else if (mode === "nerve") h.push(nervePanel());
      if (state.tab === "field" && mode !== "tract") h.push(fieldPanel());
      if (state.tab === "pupil" && mode === "region") h.push(pupilPanel());
      if (state.tab === "lesion") h.push(lesionPanel());
      h.push('<h4>顯示</h4><div class="nx-toggles"><label><input type="checkbox" data-opt="showBrain"' + (state.showBrain ? " checked" : "") + "> 腦部外形</label>" +
        '<label><input type="checkbox" data-opt="showLabels"' + (state.showLabels ? " checked" : "") + "> 標籤</label></div>");
      h.push('<p class="nx-note">模型是依課本描述畫成的示意圖，位置與比例不是真實測量資料。</p>');
      panel.innerHTML = h.join("");
      updateInset();
    }
    function fieldPanel() {
      var h = ["<h4>視野（點一格只看那一格的纖維）</h4>"];
      h.push('<div class="nx-vf-pick">' + fieldSVG({ R: [], L: [] }, { cells: VS.cells, hot: state.hot || [] }) + "</div>");
      h.push('<div class="nx-row"><span>哪一眼</span>' + chip("data-eye", "both", state.eye === "both", "兩眼") + chip("data-eye", "R", state.eye === "R", "右眼") + chip("data-eye", "L", state.eye === "L", "左眼") + "</div>");
      if (state.hot) {
        h.push('<p class="nx-note">' + esc(cellText(state.hot[0])) + "</p>");
        h.push('<p><button type="button" class="nx-btn3d is-ghost" data-act="allcells">顯示全部</button></p>');
      } else {
        h.push('<p class="nx-note">同一格視野的兩條纖維（左右眼各一）在視交叉之後會合在同一側，所以視交叉以後的病灶兩眼都缺同一邊。</p>');
      }
      return h.join("");
    }
    function pupilPanel() {
      var h = ["<h4>瞳孔光反射</h4>"];
      h.push('<div class="nx-row"><span>光照</span>' + chip("data-light", "R", state.light === "R", "右眼") + chip("data-light", "L", state.light === "L", "左眼") +
        chip("data-act", "play", state.playing, state.playing ? "暫停" : "播放") + "</div>");
      h.push('<p class="nx-note">光點從被照的眼睛出發，經兩側視神經徑到兩側頂蓋前核，再到兩側 EW 核（交叉的走後連合），經動眼神經與睫狀神經節到瞳孔括約肌——所以兩眼一起縮（直接與間接反射）。</p>');
      h.push('<p><a href="' + BASE + '/tract/plr.html">瞳孔光反射的說明 →</a></p>');
      return h.join("");
    }
    function lesionPanel() {
      var l = LE.lesions[state.lesion];
      var h = ["<h4>選擇病灶</h4>"];
      h.push('<select data-act="lesion">' + lesionIds.map(function (id) { return '<option value="' + id + '"' + (id === state.lesion ? " selected" : "") + ">" + esc(LE.lesions[id].zh) + "</option>"; }).join("") + "</select>");
      h.push('<div class="nx-row"><span>光照</span>' + chip("data-light", "R", state.light === "R", "右眼") + chip("data-light", "L", state.light === "L", "左眼") +
        chip("data-act", "play", state.playing, state.playing ? "暫停" : "播放") + "</div>");
      var d = deficits(model, l.zones).filter(function (x) { return !x.minor; });
      h.push('<h4>推導出的症狀</h4><ul class="nx-deficits">' + d.map(function (x) { return "<li>" + esc(x.text) + "</li>"; }).join("") + "</ul>");
      if (loss && loss.pupil) h.push("<h4>瞳孔反射</h4>" + pupilTable(loss.pupil));
      h.push('<p><a href="' + BASE + "/lesion/" + state.lesion + '.html">' + esc(l.zh) + " 的說明 →</a></p>");
      return h.join("");
    }
    function tractPanel() {
      var tr = TR[tractId], h = ["<h4>神經元鏈</h4>"];
      var orders = [];
      tr.chains.forEach(function (c) { c.neurons.forEach(function (n) { if (orders.indexOf(n.order) < 0) orders.push(n.order); }); });
      h.push('<ul class="nx-chainleg">' + orders.map(function (o) { return '<li><i style="background:#' + new THREE.Color(oc(o)).getHexString() + '"></i>' + ORDER_ZH[o] + "</li>"; }).join("") + "</ul>");
      if (tr.variants) h.push('<div class="nx-row"><span>看哪一種</span>' + tr.variants.map(function (v) { return chip("data-variant", v.id, state.variant === v.id, esc(v.zh)); }).join("") + "</div>");
      var sl = tr.sideLabels || ["右側", "左側"];
      h.push('<div class="nx-row"><span>' + (tractId === "plr" ? "光照" : "哪一眼") + "</span>" + chip("data-side", "R", state.side === "R", sl[0].replace("光照", "")) + chip("data-side", "L", state.side === "L", sl[1].replace("光照", "")) +
        chip("data-act", "play", state.playing, state.playing ? "暫停" : "播放") + "</div>");
      h.push('<p><a href="' + BASE + "/3d.html?region=visual" + (tractId === "plr" ? "&amp;tab=pupil" : "") + '">在完整 3D 中開啟 →</a></p>');
      return h.join("");
    }
    function nervePanel() {
      var nv = NV[root.dataset.nerve];
      return '<h4>視神經</h4><p><b style="color:#' + new THREE.Color(TH.eff).getHexString() + '">' + nv.num + " " + esc(nv.zh) + '</b></p><p class="nx-note">' + esc(nv.exit) + '</p><p><a href="' + BASE + '/3d.html?region=visual">在完整 3D 中開啟 →</a></p>';
    }

    // 右下角：目前的視野圖
    var inset = document.createElement("div");
    inset.className = "nx-inset nx-inset-vf";
    inset.innerHTML = '<p class="nx-inset-head"><b data-slot="iname"></b></p><div data-slot="vf"></div><p class="nx-inset-foot">病人看出去的樣子・黑色 = 看不到</p>';
    if (mode === "tract") inset.hidden = true;   // 路徑頁看的是神經元鏈，不需要視野圖
    stage.parentNode.appendChild(inset);
    function updateInset() {
      var lost = loss ? loss.lost : { R: [], L: [] };
      $("[data-slot=iname]", inset).textContent = state.tab === "lesion" ? LE.lesions[state.lesion].zh.replace(/（.*）/, "") : "視野";
      $("[data-slot=vf]", inset).innerHTML = fieldSVG(lost, { cells: VS.cells, hot: state.hot || [], sides: false });
    }

    panel.addEventListener("click", function (ev) {
      var cellEl = ev.target.closest && ev.target.closest("[data-cell]");
      if (cellEl && panel.contains(cellEl)) {
        var c = cellEl.getAttribute("data-cell");
        state.hot = state.hot && state.hot[0] === c ? null : [c];
        applyLook(); renderPanel();
        return;
      }
      var t = ev.target.closest("button");
      if (!t) return;
      if (t.dataset.tab) {
        state.tab = t.dataset.tab;
        if (state.tab !== "field") state.hot = null;
        applyLook(); renderPanel();
        if (state.tab === "pupil") setView("pupil");
      } else if (t.dataset.eye) { state.eye = t.dataset.eye; applyLook(); renderPanel(); }
      else if (t.dataset.light) { state.light = t.dataset.light; clock = 0; applyLook(); renderPanel(); }
      else if (t.dataset.variant) { state.variant = t.dataset.variant; clock = 0; buildChain(); renderPanel(); }
      else if (t.dataset.side) { state.side = t.dataset.side; clock = 0; buildChain(); renderPanel(); }
      else if (t.dataset.act === "play") { state.playing = !state.playing; renderPanel(); }
      else if (t.dataset.act === "allcells") { state.hot = null; applyLook(); renderPanel(); }
    });
    panel.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t.dataset.act === "lesion") { state.lesion = t.value; applyLook(); renderPanel(); }
      else if (t.dataset.opt) { state[t.dataset.opt] = t.checked; applyLook(); }
    });

    /* ---------- 視角按鈕與圖例 ---------- */
    var views = document.createElement("div");
    views.className = "nx-views";
    views.innerHTML = [["all", "全部"], ["top", "由上往下"], ["side", "側面"], ["chiasm", "視交叉"], ["pupil", "瞳孔反射"]].map(function (v) {
      return '<button type="button" data-view="' + v[0] + '">' + v[1] + "</button>";
    }).join("");
    stage.parentNode.appendChild(views);
    views.addEventListener("click", function (ev) { var b = ev.target.closest("button"); if (b) setView(b.dataset.view); });
    var themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "nx-theme";
    themeBtn.textContent = themeName === "dark" ? "☀︎ 淺色" : "☾ 深色";
    themeBtn.setAttribute("aria-label", themeName === "dark" ? "切換成淺色背景" : "切換成深色背景");
    stage.parentNode.appendChild(themeBtn);
    themeBtn.addEventListener("click", function () {
      try { localStorage.setItem("nx-theme", themeName === "dark" ? "light" : "dark"); } catch (e) { /* 無痕模式 */ }
      var keep = { theme: themeName === "dark" ? "light" : "dark", state: JSON.parse(JSON.stringify(state)), cam: [camera.position.toArray(), controls.target.toArray()] };
      kill(life);
      resetDom(root);
      mount(root, keep, handle);
    });

    /* ---------- 滑鼠 ---------- */
    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), lastMove = 0, downAt = null;
    function pickables() {
      return fiberMeshes.concat(radMeshes).filter(function (m) { return m.material.opacity > 0.3; }).concat(picks, [pitM]);
    }
    function hitAt(ev) {
      var r = renderer.domElement.getBoundingClientRect();
      mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(pickables(), false);
      return hits.length ? hits[0].object.userData : null;
    }
    renderer.domElement.addEventListener("pointermove", function (ev) {
      var now = performance.now();
      if (now - lastMove < 40) return;
      lastMove = now;
      var u = hitAt(ev), r = renderer.domElement.getBoundingClientRect();
      if (!u) { tip.hidden = true; renderer.domElement.style.cursor = ""; return; }
      var html;
      if (u.fiber) html = '<b style="color:' + VS.cells[u.fiber.cell].color + '">' + SZH[u.fiber.eye] + "眼・" + (u.fiber.nasal ? "鼻側" : "顳側") + "視網膜</b><br>→ " + VS.cells[u.fiber.cell].zh + "視野" + (u.fiber.crossed ? "（交叉）" : "（不交叉）");
      else if (u.rad) html = '<b style="color:' + VS.cells[u.rad.cell].color + '">' + SZH[u.rad.side] + "視放射" + (u.rad.meyer ? "（Meyer 環）" : "") + "</b><br>" + VS.cells[u.rad.cell].zh + "視野";
      else html = "<b>" + esc(u.name || "") + "</b>" + (u.structure ? "<br>點一下看說明" : "");
      tip.innerHTML = html;
      tip.hidden = false;
      tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - 170) + "px";
      tip.style.top = (ev.clientY - r.top + 12) + "px";
      renderer.domElement.style.cursor = u.structure || u.fiber || u.rad ? "pointer" : "";
    });
    renderer.domElement.addEventListener("pointerleave", function () { tip.hidden = true; });
    renderer.domElement.addEventListener("pointerdown", function (ev) { downAt = [ev.clientX, ev.clientY]; });
    renderer.domElement.addEventListener("pointerup", function (ev) {
      if (!downAt || Math.abs(ev.clientX - downAt[0]) + Math.abs(ev.clientY - downAt[1]) > 5) return;
      var u = hitAt(ev);
      if (!u) return;
      if ((u.fiber || u.rad) && mode === "region") {
        state.tab = "field";
        var c = (u.fiber || u.rad).cell;
        state.hot = state.hot && state.hot[0] === c ? null : [c];
        applyLook(); renderPanel();
      } else if (u.structure) location.href = BASE + "/structure/" + u.structure + ".html";
    });

    /* ---------- 迴圈 ---------- */
    function resize() {
      var w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
    var visible = true, last = performance.now();
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var zs0 = null;
    function loop(now) {
      if (life.dead) return;
      life.raf = requestAnimationFrame(loop);
      if (!visible) return;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      controls.update();
      var CYCLE = 4.2;   // 秒：光點走完（約 3 秒）後停一下，再重來
      if (state.playing && !reduce) clock = (clock + dt) % CYCLE;
      var u = reduce ? 1 : Math.min(1, clock / 3);
      var zsNow = zones();
      if (zsNow !== zs0) {
        zs0 = zsNow;
        // 每條路線被病灶擋住的位置
        runs.forEach(function (r) {
          r.stopAt = r.total;
          if (!zsNow.length) return;
          for (var i = 0; i <= 300; i++) {
            var d = r.total * i / 300, sg = segAt(r, d), p = sg.curve.getPointAt(Math.min(1, (d - sg.start) / sg.len));
            if (zsNow.some(function (z) { return z.brain && inZone(z.brain, p); })) { r.stopAt = d; break; }
          }
        });
      }
      var arrived = { R: false, L: false };
      runs.forEach(function (r) {
        var d = Math.min(u * r.total, r.stopAt);
        var sg = segAt(r, d);
        r.spark.position.copy(sg.curve.getPointAt(Math.min(1, Math.max(0, (d - sg.start) / sg.len))));
        r.spark.visible = clock < 3.6 || reduce;
        r.spark.material.color.set(d < r.total - 0.01 && d >= r.stopAt - 0.01 && r.stopAt < r.total ? 0xff5a4d : TH.spark);
        if (r.pupil && u >= 1 && r.stopAt >= r.total) arrived[r.pupil] = true;
      });
      // 瞳孔：光點到達的一側縮小
      var pupilActive = state.tab === "pupil" || state.tab === "lesion" || tractId === "plr";
      ["R", "L"].forEach(function (s) {
        var ir = irises[s], rest = ir.rest || 2.2;
        var constrict = pupilActive && (tractId === "plr" ? u >= 1 : arrived[s]);
        ir.target = constrict ? 1.1 : rest;
        ir.r += (ir.target - ir.r) * Math.min(1, dt * 6);
        if (Math.abs(ir.r - (ir.drawn || 0)) > 0.02) {   // 大小有變才重建環
          ir.mesh.geometry.dispose();
          ir.mesh.geometry = new THREE.RingGeometry(ir.r, 4.4, 40);
          ir.drawn = ir.r;
        }
      });
      renderer.render(scene, camera);
      updateLabels();
    }
    function segAt(r, d) {
      for (var i = 0; i < r.segs.length; i++) if (d <= r.segs[i].start + r.segs[i].len) return r.segs[i];
      return r.segs[r.segs.length - 1];
    }
    if (window.ResizeObserver) { var ro = new ResizeObserver(resize); ro.observe(stage); life.cleanup.push(function () { ro.disconnect(); }); }
    window.addEventListener("resize", resize);
    life.cleanup.push(function () { window.removeEventListener("resize", resize); });
    if (window.IntersectionObserver) { var io = new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }); io.observe(root); life.cleanup.push(function () { io.disconnect(); }); }

    resize();
    applyLook();
    renderPanel();
    if (params.get("view")) setView(params.get("view"));
    else if (mode === "nerve") setView("chiasm");
    else if (tractId === "plr" || state.tab === "pupil") setView("pupil");
    else if (state.tab === "lesion" && /cn3|adie/.test(state.lesion)) setView("pupil");
    else setView("all");
    if (carry && carry.cam) { camera.position.fromArray(carry.cam[0]); controls.target.fromArray(carry.cam[1]); controls.update(); }
    life.raf = requestAnimationFrame(loop);
  }
}

// 頁面上本來就有的 .nx-viewer（路徑頁、腦神經頁）：模組其他部分都定義好之後才掛上
var auto = document.querySelector(".nx-viewer[data-engine=visual]:not([data-hub])");
if (auto) mount(auto);
