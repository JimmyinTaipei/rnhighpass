/**
 * 3D 互動心臟：看電流怎麼在心臟裡走，並和下方的心電圖同步。
 *
 * 心臟是真實 CT 模型（Rodero 等人 CEMRG 四腔心，CC BY 4.0；見 heart-real.js），座標系：
 *   +x = 病人左側、+y = 頭側、+z 前方（面向讀者），1 單位 = 5 cm
 * 心肌每個頂點都事先算好「活化延遲」（沿心肌走最短路徑），shader 依目前時間上色：
 *   黃白色 = 去極化波前、紅色 = 已去極化、藍色 = 正在再極化。
 * 傳導系統（SA node → AV node → His → 束支 → Purkinje）是一段段的管子，
 * 電流經過時從頭亮到尾，被阻斷的地方就停住。
 *
 * 節律與時間點全部來自 rhythms.js，和節律條是同一份資料。
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { getRhythm, sample, segmentAt, nextBoundary, VENT_MODE } from "./rhythms.js";
import { loadRealHeart } from "./heart-real.js";

var V3 = function (x, y, z) { return new THREE.Vector3(x, y, z); };

/* ============================== 節律說明 ============================== */

var INFO = {
  nsr: { name: "正常竇性節律", hr: "75 bpm", link: "basics.html#waves",
    desc: "SA node 規律放電，每個 P 波後面都跟著一個窄的 QRS。" },
  "sinus-brady": { name: "竇性心搏過慢", hr: "50 bpm", link: "rhythms.html#sinus-brady",
    desc: "一切都正常，只是 SA node 放電變慢（< 60 bpm）。" },
  "sinus-tachy": { name: "竇性心搏過速", hr: "120 bpm", link: "rhythms.html#sinus-tachy",
    desc: "SA node 放電變快（> 100 bpm），波形本身正常。" },
  avb1: { name: "一度房室傳導阻滯", hr: "67 bpm", link: "blocks.html#avb1",
    desc: "每個 P 都有下傳，只是在 AV node 走得特別慢 → PR > 5 小格。" },
  mobitz1: { name: "二度 AV block Mobitz I（Wenckebach）", hr: "約 50 bpm", link: "blocks.html#mobitz1",
    desc: "AV node 一拍比一拍累，PR 越拉越長，最後一個 P 傳不下去，然後重來。" },
  mobitz2: { name: "二度 AV block Mobitz II", hr: "約 45 bpm", link: "blocks.html#mobitz2",
    desc: "PR 固定不變，但 His 以下的傳導偶爾突然擋住一拍。比 Mobitz I 危險。" },
  avb3: { name: "三度（完全）房室傳導阻滯", hr: "心房 80／心室 40", link: "blocks.html#avb3",
    desc: "心房的電流完全傳不到心室，心室由交界區的逸搏點自己跳，P 和 QRS 各跳各的。" },
  pac: { name: "心房早期收縮 PAC", hr: "75 bpm", link: "rhythms.html#pac",
    desc: "心房裡的異位點比 SA node 早放電：提早出現、形狀不同的 P 波，QRS 正常。" },
  pvc: { name: "心室早期收縮 PVC", hr: "75 bpm", link: "rhythms.html#pvc",
    desc: "心室的異位點自己放電，不走傳導系統，在心肌間慢慢傳 → 提早出現的寬 QRS，前面沒有 P。" },
  rbbb: { name: "右束支傳導阻滯 RBBB", hr: "67 bpm", link: "blocks.html#rbbb",
    desc: "右束支斷了，右心室要等左邊的電流穿過中膈慢慢傳過來 → QRS 變寬、V1 出現 RSR′。" },
  lbbb: { name: "左束支傳導阻滯 LBBB", hr: "67 bpm", link: "blocks.html#lbbb",
    desc: "左束支斷了，左心室要等右邊的電流慢慢傳過來 → QRS 很寬、V6 出現寬而有缺口的 R 波。" },
  wpw: { name: "WPW 症候群", hr: "67 bpm", link: "blocks.html#wpw",
    desc: "心房和心室之間多了一條 Kent bundle，電流繞過 AV node 提早進入心室 → PR 短、delta wave。" },
  junctional: { name: "交界區節律", hr: "50 bpm", link: "rhythms.html#junctional-rhythm",
    desc: "SA node 失靈，由 AV 交界區接手（40–60 bpm），心房被往上逆傳 → 倒 P 波或看不到 P。" },
  afl: { name: "心房撲動 Atrial flutter（4:1）", hr: "心房 300／心室 75", link: "rhythms.html#afl",
    desc: "電流在右心房繞著三尖瓣環打轉，每圈 0.2 秒 → 鋸齒狀 F 波；AV node 每 4 圈放行 1 次。" },
  af: { name: "心房顫動 Atrial fibrillation", hr: "約 80 bpm，不規則", link: "rhythms.html#af",
    desc: "心房到處都在亂放電，沒有有效收縮、看不到 P 波；AV node 不規則地放行 → RR 完全不規則。" },
  vt: { name: "心室頻脈 VT", hr: "170 bpm", link: "rhythms.html#vt",
    desc: "心室的異位點快速反覆放電 → 規則、又寬又快的 QRS。可能無脈搏，需要立即處理。" },
  vf: { name: "心室顫動 VF", hr: "無法計算", link: "rhythms.html#vf",
    desc: "心室各處亂顫、沒有有效收縮，心電圖只剩雜亂的波。需要立刻電擊（AED）。" }
};

