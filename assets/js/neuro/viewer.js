/**
 * 神經解剖學：3D 互動模型（脊髓＋腦幹＋腦）。
 *
 * 所有形狀都由 geometry.js 依 assets/data/neuro/*.json 算出來，這裡只負責把它們變成 three.js 物件：
 *   - 脊髓外殼、灰質：每一節的外輪廓與蝴蝶形 loft 起來
 *   - 傳導路徑：脊髓段用每一節的路徑範圍 loft 成實體束；腦部段沿路點畫成管子（左右兩側都畫）
 *   - 神經元鏈：選定一條路徑與身體節段後，畫出一條代表性纖維，第 1、2、3 級神經元不同顏色，光點沿路走
 *   - 切面：節段滑桿的位置會出現一片切面，旁邊同步顯示 2D 橫切面
 *   - 病灶：常考病灶的範圍畫成紅色的塊，並列出推導出的症狀
 *
 * 頁面上的 .nx-viewer 用 data-mode 決定模式：region（完整模型）或 tract（單一路徑頁）。
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { createModel, sectionSVG, brainSectionSVG, lesionPolys } from "./geometry.js";
import { deficits, adjustZones } from "./lesion.js";
import { cbMapSVG, cbColors } from "./cerebellum.js";
import { bgCompare, bgKnock, circuitSVG, circuitLegend } from "./basal.js";
import { limbicKnock, limbicSVG, limbicLegend } from "./limbic.js";

var root = null;
var DATA_FILES = ["levels", "tracts", "structures", "lesions", "nerves", "visual", "auditory", "diencephalon", "basal", "limbic"];
var dataCache = null;   // 同一頁切換區域時不必重新下載
function loadData() {
  if (!dataCache) {
    dataCache = Promise.all(DATA_FILES.map(function (f) {
      return fetch("/assets/data/neuro/" + f + ".json").then(function (r) { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); });
    }));
    dataCache.catch(function () { dataCache = null; });
  }
  return dataCache;
}
/**
 * 把 3D 掛到一個 .nx-viewer 上；回傳 { destroy }，整合頁切換區域時用來拆掉舊的（停止動畫、釋放 WebGL、移除監聽）。
 * 頁面上本來就有的 .nx-viewer（路徑頁、腦神經頁）載入時自動掛上。
 */
export function mount(el) {
  root = el;
  var life = { dead: false, raf: 0, cleanup: [] };
  init(el, life);
  return {
    destroy: function () {
      if (life.dead) return;
      life.dead = true;
      cancelAnimationFrame(life.raf);
      life.cleanup.forEach(function (f) { try { f(); } catch (e) { /* 已經釋放 */ } });
      life.cleanup = [];
    }
  };
}