export var RHYTHM_ORDER = [
  ["正常", ["nsr", "sinus-brady", "sinus-tachy"]],
  ["傳導阻滯", ["avb1", "mobitz1", "mobitz2", "avb3", "rbbb", "lbbb", "wpw"]],
  ["心律不整", ["pac", "pvc", "junctional", "afl", "af", "vt", "vf"]]
];

/* ============================== 解剖位置 ============================== */

// 心臟幾何、傳導路徑與各模式的活化延遲來自真實 CT 模型（heart-real.js）。
// 這裡只放 three 物件建好前的預設值；模型載入後由 applyModel() 填入。
var P = { CENTER: V3(-0.3, 0.1, -0.2) };

/* ============================== Shader ============================== */

var NOISE = [
  "float hash(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}",
  "float noise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);",
  "return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),",
  "mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}"
].join("\n");

var MYO_VERT = [
  "attribute float aDelay;",
  "varying float vDelay; varying vec3 vN; varying vec3 vView; varying vec3 vPos;",
  "void main(){",
  "  vDelay=aDelay; vPos=position;",
  "  vec4 mv=modelViewMatrix*vec4(position,1.0);",
  "  vN=normalize(normalMatrix*normal); vView=normalize(-mv.xyz);",
  "  gl_Position=projectionMatrix*mv;",
  "}"
].join("\n");

var MYO_FRAG = [
  "uniform float uDt, uRepStart, uMaxD, uFib, uTime, uOpacity, uBack, uPeriodic;",
  "uniform vec3 uRest;",
  "varying float vDelay; varying vec3 vN; varying vec3 vView; varying vec3 vPos;",
  NOISE,
  "void main(){",
  "  vec3 cFront=vec3(1.0,0.93,0.55), cDep=vec3(0.95,0.32,0.22), cRep=vec3(0.35,0.72,1.0);",
  "  vec3 col=uRest; float a=0.16;",
  "  if(uFib>0.5){",
  "    float n=noise(vPos*4.0+vec3(0.0,uTime*0.0021,uTime*0.0017))+0.5*noise(vPos*9.0-vec3(uTime*0.003));",
  "    float m=smoothstep(0.62,0.9,fract(n*1.7+uTime*0.0022));",
  "    col=mix(uRest,mix(cDep,cFront,m),m); a=mix(0.16,0.75,m);",
  "  } else {",
  "    float x=uDt-vDelay;",
  "    if(uPeriodic>0.0){ x=mod(x,uPeriodic); }",
  "    float repT=uPeriodic>0.0 ? 110.0 : uRepStart+(uMaxD-vDelay)*0.8;",
  "    float xr=uPeriodic>0.0 ? x : uDt;",
  "    if(x>=0.0){",
  "      float front=1.0-smoothstep(0.0,24.0,x);",
  "      if(xr<repT){ col=mix(cDep,cFront,front); a=mix(0.55,0.95,front); }",
  "      else if(xr<repT+80.0){ float k=(xr-repT)/80.0; col=mix(cRep,uRest,k); a=mix(0.55,0.16,k); }",
  "    }",
  "  }",
  "  float ndl=max(dot(vN,normalize(vec3(0.3,0.7,0.8))),0.0);",
  "  float rim=pow(1.0-abs(dot(vN,vView)),2.0);",
  "  col=col*(0.6+0.55*ndl)+rim*0.18;",
  "  a=(a+rim*0.2)*uOpacity*(uBack>0.5?0.45:1.0);",
  "  gl_FragColor=vec4(col,a);",
  "}"
].join("\n");

var TUBE_VERT = [
  "varying vec2 vUv;",
  "void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }"
].join("\n");

var TUBE_FRAG = [
  "uniform float uHead, uGlow, uRing;",
  "uniform vec3 uBase;",
  "varying vec2 vUv;",
  "void main(){",
  "  float s=vUv.x; float passed; float d;",
  "  if(uRing>0.5){ d=fract(uHead-s); passed=1.0-smoothstep(0.0,0.55,d); }",
  "  else { d=uHead-s; passed=step(0.0,d); }",
  "  float head=exp(-abs(d)*28.0)*step(-0.02,d);",
  "  vec3 lit=vec3(1.0,0.86,0.35);",
  "  vec3 col=mix(uBase,lit,passed*uGlow)+vec3(1.0)*head*uGlow*0.9;",
  "  gl_FragColor=vec4(col,1.0);",
  "}"
].join("\n");

/* ============================== 主程式 ============================== */

export function createHeartViewer(root) {
  var $ = function (sel) { return root.querySelector(sel); };
  var stage = $(".hv-stage"), ecgCanvas = $(".hv-ecg canvas");
  var state = {
    rhythm: null, now: 0, speed: 0.25, playing: true, lead: "II",
    showMyo: true, showCond: true, showLabels: true, showAxis: false, showCoro: false
  };

  /* ---------- three.js 場景 ---------- */
  var three = null;
  try { three = initThree(); } catch (e) { console.warn("WebGL 無法使用，只顯示心電圖", e); root.classList.add("hv-no-webgl"); }

  function initThree() {
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    stage.appendChild(renderer.domElement);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0.9, 0.4, 7.2);
    var controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(P.CENTER);
    controls.enableDamping = true;
    controls.minDistance = 2.2;
    controls.maxDistance = 12;
    controls.enablePan = false;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    var dl = new THREE.DirectionalLight(0xffffff, 1.2);
    dl.position.set(2, 3, 4);
    scene.add(dl);

    var t = { renderer: renderer, scene: scene, camera: camera, controls: controls, ready: false,
      chambers: {}, cond: {}, arrows: {}, coro: [] };
    loadRealHeart().then(function (model) {
      applyModel(t, model);
      resize();
      frame(true);
    }).catch(function (e) {
      console.warn("3D 心臟模型載入失敗，只顯示心電圖", e);
      root.classList.add("hv-no-webgl");
    });
    return t;
  }

  /** 把真實模型放進場景：心腔、大血管、瓣膜、冠狀動脈、傳導系統、標籤位置。 */
  function applyModel(t, m) {
    var scene = t.scene, lm = m.landmarks, paths = m.paths;
    var box = new THREE.Box3();
    Object.keys(m.geos).forEach(function (k) { m.geos[k].computeBoundingBox(); box.union(m.geos[k].boundingBox); });
    P.CENTER = box.getCenter(new THREE.Vector3());
    t.controls.target.copy(P.CENTER);

    var REST = { lv: [0.62, 0.33, 0.38], rv: [0.66, 0.4, 0.45], ra: [0.55, 0.42, 0.55], la: [0.6, 0.45, 0.6] };
    Object.keys(m.geos).forEach(function (k) {
      var geo = m.geos[k];
      geo.setAttribute("aDelay", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
      var mk = function (back) {
        var mat = new THREE.ShaderMaterial({
          vertexShader: MYO_VERT, fragmentShader: MYO_FRAG, transparent: true, depthWrite: false,
          side: back ? THREE.BackSide : THREE.FrontSide,
          uniforms: {
            uDt: { value: 1e6 }, uRepStart: { value: 200 }, uMaxD: { value: 90 }, uFib: { value: 0 }, uTime: { value: 0 },
            uOpacity: { value: 1 }, uBack: { value: back ? 1 : 0 }, uPeriodic: { value: 0 },
            uRest: { value: new THREE.Color().fromArray(REST[k]) }
          }
        });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = back ? 1 : 3;
        scene.add(mesh);
        return mesh;
      };
      t.chambers[k] = { geo: geo, back: mk(true), front: mk(false), pattern: null };
    });
    t.patterns = m.patterns;

    // 大血管與瓣膜（只是方位參考，不參與電流）
    var vesselMat = new THREE.MeshStandardMaterial({ color: 0x8aa0c8, transparent: true, opacity: 0.35, depthWrite: false, roughness: 0.6 });
    var valveMat = new THREE.MeshStandardMaterial({ color: 0xece4cc, transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.7, side: THREE.DoubleSide });
    m.vessels.forEach(function (g) { var x = new THREE.Mesh(g, vesselMat); x.renderOrder = 2; scene.add(x); });
    m.valves.forEach(function (g) { var x = new THREE.Mesh(g, valveMat); x.renderOrder = 2; scene.add(x); });
    var coroMat = new THREE.MeshStandardMaterial({ color: 0xd9262c, roughness: 0.45 });
    m.coronary.forEach(function (g) { var x = new THREE.Mesh(g, coroMat); x.renderOrder = 4; scene.add(x); t.coro.push(x); });

    // 傳導系統：希氏束路徑在穿入點分成房室結（avn）與希氏束（his）兩段
    var hisPath = paths.His_bundle, cut = 0, bd = Infinity;
    hisPath.forEach(function (p, i) { var d = p.distanceTo(lm.His); if (d < bd) { bd = d; cut = i; } });
    var C = {
      int1: paths.Internodal_ant, int2: paths.Internodal_mid, int3: paths.Internodal_post, bach: paths.Bachmann,
      avn: hisPath.slice(0, Math.max(2, cut + 1)), his: hisPath.slice(Math.max(0, cut - 1)),
      rbb: paths.RBB, laf: paths.LAF, lpf: paths.LPF, kent: paths.Kent, ring: paths.FlutterRing
    };
    Object.keys(C).forEach(function (k) {
      var curve = new THREE.CatmullRomCurve3(C[k], k === "ring");
      var r = k === "avn" || k === "his" ? 0.045 : k === "kent" ? 0.04 : 0.03;
      var mat = new THREE.ShaderMaterial({
        vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG,
        uniforms: { uHead: { value: 0 }, uGlow: { value: 0 }, uRing: { value: k === "ring" ? 1 : 0 }, uBase: { value: new THREE.Color(0.55, 0.5, 0.2) } }
      });
      var mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(40, C[k].length * 3), r, 10, k === "ring"), mat);
      mesh.renderOrder = 0;
      scene.add(mesh);
      var spark = new THREE.Mesh(new THREE.SphereGeometry(r * 2.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
      spark.renderOrder = 5;
      spark.visible = false;
      scene.add(spark);
      t.cond[k] = { mesh: mesh, curve: curve, spark: spark };
    });
    // SA / AV node 本身畫成小球
    var nodeMat = function () { return new THREE.MeshBasicMaterial({ color: 0xc8b24a }); };
    t.saBall = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 16), nodeMat());
    t.saBall.position.copy(lm.SA); scene.add(t.saBall);
    t.avBall = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 16), nodeMat());
    t.avBall.position.copy(lm.AVN); scene.add(t.avBall);
    t.pvcBall = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff7a59, transparent: true, depthTest: false }));
    t.pvcBall.position.copy(lm.PVC); t.pvcBall.renderOrder = 5; scene.add(t.pvcBall);

    // 導程方向箭頭
    var LEAD_DIR = { II: V3(0.5, -0.866, 0), V1: V3(-0.45, -0.1, 1), V6: V3(1, -0.15, -0.05) };
    Object.keys(LEAD_DIR).forEach(function (l) {
      var dir = LEAD_DIR[l].clone().normalize();
      var ar = new THREE.ArrowHelper(dir, P.CENTER.clone().addScaledVector(dir, -1.8), 3.6, 0x6fd0ff, 0.28, 0.16);
      ar.visible = false;
      scene.add(ar);
      t.arrows[l] = { arrow: ar, tip: P.CENTER.clone().addScaledVector(dir, 1.75) };
    });

    // 標籤位置：心腔標在各自的中心往外推一點，傳導系統標在路徑中段
    var chamberLabel = function (k, push) {
      var c = m.geos[k].boundingBox.getCenter(new THREE.Vector3());
      return c.add(c.clone().sub(P.CENTER).multiplyScalar(push));
    };
    var at = { SA: lm.SA, AVN: lm.AVN, His: t.cond.his.curve.getPointAt(0.5), PVC: lm.PVC,
      rbb: t.cond.rbb.curve.getPointAt(0.92), laf: t.cond.laf.curve.getPointAt(0.95), lpf: t.cond.lpf.curve.getPointAt(0.95),
      kent: t.cond.kent.curve.getPointAt(0.5),
      RA: chamberLabel("ra", 0.35), LA: chamberLabel("la", 0.35), RV: chamberLabel("rv", 0.6), LV: chamberLabel("lv", 0.6) };
    labelEls.forEach(function (l) { l.pos = at[l.key]; });
    t.ready = true;
  }

  /* ---------- 標籤 ---------- */
  var LABELS = [
    ["SA node", "SA", "cond"], ["AV node", "AVN", "cond"], ["His bundle", "His", "cond"],
    ["右束支", "rbb", "cond"], ["左前分支", "laf", "cond"], ["左後分支", "lpf", "cond"],
    ["右心房", "RA", "myo"], ["左心房", "LA", "myo"], ["右心室", "RV", "myo"], ["左心室", "LV", "myo"],
    ["Kent bundle", "kent", "kent"], ["異位點", "PVC", "pvc"]
  ];
  var labelLayer = $(".hv-labels");
  var labelEls = LABELS.map(function (l) {
    var el = document.createElement("span");
    el.className = "hv-label hv-label-" + l[2];
    el.textContent = l[0];
    el.hidden = true;
    labelLayer.appendChild(el);
    return { el: el, key: l[1], pos: null, kind: l[2] };
  });

  /* ---------- 時間軸：把節律換算成各部位的事件 ---------- */
  var events = null;

  function buildEvents(r) {
    var ev = { seg: {}, atria: [], vent: [] };
    var add = function (k, start, dur, max) { (ev.seg[k] = ev.seg[k] || []).push({ start: start, dur: dur, max: max == null ? 1 : max }); };
    r.beats.forEach(function (b) {
      var c = b.cond, q = b.qrs;
      if (b.p) {
        var mode = b.p.origin === "sa" ? "sa" : b.p.origin === "retro" ? "retro" : "ectopicA";
        ev.atria.push({ start: b.p.t, mode: mode, rep: b.p.dur + 70 });
        if (mode === "sa") { add("int1", b.p.t, 45); add("int2", b.p.t, 40); add("int3", b.p.t, 48); add("bach", b.p.t, 30); }
      }
      if (c.av) add("avn", c.av.t0, c.av.t1 - c.av.t0, c.block === "av" ? 0.55 : 1);
      if (c.block === "his") add("his", c.av.t1, 14, 0.45);
      if (c.kent) add("kent", c.kent.t0, c.kent.t1 - c.kent.t0);
      if (q) {
        var vm = VENT_MODE[q.morph];
        ev.vent.push({ start: q.t, mode: vm, rep: q.tPeak - 60 });
        if (c.his != null) {
          var h = c.his;
          add("his", h, 14);
          add("rbb", h + 12, 22, vm === "rbbb" ? 0.25 : 1);
          add("laf", h + 12, 16, vm === "lbbb" ? 0.3 : 1);
          add("lpf", h + 12, 18, vm === "lbbb" ? 0.3 : 1);
        }
      }
    });
    Object.keys(ev.seg).forEach(function (k) { ev.seg[k].sort(function (a, b) { return a.start - b.start; }); });
    return ev;
  }

  /** 在時間 local 時，最近一次開始的事件（考慮循環：上一輪的最後一個也算）。 */
  function latest(list, local, L) {
    if (!list || !list.length) return null;
    var hit = null;
    for (var i = 0; i < list.length; i++) if (list[i].start <= local) hit = list[i];
    if (!hit) { var last = list[list.length - 1]; hit = Object.assign({}, last, { start: last.start - L }); }
    return hit;
  }

  function setPattern(ch, name, arr) {
    if (ch.pattern === name) return;
    ch.geo.attributes.aDelay.array.set(arr);
    ch.geo.attributes.aDelay.needsUpdate = true;
    ch.pattern = name;
  }

  function setU(ch, key, val) {
    ch.front.material.uniforms[key].value = val;
    ch.back.material.uniforms[key].value = val;
  }

  function update3D() {
    if (!three || !three.ready) return;
    var r = state.rhythm, L = r.L, local = ((state.now % L) + L) % L;
    var ch = three.chambers, pat = three.patterns;

    // 心房
    ["ra", "la"].forEach(function (k) {
      var c = ch[k];
      setU(c, "uTime", state.now);
      setU(c, "uFib", r.atrial === "fib" ? 1 : 0);
      setU(c, "uPeriodic", 0);
      if (r.atrial === "flutter") {
        setPattern(c, "flutter", pat.atria.flutter[k]);
        setU(c, "uPeriodic", 200);
        setU(c, "uDt", local);
        return;
      }
      var e = latest(events.atria, local, L);
      if (!e) { setU(c, "uDt", 1e6); return; }
      var p = pat.atria[e.mode];
      setPattern(c, e.mode, p[k]);
      setU(c, "uDt", local - e.start);
      setU(c, "uRepStart", e.rep);
      setU(c, "uMaxD", p.max);
    });

    // 心室
    ["lv", "rv"].forEach(function (k) {
      var c = ch[k];
      setU(c, "uTime", state.now);
      setU(c, "uFib", r.ventricular === "vf" || r.ventricular === "tdp" ? 1 : 0);
      var e = latest(events.vent, local, L);
      if (!e) { setU(c, "uDt", 1e6); return; }
      var p = pat.vent[e.mode];
      setPattern(c, e.mode, p[k]);
      setU(c, "uDt", local - e.start);
      setU(c, "uRepStart", e.rep);
      setU(c, "uMaxD", p.max);
    });

    // 傳導系統
    Object.keys(three.cond).forEach(function (k) {
      var c = three.cond[k], u = c.mesh.material.uniforms;
      var visible = state.showCond && (k !== "kent" || r.id === "wpw") && (k !== "ring" || r.atrial === "flutter");
      c.mesh.visible = visible;
      c.spark.visible = false;
      if (!visible) return;
      if (k === "ring") {
        u.uHead.value = (local % 200) / 200;
        u.uGlow.value = 1;
        c.spark.visible = true;
        c.spark.position.copy(c.curve.getPointAt(u.uHead.value));
        return;
      }
      var e = latest(events.seg[k], local, L);
      if (!e) { u.uGlow.value = 0; return; }
      var prog = (local - e.start) / Math.max(1, e.dur);
      var head = Math.min(prog, e.max);
      var endT = e.start + e.dur * e.max;
      var glow = local < endT ? 1 : Math.max(0, 1 - (local - endT) / 220);
      u.uHead.value = Math.max(0, head);
      u.uGlow.value = prog >= 0 ? glow : 0;
      if (prog >= 0 && prog <= e.max) {
        c.spark.visible = true;
        c.spark.position.copy(c.curve.getPointAt(Math.min(1, Math.max(0, head))));
      }
    });
    three.pvcBall.visible = VENT_MODE_HAS_ECTOPIC(r);
    three.saBall.material.color.setHex(r.atrial === "normal" && r.beats.some(function (b) { return b.p && b.p.origin === "sa"; }) ? 0xe8cf55 : 0x6b6450);
    three.avBall.material.color.setHex(0xc8b24a);

    Object.keys(ch).forEach(function (k) {
      ch[k].front.visible = state.showMyo;
      ch[k].back.visible = state.showMyo;
    });
    Object.keys(three.arrows).forEach(function (l) { three.arrows[l].arrow.visible = state.showAxis && l === state.lead; });
    three.coro.forEach(function (m) { m.visible = state.showCoro; });
  }

  function VENT_MODE_HAS_ECTOPIC(r) {
    return r.beats.some(function (b) { return b.qrs && VENT_MODE[b.qrs.morph] === "ectopicV"; });
  }

  function updateLabels() {
    if (!three || !three.ready) return;
    var w = stage.clientWidth, h = stage.clientHeight, v = new THREE.Vector3();
    var r = state.rhythm;
    labelEls.forEach(function (l) {
      var show = state.showLabels &&
        (l.kind === "cond" ? state.showCond : l.kind === "myo" ? state.showMyo : l.kind === "kent" ? r.id === "wpw" : VENT_MODE_HAS_ECTOPIC(r));
      if (!show || !l.pos) { l.el.hidden = true; return; }
      v.copy(l.pos).project(three.camera);
      l.el.hidden = v.z > 1;
      l.el.style.transform = "translate(" + ((v.x * 0.5 + 0.5) * w).toFixed(1) + "px," + ((-v.y * 0.5 + 0.5) * h).toFixed(1) + "px)";
    });
    if (state.showAxis) {
      var a = three.arrows[state.lead];
      v.copy(a.tip).project(three.camera);
      axisLabel.hidden = false;
      axisLabel.textContent = "+ " + state.lead;
      axisLabel.style.transform = "translate(" + ((v.x * 0.5 + 0.5) * w).toFixed(1) + "px," + ((-v.y * 0.5 + 0.5) * h).toFixed(1) + "px)";
    } else axisLabel.hidden = true;
  }
  var axisLabel = document.createElement("span");
  axisLabel.className = "hv-label hv-label-axis";
  labelLayer.appendChild(axisLabel);

  /* ---------- 心電圖 ---------- */
  var ctx = ecgCanvas.getContext("2d");
  var WINDOW = 4000; // 一個畫面 4 秒（手機 2.5 秒）

  function drawECG() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = ecgCanvas.clientWidth, chh = ecgCanvas.clientHeight;
    if (ecgCanvas.width !== Math.round(cw * dpr) || ecgCanvas.height !== Math.round(chh * dpr)) {
      ecgCanvas.width = Math.round(cw * dpr); ecgCanvas.height = Math.round(chh * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, chh);
    WINDOW = cw < 520 ? 2500 : 4000;
    var pxPerMs = cw / WINDOW, mm = pxPerMs * 40; // 1 小格 = 40 ms
    // 標準增益 10 mm/mV 放不下時自動減半（監視器常見的做法），格子維持正方形
    var gain = mm * 10 * 1.35 > chh * 0.55 ? 0.5 : 1;
    var y0 = chh * 0.62, mv = mm * 10 * gain;
    // 方格紙
    ctx.lineWidth = 1;
    for (var x = 0, i = 0; x <= cw; x += mm, i++) {
      ctx.strokeStyle = i % 5 ? "rgba(236,120,120,0.16)" : "rgba(236,120,120,0.38)";
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, chh); ctx.stroke();
    }
    for (var yy = y0 % mm, j = Math.round((y0 - (y0 % mm)) / mm); yy <= chh; yy += mm, j--) {
      ctx.strokeStyle = j % 5 ? "rgba(236,120,120,0.16)" : "rgba(236,120,120,0.38)";
      ctx.beginPath(); ctx.moveTo(0, Math.round(yy) + 0.5); ctx.lineTo(cw, Math.round(yy) + 0.5); ctx.stroke();
    }
    var r = state.rhythm, now = state.now;
    var ws = Math.floor(now / WINDOW) * WINDOW;
    var cursorX = (now - ws) * pxPerMs;

    // 目前波段底色
    var seg = segmentAt(r, now);
    if (seg.span) {
      var base = now - (((now % r.L) + r.L) % r.L);
      var a = (seg.span[0] + base - ws) * pxPerMs, b = (seg.span[1] + base - ws) * pxPerMs;
      if (seg.span[0] > ((now % r.L) + r.L) % r.L) { a -= r.L * pxPerMs; b -= r.L * pxPerMs; }
      ctx.fillStyle = "rgba(255,214,102,0.22)";
      ctx.fillRect(Math.max(0, a), 0, Math.max(0, Math.min(b, cursorX) - Math.max(0, a)), chh);
    }

    var step = Math.max(2, 1.2 / pxPerMs);
    var trace = function (from, to, alpha) {
      ctx.beginPath();
      for (var t = from; t <= to; t += step) {
        var px = (t - ws) * pxPerMs;
        if (px < 0) continue;
        var py = y0 - sample(r, state.lead, t) * mv;
        if (t === from) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = "rgba(20,24,33," + alpha + ")";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    };
    // 前一輪還沒被蓋掉的部分（像監視器一樣掃過去）
    var gap = 180;
    if (now - WINDOW > 0 || ws > 0) trace(now - WINDOW + gap, ws, 0.25);
    trace(ws, now, 1);
    ctx.fillStyle = "#2C5A96";
    ctx.beginPath(); ctx.arc(cursorX, y0 - sample(r, state.lead, now) * mv, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(20,24,33,0.7)";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText(state.lead, 8, 18);
    if (gain !== 1) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText("5 mm/mV", 30, 18);
    }
  }

  /* ---------- 說明文字 ---------- */
  var captionEl = $(".hv-caption"), segEls = root.querySelectorAll(".hv-segs [data-seg]");

  function caption(r, seg) {
    var id = r.id, b = seg.beat, q = b && b.qrs, p = b && b.p;
    if (r.ventricular === "vf") return "心室各處同時亂放電，沒有一致的去極化方向 → 心電圖只剩雜亂的波，心臟無法有效打出血液。";
    switch (seg.seg) {
      case "P":
        if (r.id === "wpw" && q && q.t - p.t < 100) return "電流從 SA node 擴散到心房，同時已經有一部分從 Kent bundle 抄捷徑進入心室。";
        if (p.origin === "retro") return "電流從 AV 交界區往上逆傳，心房由下往上去極化 → 下方導程（II）的 P 波是倒的。";
        if (p.origin === "ectopic") return "心房裡的異位點比 SA node 早放電 → 提早出現、形狀和竇性不同的 P 波。";
        if (r.dissociated) return "SA node 照常放電、心房去極化（P 波），但這些電流全部被擋在 AV node。";
        return "SA node 放電，電流經結間徑路與 Bachmann bundle 擴散到左右心房 → 心房去極化 = P 波。";
      case "PR":
        if (id === "avb1") return "電流在 AV node 走得特別慢（一度 AV block）→ PR interval 超過 5 小格（0.2 秒）。";
        if (id === "mobitz1") return "AV node 一拍比一拍更疲乏，這次 PR 又比上一拍更長。";
        if (id === "wpw") return "Kent bundle 提早把電流送進心室 → PR 變短。";
        return "電流在 AV node 放慢（AV delay），讓心房先收縮把血擠進心室；這段期間心電圖是平的。";
      case "QRS":
        if (!q) return "";
        if (q.morph === "rbbb") return "右束支被擋住：左心室照常快速去極化，右心室要等電流穿過中膈、在心肌間慢慢傳過去 → QRS ≥ 3 小格，V1 出現 RSR′（兔耳朵）。";
        if (q.morph === "lbbb") return "左束支被擋住：電流先走右束支，再從右往左慢慢穿過中膈、傳遍左心室 → QRS 很寬，V6 出現寬而有缺口的 R 波。";
        if (q.morph === "wpw") return "心室有一部分被 Kent bundle 提早活化（慢慢爬升的 delta wave），接著正常的 His–Purkinje 電流才趕到 → QRS 起始處變鈍、變寬。";
        if (q.morph === "pvc" || q.morph === "vt") return (id === "vt" ? "心室異位點快速反覆放電，" : "心室異位點自己放電，") + "電流不走傳導系統，只能在心肌細胞之間慢慢傳 → 又寬又怪的 QRS，前面沒有 P 波。";
        if (q.junctional && !p) return "交界區（AV node 下方）自己放電當節律點，電流往下走正常的 His–Purkinje → QRS 是窄的。";
        return "電流通過 His bundle → 左右束支 → Purkinje 纖維，幾乎同時傳遍兩側心室 → 窄的 QRS（< 2.5 小格）。心室中膈最先由左往右去極化。";
      case "ST":
        return "整個心室都處於去極化狀態，細胞之間沒有電位差 → ST 段回到基線。這時心室正在收縮。";
      case "T":
        if (q && q.morph !== "normal" && q.morph !== "wpw") return "心室再極化。因為去極化的順序不正常，再極化順序也跟著亂 → T 波方向常和 QRS 相反。";
        return "心室再極化（藍色）。再極化從心外膜往心內膜走，方向和去極化相反，所以 T 波和 QRS 同方向（正的）。";
      case "blocked":
        if (id === "mobitz1") return "PR 越拉越長，這一拍 AV node 終於傳不過去 → 這個 P 後面沒有 QRS。之後 AV node 休息夠了，PR 又回到最短。";
        if (id === "mobitz2") return "電流順利通過 AV node，卻在 His 以下突然被擋住 → 沒有預警地少了一個 QRS。";
        return "這個 P 波沒有下傳到心室。";
      default:
        if (r.atrial === "flutter") return "電流在右心房繞著三尖瓣環一圈又一圈（每圈 0.2 秒）→ 鋸齒狀的 F 波。AV node 每 4 圈只放行 1 次。";
        if (r.atrial === "fib") return "心房到處都是小小的亂流，沒有一致的去極化 → 看不到 P 波，只有細小抖動的 f 波。";
        if (r.dissociated) return "心房照自己的速度跳，但電流全被擋在 AV node；心室由交界區的逸搏點每分鐘約 40 次自己跳。";
        return "心肌靜止（舒張期），等待下一次放電。";
    }
  }

  var lastCaption = "", lastSeg = "";
  function updateText() {
    var r = state.rhythm, seg = segmentAt(r, state.now);
    var text = caption(r, seg);
    if (text !== lastCaption) { captionEl.textContent = text; lastCaption = text; }
    var s = seg.seg === "blocked" ? "PR" : seg.seg;
    if (s !== lastSeg) {
      segEls.forEach(function (el) { el.classList.toggle("is-on", el.dataset.seg === s); });
      lastSeg = s;
    }
    timeInput.value = String(Math.round(((state.now % r.L) + r.L) % r.L));
  }

  /* ---------- 控制列 ---------- */
  var playBtn = $("[data-act=play]"), stepBtn = $("[data-act=step]"), timeInput = $(".hv-time");
  var select = $(".hv-rhythm"), infoName = $(".hv-name"), infoHr = $(".hv-hr"), infoDesc = $(".hv-desc"), infoLink = $(".hv-more");

  RHYTHM_ORDER.forEach(function (grp) {
    var og = document.createElement("optgroup");
    og.label = grp[0];
    grp[1].forEach(function (id) {
      var o = document.createElement("option");
      o.value = id; o.textContent = INFO[id].name;
      og.appendChild(o);
    });
    select.appendChild(og);
  });

  function setRhythm(id) {
    if (!INFO[id]) id = "nsr";
    state.rhythm = getRhythm(id);
    events = buildEvents(state.rhythm);
    state.now = 0;
    select.value = id;
    infoName.textContent = INFO[id].name;
    infoHr.textContent = INFO[id].hr;
    infoDesc.textContent = INFO[id].desc;
    infoLink.href = INFO[id].link;
    timeInput.max = String(state.rhythm.L);
    try { history.replaceState(null, "", "?rhythm=" + id); } catch (e) { /* file:// 或沙盒 */ }
    frame(true);
  }

  function setPlaying(on) {
    state.playing = on;
    playBtn.setAttribute("aria-pressed", on ? "true" : "false");
    playBtn.querySelector("span").textContent = on ? "暫停" : "播放";
    root.classList.toggle("is-paused", !on);
  }

  select.addEventListener("change", function () { setRhythm(select.value); });
  playBtn.addEventListener("click", function () { setPlaying(!state.playing); });
  stepBtn.addEventListener("click", function () {
    setPlaying(false);
    state.now = nextBoundary(state.rhythm, state.now) + 1;
    frame(true);
  });
  timeInput.addEventListener("input", function () {
    setPlaying(false);
    var L = state.rhythm.L;
    state.now = Math.floor(state.now / L) * L + Number(timeInput.value);
    frame(true);
  });
  root.querySelectorAll("[data-speed]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.speed = Number(btn.dataset.speed);
      root.querySelectorAll("[data-speed]").forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
    });
  });
  root.querySelectorAll("[data-lead]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.lead = btn.dataset.lead;
      root.querySelectorAll("[data-lead]").forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
      frame(true);
    });
  });
  root.querySelectorAll("[data-toggle]").forEach(function (input) {
    input.addEventListener("change", function () { state[input.dataset.toggle] = input.checked; frame(true); });
  });
  root.querySelectorAll("[data-view]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!three) return;
      var d = three.camera.position.distanceTo(three.controls.target);
      var dir = { front: V3(0.12, 0.05, 1), left: V3(1, 0.05, -0.15), inferior: V3(0.1, -1, 0.35), back: V3(-0.1, 0.1, -1) }[btn.dataset.view];
      three.camera.position.copy(three.controls.target).addScaledVector(dir.normalize(), d);
      three.controls.update();
      frame(true);
    });
  });
  document.querySelectorAll("a[data-rhythm-link]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      setRhythm(a.dataset.rhythmLink);
      setPlaying(true);
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  /* ---------- 迴圈 ---------- */
  var lastTs = 0, visible = true;
  function resize() {
    if (!three) return;
    var w = stage.clientWidth, h = stage.clientHeight;
    three.renderer.setSize(w, h, false);
    three.camera.aspect = w / h;
    three.camera.updateProjectionMatrix();
    // 窄螢幕（手機直向）時把鏡頭拉遠，讓整顆心臟都在畫面裡
    var fit = Math.max(4.6, 2.6 / (0.65 * three.camera.aspect));
    var dir = three.camera.position.clone().sub(three.controls.target).normalize();
    three.camera.position.copy(three.controls.target).addScaledVector(dir, fit);
    three.controls.maxDistance = Math.max(12, fit * 1.5);
  }

  function frame(force) {
    update3D();
    if (three) { three.controls.update(); three.renderer.render(three.scene, three.camera); }
    updateLabels();
    drawECG();
    updateText();
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = lastTs ? Math.min(100, ts - lastTs) : 0;
    lastTs = ts;
    if (!visible) return;
    if (state.playing) state.now += dt * state.speed;
    frame();
  }

  if (window.ResizeObserver) new ResizeObserver(function () { resize(); frame(true); }).observe(stage);
  window.addEventListener("resize", resize);
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }).observe(root);
  }

  var params = new URLSearchParams(location.search);
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  resize();
  setRhythm(params.get("rhythm") || "nsr");
  setPlaying(!reduce && params.get("paused") == null);
  if (params.get("t")) { state.now = Number(params.get("t")); frame(true); }
  requestAnimationFrame(loop);

  return { setRhythm: setRhythm, state: state };
}

var rootEl = document.querySelector(".heart-viewer");
if (rootEl) window.heartViewer = createHeartViewer(rootEl);