function $(sel, el) { return (el || root).querySelector(sel); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
var NAMES = {};
function plain(s) {
  return String(s || "").replace(/\[\[[a-z]+:[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/\[\[([a-z]+):([a-z0-9-]+)\]\]/g, function (m, t, id) { return NAMES[t + ":" + id] || id; });
}

var ORDER_COLOR = {
  "1": 0xffe066, "2": 0xff8a5c, "3": 0x7dd3fc, UMN: 0xff6b6b, "UMN-b": 0xffb3c7, LMN: 0xffd166,
  gaze: 0xc4a3ff, "LMN-VI": 0xffd166, int: 0x8be0c9, "LMN-III": 0xffd166,
  C: 0xffb3c7, PN: 0x8fd3a8, IO: 0xe0c46c, PC: 0xc9b8e8, DN: 0x6aa7ff, VL: 0x7dd3fc, VG: 0xffe066,
  SG: 0xffe066, CN: 0xff8a5c, SO: 0xc4a3ff, IC: 0x8fd3a8, MG: 0x7dd3fc, VN: 0x6fd3c1, TH: 0x7dd3fc,
  CX: 0xffb3c7, STR: 0x7fa8ff, GPI: 0xb8c2d4, GPE: 0xdde3ee, STN: 0x6fdc9a, SNC: 0xff7eb3, VA: 0xc4b5fd
};
var ORDER_ZH = {
  "1": "第 1 級", "2": "第 2 級", "3": "第 3 級", UMN: "上運動神經元", "UMN-b": "上運動神經元（同側，只到上半臉）", LMN: "下運動神經元",
  gaze: "PPRF（注視中樞）", "LMN-VI": "外旋神經", int: "核間神經元（MLF）", "LMN-III": "動眼神經",
  C: "大腦皮質", PN: "橋腦核", IO: "下橄欖核", PC: "Purkinje 細胞", DN: "小腦核（齒狀核）", VL: "視丘 VL", VG: "前庭神經節",
  SG: "螺旋神經節", CN: "耳蝸神經核", SO: "上橄欖核", IC: "下丘", MG: "內側膝狀體", VN: "前庭神經核", TH: "視丘腹後核",
  CX: "大腦皮質", STR: "紋狀體", GPI: "蒼白球內節", GPE: "蒼白球外節", STN: "視丘下核", SNC: "黑質緻密部", VA: "視丘 VA／VL"
};
var NERVE_COLOR = 0xe39a2d;
/** 淺底用的神經元鏈顏色：亮黃、淺藍在白底上看不清楚，改成較深的同色系。 */
var ORDER_LIGHT = {
  "1": 0xd19a00, "2": 0xe8590c, "3": 0x1c7ed6, UMN: 0xe03131, "UMN-b": 0xe64980, LMN: 0xf08c00,
  gaze: 0x7048e8, "LMN-VI": 0xf08c00, int: 0x0ca678, "LMN-III": 0xf08c00,
  C: 0xe64980, PN: 0x2f9e44, IO: 0xb08900, PC: 0x9775fa, DN: 0x1971c2, VL: 0x1c7ed6, VG: 0xd19a00,
  SG: 0xd19a00, CN: 0xe8590c, SO: 0x7048e8, IC: 0x2f9e44, MG: 0x1c7ed6, VN: 0x0ca678, TH: 0x1c7ed6,
  CX: 0xe64980, STR: 0x3b6fd4, GPI: 0x4b5563, GPE: 0x8a94a6, STN: 0x2f9e44, SNC: 0xb8336a, VA: 0x7048e8
};
/**
 * 3D 的兩套配色（淺色為預設）。背景色在 CSS（.nx-viewer 的 --nv-bg），這裡只管 three.js 物件。
 * 淺底上半透明的外殼要深一點、不透明度高一點，否則會糊成一片白。
 */
var THEMES = {
  light: {
    hemiLight: [0xffffff, 0x9aa3b5, 1.25], dir: 1.05, dir2: [0xc8d4ff, 0.35],
    cord: [0x6f86ad, 0.17], gray: [0xb07d98, 0.5], stem: [0x6f86ad, 0.15], thal: 0x4f7fd6, hyp: 0x1ea896, hemi: [0x7d8fb0, 0.07],
    pre: 0xe8604c, post: 0x3b7be0, cb: 0x8f80c4, slice: [0x3d6fb8, 0.1, 0.8], syn: 0x6b7280, spark: 0x111827, iml: 0x8b95a7,
    linkIn: [0x1c8fd1, 0x0b3c5a], linkOut: [0xe07a12, 0x5a2d00], hot: 0x3a3a3a, nerve: 0xd9821a, lesion: [0xe03131, 0x5a0a0a],
    order: ORDER_LIGHT
  },
  dark: {
    hemiLight: [0xdfe9ff, 0x1a2233, 1.1], dir: 1.4, dir2: [0x9fb8ff, 0.5],
    cord: [0x9fb4d4, 0.13], gray: [0xc8a6b8, 0.42], stem: [0x9fb4d4, 0.12], thal: 0x8fb7ff, hyp: 0x5ee0d0, hemi: [0xa8b8d8, 0.06],
    pre: 0xff8a7a, post: 0x7fb2ff, cb: 0xb0a4d8, slice: [0x9cc3ff, 0.16, 0.7], syn: 0xffffff, spark: 0xffffff, iml: 0xffffff,
    linkIn: [0x7dd3fc, 0x1d5f80], linkOut: [0xffb86b, 0x804000], hot: 0x333333, nerve: 0xe39a2d, lesion: [0xff4a3d, 0x661010],
    order: ORDER_COLOR
  }
};
function savedTheme() {
  try { return localStorage.getItem("nx-theme") === "dark" ? "dark" : "light"; } catch (e) { return "light"; }
}
var hexOf = function (c) { return "#" + new THREE.Color(c).getHexString(); };

function init(root, life) {
  var mode = root.dataset.mode || "region";
  var stage = $(".nx-stage"), labelLayer = $(".nx-labels"), tip = $(".nx-tip"), panel = $(".nx-panel");
  var params = new URLSearchParams(location.search);
  var themeName = savedTheme(), TH = THEMES[themeName];
  root.dataset.theme = themeName;
  function oc(o) { return TH.order[o] || ORDER_COLOR[o] || 0x888888; }

  loadData().then(function (arr) {
    if (life.dead) return;
    arr = JSON.parse(JSON.stringify(arr));   // createModel 會改動資料，每次掛載用一份新的
    var data = { levels: arr[0], tracts: arr[1], structures: arr[2], lesions: arr[3], nerves: arr[4], visual: arr[5], auditory: arr[6], diencephalon: arr[7], basal: arr[8], limbic: arr[9] };
    Object.keys(data.nerves.nerves).forEach(function (id) { NAMES["nerve:" + id] = data.nerves.nerves[id].zh; });
    Object.keys(data.structures.structures).forEach(function (id) { NAMES["structure:" + id] = data.structures.structures[id].zh; });
    Object.keys(data.tracts.tracts).forEach(function (id) { NAMES["tract:" + id] = data.tracts.tracts[id].zh; });
    start(createModel(data));
  }).catch(function (e) {
    $(".nx-loading").textContent = "3D 模型載入失敗，請重新整理頁面。";
    console.error(e);
  });

  function start(model) {
    var T = model.data.tracts, TR = T.tracts, LE = model.data.lesions;
    var NV = model.data.nerves.nerves, COLS = model.data.nerves.columns, ST = model.data.structures.structures;
    var tk = mode === "tract" && TR[root.dataset.tract] ? TR[root.dataset.tract].kind : null;
    var region = root.dataset.region ||
      (tk === "cerebellar" ? "cerebellum" : tk === "auditory" || tk === "vestibular" ? "auditory" : tk === "diencephalon" ? "diencephalon" : tk === "basal" ? "basal-ganglia" : tk === "limbic" ? "limbic"
        : mode === "nerve" || (mode === "tract" && TR[root.dataset.tract] && !TR[root.dataset.tract].inputs) ? "brainstem" : "spinal-cord");
    var isCb = region === "cerebellum";
    var isAud = region === "auditory";
    var isDi = region === "diencephalon";
    var isBg = region === "basal-ganglia";
    var isLim = region === "limbic";
    var isFore = isDi || isBg || isLim;   // 前腦：切面變成大腦的水平切面，畫橢球形的核與內囊
    var isStem = region === "brainstem" || isCb || isAud || isFore;   // 小腦、聽覺也用腦部的設定（沒有脊髓節段滑桿）
    var lesionRegion = { "spinal-cord": "spinal", brainstem: "brainstem", cerebellum: "cerebellum", auditory: "auditory", diencephalon: "diencephalon", "basal-ganglia": "basal-ganglia", limbic: "limbic" }[region];
    var AUD_TRACTS = (T.groups.filter(function (g) { return g.id === "auditory"; })[0] || { tracts: [] }).tracts;
    var lesionIds = LE.order.filter(function (id) { var l = LE.lesions[id]; return (l.region || "spinal") === lesionRegion || (l.alsoIn || []).indexOf(lesionRegion) >= 0; });
    var BG = model.BG, CONDS = BG ? BG.circuit.conditions : [];
    var CBC = cbColors(model);
    var focusParam = params.get("tract");
    var nerveParam = params.get("nerve");
    var state = {
      length: "equal",
      tab: params.get("lesion") ? "lesion" : (isBg || isLim) && mode === "region" ? "circuit" : isDi && mode === "region" && !focusParam ? "nuclei" : (mode === "region" && isCb && !focusParam ? "zones" : mode === "region" && isStem && !isAud && !focusParam ? "nerves" : "tracts"),
      cbColor: "zone",
      visible: {},
      focus: mode === "tract" ? root.dataset.tract : (TR[focusParam] ? focusParam : isAud && mode === "region" && !params.get("lesion") ? "auditory" : isBg && mode === "region" && !params.get("lesion") ? "bg-direct" : isLim && mode === "region" && !params.get("lesion") ? "fornix" : null),
      cond: CONDS.some(function (c) { return c.id === params.get("cond"); }) ? params.get("cond") : "normal",
      nerve: mode === "nerve" ? root.dataset.nerve : (NV[nerveParam] ? nerveParam : null),
      inSeg: null, variant: null,
      side: "R",
      slice: isStem ? { kind: "brain", pos: 0, y: isAud ? 34 : isDi ? 88.5 : isBg ? 93.5 : isLim ? 89 : 16 } : { kind: "seg", pos: 4.5, y: 0 },
      nucleus: ST[params.get("nucleus")] && (ST[params.get("nucleus")].thal || ST[params.get("nucleus")].ell) ? params.get("nucleus") : isDi && mode === "region" && !focusParam && !params.get("lesion") ? "vl" : null,
      showGray: true, showLabels: true, showBrain: true, showNuclei: true,
      lesion: lesionIds.indexOf(params.get("lesion")) >= 0 ? params.get("lesion") : lesionIds[0],
      lesionSeg: null, lesionSide: null,
      playing: true
    };
    T.order.forEach(function (tid) {
      state.visible[tid] = mode === "tract" ? tid === state.focus : mode === "nerve" ? false : isCb ? TR[tid].kind === "cerebellar" : isAud ? AUD_TRACTS.indexOf(tid) >= 0 : isDi ? /^(mammillothalamic|hypothalamohypophysial)$/.test(tid) : isBg ? TR[tid].kind === "basal" : isLim ? TR[tid].kind === "limbic" || tid === "mammillothalamic" : /^(dcml|als|lcst)$/.test(tid);
    });
    function setFocus(tid) {
      state.focus = tid;
      if (!tid) return;
      state.visible[tid] = true;
      state.inSeg = TR[tid].inputs ? TR[tid].inputs.default : null;
      state.variant = TR[tid].variants ? TR[tid].variants[0].id : null;
    }
    setFocus(state.focus);
    if (state.nerve && mode === "nerve") {
      var nv0 = NV[state.nerve], lv0 = model.data.levels.brainLevels.filter(function (b) { return b.id === nv0.exitLevel; })[0];
      state.slice = { kind: "brain", pos: 0, y: lv0 ? lv0.y : 30 };
    }
    var lvParam = params.get("level");
    if (lvParam && model.segIdx[lvParam] != null) state.slice = { kind: "seg", pos: model.segIdx[lvParam] + 0.5, y: 0 };
    if (params.get("y")) state.slice = { kind: "brain", pos: 0, y: parseFloat(params.get("y")) };
    if (mode === "tract") {
      var firstSeg = TR[state.focus].bundles.filter(function (b) { return b.present; })[0];
      if (state.inSeg) state.slice = { kind: "seg", pos: model.segIdx[state.inSeg] + 0.5, y: 0 };
      if (!firstSeg) state.slice = { kind: "brain", pos: 0, y: isAud ? 34 : isDi ? 88.5 : isBg ? 93.5 : isLim ? 89 : tid2y(state.focus) };
    }
    /** 腦幹路徑的代表切面高度（取第一個 bundle 路點的中間）。 */
    function tid2y(tid) {
      var w = TR[tid].bundles[0].brain || [[18]];
      var ys = w.map(function (p) { return p[0]; }).filter(function (y) { return y < 80; });
      return ys.length ? Math.round((Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2) : 18;
    }

    /* ---------- three.js 基本設定 ---------- */
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      $(".nx-loading").textContent = "這個瀏覽器無法顯示 3D（WebGL 沒有開啟）。下方的切面與文字仍然可以使用。";
      return;
    }
    $(".nx-loading").remove();
    life.cleanup.push(function () { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    stage.appendChild(renderer.domElement);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(35, 1, 0.5, 4000);
    var controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 12;
    controls.maxDistance = 1400;
    var hemiLight = new THREE.HemisphereLight(TH.hemiLight[0], TH.hemiLight[1], TH.hemiLight[2]);
    scene.add(hemiLight);
    var dir = new THREE.DirectionalLight(0xffffff, TH.dir);
    dir.position.set(60, 120, 160);
    scene.add(dir);
    var dir2 = new THREE.DirectionalLight(TH.dir2[0], TH.dir2[1]);
    dir2.position.set(-80, -40, -120);
    scene.add(dir2);

    var world = new THREE.Group();
    scene.add(world);
    var groups = {};         // 每次 rebuild 重建
    var tractMeshes = [];    // 給 raycast
    var nucMeshes = [], nerveMeshes = [], earMeshes = [], diMeshes = [];
    var chainObjs = null;
    var labelEls = [];

    /* ---------- 幾何工具 ---------- */
    function loft(rings, ys, opts) {
      opts = opts || {};
      var n = rings[0].length, pos = [], idx = [];
      rings.forEach(function (ring, j) {
        ring.forEach(function (p) { pos.push(p.x, ys[j], p.z); });
      });
      for (var j = 0; j < rings.length - 1; j++) {
        for (var i = 0; i < n; i++) {
          var a = j * n + i, b = j * n + (i + 1) % n, c = (j + 1) * n + i, d = (j + 1) * n + (i + 1) % n;
          idx.push(a, c, b, b, c, d);
        }
      }
      if (opts.caps) {
        // 兩端封口（扇形）
        [0, rings.length - 1].forEach(function (j, e) {
          var cx = 0, cz = 0;
          rings[j].forEach(function (p) { cx += p.x; cz += p.z; });
          var ci = pos.length / 3;
          pos.push(cx / n, ys[j], cz / n);
          for (var i = 0; i < n; i++) {
            var a = j * n + i, b = j * n + (i + 1) % n;
            if (e === 0) idx.push(ci, a, b); else idx.push(ci, b, a);
          }
        });
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }
    function ellipseRing(a, b, zc, n) {
      var out = [];
      for (var i = 0; i < n; i++) {
        var t = (i / n) * Math.PI * 2;
        out.push({ x: -a * Math.sin(t), z: zc - b * Math.cos(t) });
      }
      return out;
    }
    function superEllipsoid(c, r, p, segU, segV) {
      var g = new THREE.SphereGeometry(1, segU, segV);
      var a = g.attributes.position;
      for (var i = 0; i < a.count; i++) {
        var x = a.getX(i), y = a.getY(i), z = a.getZ(i);
        var f = function (v) { return Math.sign(v) * Math.pow(Math.abs(v), 2 / p); };
        a.setXYZ(i, c[0] + r[0] * f(x), c[1] + r[1] * f(y), c[2] + r[2] * f(z));
      }
      g.computeVertexNormals();
      return g;
    }
    /**
     * 小腦：橢球加上下表面中線的深溝（vallecula）與前方容納腦幹的凹面。
     * 在小腦單元依縱向分區或分葉上色（顏色由 geometry.js 的 cbClassify 決定，和症狀推導同一套）。
     */
    function cerebellumMesh(C) {
      var g = new THREE.SphereGeometry(1, 96, 64), a = g.attributes.position, cols = [];
      var palette = isCb ? CBC[state.cbColor === "lobe" ? "lobe" : "zone"] : null;
      for (var i = 0; i < a.count; i++) {
        var u = a.getX(i), v = a.getY(i), w = a.getZ(i);
        if (palette) {
          var c = model.cbClassify({ x: C.c[0] + u * C.r[0] * 0.86, y: C.c[1] + v * C.r[1] * 0.86, z: C.c[2] + w * C.r[2] * 0.86 });
          var key = !c ? null : state.cbColor === "lobe" ? c.lobe : c.zone;
          var col = new THREE.Color(key ? palette[key] : "#8a90a6");
          cols.push(col.r, col.g, col.b);
        }
        var back = Math.max(0, -(v * 0.6 + w * 0.8));
        var f = 1 - 0.14 * Math.exp(-Math.pow(u / 0.08, 2)) * back;
        var f2 = w > 0 ? 1 - 0.3 * Math.exp(-Math.pow(u / 0.3, 2)) * w * w * Math.exp(-Math.pow(v / 0.7, 2)) : 1;
        a.setXYZ(i, C.c[0] + u * C.r[0], C.c[1] + v * f * C.r[1], C.c[2] + w * f * f2 * C.r[2]);
      }
      if (palette) g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      g.computeVertexNormals();
      var m = new THREE.Mesh(g, palette ? mat(0xffffff, 0.42, { depthWrite: false, vertexColors: true }) : mat(TH.cb, 0.08, { depthWrite: false }));
      m.renderOrder = 6;
      m.name = "cerebellum";
      return m;
    }
    function mat(color, opacity, extra) {
      return new THREE.MeshStandardMaterial(Object.assign({
        color: color, transparent: opacity < 1, opacity: opacity, roughness: 0.6, metalness: 0.0,
        depthWrite: opacity >= 0.6, side: THREE.DoubleSide
      }, extra || {}));
    }
    function tube(points, radius, color, opacity) {
      if (points.length < 2) return null;
      var curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
      var g = new THREE.TubeGeometry(curve, Math.max(24, points.length * 10), radius, 10, false);
      var m = new THREE.Mesh(g, mat(color, opacity == null ? 1 : opacity));
      m.userData.curve = curve;
      return m;
    }
    function V(p) { return new THREE.Vector3(p.x, p.y, p.z); }
    /** 管子沿長軸由 c0 漸變到 c1（耳蝸：底部高頻 → 頂部低頻；顳橫回：後內側高頻 → 前外側低頻）。 */
    function gradTube(pts, radius, c0, c1, opacity) {
      var curve = new THREE.CatmullRomCurve3(pts.map(V), false, "centripetal");
      var n = Math.max(40, pts.length * 3), rs = 8;
      var g = new THREE.TubeGeometry(curve, n, radius, rs, false);
      var a = new THREE.Color(c0), b = new THREE.Color(c1), cols = [];
      for (var i = 0; i <= n; i++) {
        var c = a.clone().lerp(b, i / n);
        for (var j = 0; j <= rs; j++) cols.push(c.r, c.g, c.b);
      }
      g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      return new THREE.Mesh(g, mat(0xffffff, opacity == null ? 0.95 : opacity, { vertexColors: true }));
    }
    function ball(p, r, color, opacity) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat(new THREE.Color(color), opacity == null ? 0.95 : opacity));
      m.position.copy(V(p));
      return m;
    }
    /**
     * 聽覺與前庭單元：兩側內耳（耳蝸依頻率上色、三個半規管與壺腹、前庭）、內耳道裡的兩條分支、
     * 顳橫回（聽覺皮質，依頻率上色）與前庭皮質（PIVC）。
     */
    /**
     * 間腦單元：視丘、下視丘各核（structures.json 的 ell 橢球，依核群上色）、內囊（依段上色的帶子）、內髓板，
     * 以及當地標的尾狀核、殼核、蒼白球。
     */
    // 邊緣系統單元：畫哪些橢球核、不透明度
    function C_HIP() { return ST.hippocampus.color; }
    var LIM_OP = { entorhinal: 0.8, amygdala: 0.85, "septal-area": 0.85, "cingulate-gyrus": 0.55, "nucleus-basalis": 0.75, "temporal-neocortex": 0.16, "mammillary-body": 0.95, an: 0.9, md: 0.5, habenula: 0.7, "nucleus-accumbens": 0.5, "lateral-hyp": 0.25 };
    var CTX = /^(caudate|putamen|globus-pallidus|gpe|gpi|nucleus-accumbens|claustrum)$/;
    // 基底核單元：畫哪些橢球核、不透明度（紋狀體半透明，才看得到裡面的纖維）
    var BG_OP = { caudate: 0.4, putamen: 0.36, "nucleus-accumbens": 0.5, gpe: 0.6, gpi: 0.75, subthalamic: 0.9, "zona-incerta": 0.35, claustrum: 0.3, va: 0.4, vl: 0.4, cm: 0.25 };
    function bgColor(id) {
      var s = ST[id], G = BG ? BG.groups : {};
      if (s && s.bg && G[s.bg.group]) return G[s.bg.group].color;
      if (/^(va|vl|cm)$/.test(id)) return G.thal ? G.thal.color : "#9b87e0";
      return G.other ? G.other.color : "#c9b18a";
    }
    /** 基底核：依迴路推導的活性替核上色（↑ 發亮、↓ 變淡、失去功能變灰）。 */
    function applyBgActivity() {
      if (!isBg || !BG) return;
      var cmp = bgCompare(BG, bgKnockNow());
      var nodeOf = {};
      BG.circuit.nodes.forEach(function (n) { n.structs.forEach(function (id) { if (id !== "caudate" && id !== "putamen") nodeOf[id] = n.id; }); });
      var paint = function (m, id) {
        var nd = nodeOf[id], dir = nd ? cmp.dir[nd] : "same";
        var base = m.userData.baseOpacity != null ? m.userData.baseOpacity : 0.95;
        m.material.color.set(dir === "x" ? 0x9aa3b2 : m.userData.baseColor || m.material.color.getHex());
        m.material.opacity = dir === "x" ? 0.25 : dir === "down" ? base * 0.45 : base;
        m.material.emissive = new THREE.Color(dir === "up" ? 0xff9f1a : 0x000000);
        m.material.emissiveIntensity = dir === "up" ? 0.55 : 0;
      };
      diMeshes.forEach(function (m) { paint(m, m.userData.nucleus); });
      nucMeshes.forEach(function (m) { if (/^(snc|snr)$/.test(m.userData.nucleus)) { if (m.userData.baseColor == null) m.userData.baseColor = m.material.color.getHex(); paint(m, m.userData.nucleus); } });
    }
    function bgKnockNow() {
      if (state.tab === "lesion") return bgKnock(model, currentZones());
      var c = CONDS.filter(function (x) { return x.id === state.cond; })[0];
      return c ? c.knock : [];
    }
    function diGroup() {
      var g = new THREE.Group();
      diMeshes = [];
      if (!isFore) return g;
      Object.keys(ST).forEach(function (id) {
        var st = ST[id];
        if (!st.ell) return;
        if (isBg && BG_OP[id] == null) return;
        if (isLim && LIM_OP[id] == null) return;
        var op = isBg ? BG_OP[id] : isLim ? LIM_OP[id] : CTX.test(id) ? 0.22 : 0.9;
        var col = isBg ? bgColor(id) : st.color || "#b9b2c8";
        ["R", "L"].forEach(function (side) {
          var e = model.ellOf(id, side);
          var m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), mat(new THREE.Color(col), op, op < 0.6 ? { depthWrite: false } : {}));
          m.scale.set(e.rx, e.ry, e.rz);
          m.position.set(e.x, e.y, e.z);
          m.userData = { nucleus: id, side: side, baseOpacity: op, baseColor: col };
          if (op < 0.6) m.renderOrder = 6;
          g.add(m);
          diMeshes.push(m);
        });
      });
      // 基底核：尾狀核的體與尾（C 字形）
      if (isBg && BG) {
        [-1, 1].forEach(function (sd) {
          var pts = BG.caudateTail.pts.map(function (w) { return new THREE.Vector3(sd * w[1], w[0], w[2]); });
          var t = tube(pts, 1.4, new THREE.Color(bgColor("caudate")), 0.3);
          if (t) { t.material.depthWrite = false; t.renderOrder = 6; t.userData = { nucleus: "caudate", side: sd < 0 ? "R" : "L", baseOpacity: BG_OP.caudate, baseColor: bgColor("caudate") }; g.add(t); diMeshes.push(t); }
        });
      }
      // 內囊：把每一層的中心線串成帶子，依段上色
      var DIc = model.DI;
      if (DIc) {
        var P = DIc.ic.parts, ys = [];
        for (var y = DIc.ic.y0; y <= DIc.ic.y1 + 1e-6; y += 2) ys.push(y);
        [-1, 1].forEach(function (sd) {
          var pos = [], cols = [], idx = [], n = DIc.ic.pts.length;
          ys.forEach(function (y) {
            model.icLine(y).forEach(function (q, i) {
              pos.push(sd * q.lat, y, q.z);
              var part = q.part === "posterior" && q.z < -3 ? "posterior-s" : q.part;
              var c = new THREE.Color(P[part].color);
              cols.push(c.r, c.g, c.b);
            });
          });
          for (var j = 0; j < ys.length - 1; j++) for (var i = 0; i < n - 1; i++) {
            var a = j * n + i, b = a + 1, c2 = a + n, d = c2 + 1;
            idx.push(a, c2, b, b, c2, d);
          }
          var geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
          geo.setIndex(idx);
          geo.computeVertexNormals();
          var ic = new THREE.Mesh(geo, mat(0xffffff, isBg ? 0.18 : isLim ? 0.08 : 0.3, { depthWrite: false, vertexColors: true }));
          ic.renderOrder = 7;
          ic.name = "ic";
          g.add(ic);
        });
        // 內髓板（白色細管）
        if (!isBg && !isLim) [-1, 1].forEach(function (sd) {
          var P3 = function (w) { return new THREE.Vector3(sd * w[1], w[0], w[2]); };
          [DIc.iml.stem].concat(DIc.iml.arms).forEach(function (line) {
            var t = tube(line.map(P3), 0.35, TH.iml, 0.8);
            if (t) g.add(t);
          });
        });
      }
      return g;
    }
    /** 選定的視丘核：畫出傳入（藍）與傳出（橘，經內囊到皮質）的連線。 */
    function buildLinks() {
      if (!groups.links) return;
      groups.links.clear();
      linkLabels.forEach(function (l) { l.el.remove(); });
      labelEls = labelEls.filter(function (l) { return linkLabels.indexOf(l) < 0; });
      linkLabels = [];
      diMeshes.forEach(function (m) {
        var on = !state.nucleus || (m.userData.nucleus === state.nucleus && m.userData.side === "R");
        m.material.opacity = state.nucleus ? (on ? 0.98 : Math.min(0.14, m.userData.baseOpacity)) : m.userData.baseOpacity;
        m.material.depthWrite = on && m.userData.baseOpacity > 0.5;
        m.material.emissive = new THREE.Color(on && state.nucleus ? TH.hot : 0x000000);
      });
      if (!state.nucleus || !ST[state.nucleus] || !ST[state.nucleus].thal) return;
      var L = model.thalLinks(state.nucleus, "R");
      L.in.forEach(function (l) {
        var t = tube(l.pts.map(V), 0.45, TH.linkIn[0], 0.95);
        if (t) { t.material.emissive = new THREE.Color(TH.linkIn[1]); groups.links.add(t); }
        var s0 = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat(TH.linkIn[0], 1));
        s0.position.copy(V(l.pts[0]));
        groups.links.add(s0);
      });
      L.out.forEach(function (l) {
        var t = tube(l.pts.map(V), 0.55, TH.linkOut[0], 0.95);
        if (t) { t.material.emissive = new THREE.Color(TH.linkOut[1]); groups.links.add(t); }
        var end = l.pts[l.pts.length - 1];
        var s1 = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 12), mat(TH.linkOut[0], 0.9));
        s1.position.copy(V(end));
        groups.links.add(s1);
        var el = document.createElement("span");
        el.className = "nx-label nx-label-link";
        el.textContent = l.zh;
        labelLayer.appendChild(el);
        var item = { el: el, pos: V(end) };
        labelEls.push(item);
        linkLabels.push(item);
      });
    }
    var linkLabels = [];
    function earGroup() {
      var g = new THREE.Group();
      earMeshes = [];
      var AU = model.aud;
      if (!AU || !isAud) return g;
      var C = AU.A.colors;
      function pick(m, id) { m.userData = { structure: id }; earMeshes.push(m); g.add(m); return m; }
      ["R", "L"].forEach(function (ear) {
        pick(gradTube(AU.spiral(ear, 120), 0.8, C.high, C.low), "cochlea");
        AU.canals(ear).forEach(function (c) {
          pick(tube(c.pts.map(V), 0.45, new THREE.Color(C.vestibular), 0.9), "semicircular-canals");
          pick(ball(c.amp, 0.95, C.vestibular), "semicircular-canals");
        });
        AU.blobs(ear).forEach(function (b) { pick(ball(b.c, b.r, C.vestibular, b.id === "vestibule" ? 0.35 : 0.9), b.id === "vestibule" ? "semicircular-canals" : "otolith-organs"); });
        pick(tube(AU.cochlearNerve(ear).slice(0, 3).map(V), 0.42, new THREE.Color(C.cochlea), 0.95), "spiral-ganglion");
        pick(tube(AU.vestibularNerve(ear).slice(0, 4).map(V), 0.42, new THREE.Color(C.vestibular), 0.95), "vestibular-ganglion");
        pick(ball(AU.spiralGanglion(ear), 0.9, C.cochlea), "spiral-ganglion");
        pick(ball(AU.scarpa(ear), 0.9, C.vestibular), "vestibular-ganglion");
        // 顳橫回：heschl(ear) 是 ear 對側那一個，兩耳各畫一次就是兩側
        var h = pick(gradTube(AU.heschl(ear), 1.6, C.high, C.low, 0.8), "a1");
        h.renderOrder = 8;
        pick(ball(AU.pivc(ear), 2.4, C.pivc, 0.45), "pivc");
      });
      return g;
    }

    /* ---------- 建立模型 ---------- */
    function rebuild() {
      Object.keys(groups).forEach(function (k) { world.remove(groups[k]); disposeTree(groups[k]); });
      groups = {};
      tractMeshes = [];
      var L = state.length;
      var N = model.N;

      // 脊髓外殼與灰質
      var rings = [], grings = [], ys = [];
      for (var s = 0; s <= N * 4; s++) {
        var pos = Math.min(s / 4, N - 0.001);
        rings.push(model.outlineRing(pos, 96));
        grings.push(model.grayRing(pos, 160));
        ys.push(model.yAt(pos, L));
      }
      // 圓錐末端收尖
      var tipY = model.yAt(N, L) - (L === "real" ? 10 : 5);
      rings.push(rings[rings.length - 1].map(function (p) { return { x: p.x * 0.15, z: p.z * 0.15 }; }));
      ys.push(tipY);
      var cord = new THREE.Group();
      var shell = new THREE.Mesh(loft(rings, ys), mat(TH.cord[0], TH.cord[1], { depthWrite: false }));
      shell.renderOrder = 5;
      cord.add(shell);
      var gm = new THREE.Mesh(loft(grings, ys.slice(0, grings.length), { caps: true }), mat(TH.gray[0], TH.gray[1], { depthWrite: false }));
      gm.renderOrder = 2;
      gm.name = "gray";
      cord.add(gm);
      groups.cord = cord;

      // 腦幹外殼
      var bsR = [], bsY = [];
      for (var y = 0; y <= 80; y += 2) {
        var b = model.brainstemAt(y);
        bsR.push(ellipseRing(b.a, b.b, b.zc, 96));
        bsY.push(y);
      }
      var brain = new THREE.Group();
      var bsm = new THREE.Mesh(loft(bsR, bsY), mat(TH.stem[0], TH.stem[1], { depthWrite: false }));
      bsm.renderOrder = 5;
      brain.add(bsm);
      var B = model.data.levels.brain;
      [[B.thalamus, TH.thal, isFore ? 0.05 : 0.2, 2], [B.hypothalamus, TH.hyp, isFore ? 0.05 : 0.25, 2]].forEach(function (d) {
        [-1, 1].forEach(function (sd) {
          var m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), mat(d[1], d[2], { depthWrite: false }));
          m.scale.set(d[0].r[0], d[0].r[1], d[0].r[2]);
          m.position.set(sd * d[0].c[0], d[0].c[1], d[0].c[2]);
          m.renderOrder = 4;
          brain.add(m);
        });
      });
      brain.add(cerebellumMesh(B.cerebellum));
      [-1, 1].forEach(function (sd) {
        var H = model.HEMI;
        var hm = new THREE.Mesh(superEllipsoid([sd * H.c[0], H.c[1], H.c[2]], H.r, model.HP, 48, 32), mat(TH.hemi[0], TH.hemi[1], { depthWrite: false }));
        hm.renderOrder = 7;
        brain.add(hm);
        // 中央前回（紅）與中央後回（藍）
        [[4, TH.pre], [-9, TH.post]].forEach(function (g) {
          var pts = [];
          for (var X = 3; X <= 68; X += 2.5) pts.push(new THREE.Vector3(sd * X, model.hemiTop(X, g[0]) + 0.6, g[0]));
          var t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 1.6, 8, false), mat(g[1], 0.55, { depthWrite: false }));
          t.renderOrder = 8;
          brain.add(t);
        });
      });
      groups.brain = brain;
      groups.ear = earGroup();
      groups.di = diGroup();
      groups.links = new THREE.Group();

      // 傳導路徑（左右兩側都畫；以「負責的身體側」R、L 分）
      var tracts = new THREE.Group();
      T.order.forEach(function (tid) {
        var tr = TR[tid];
        var tg = new THREE.Group();
        tg.name = tid;
        tr.bundles.forEach(function (bd) {
          ["R", "L"].forEach(function (body) {
            var color = new THREE.Color(tr.color);
            // 脊髓段
            var cside = bd.cordSide ? model.cordSide(bd.cordSide, body) : 0;
            var lastCord = null;
            if (bd.phi) {
              var lo = model.segIdx[bd.present[1]], hi = model.segIdx[bd.present[0]] + 1;
              var rr = [], yy = [];
              for (var q = lo; q <= hi + 1e-6; q += 0.25) {
                var qq = Math.min(q, hi - 0.001), rg = model.region(bd, qq);
                if (!rg) continue;
                rr.push(model.regionRing(rg, cside, 6));
                yy.push(model.yAt(qq, L));
              }
              if (rr.length > 1) {
                var m = new THREE.Mesh(loft(rr, yy, { caps: true }), mat(color, 0.78));
                m.userData = { tract: tid, bundle: bd };
                m.renderOrder = 3;
                tg.add(m);
                tractMeshes.push(m);
                var c0 = model.regionCenter(model.region(bd, lo + 0.001), cside);
                lastCord = { x: c0.x, y: model.yAt(lo + 0.001, L), z: c0.z };
              }
            }
            // 腦部段
            if (bd.brain && bd.brain.length) {
              var pts = bd.brain.slice().sort(function (a, b) { return a[0] - b[0]; }).map(function (w) { return { x: model.sx(w[1], body), y: w[0], z: w[2] }; });
              var rad = bd.brain.reduce(function (s, w) { return s + (w[3] + w[4]) / 2; }, 0) / bd.brain.length;
              if (lastCord && pts[0].y > lastCord.y) pts.unshift(lastCord);
              var tm = tube(pts.map(V), rad * 0.75, color, 0.78);
              if (tm) {
                tm.userData = { tract: tid, bundle: bd };
                tm.renderOrder = 3;
                tg.add(tm);
                tractMeshes.push(tm);
              }
            }
          });
        });
        tracts.add(tg);
      });
      groups.tracts = tracts;

      // 腦神經核（依功能分類上色，左右兩側）與腦神經纖維
      var nuclei = new THREE.Group();
      nucMeshes = [];
      Object.keys(ST).forEach(function (id) {
        var st = ST[id];
        if (!st.nuc) return;
        var col = st.color || (st.col && COLS[st.col] ? COLS[st.col].color : "#b9b2c8");
        ["R", "L"].forEach(function (side) {
          var path = model.nucPath(id, side);
          var r = path.reduce(function (a, w) { return a + (w.rx + w.rz) / 2; }, 0) / path.length;
          var pts = path.map(V);
          var g = new THREE.Group();
          var m = pts.length > 1 ? tube(pts, r, new THREE.Color(col), 0.95) : null;
          if (m) { m.userData = { nucleus: id }; g.add(m); nucMeshes.push(m); }
          [pts[0], pts[pts.length - 1]].forEach(function (p) {
            var cap = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat(new THREE.Color(col), 0.95));
            cap.position.copy(p);
            cap.userData = { nucleus: id };
            g.add(cap);
            nucMeshes.push(cap);
          });
          g.userData = { nucleus: id };
          nuclei.add(g);
        });
      });
      groups.nuclei = nuclei;
      var nerves = new THREE.Group();
      nerveMeshes = [];
      Object.keys(NV).forEach(function (id) {
        ["R", "L"].forEach(function (side) {
          var m = tube(model.nervePoints(id, side).map(V), 0.42, TH.nerve, 0.95);
          if (!m) return;
          m.userData = { nerve: id };
          m.renderOrder = 4;
          nerves.add(m);
          nerveMeshes.push(m);
        });
      });
      groups.nerves = nerves;

      // 切面、病灶
      groups.slice = new THREE.Group();
      groups.lesion = new THREE.Group();
      groups.chain = new THREE.Group();

      Object.keys(groups).forEach(function (k) { world.add(groups[k]); });
      buildLabels();
      applyVisibility();
      buildChain();
      buildSlice();
      buildLesion();
      buildLinks();
      applyBgActivity();
    }

    function disposeTree(o) {
      o.traverse(function (c) {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
    }

    function applyVisibility() {
      groups.tracts.children.forEach(function (g) {
        g.visible = !!state.visible[g.name];
        g.children.forEach(function (m) {
          // 有選路線時把路徑束變淡，才看得到裡面的神經元鏈
          var op = !state.focus ? (isStem ? 0.32 : 0.78) : state.focus === g.name ? 0.3 : 0.18;
          m.material.opacity = op;
          m.material.depthWrite = op >= 0.6;
        });
      });
      var gm = groups.cord.getObjectByName("gray");
      if (gm) gm.visible = state.showGray;
      groups.brain.visible = state.showBrain;
      if (groups.ear) groups.ear.visible = state.showBrain;
      if (groups.di) groups.di.visible = state.showNuclei;
      // 神經核與腦神經：選了某一條腦神經時，只亮它和它的核
      var nvNuc = state.nerve ? NV[state.nerve].components.map(function (c) { return c.nucleus; }) : null;
      groups.nuclei.visible = state.showNuclei;
      groups.nerves.visible = state.showNuclei;
      // 聽覺單元：只顯示聽覺、前庭相關的核與神經（看前庭眼反射時加上外旋、動眼神經）
      var vorOn = state.focus === "vor";
      var audNuc = isAud ? ["cochlear-nuclei", "vestibular-nuclei", "superior-olive", "inferior-colliculus", "mgn"].concat(vorOn ? ["abducens-nucleus", "oculomotor-nucleus"] : []) : isDi ? ["mgn", "red-nucleus", "superior-colliculus"] : isBg ? ["snc", "snr", "red-nucleus"] : isLim ? ["hippocampus"] : null;
      var audNv = isAud ? ["cn8"].concat(vorOn ? ["cn6", "cn3"] : []) : isFore ? [] : null;
      groups.nuclei.children.forEach(function (g) {
        var on = !nvNuc || nvNuc.indexOf(g.userData.nucleus) >= 0;
        g.visible = !audNuc || audNuc.indexOf(g.userData.nucleus) >= 0;
        g.children.forEach(function (m) { m.material.opacity = on ? 0.95 : 0.12; m.material.depthWrite = on; });
      });
      groups.nerves.children.forEach(function (m) {
        m.visible = !audNv || audNv.indexOf(m.userData.nerve) >= 0;
        var on = !state.nerve || m.userData.nerve === state.nerve;
        m.material.opacity = on ? 0.95 : 0.12;
        m.material.depthWrite = on;
        m.material.emissive = new THREE.Color(on && state.nerve ? TH.nerve : 0x000000);
        m.material.emissiveIntensity = on && state.nerve ? 0.45 : 0;
      });
      labelEls.forEach(function (l) { l.el.hidden = !state.showLabels; });
      applyBgActivity();
    }

    /* ---------- 神經元鏈 ---------- */
    var pulse = { t: 0, total: 0, segs: [] };
    function buildChain() {
      groups.chain.clear();
      chainObjs = null;
      if (!state.focus) return;
      var ch = model.chainFor(state.focus, state.inSeg, state.side, state.length, state.variant);
      var segs = [], total = 0;
      var R = state.length === "real" ? 0.5 : 0.36;
      ch.forEach(function (nr) {
        var col = oc(nr.order);
        var pts = nr.pts.map(V);
        var tm = tube(pts, R, col, 1);
        if (!tm) return;
        tm.material.emissive = new THREE.Color(col);
        tm.material.emissiveIntensity = 0.35;
        tm.renderOrder = 10;
        groups.chain.add(tm);
        var soma = new THREE.Mesh(new THREE.SphereGeometry(R * 3, 20, 14), mat(col, 1, { emissive: new THREE.Color(col), emissiveIntensity: 0.5 }));
        soma.position.copy(pts[0]);
        groups.chain.add(soma);
        var syn = new THREE.Mesh(new THREE.SphereGeometry(R * 1.8, 16, 12), mat(TH.syn, 0.9));
        syn.position.copy(pts[pts.length - 1]);
        groups.chain.add(syn);
        var len = tm.userData.curve.getLength();
        segs.push({ curve: tm.userData.curve, len: len, start: total });
        total += len;
      });
      var spark = new THREE.Mesh(new THREE.SphereGeometry(R * 2.4, 16, 12), new THREE.MeshBasicMaterial({ color: TH.spark }));
      spark.renderOrder = 12;
      groups.chain.add(spark);
      pulse = { t: 0, total: total, segs: segs, spark: spark };
      chainObjs = ch;
    }

    /* ---------- 切面 ---------- */
    function buildSlice() {
      groups.slice.clear();
      if (isCb) return;   // 小腦單元沒有切面，右下角改成攤開圖
      var y, ring;
      if (state.slice.kind === "seg") {
        y = model.yAt(state.slice.pos, state.length);
        ring = model.outlineRing(state.slice.pos, 96).map(function (p) { return { x: p.x * 1.9, z: p.z * 1.9 }; });
      } else {
        y = state.slice.y;
        var b = model.brainstemAt(y);
        ring = ellipseRing(b.a * 1.5, b.b * 1.5, b.zc, 96);
      }
      var shape = new THREE.Shape(ring.map(function (p) { return new THREE.Vector2(p.x, -p.z); }));
      var g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: TH.slice[0], transparent: true, opacity: TH.slice[1], side: THREE.DoubleSide, depthWrite: false }));
      m.position.y = y;
      m.renderOrder = 9;
      groups.slice.add(m);
      var edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ring.map(function (p) { return new THREE.Vector3(p.x, y, p.z); })), new THREE.LineBasicMaterial({ color: TH.slice[0], transparent: true, opacity: TH.slice[2] }));
      groups.slice.add(edge);
    }

    /* ---------- 病灶 ---------- */
    function currentZones() {
      var l = LE.lesions[state.lesion];
      return l.adjustable ? adjustZones(l.zones, state.lesionSeg, state.lesionSide) : l.zones;
    }
    function buildLesion() {
      groups.lesion.clear();
      if (state.tab !== "lesion" || mode !== "region") return;
      currentZones().forEach(function (z) {
        if (z.brain) { buildBrainLesion(z.brain); return; }
        var a = model.segIdx[z.segs[0]], b = model.segIdx[z.segs[1]] + 1;
        var polys = lesionPolys(model, (a + b) / 2, z);
        polys.forEach(function (poly) {
          var rr = [], yy = [];
          for (var q = a; q <= b + 1e-6; q += Math.max(0.25, (b - a) / 12)) {
            var pp = lesionPolys(model, Math.min(q, b - 0.001) + 0, z);
            var ring = pp[polys.indexOf(poly)] || poly;
            if (ring.length !== poly.length) ring = poly;
            rr.push(ring.map(function (p) { return { x: p.x, z: p.z }; }));
            yy.push(model.yAt(Math.min(q, b), state.length));
          }
          if (rr.length < 2) { rr = [poly, poly]; yy = [model.yAt(a, state.length), model.yAt(b, state.length)]; }
          var m = new THREE.Mesh(loft(rr, yy, { caps: true }), mat(TH.lesion[0], 0.5, { depthWrite: false, emissive: new THREE.Color(TH.lesion[1]) }));
          m.renderOrder = 11;
          groups.lesion.add(m);
        });
      });
    }

    /** 腦幹病灶：每個方框依腦幹外形裁切後，沿 y 疊成實體。 */
    function buildBrainLesion(zb) {
      var sides = zb.side === "both" ? [-1, 1] : [zb.side === "L" ? 1 : -1];
      var bsMid = model.brainstemAt((zb.y[0] + zb.y[1]) / 2);
      var outside = zb.y[0] > 80 || zb.boxes.every(function (bx) { return bx.lat[0] >= bsMid.a * 0.95; });
      if (isCb || outside) {   // 小腦、內耳、內耳道、大腦的病灶不限於腦幹內，直接畫方框
        sides.forEach(function (sd) {
          zb.boxes.forEach(function (bx) {
            var w = bx.lat[1] - bx.lat[0], hh = zb.y[1] - zb.y[0], d = bx.z[1] - bx.z[0];
            var m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat(TH.lesion[0], 0.45, { depthWrite: false, emissive: new THREE.Color(TH.lesion[1]) }));
            m.position.set(sd * (bx.lat[0] + w / 2), zb.y[0] + hh / 2, bx.z[0] + d / 2);
            m.renderOrder = 11;
            groups.lesion.add(m);
          });
        });
        return;
      }
      sides.forEach(function (sd) {
        zb.boxes.forEach(function (bx) {
          var rr = [], yy = [];
          for (var y = zb.y[0]; y <= zb.y[1] + 1e-6; y += Math.max(0.5, (zb.y[1] - zb.y[0]) / 10)) {
            var bs = model.brainstemAt(y), ring = [], n = 10;
            var corners = [[bx.lat[0], bx.z[0]], [bx.lat[1], bx.z[0]], [bx.lat[1], bx.z[1]], [bx.lat[0], bx.z[1]]];
            for (var c = 0; c < 4; c++) {
              var p0 = corners[c], p1 = corners[(c + 1) % 4];
              for (var i = 0; i < n; i++) {
                var t = i / n, lat = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t;
                // 落在腦幹外面的點縮回外形邊緣
                var ex = lat / bs.a, ez = (z - bs.zc) / bs.b, e = Math.sqrt(ex * ex + ez * ez);
                if (e > 0.98) { lat = lat * 0.98 / e; z = bs.zc + (z - bs.zc) * 0.98 / e; }
                ring.push({ x: sd * lat, z: z });
              }
            }
            rr.push(ring);
            yy.push(Math.min(y, zb.y[1]));
          }
          var m = new THREE.Mesh(loft(rr, yy, { caps: true }), mat(TH.lesion[0], 0.55, { depthWrite: false, emissive: new THREE.Color(TH.lesion[1]) }));
          m.renderOrder = 11;
          groups.lesion.add(m);
        });
      });
    }

    /* ---------- 標籤 ---------- */
    function buildLabels() {
      labelLayer.innerHTML = "";
      labelEls = [];
      var L = state.length;
      (isCb || isAud || isFore ? [] : ["c1", "c5", "t1", "t6", "t12", "l1", "l5", "s1", "co1"]).forEach(function (id) {
        addLabel(model.segs[model.segIdx[id]].name, new THREE.Vector3(-9, model.yAt(model.segIdx[id] + 0.5, L), 0), "lvl");
      });
      [["延髓", [0, 16, 9]], ["橋腦", [0, 45, 14]], ["中腦", [0, 68, 11]], ["視丘", [-16, 95, 4]], ["小腦", [-40, 44, -40]],
        ["中央前回（M1）", [-56, 172, 6]], ["中央後回（S1）", [-56, 168, -12]], ["錐體交叉", [0, 1, 7]], ["感覺交叉", [0, 10, -2]]].forEach(function (d) {
        if ((isCb || isAud) && /小腦|錐體交叉|感覺交叉|中央/.test(d[0])) return;
        if (isFore && /錐體交叉|感覺交叉|延髓|橋腦|視丘/.test(d[0])) return;
        addLabel(d[0], new THREE.Vector3(d[1][0], d[1][1], d[1][2]), "key");
      });
      if (isDi && mode === "region") {
        ["an", "md", "va", "vl", "vpl", "vpm", "ld", "lp", "pulvinar", "cm", "mammillary-body", "son", "subthalamic", "caudate", "putamen", "pineal"].forEach(function (id) {
          var e = model.ellOf(id, "R");
          if (!e) return;
          var st = ST[id];
          addLabel(st.abbr || st.zh.replace(/（.*?）/g, "").replace(/^視丘/, ""), new THREE.Vector3(e.x - (CTX.test(id) ? e.rx : 0), e.y + e.ry * 0.9, e.z), "key");
        });
        [["外側膝狀體", [-21, 84, -12]], ["內側膝狀體", [-16, 83, -16]], ["內囊", [-26, 108, 4]]].forEach(function (d) { addLabel(d[0], new THREE.Vector3(d[1][0], d[1][1], d[1][2]), "key"); });
      }
      if (isLim && mode === "region") {
        ["entorhinal", "amygdala", "septal-area", "cingulate-gyrus", "nucleus-basalis", "mammillary-body", "an"].forEach(function (id) {
          var e = model.ellOf(id, "R");
          if (!e) return;
          var st = ST[id];
          addLabel(st.zh.replace(/（.*?）/g, "").replace(/^視丘/, ""), new THREE.Vector3(e.x, e.y + e.ry * 0.9, e.z), "key");
        });
        var hp = model.nucPath("hippocampus", "R");
        addLabel("海馬結構", new THREE.Vector3(hp[3].x, hp[3].y + 2.4, hp[3].z), "key");
        [["穹窿", [-3, 112, -8]], ["乳頭視丘徑", [-6.5, 91, 5.5]], ["終紋", [-23, 101, -22]]].forEach(function (d) { addLabel(d[0], new THREE.Vector3(d[1][0], d[1][1], d[1][2]), "key"); });
      }
      if (isBg && mode === "region") {
        ["caudate", "putamen", "gpe", "gpi", "subthalamic", "nucleus-accumbens", "claustrum"].forEach(function (id) {
          var e = model.ellOf(id, "R");
          if (!e) return;
          var st = ST[id];
          var dx = id === "putamen" || id === "claustrum" ? -e.rx : id === "gpe" ? 0 : 0;
          addLabel(st.abbr && !/NAc/.test(st.abbr) ? st.abbr : st.zh.replace(/（.*?）/g, ""), new THREE.Vector3(e.x + dx, e.y + e.ry * (id === "gpe" ? 1.05 : 0.9), e.z + (id === "gpe" ? -2 : 0)), "key");
        });
        var t = BG.caudateTail.pts[6];
        [["尾狀核尾", [-t[1], t[0], t[2]]], ["黑質（SNc、SNr）", [-12.5, 70, 3]], ["視丘 VA、VL", [-13.5, 94, 4]], ["內囊", [-26, 108, 4]], ["輔助運動區、運動前區", [-34, 128, 14]]].forEach(function (d) { addLabel(d[0], new THREE.Vector3(d[1][0], d[1][1], d[1][2]), "key"); });
      }
      if (isAud && mode === "region") {
        [["耳蝸", [-37, 30, 12]], ["半規管", [-47, 39, -2]], ["內耳道", [-27, 35, 3]], ["耳蝸神經核", [-13, 28, -8]], ["前庭神經核", [-7, 24, -8]],
          ["上橄欖核", [-8, 37, 2]], ["斜方體", [0, 32, 5]], ["外側蹄系", [-12, 50, -4]], ["下丘", [-5, 62, -11]], ["內側膝狀體", [-16, 80, -17]], ["聽覺皮質（顳橫回）", [-54, 93, 0]]].forEach(function (d) {
          addLabel(d[0], new THREE.Vector3(d[1][0], d[1][1], d[1][2]), "key");
        });
      }
      if (isCb && mode === "region") {
        [["蚓部", [0, 58, -52]], ["外側區（半球）", [-38, 54, -44]], ["小結", [0, 28, -18]], ["絨球", [-26, 30, -12]],
          ["齒狀核", [-17, 46, -22]], ["上小腦腳", [-9, 58, -12]], ["中小腦腳", [-20, 47, -4]], ["下小腦腳", [-12, 30, -9]], ["原裂", [-30, 63, -24]]].forEach(function (d) {
          addLabel(d[0], new THREE.Vector3(d[1][0], d[1][1], d[1][2]), "key");
        });
      }
    }
    function addLabel(text, pos, kind) {
      var el = document.createElement("span");
      el.className = "nx-label nx-label-" + kind;
      el.textContent = text;
      labelLayer.appendChild(el);
      labelEls.push({ el: el, pos: pos });
    }
    var tmpV = new THREE.Vector3();
    function updateLabels() {
      if (!state.showLabels) return;
      var w = stage.clientWidth, h = stage.clientHeight;
      labelEls.forEach(function (l) {
        tmpV.copy(l.pos).project(camera);
        var off = tmpV.z > 1 || tmpV.x < -1.1 || tmpV.x > 1.1 || tmpV.y < -1.1 || tmpV.y > 1.1;
        l.el.hidden = off;
        if (!off) l.el.style.transform = "translate(" + ((tmpV.x * 0.5 + 0.5) * w).toFixed(1) + "px," + ((-tmpV.y * 0.5 + 0.5) * h).toFixed(1) + "px)";
      });
    }

    /* ---------- 相機 ---------- */
    function sliceY() { return state.slice.kind === "seg" ? model.yAt(state.slice.pos, state.length) : state.slice.y; }
    function setView(v, instant) {
      var ty, dist, dirv = new THREE.Vector3(0.55, 0.18, 1).normalize();
      var top = 190, bottom = model.yAt(model.N, state.length);
      if (v === "all") { ty = (top + bottom) / 2; dist = (top - bottom) * 1.55; }
      else if (v === "brain") { ty = 115; dist = 330; }
      else if (v === "stem") { ty = 40; dist = 150; }
      else if (v === "di" || v === "ditop") {
        // 間腦：從右前上方看右側視丘；由上往下：和水平切面相同的方向（後方在上）
        var c0 = new THREE.Vector3(v === "di" ? -10 : 0, 93, 0);
        controls.target.copy(c0);
        var fz0 = camera.aspect < 1 ? Math.min(1.8, 0.95 / camera.aspect) : 1;
        if (v === "di") camera.position.copy(c0).add(new THREE.Vector3(-0.62, 0.55, 0.56).normalize().multiplyScalar(118 * fz0));
        else camera.position.set(0, 90 + 115 * fz0, 6);
        controls.update();
        return;
      }
      else if (v === "lim" || v === "limtop") {
        // 邊緣系統：從右外上方看右側顳葉內側與穹窿；由上往下：像水平切面一樣（後方在上）
        var c2 = v === "lim" ? new THREE.Vector3(-14, 92, -4) : new THREE.Vector3(-10, 92, -2);
        controls.target.copy(c2);
        var fz2 = camera.aspect < 1 ? Math.min(1.8, 0.95 / camera.aspect) : 1;
        if (v === "lim") camera.position.copy(c2).add(new THREE.Vector3(-0.85, 0.5, 0.35).normalize().multiplyScalar(150 * fz2));
        else camera.position.set(-10, 92 + 160 * fz2, 4);
        controls.update();
        return;
      }
      else if (v === "bg" || v === "bgfront") {
        // 基底核：從右前外上方看右半球的豆狀核與尾狀核；正面：像冠狀切面一樣從前面看
        var c1 = v === "bg" ? new THREE.Vector3(-17, 83, 9) : new THREE.Vector3(-4, 81, 0);
        controls.target.copy(c1);
        var fz1 = camera.aspect < 1 ? Math.min(1.8, 0.95 / camera.aspect) : 1;
        camera.position.copy(c1).add((v === "bg" ? new THREE.Vector3(-0.8, 0.42, 0.62) : new THREE.Vector3(-0.08, 0.12, 1)).normalize().multiplyScalar((v === "bg" ? 128 : 118) * fz1));
        controls.update();
        return;
      }
      else if (v === "aud" || v === "ear") {
        // 聽覺：從前方稍微偏上看（病人右側在畫面左邊），框住兩耳到聽覺皮質；內耳：靠近右耳，從前外側看
        var box = v === "aud" ? new THREE.Box3(new THREE.Vector3(-60, 24, -16), new THREE.Vector3(60, 96, 12)) : new THREE.Box3(new THREE.Vector3(-50, 25, -8), new THREE.Vector3(-26, 41, 12));
        var c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
        var half = Math.tan((camera.fov * Math.PI) / 360);
        var d = Math.max((s.y / 2) / half, (s.x / 2) / (half * camera.aspect)) * 1.12 + (v === "aud" ? 20 : 12);
        controls.target.copy(c);
        camera.position.copy(c).add((v === "aud" ? new THREE.Vector3(0.12, 0.22, 1) : new THREE.Vector3(-0.75, 0.4, 0.75)).normalize().multiplyScalar(d));
        controls.update();
        return;
      }
      else if (v === "cb") {   // 從後上方看小腦：病人右側在畫面右邊
        controls.target.set(0, 42, -24);
        var fz = camera.aspect < 1 ? Math.min(1.8, 0.9 / camera.aspect) : 1;
        camera.position.set(35 * fz, 42 + 72 * fz, -24 - 138 * fz);
        controls.update();
        return;
      }
      else { ty = sliceY(); dist = state.length === "real" ? 150 : 110; }
      if (v === "side") { ty = sliceY(); dist = state.length === "real" ? 150 : 110; dirv.set(1, 0.1, 0.05).normalize(); }
      if (v === "top") { ty = sliceY(); dist = 55; dirv.set(0.02, 1, 0.12).normalize(); }
      var target = new THREE.Vector3(0, ty, 0);
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dirv, dist);
      controls.update();
    }
    function fitNerve() {
      if (!state.nerve) return setView("stem");
      var box = new THREE.Box3();
      ["R", "L"].forEach(function (sd) { model.nervePoints(state.nerve, sd).forEach(function (p) { box.expandByPoint(V(p)); }); });
      var c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      controls.target.copy(c);
      var dist = Math.max(sz.x, sz.y, sz.z) * 1.9 + 30;
      // 走在背側的神經（滑車神經）從後面看比較清楚
      var p0 = NV[state.nerve].path, zs = p0.slice(0, NV[state.nerve].exitAt + 1).map(function (w) { return w[2]; });
      var back = zs.reduce(function (a, z) { return a + z; }, 0) / zs.length < -4;
      camera.position.copy(c).add(new THREE.Vector3(0.35, 0.3, back ? -1 : 1).normalize().multiplyScalar(dist));
      controls.update();
    }
    function fitChain() {
      if (!chainObjs) return setView(isStem ? "stem" : "all");
      var box = new THREE.Box3();
      chainObjs.forEach(function (n) { n.pts.forEach(function (p) { box.expandByPoint(V(p)); }); });
      var c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      controls.target.copy(c);
      var half = Math.tan((camera.fov * Math.PI) / 360);
      var dist = Math.max((s.y / 2) / half, (Math.max(s.x, s.z) / 2) / (half * camera.aspect)) * 1.25 + 20;
      camera.position.copy(c).add(new THREE.Vector3(0.55, 0.12, 1).normalize().multiplyScalar(dist));
      controls.update();
    }

    /* ---------- 面板 ---------- */
    function segOptions(from, to, sel) {
      var a = model.segIdx[to], b = model.segIdx[from], out = [];
      for (var i = a; i <= b; i++) {
        var s = model.segs[i];
        out.push('<option value="' + s.id + '"' + (s.id === sel ? " selected" : "") + ">" + s.name + (s.dermatome ? "（" + s.dermatome + "）" : "") + "</option>");
      }
      return out.join("");
    }
    function sliceName() {
      if (state.slice.kind === "seg") return model.segs[Math.min(model.N - 1, Math.floor(state.slice.pos))].name;
      var y = state.slice.y;
      var bl = model.data.levels.brainLevels.filter(function (b) { return Math.abs(b.y - y) < 0.5; })[0];
      if (bl) return bl.name;
      return y < 12 ? "延髓下段" : y < 22 ? "延髓中段" : y < 32 ? "延髓上段" : y < 40 ? "橋腦下段" : y < 52 ? "橋腦中段" : y < 60 ? "橋腦上段" : y < 67 ? "中腦下段" : y <= 80 ? "中腦上段" : y < 85 ? "間腦下段" : y < 92 ? "視丘中段" : y < 101 ? "視丘上段、內囊" : "內囊上段（視丘以上）";
    }
    function sectionHTML() {
      if (isCb) {
        var zs = state.tab === "lesion" && mode === "region" ? currentZones() : null;
        return cbMapSVG(model, { zones: zs, color: state.cbColor, labels: false, label: "小腦攤開圖" });
      }
      var hl = state.focus ? [state.focus] : null;
      var fiber = null;
      if (state.focus && state.slice.kind === "seg") {
        // 代表纖維在這一節的位置
        fiber = [];
        var pos = state.slice.pos;
        (chainObjs || []).forEach(function (nr) {
          var y = model.yAt(pos, state.length);
          for (var i = 0; i < nr.pts.length - 1; i++) {
            var a = nr.pts[i], b = nr.pts[i + 1];
            if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) {
              var t = (y - a.y) / (b.y - a.y);
              fiber.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, color: hexOf(oc(nr.order)) });
            }
          }
        });
      }
      var lesTab = state.tab === "lesion" && mode === "region";
      if (state.slice.kind === "seg") {
        var seg = model.segs[Math.min(model.N - 1, Math.floor(state.slice.pos))].id;
        var les = null;
        if (lesTab) {
          currentZones().forEach(function (z) {
            if (z.brain) return;
            var a = model.segIdx[z.segs[0]], b = model.segIdx[z.segs[1]];
            var i = model.segIdx[seg];
            if (i >= a && i <= b) les = { side: z.side, parts: z.parts };
          });
        }
        return sectionSVG(model, seg, { scale: 20, highlight: lesTab ? null : hl, fiber: fiber, lesion: les, label: seg.toUpperCase() + " 橫切面" });
      }
      var bl = null;
      if (lesTab) currentZones().forEach(function (z) { if (z.brain && state.slice.y >= z.brain.y[0] - 0.01 && state.slice.y <= z.brain.y[1] + 0.01) bl = z.brain; });
      return brainSectionSVG(model, state.slice.y, { scale: 9, highlight: lesTab ? null : hl, nerve: state.nerve, brainLesion: bl, label: sliceName() });
    }

    function renderPanel() {
      var h = [];
      if (mode === "region") {
        var tabs = isCb ? [["zones", "分區"], ["tracts", "路徑"], ["lesion", "病灶"]] : isBg || isLim ? [["circuit", "迴路"], ["tracts", "路徑"], ["lesion", "病灶"]] : isDi ? [["nuclei", "視丘核"], ["tracts", "路徑"], ["lesion", "病灶"]] : [["tracts", "路徑"]].concat(isStem && !isAud ? [["nerves", "腦神經"]] : []).concat([["lesion", "病灶"]]);
        h.push('<div class="nx-modes" role="tablist">' + tabs.map(function (t) {
          return '<button type="button" class="nx-chip" data-tab="' + t[0] + '" aria-pressed="' + (state.tab === t[0]) + '">' + t[1] + "</button>";
        }).join("") + "</div>");
      }
      if (!isCb) h.push(slicePanel());
      if (mode === "nerve") h.push(nervePanel());
      else if (state.tab === "zones" && mode === "region") h.push(zonesPanel());
      else if (state.tab === "nuclei" && mode === "region") h.push(nucleiPanel());
      else if (state.tab === "circuit" && mode === "region") h.push(isLim ? limbicPanel() : circuitPanel());
      else if (state.tab === "lesion" && mode === "region") h.push(lesionPanel());
      else if (state.tab === "nerves" && mode === "region") h.push(nervePanel());
      else h.push(tractPanel());
      h.push('<h4>顯示</h4><div class="nx-toggles">' +
        '<label><input type="checkbox" data-opt="showGray"' + (state.showGray ? " checked" : "") + "> 灰質</label>" +
        '<label><input type="checkbox" data-opt="showBrain"' + (state.showBrain ? " checked" : "") + "> 腦部外形</label>" +
        '<label><input type="checkbox" data-opt="showNuclei"' + (state.showNuclei ? " checked" : "") + "> 腦神經核與纖維</label>" +
        '<label><input type="checkbox" data-opt="showLabels"' + (state.showLabels ? " checked" : "") + "> 標籤</label>" +
        '<label><input type="checkbox" data-opt="real"' + (state.length === "real" ? " checked" : "") + "> 真實長度</label></div>");
      h.push('<p class="nx-note">模型是依課本描述畫成的示意圖，形狀與比例不是真實測量資料。</p>');
      panel.innerHTML = h.join("");
      updateSection();
    }

    function tractPanel() {
      var h = [];
      if (state.focus) {
        var tr = TR[state.focus];
        var orders = [];
        tr.chains.forEach(function (c) { c.neurons.forEach(function (n) { if (orders.indexOf(String(n.order)) < 0) orders.push(String(n.order)); }); });
        h.push("<h4>神經元鏈</h4>");
        h.push('<p><b style="color:' + tr.color + '">' + esc(tr.zh) + "</b>" + (mode === "region" ? ' <a href="/resources/neuro/tract/' + state.focus + '.html">看說明 →</a>' : "") + "</p>");
        h.push('<ul class="nx-chainleg">' + orders.map(function (o) {
          return '<li><i style="background:#' + new THREE.Color(oc(o)).getHexString() + '"></i>' + (ORDER_ZH[o] || o) + "</li>";
        }).join("") + "</ul>");
        if (tr.inputs) h.push('<div class="nx-row"><span>' + (tr.inputs.label || "身體節段") + '</span><select data-act="inseg">' + segOptions(tr.inputs.from, tr.inputs.to, state.inSeg) + "</select></div>");
        if (tr.variants) h.push('<div class="nx-row"><span>看哪一種</span>' + tr.variants.map(function (v) {
          return '<button type="button" class="nx-chip" data-variant="' + v.id + '" aria-pressed="' + (state.variant === v.id) + '">' + esc(v.zh) + "</button>";
        }).join("") + "</div>");
        var sl = tr.sideLabels || ["右側", "左側"];
        h.push('<div class="nx-row"><span>' + (tr.sideLabels ? "方向" : tr.kind === "descending" && !tr.inputs ? "臉的哪一側" : "身體側") + '</span><button type="button" class="nx-chip" data-side="R" aria-pressed="' + (state.side === "R") + '">' + sl[0] + '</button><button type="button" class="nx-chip" data-side="L" aria-pressed="' + (state.side === "L") + '">' + sl[1] + "</button>" +
          '<button type="button" class="nx-chip" data-act="play" aria-pressed="' + state.playing + '">' + (state.playing ? "暫停" : "播放") + "</button></div>");
        h.push('<p class="nx-note">' + chainText(state.focus) + "</p>");
        if (tr.kind === "auditory") h.push('<p class="nx-note">耳蝸與顳橫回的顏色：紅＝高頻（耳蝸底部、皮質後內側）、藍＝低頻（耳蝸頂部、皮質前外側）。三種走法切換看看：每一耳都同時送到兩側。</p>');
        if (state.focus === "vor") h.push('<p class="nx-note">' + (state.side === "R" ? "頭向右轉 → 右外側半規管興奮 → 兩眼往左轉（左外直肌＋右內直肌）。" : "頭向左轉 → 左外側半規管興奮 → 兩眼往右轉（右外直肌＋左內直肌）。") + "</p>");
        var page3d = tr.kind === "cerebellar" ? "cerebellum" : tr.kind === "diencephalon" ? "diencephalon" : tr.kind === "basal" ? "basal-ganglia" : tr.kind === "limbic" ? "limbic" : tr.kind === "auditory" || tr.kind === "vestibular" ? "auditory" : isStem || !tr.inputs ? "brainstem" : "spinal-cord";
        if (mode === "region") h.push('<p><button type="button" class="nx-btn3d is-ghost" data-act="unfocus">取消路線</button> <button type="button" class="nx-btn3d is-ghost" data-act="fit">看整條路線</button></p>');
        else h.push('<p><button type="button" class="nx-btn3d is-ghost" data-act="fit">看整條路線</button> <a href="/resources/neuro/3d.html?region=' + page3d + '&amp;tract=' + state.focus + '">在完整 3D 中開啟 →</a></p>');
      }
      if (mode === "region") {
        h.push("<h4>傳導路徑（勾選顯示，按「路線」看神經元鏈）</h4>");
        T.groups.forEach(function (g) {
          if (g.id === "visual") return;   // 視覺路徑在另一個 3D（visual-viewer.js）
          h.push('<p class="nx-note" style="margin:6px 0 2px">' + g.name + '</p><ul class="nx-tlist">' + g.tracts.map(function (tid) {
            var tr = TR[tid];
            return '<li><label><input type="checkbox" data-vis="' + tid + '"' + (state.visible[tid] ? " checked" : "") + '><i style="background:' + tr.color + '"></i>' + esc(tr.zh.replace(/（.*）/, "")) + "</label>" +
              '<button type="button" data-focus="' + tid + '" aria-pressed="' + (state.focus === tid) + '">路線</button></li>';
          }).join("") + "</ul>");
        });
      }
      return h.join("");
    }
    function chainText(tid) {
      var tr = TR[tid];
      var s = tr.neurons.map(function (n) { return plain(n.soma).replace(/（.*?）/g, ""); });
      s.push(plain(tr.neurons[tr.neurons.length - 1].synapse).replace(/（.*?）/g, ""));
      return esc(s.join(" → "));
    }

    function nervePanel() {
      var h = [];
      if (state.nerve) {
        var nv = NV[state.nerve];
        h.push("<h4>腦神經</h4>");
        h.push('<p><b style="color:' + hexOf(TH.nerve) + '">' + nv.num + " " + esc(nv.zh) + "</b>" + (mode === "region" ? ' <a href="/resources/neuro/nerve/' + state.nerve + '.html">看說明 →</a>' : "") + "</p>");
        h.push('<ul class="nx-deficits">' + nv.components.map(function (c) {
          var col = COLS[c.col];
          return '<li><span class="nx-colchip" style="--c:' + col.color + '">' + c.col + "</span> " + esc(NAMES["structure:" + c.nucleus] || c.nucleus) + "：" + esc(plain(c.fn)) + "</li>";
        }).join("") + "</ul>");
        h.push('<p class="nx-note">出腦幹：' + esc(nv.exit) + "</p>");
        h.push('<p><button type="button" class="nx-btn3d is-ghost" data-act="fitnerve">看這條神經</button>' + (mode === "region" ? ' <button type="button" class="nx-btn3d is-ghost" data-act="unnerve">取消</button>' : ' <a href="/resources/neuro/3d.html?region=brainstem&amp;nerve=' + state.nerve + '">在完整 3D 中開啟 →</a>') + "</p>");
      }
      if (mode === "region") {
        h.push("<h4>腦神經（點一條看它的核與走向）</h4>");
        h.push('<ul class="nx-tlist">' + model.data.nerves.order.filter(function (id) { return !NV[id].special; }).map(function (id) {
          var nv = NV[id];
          return '<li><button type="button" data-nerve="' + id + '" aria-pressed="' + (state.nerve === id) + '">' + nv.num + "</button> " + esc(nv.zh) + "</li>";
        }).join("") + "</ul>");
        h.push('<p class="nx-note">神經核顏色：' + Object.keys(COLS).map(function (k) { return '<span class="nx-colchip" style="--c:' + COLS[k].color + '">' + k + "</span>"; }).join(" ") + "</p>");
      }
      return h.join("");
    }

    /** 間腦：依核群列出視丘各核，選一個看它的傳入與傳出。 */
    function nucleiPanel() {
      var G = model.DI ? model.DI.groups : {};
      var TYPE = { relay: "中繼核", association: "聯合核", nonspecific: "非特異核", reticular: "網狀核" };
      var h = [];
      if (state.nucleus && ST[state.nucleus]) {
        var st = ST[state.nucleus], th = st.thal;
        h.push("<h4>" + esc(st.zh) + (st.abbr ? " <span class=\"nx-en\">" + esc(st.abbr) + "</span>" : "") + ' <a href="/resources/neuro/structure/' + state.nucleus + '.html">看說明 →</a></h4>');
        if (th) {
          h.push('<p class="nx-note">' + esc((G[th.group] || {}).zh || "") + "・" + esc(TYPE[th.type] || "") + (th.fn ? "・" + esc(th.fn) : "") + "</p>");
          h.push('<ul class="nx-links">' + th.in.map(function (l) { return '<li class="is-in">傳入：' + esc(l.zh) + "</li>"; }).join("") +
            th.out.map(function (l) { return '<li class="is-out">傳出：' + esc(l.zh) + (l.ic ? "（內囊" + esc(model.DI.ic.parts[l.ic].zh) + "）" : "") + "</li>"; }).join("") + "</ul>");
          if (!th.out.length) h.push('<p class="nx-note">網狀核不投射到皮質，只回頭抑制其他視丘核。</p>');
        } else h.push('<p class="nx-note">' + esc(plain(st.summary)) + "</p>");
        h.push('<p><button type="button" class="nx-btn3d is-ghost" data-act="unnucleus">取消</button></p>');
      }
      h.push("<h4>視丘各核（點一個看它連到哪裡）</h4>");
      var order = ["anterior", "medial", "intralaminar", "lateral", "ventral", "meta", "reticular"];
      order.forEach(function (gid) {
        var ids = Object.keys(ST).filter(function (id) { return ST[id].thal && ST[id].thal.group === gid; });
        if (!ids.length) return;
        h.push('<p class="nx-note" style="margin:6px 0 2px"><i class="nx-dot" style="background:' + G[gid].color + '"></i>' + esc(G[gid].zh) + '</p><div class="nx-row">' + ids.map(function (id) {
          return '<button type="button" class="nx-chip" data-nucleus="' + id + '" aria-pressed="' + (state.nucleus === id) + '">' + esc(ST[id].abbr || ST[id].zh.replace(/（.*?）/g, "").replace(/^視丘/, "")) + "</button>";
        }).join("") + "</div>");
      });
      h.push("<h4>下視丘、上視丘、視丘下部</h4><div class=\"nx-row\">" + Object.keys(ST).filter(function (id) { return ST[id].ell && !ST[id].thal && !CTX.test(id); }).map(function (id) {
        return '<button type="button" class="nx-chip" data-nucleus="' + id + '" aria-pressed="' + (state.nucleus === id) + '">' + esc(ST[id].abbr || ST[id].zh.replace(/（.*?）/g, "")) + "</button>";
      }).join("") + "</div>");
      h.push('<p class="nx-note">藍線是傳入、橘線是傳出（經內囊到皮質）。內囊的顏色：<span style="color:#3fae78">前肢</span>、<span style="color:#c99a00">膝部</span>、<span style="color:#e0645a">後肢</span>、<span style="color:#4f86d6">後肢後段</span>、<span style="color:#8a6bd6">後豆狀部</span>。</p>');
      return h.join("");
    }
    /** 基底核：選路徑（神經元鏈）與狀況（依迴路推導各核的活性）。 */
    var BG_PATHS = [["bg-direct", "direct", "直接路徑"], ["bg-indirect", "indirect", "間接路徑"], ["nigrostriatal", "nigro", "黑質紋狀體"]];
    function circuitPanel() {
      var h = ["<h4>看哪一條路徑</h4>"];
      var cur = BG_PATHS.filter(function (p) { return p[0] === state.focus; })[0];
      h.push('<div class="nx-row">' + BG_PATHS.map(function (p) {
        return '<button type="button" class="nx-chip" data-focus="' + p[0] + '" aria-pressed="' + (state.focus === p[0]) + '">' + p[2] + "</button>";
      }).join("") + "</div>");
      if (state.focus && TR[state.focus]) h.push('<p class="nx-note">' + chainText(state.focus) + "</p>");
      h.push("<h4>狀況</h4><div class=\"nx-row\">" + CONDS.map(function (c) {
        return '<button type="button" class="nx-chip" data-cond="' + c.id + '" aria-pressed="' + (state.cond === c.id) + '">' + esc(c.zh) + "</button>";
      }).join("") + "</div>");
      var c = CONDS.filter(function (x) { return x.id === state.cond; })[0], cmp = bgCompare(BG, c ? c.knock : []);
      h.push('<div class="nx-bg-card">' + circuitSVG(BG, { cond: state.cond, path: cur ? cur[1] : null, label: "基底核迴路：" + (c ? c.zh : "") }) + circuitLegend() + "</div>");
      h.push('<p class="nx-note"><b>' + esc(c ? c.zh : "") + "</b>：" + esc(cmp.motorZh) + (c && c.note ? "。" + esc(c.note) : "") + "</p>");
      if (c && c.lesion) h.push('<p><a href="/resources/neuro/lesion/' + c.lesion + '.html">' + esc(LE.lesions[c.lesion].zh) + " 的說明 →</a></p>");
      h.push('<p class="nx-note">3D 裡發亮＝比正常活躍、變淡＝比正常安靜、灰色＝失去功能。</p>');
      return h.join("");
    }
    /** 邊緣系統：選路徑（神經元鏈）；下方是 Papez 迴路與杏仁核連結的迴路圖。 */
    var LIM_PATHS = [["fornix", "穹窿"], ["mammillothalamic", "乳頭視丘徑"], ["hippocampal-circuit", "海馬內迴路"], ["amygdalofugal", "杏仁核傳出"]];
    function limbicPanel() {
      var h = ["<h4>看哪一條路徑</h4>"];
      h.push('<div class="nx-row">' + LIM_PATHS.map(function (p) {
        return '<button type="button" class="nx-chip" data-focus="' + p[0] + '" aria-pressed="' + (state.focus === p[0]) + '">' + p[1] + "</button>";
      }).join("") + "</div>");
      var tr = state.focus && TR[state.focus];
      if (tr && tr.variants) h.push('<div class="nx-row"><span>走法</span>' + tr.variants.map(function (v) { return '<button type="button" class="nx-chip" data-variant="' + v.id + '" aria-pressed="' + (state.variant === v.id) + '">' + esc(v.zh) + "</button>"; }).join("") + "</div>");
      if (tr) h.push('<p class="nx-note">' + chainText(state.focus) + "</p>");
      h.push('<div class="nx-bg-card">' + limbicSVG(model.LM, { label: "邊緣系統迴路" }) + limbicLegend() + "</div>");
      h.push('<p class="nx-note"><b>Papez 迴路</b>：內嗅皮質 → 海馬 →（穹窿）→ 乳頭體 →（乳頭視丘徑）→ 前核 →（內囊前肢）→ 扣帶迴 →（扣帶束）→ 內嗅皮質。杏仁核不在這條迴路裡，它管情緒，傳出走終紋與腹側杏仁傳出徑。</p>');
      return h.join("");
    }
    function zonesPanel() {
      var h = ["<h4>小腦上色方式</h4>"];
      h.push('<div class="nx-row">' + [["zone", "縱向分區"], ["lobe", "分葉"]].map(function (c) {
        return '<button type="button" class="nx-chip" data-cbcolor="' + c[0] + '" aria-pressed="' + (state.cbColor === c[0]) + '">' + c[1] + "</button>";
      }).join("") + "</div>");
      var item = function (col, text, link) { return '<li><i style="background:' + col + '"></i><a href="/resources/neuro/structure/' + link + '.html">' + esc(text) + "</a></li>"; };
      if (state.cbColor === "lobe") {
        h.push('<ul class="nx-legend">' + item(CBC.lobe.anterior, "前葉（原裂之前）", "anterior-lobe") + item(CBC.lobe.posterior, "後葉", "posterior-lobe") + item(CBC.lobe.fn, "小葉結節葉（後外側裂之後）", "flocculonodular-lobe") + "</ul>");
      } else {
        h.push('<ul class="nx-legend">' + item(CBC.zone.vermis, "蚓部 → 頂核：軀幹、姿勢", "vermis") + item(CBC.zone.intermediate, "中間區 → 中間核：進行中的肢體動作", "intermediate-zone") +
          item(CBC.zone.lateral, "外側區 → 齒狀核：規劃精細動作", "lateral-zone") + item(CBC.zone.fn, "小葉結節葉 → 前庭核：平衡、眼球", "flocculonodular-lobe") + "</ul>");
      }
      h.push('<p class="nx-note">小腦是半透明的，裡面的橢圓就是小腦核（顏色和對應的皮質區相同）。每一側小腦管同側身體。</p>');
      h.push("<h4>三對小腦腳</h4><ul class=\"nx-deficits\"><li>下小腦腳（延髓）：脊髓小腦（後、楔）、橄欖小腦、前庭；頂核與前庭小腦的輸出</li><li>中小腦腳（橋腦）：只有對側橋腦核來的傳入</li><li>上小腦腳（中腦）：小腦核的輸出（在下丘高度交叉）、前脊髓小腦徑</li></ul>");
      return h.join("");
    }
    function lesionPanel() {
      var l = LE.lesions[state.lesion];
      var h = ["<h4>選擇病灶</h4>"];
      h.push('<select data-act="lesion">' + lesionIds.map(function (id) {
        return '<option value="' + id + '"' + (id === state.lesion ? " selected" : "") + ">" + esc(LE.lesions[id].zh) + "</option>";
      }).join("") + "</select>");
      var z = currentZones()[0];
      if (l.adjustable) {
        h.push('<div class="nx-row"><span>節段</span><select data-act="lseg">' + segOptions(l.adjustable.levels[1], l.adjustable.levels[0], z.segs[0]) + "</select></div>");
        if (l.adjustable.side) h.push('<div class="nx-row"><span>病灶側</span><button type="button" class="nx-chip" data-lside="R" aria-pressed="' + (z.side === "R") + '">右</button><button type="button" class="nx-chip" data-lside="L" aria-pressed="' + (z.side === "L") + '">左</button></div>');
      }
      var d = deficits(model, currentZones());
      h.push("<h4>推導出的症狀</h4><ul class=\"nx-deficits\">" + d.filter(function (x) { return !x.minor; }).map(function (x) { return "<li>" + esc(x.text) + "</li>"; }).join("") + "</ul>");
      if (isLim && model.LM) {
        var lk = limbicKnock(model, currentZones());
        h.push('<div class="nx-bg-card">' + limbicSVG(model.LM, { knock: lk, label: l.zh + " 的迴路" }) + limbicLegend() + "</div>");
      }
      if (isBg && BG) {
        var kn = bgKnock(model, currentZones());
        if (kn.length) h.push('<div class="nx-bg-card">' + circuitSVG(BG, { knock: kn, label: l.zh + " 的迴路" }) + "</div><p class=\"nx-note\">" + esc(bgCompare(BG, kn).motorZh) + "</p>");
      }
      h.push('<p><a href="/resources/neuro/lesion/' + state.lesion + '.html">' + esc(l.zh) + " 的說明 →</a></p>");
      return h.join("");
    }

    var BRAIN_JUMPS = model.data.levels.brainLevels.filter(function (b) { return isBg || isLim ? b.y >= 70 && b.y < 150 : isDi ? b.y >= 80 && b.y < 150 : b.y < 80; });
    function slicePanel() {
      var h = ["<h4>切面</h4>"];
      h.push('<div class="nx-row"><span class="nx-lvlname" data-slot="lvl">' + esc(sliceName()) + "</span></div>");
      if (isStem) {
        h.push('<input type="range" data-act="bslice" min="' + (isBg || isLim ? 60 : isDi ? 76 : 0) + '" max="' + (isFore ? 108 : 80) + '" step="1" value="' + Math.round(state.slice.kind === "brain" ? state.slice.y : 0) + '" aria-label="腦幹高度">');
      } else {
        h.push('<input type="range" data-act="slice" min="0" max="' + (model.N - 1) + '" step="1" value="' + (state.slice.kind === "seg" ? Math.floor(state.slice.pos) : 0) + '" aria-label="脊髓節段">');
      }
      h.push('<div class="nx-row">' + BRAIN_JUMPS.map(function (bl) {
        return '<button type="button" class="nx-chip" data-by="' + bl.y + '" aria-pressed="' + (state.slice.kind === "brain" && state.slice.y === bl.y) + '" title="' + esc(bl.name) + '">' + esc(bl.name.replace(/（.*）/, "")) + "</button>";
      }).join("") + "</div>");
      return h.join("");
    }
    var inset = document.createElement("div");
    inset.className = "nx-inset" + (isCb ? " nx-inset-cb" : "");
    inset.innerHTML = '<p class="nx-inset-head"><b data-slot="iname"></b> <a data-slot="lvlink" href="#">這一層 →</a></p><div class="nx-sec2d" data-slot="sec"></div><p class="nx-inset-foot">' +
      (isCb ? "上＝前葉、下＝小葉結節葉・右邊 = 病人右側" : "後方在上・左邊 = 病人右側") + "</p>";
    if (isCb && mode === "tract") inset.hidden = true;   // 路徑頁看的是神經元鏈
    stage.parentNode.appendChild(inset);
    function updateSection() {
      var sec = $("[data-slot=sec]", inset), nm = $("[data-slot=lvl]", panel), ln = $("[data-slot=lvlink]", inset);
      sec.innerHTML = sectionHTML();
      $("[data-slot=iname]", inset).textContent = sliceName();
      if (nm) nm.textContent = sliceName();
      if (isCb) {
        $("[data-slot=iname]", inset).textContent = state.tab === "lesion" && mode === "region" ? "攤開圖・紅＝病灶" : "小腦攤開圖";
        ln.hidden = true;
        return;
      }
      var id = state.slice.kind === "seg" ? model.segs[Math.min(model.N - 1, Math.floor(state.slice.pos))].id : nearestLevel(state.slice.y).id;
      ln.href = "/resources/neuro/level/" + id + ".html";
    }
    function nearestLevel(y) {
      return model.data.levels.brainLevels.filter(function (b) { return b.y < 150; }).reduce(function (a, b) { return Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a; });
    }

    inset.addEventListener("click", function (ev) {
      var t = ev.target.closest && ev.target.closest("[data-tract], [data-structure], [data-nerve]");
      if (!t) return;
      if (t.dataset.tract) location.href = "/resources/neuro/tract/" + t.dataset.tract + ".html";
      else if (t.dataset.structure) location.href = "/resources/neuro/structure/" + t.dataset.structure + ".html";
      else if (t.dataset.nerve) location.href = "/resources/neuro/nerve/" + t.dataset.nerve + ".html";
    });
    function setNerve(id) {
      state.nerve = id;
      applyVisibility();
      if (id) {
        var lv = model.data.levels.brainLevels.filter(function (b) { return b.id === NV[id].exitLevel; })[0];
        if (lv) { state.slice = { kind: "brain", pos: 0, y: lv.y }; buildSlice(); }
        fitNerve();
      }
      renderPanel();
    }
    panel.addEventListener("click", function (ev) {
      var t = ev.target.closest("button");
      if (!t) return;
      if (t.dataset.tab) { state.tab = t.dataset.tab; buildLesion(); if (state.tab === "lesion") jumpToLesion(); applyBgActivity(); renderPanel(); }
      else if (t.dataset.focus) {
        var id = t.dataset.focus;
        if (state.focus === id) state.focus = null; else setFocus(id);
        applyVisibility(); buildChain(); renderPanel();
        if (state.focus && !isBg && !isLim) fitChain();
      }
      else if (t.dataset.nerve) setNerve(state.nerve === t.dataset.nerve ? null : t.dataset.nerve);
      else if (t.dataset.cond) { state.cond = t.dataset.cond; applyBgActivity(); renderPanel(); }
      else if (t.dataset.nucleus) { state.nucleus = state.nucleus === t.dataset.nucleus ? null : t.dataset.nucleus; buildLinks(); renderPanel(); }
      else if (t.dataset.act === "unnucleus") { state.nucleus = null; buildLinks(); renderPanel(); }
      else if (t.dataset.cbcolor) { state.cbColor = t.dataset.cbcolor; var old = groups.brain.getObjectByName("cerebellum"); if (old) { groups.brain.remove(old); old.geometry.dispose(); old.material.dispose(); } groups.brain.add(cerebellumMesh(model.data.levels.brain.cerebellum)); renderPanel(); }
      else if (t.dataset.variant) { state.variant = t.dataset.variant; buildChain(); renderPanel(); }
      else if (t.dataset.side) { state.side = t.dataset.side; buildChain(); renderPanel(); }
      else if (t.dataset.lside) { state.lesionSide = t.dataset.lside; buildLesion(); renderPanel(); }
      else if (t.dataset.by) { state.slice = { kind: "brain", pos: 0, y: parseFloat(t.dataset.by) }; buildSlice(); renderPanel(); setView("stem"); }
      else if (t.dataset.act === "play") { state.playing = !state.playing; renderPanel(); }
      else if (t.dataset.act === "unfocus") { state.focus = null; applyVisibility(); buildChain(); renderPanel(); }
      else if (t.dataset.act === "unnerve") setNerve(null);
      else if (t.dataset.act === "fit") fitChain();
      else if (t.dataset.act === "fitnerve") fitNerve();
    });
    panel.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t.dataset.vis) { state.visible[t.dataset.vis] = t.checked; applyVisibility(); }
      else if (t.dataset.opt === "real") {
        var keepSlice = state.slice;
        state.length = t.checked ? "real" : "equal";
        rebuild(); state.slice = keepSlice; buildSlice(); setView("slice"); updateSection();
      }
      else if (t.dataset.opt) { state[t.dataset.opt] = t.checked; applyVisibility(); }
      else if (t.dataset.act === "inseg") { state.inSeg = t.value; buildChain(); updateSection(); }
      else if (t.dataset.act === "lesion") { state.lesion = t.value; state.lesionSeg = null; state.lesionSide = null; buildLesion(); jumpToLesion(); applyBgActivity(); renderPanel(); }
      else if (t.dataset.act === "lseg") { state.lesionSeg = t.value; buildLesion(); jumpToLesion(); renderPanel(); }
    });
    panel.addEventListener("input", function (ev) {
      var t = ev.target;
      if (t.dataset.act === "slice") {
        var oldY = sliceY();
        state.slice = { kind: "seg", pos: parseInt(t.value, 10) + 0.5, y: 0 };
        buildSlice();
        var dy = sliceY() - oldY;
        controls.target.y += dy; camera.position.y += dy; controls.update();
        updateSection();
      } else if (t.dataset.act === "bslice") {
        var oy = sliceY();
        state.slice = { kind: "brain", pos: 0, y: parseInt(t.value, 10) };
        buildSlice();
        var d2 = sliceY() - oy;
        controls.target.y += d2; camera.position.y += d2; controls.update();
        updateSection();
      }
    });
    function jumpToLesion() {
      if (isCb) return;
      var z = currentZones()[0];
      if (z.brain && z.brain.y[0] > (isFore ? 108 : 80)) return;
      var oldY = sliceY();
      state.slice = z.brain ? { kind: "brain", pos: 0, y: Math.round((z.brain.y[0] + z.brain.y[1]) / 2) } : { kind: "seg", pos: model.segIdx[z.segs[0]] + 0.5, y: 0 };
      buildSlice();
      var dy = sliceY() - oldY;
      controls.target.y += dy; camera.position.y += dy; controls.update();
    }

    /* ---------- 視角按鈕 ---------- */
    var views = document.createElement("div");
    views.className = "nx-views";
    views.innerHTML = (isCb ? [["cb", "小腦"], ["stem", "腦幹"], ["brain", "大腦"], ["all", "全程"]] : isBg ? [["bg", "基底核"], ["bgfront", "正面"], ["ditop", "由上往下"], ["slice", "切面處"]] : isLim ? [["lim", "邊緣系統"], ["limtop", "由上往下"], ["brain", "大腦"], ["slice", "切面處"]] : isAud ? [["aud", "聽覺路徑"], ["ear", "內耳"], ["stem", "腦幹"], ["slice", "切面處"]] : isDi ? [["di", "間腦"], ["ditop", "由上往下"], ["brain", "大腦"], ["slice", "切面處"]] : [["all", "全程"], ["brain", "大腦"], ["stem", "腦幹"], ["slice", "切面處"], ["top", "由上往下"]]).map(function (v) {
      return '<button type="button" data-view="' + v[0] + '">' + v[1] + "</button>";
    }).join("");
    stage.parentNode.appendChild(views);
    views.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (b) setView(b.dataset.view);
    });
    var leg = document.createElement("ul");
    leg.className = "nx-legend3d";
    function legendHTML() {
      var li = function (c, t) { return '<li><i style="background:' + (typeof c === "number" ? hexOf(c) : c) + '"></i>' + t + "</li>"; };
      if (isLim) return li(C_HIP(), "海馬結構") + ["amygdala", "entorhinal", "septal-area", "cingulate-gyrus", "nucleus-basalis"].map(function (id) { return li(ST[id].color, ST[id].zh.replace(/（.*）/, "")); }).join("") + li(TR.fornix.color, "穹窿") + li(TR["amygdalofugal"].color, "杏仁核傳出") + li(TR.mammillothalamic.color, "乳頭視丘徑");
      if (isBg && BG) return ["striatum", "gpe", "gpi", "stn", "snc", "snr", "thal"].map(function (g) { return li(BG.groups[g].color, BG.groups[g].zh.replace(/（.*）/, "")); }).join("") +
        li(TR["bg-direct"].color, "直接路徑") + li(TR["bg-indirect"].color, "間接路徑") + li(TR.nigrostriatal.color, "黑質紋狀體");
      return isDi && model.DI
        ? ["anterior", "medial", "intralaminar", "lateral", "ventral", "hypothalamus"].map(function (g) { return li(model.DI.groups[g].color, model.DI.groups[g].zh); }).join("") + li(TH.linkIn[0], "傳入") + li(TH.linkOut[0], "傳出")
        : isAud && model.aud
        ? li(model.aud.A.colors.high, "高頻") + li(model.aud.A.colors.low, "低頻") + li(model.aud.A.colors.vestibular, "前庭（半規管、耳石器）") + li(TH.slice[0], "切面")
        : li(TH.gray[0], "灰質") + li(TH.pre, "中央前回") + li(TH.post, "中央後回") + li(TH.slice[0], "切面");
    }
    leg.innerHTML = legendHTML();
    stage.parentNode.appendChild(leg);

    /* ---------- 淺色／深色 ---------- */
    var themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "nx-theme";
    function themeLabel() {
      themeBtn.textContent = themeName === "dark" ? "☀︎ 淺色" : "☾ 深色";
      themeBtn.setAttribute("aria-label", themeName === "dark" ? "切換成淺色背景" : "切換成深色背景");
    }
    themeLabel();
    stage.parentNode.appendChild(themeBtn);
    themeBtn.addEventListener("click", function () {
      themeName = themeName === "dark" ? "light" : "dark";
      TH = THEMES[themeName];
      root.dataset.theme = themeName;
      try { localStorage.setItem("nx-theme", themeName); } catch (e) { /* 無痕模式：只在這一頁有效 */ }
      hemiLight.color.set(TH.hemiLight[0]);
      hemiLight.groundColor.set(TH.hemiLight[1]);
      hemiLight.intensity = TH.hemiLight[2];
      dir.intensity = TH.dir;
      dir2.color.set(TH.dir2[0]);
      dir2.intensity = TH.dir2[1];
      rebuild();
      leg.innerHTML = legendHTML();
      renderPanel();
      themeLabel();
    });

    /* ---------- 滑鼠：路徑名稱 ---------- */
    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), lastMove = 0, downAt = null;
    renderer.domElement.addEventListener("pointermove", function (ev) {
      var now = performance.now();
      if (now - lastMove < 40) return;
      lastMove = now;
      var r = renderer.domElement.getBoundingClientRect();
      mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(pickables(), false);
      if (hits.length) {
        var u = hits[0].object.userData;
        tip.hidden = false;
        if (u.tract) tip.innerHTML = '<b style="color:' + TR[u.tract].color + '">' + esc(u.bundle.zh) + "</b>" + (mode === "region" ? "<br>點一下看神經元鏈" : "");
        else if (u.nerve) tip.innerHTML = '<b style="color:#f0b050">' + NV[u.nerve].num + " " + esc(NV[u.nerve].zh) + "</b>" + (mode === "region" ? "<br>點一下看它的核與走向" : "");
        else if (u.structure) tip.innerHTML = "<b>" + esc(ST[u.structure].zh) + "</b>" + (mode === "region" ? "<br>點一下看說明" : "");
        else if (u.nucleus) {
          var st = ST[u.nucleus], c = st.col && COLS[st.col];
          tip.innerHTML = '<b style="color:' + (c ? c.color : "#ddd") + '">' + esc(st.zh) + "</b>" + (c ? "<br>" + st.col + "・" + esc(c.zh) : "");
        }
        tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - 160) + "px";
        tip.style.top = (ev.clientY - r.top + 12) + "px";
        renderer.domElement.style.cursor = "pointer";
      } else {
        tip.hidden = true;
        renderer.domElement.style.cursor = "";
      }
    });
    renderer.domElement.addEventListener("pointerleave", function () { tip.hidden = true; });
    renderer.domElement.addEventListener("pointerdown", function (ev) { downAt = [ev.clientX, ev.clientY]; });
    renderer.domElement.addEventListener("pointerup", function (ev) {
      if (!downAt || Math.abs(ev.clientX - downAt[0]) + Math.abs(ev.clientY - downAt[1]) > 5 || mode !== "region") return;
      var r = renderer.domElement.getBoundingClientRect();
      mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(pickables(), false);
      if (!hits.length) return;
      var u = hits[0].object.userData;
      if (u.tract) {
        setFocus(u.tract); state.tab = "tracts";
        applyVisibility(); buildChain(); buildLesion(); renderPanel();
      } else if (u.nerve && isStem) { state.tab = "nerves"; buildLesion(); setNerve(u.nerve); }
      else if (u.nucleus && isDi && ST[u.nucleus].ell) { state.nucleus = u.nucleus; state.tab = "nuclei"; buildLinks(); buildLesion(); renderPanel(); }
      else if (u.nucleus) location.href = "/resources/neuro/structure/" + u.nucleus + ".html";
      else if (u.structure) location.href = "/resources/neuro/structure/" + u.structure + ".html";
    });
    function pickables() {
      var out = tractMeshes.filter(function (m) { return m.parent.visible; });
      if (groups.ear && groups.ear.visible) out = out.concat(earMeshes);
      if (groups.di && groups.di.visible) out = out.concat(diMeshes.filter(function (m) { return m.material.opacity > 0.3 || !state.nucleus; }));
      if (groups.nuclei && groups.nuclei.visible) {
        var shown = function (m) { for (var o = m; o; o = o.parent) if (!o.visible) return false; return m.material.opacity > 0.5; };
        out = out.concat(nerveMeshes.filter(shown), nucMeshes.filter(shown));
      }
      return out;
    }

    /* ---------- 迴圈 ---------- */
    function resize() {
      var w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
    var visible = true, last = performance.now();
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function loop(now) {
      if (life.dead) return;
      life.raf = requestAnimationFrame(loop);
      if (!visible) return;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      controls.update();
      if (pulse.spark) {
        if (state.playing && !reduce) {
          var speed = state.length === "real" ? 140 : 90;   // mm/s
          pulse.t = (pulse.t + dt * speed) % (pulse.total + 60);
        }
        var d = Math.min(pulse.t, pulse.total - 0.01);
        var sg = pulse.segs.filter(function (s) { return d >= s.start && d <= s.start + s.len; })[0] || pulse.segs[pulse.segs.length - 1];
        if (sg) pulse.spark.position.copy(sg.curve.getPointAt(Math.min(1, Math.max(0, (d - sg.start) / sg.len))));
        pulse.spark.visible = pulse.t <= pulse.total;
      }
      renderer.render(scene, camera);
      updateLabels();
    }
    if (window.ResizeObserver) { var ro = new ResizeObserver(resize); ro.observe(stage); life.cleanup.push(function () { ro.disconnect(); }); }
    window.addEventListener("resize", resize);
    life.cleanup.push(function () { window.removeEventListener("resize", resize); });
    if (window.IntersectionObserver) { var io = new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }); io.observe(root); life.cleanup.push(function () { io.disconnect(); }); }

    rebuild();
    resize();
    renderPanel();
    if (params.get("view")) setView(params.get("view"));
    else if (mode === "nerve" || (state.nerve && state.tab === "nerves")) fitNerve();
    else if (mode === "tract") fitChain();
    else if (isCb && mode === "region") { if (state.tab === "lesion") { buildLesion(); renderPanel(); } setView("cb"); }
    else if (isLim && mode === "region") { if (state.tab === "lesion") { buildLesion(); jumpToLesion(); renderPanel(); } setView("lim"); }
    else if (isBg && mode === "region") { if (state.tab === "lesion") { buildLesion(); jumpToLesion(); applyBgActivity(); renderPanel(); } setView("bg"); }
    else if (isDi && mode === "region") { if (state.tab === "lesion") { buildLesion(); jumpToLesion(); renderPanel(); } setView("di"); }
    else if (isAud && mode === "region") { if (state.tab === "lesion") { buildLesion(); jumpToLesion(); renderPanel(); } setView("aud"); }
    else if (state.tab === "lesion") { buildLesion(); jumpToLesion(); setView("slice"); renderPanel(); }
    else if (state.focus) fitChain();
    else if (state.slice.kind === "brain") setView("stem");
    else setView("slice");
    life.raf = requestAnimationFrame(loop);
  }
}

// 頁面上本來就有的 .nx-viewer（路徑頁、腦神經頁）：模組其他部分都定義好之後才掛上
var auto = document.querySelector(".nx-viewer:not([data-engine=visual]):not([data-hub])");
if (auto) mount(auto);
