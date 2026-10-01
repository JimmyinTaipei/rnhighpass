/**
 * 心電向量頁：真實 CT 心臟（CEMRG）＋即時計算的 12 導程。
 *
 * 運算在 worker.js（engine.js）裡做：節點激動時間 → 偶極子 → 導程電位。
 * 這裡負責畫面：
 *   - 心肌依每個頂點對應節點的激動／復極時間上色（shader 只吃時間，換參數時才更新屬性）
 *   - 傳導系統依事件時間從頭亮到尾，被阻斷的分支變暗紅
 *   - 心臟向量箭頭與 QRS 向量環
 *   - 12 導程，每個導程一拍，掃描線和 3D 同步
 *
 * 座標：GLB 是公尺、節點資料是毫米；+x 病人左、+y 頭側、+z 前方。
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { GLTFLoader } from "three/addons/GLTFLoader.js";

var DATA_URL = "/assets/data/ekg/heart-nodes.json";
var GLB_URL = "/assets/models/ekg/heart.glb";
var LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
// 標準 12 導程排列：四欄 I/II/III、aVR/aVL/aVF、V1–V3、V4–V6
var LAYOUT = ["I", "aVR", "V1", "V4", "II", "aVL", "V2", "V5", "III", "aVF", "V3", "V6"];

var PRESETS = {
  nsr: { name: "正常竇性節律", hr: 75, pr: 160, block: "none", link: "basics.html#waves",
    desc: "SA node 放電 → 心房 → 在 AV node 停一下 → 希氏束、左右束支 → 浦金氏纖維，心室幾乎同時從內往外激動。" },
  avb1: { name: "一度房室傳導阻滯", hr: 70, pr: 280, block: "none", link: "blocks.html#avb1",
    desc: "每個 P 都有下傳，只是電流在 AV node 停得特別久 → PR 間期 > 200 ms，QRS 形狀不變。" },
  lbbb: { name: "左束支傳導阻滯 LBBB", hr: 70, pr: 160, block: "lbbb", link: "blocks.html#lbbb",
    desc: "左束支斷了：中膈改成由右往左激動（I、V6 的小 q 消失），左心室要等電流從右邊慢慢穿過來 → QRS 變寬，I、aVL、V6 是寬而有缺口的 R 波，T 波和 QRS 反向。" },
  rbbb: { name: "右束支傳導阻滯 RBBB", hr: 70, pr: 160, block: "rbbb", link: "blocks.html#rbbb",
    desc: "右束支斷了：左心室照常激動，右心室要等電流穿過中膈慢慢傳過來 → QRS 後段多出一個往右前方的向量，V1 出現 R′，I、V6 出現寬 S 波。" }
};

var COLORS = {
  LV: 0xb84a44, RV: 0xc96a5c, LA: 0xc98f7a, RA: 0xd6a08a, Bachmann: 0xd9b26a
};

/* ============================== 進入點 ============================== */

var root = document.getElementById("vx");
if (root) init(root);

function init(root) {
  var stage = root.querySelector(".hv-stage");
  var labelsEl = root.querySelector(".hv-labels");
  var loading = root.querySelector(".vx-loading");
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (err) {
    root.classList.add("hv-no-webgl");
    if (loading) loading.textContent = "這個瀏覽器沒有開啟 WebGL，無法顯示 3D 心臟。";
  }

  var state = {
    preset: "nsr", hr: 75, pr: 160, block: "none",
    t: 0, speed: 0.25, playing: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    opacity: 0.55, show: { cond: true, coro: false, guide: false, vector: true, labels: true },
    sim: null, busy: false, pending: null, runId: 0
  };

  var ui = bindUI(root, state, {
    rerun: function () { requestRun(); },
    view: function (v) { if (scene3d) scene3d.view(v); },
    refresh: function () { if (scene3d) scene3d.applyVisibility(); }
  });
  var leadsView = createLeads(root.querySelector(".vx-leads"));
  var scene3d = null;

  // 運算
  var worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = function (ev) {
    var m = ev.data;
    state.busy = false;
    if (m.type === "error") { ui.status("計算失敗：" + m.message); return; }
    if (m.id !== state.runId) { if (state.pending) flush(); return; }
    state.sim = digest(m);
    leadsView.setData(state.sim);
    ui.showMeasures(state.sim);
    ui.status("");
    if (scene3d) scene3d.setSim(state.sim);
    if (state.t > state.sim.rr) state.t = 0;
    if (state.pending) flush();
  };
  function requestRun() {
    state.pending = { hr: state.hr, pr: state.pr, block: state.block };
    if (!state.busy) flush();
  }
  function flush() {
    var p = state.pending;
    state.pending = null;
    state.busy = true;
    state.runId++;
    ui.status("計算中…");
    worker.postMessage({ type: "run", id: state.runId, url: DATA_URL, params: p });
  }
  requestRun();

  // 3D
  var dataP = fetch(DATA_URL).then(function (r) { return r.json(); });
  if (renderer) {
    var glbP = new Promise(function (res, rej) { new GLTFLoader().load(GLB_URL, res, undefined, rej); });
    Promise.all([dataP, glbP]).then(function (r) {
      scene3d = createScene(stage, labelsEl, renderer, r[0], r[1].scene, state);
      if (loading) loading.hidden = true;
      if (state.sim) scene3d.setSim(state.sim);
      scene3d.applyVisibility();
    }).catch(function (err) {
      if (loading) loading.textContent = "3D 模型載入失敗：" + err.message;
    });
  }

  // 播放迴圈
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(100, now - last);
    last = now;
    if (state.sim) {
      if (state.playing) state.t = (state.t + dt * state.speed) % state.sim.rr;
      ui.setTime(state.t, state.sim);
      leadsView.draw(state.t);
      if (scene3d) scene3d.render(state.t);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** 把 worker 回傳的結果整理成畫面需要的時間點。 */
function digest(m) {
  var data = { rr: m.rr, events: m.events, at: m.at, rt: m.rt, vector: m.vector, leads: {} };
  LEADS.forEach(function (k, i) { data.leads[k] = m.leads[i]; });
  return data;
}

/* ============================== 量測 ============================== */

function measures(sim, region) {
  var aOn = Infinity, aOff = -Infinity, vOn = Infinity, vOff = -Infinity, tEnd = -Infinity, tOn = Infinity;
  for (var i = 0; i < sim.at.length; i++) {
    var a = sim.at[i];
    if (!isFinite(a) || a > 1e4) continue;
    if (region[i] >= 2) { aOn = Math.min(aOn, a); aOff = Math.max(aOff, a); }
    else {
      vOn = Math.min(vOn, a); vOff = Math.max(vOff, a);
      tEnd = Math.max(tEnd, sim.rt[i]); tOn = Math.min(tOn, sim.rt[i]);
    }
  }
  // 電軸：QRS 淨面積；RBBB 依臨床慣例只看前 60 ms（末段往右的寬向量是傳導延遲，不代表電軸偏移）
  var I = sim.leads.I, F = sim.leads.aVF, si = 0, sf = 0;
  var end = (sim.events.blocked || []).indexOf("RBB") >= 0 ? Math.min(vOff + 5, vOn + 60) : vOff + 5;
  for (var s = Math.floor(vOn); s < Math.min(I.length, end); s++) { si += I[s]; sf += F[s]; }
  return {
    pOn: aOn, pOff: aOff + 10, qOn: vOn, qOff: vOff + 5, tOn: tOn - 40, tOff: tEnd + 40,
    PR: vOn - aOn, QRS: vOff - vOn + 5, QT: tEnd + 40 - vOn,
    axis: Math.round(Math.atan2(sf, si) * 180 / Math.PI)
  };
}

/* ============================== 介面 ============================== */

function bindUI(root, state, act) {
  var $ = function (s) { return root.querySelector(s); };
  var sel = $(".vx-preset"), hr = $(".vx-hr"), pr = $(".vx-pr");
  var hrOut = $(".vx-hr-out"), prOut = $(".vx-pr-out");
  var nameEl = $(".hv-name"), descEl = $(".vx-desc"), more = $(".hv-more");
  var caption = $(".hv-caption"), timeEl = $(".hv-time"), statusEl = $(".vx-status");
  var playBtn = root.querySelector('[data-act="play"]');
  var region = null;

  Object.keys(PRESETS).forEach(function (k) {
    var o = document.createElement("option");
    o.value = k;
    o.textContent = PRESETS[k].name;
    sel.appendChild(o);
  });

  function applyPreset(k, silent) {
    var p = PRESETS[k];
    state.preset = k; state.hr = p.hr; state.pr = p.pr; state.block = p.block;
    hr.value = p.hr; pr.value = p.pr;
    hrOut.textContent = p.hr; prOut.textContent = p.pr;
    nameEl.textContent = p.name;
    descEl.textContent = p.desc;
    more.href = "/resources/ekg/" + p.link;
    if (!silent) act.rerun();
  }
  sel.addEventListener("change", function () { applyPreset(sel.value); });

  var debounce;
  function slider() {
    state.hr = +hr.value; state.pr = +pr.value;
    hrOut.textContent = state.hr; prOut.textContent = state.pr;
    clearTimeout(debounce);
    debounce = setTimeout(act.rerun, 120);
  }
  hr.addEventListener("input", slider);
  pr.addEventListener("input", slider);

  root.querySelectorAll("[data-view]").forEach(function (b) {
    b.addEventListener("click", function () { act.view(b.dataset.view); });
  });
  root.querySelectorAll("[data-toggle]").forEach(function (c) {
    c.checked = !!state.show[c.dataset.toggle];
    c.addEventListener("change", function () { state.show[c.dataset.toggle] = c.checked; act.refresh(); });
  });
  var op = $(".vx-opacity");
  op.value = state.opacity * 100;
  op.addEventListener("input", function () { state.opacity = op.value / 100; act.refresh(); });

  function setPlaying(on) {
    state.playing = on;
    root.classList.toggle("is-paused", !on);
    playBtn.setAttribute("aria-pressed", on ? "true" : "false");
    playBtn.querySelector("span").textContent = on ? "暫停" : "播放";
  }
  setPlaying(state.playing);
  playBtn.addEventListener("click", function () { setPlaying(!state.playing); });
  root.querySelectorAll("[data-speed]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.speed = +b.dataset.speed;
      root.querySelectorAll("[data-speed]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
    });
  });
  timeEl.addEventListener("input", function () { setPlaying(false); state.t = +timeEl.value; });

  applyPreset(state.preset, true);

  var m = null, lastPhase = "";
  return {
    status: function (s) { statusEl.textContent = s; },
    setRegion: function (r) { region = r; },
    showMeasures: function (sim) {
      fetchRegion().then(function (r) {
        m = sim.m = measures(sim, r);
        $(".vx-m-pr").textContent = Math.round(m.PR) + " ms";
        $(".vx-m-qrs").textContent = Math.round(m.QRS) + " ms";
        $(".vx-m-qt").textContent = Math.round(m.QT) + " ms";
        $(".vx-m-axis").textContent = m.axis + "°";
        timeEl.max = Math.round(sim.rr);
        lastPhase = "";
      });
    },
    setTime: function (t, sim) {
      if (document.activeElement !== timeEl) timeEl.value = Math.round(t);
      if (!sim.m) return;
      var ph = phase(t, sim);
      if (ph.key !== lastPhase) {
        lastPhase = ph.key;
        caption.textContent = ph.text;
        root.querySelectorAll(".hv-segs li").forEach(function (li) { li.classList.toggle("is-on", li.dataset.seg === ph.seg); });
      }
    }
  };

  function phase(t, sim) {
    var m = sim.m, e = sim.events, blk = state.block;
    if (t < m.pOff) return { key: "P", seg: "P", text: "P 波：SA node 放電，電流在心房肌裡由右往左、由上往下擴散（右上方的黃色波前）。" };
    if (t < e.His) return { key: "AVN", seg: "PR", text: "PR 段：心房已經激動完，電流卡在 AV node 慢慢通過，這段時間心電圖是平的。" + (state.pr > 200 ? " 這裡停得特別久，所以 PR 間期延長。" : "") };
    if (t < m.qOn) return { key: "His", seg: "PR", text: "希氏束與束支：電流穿過中心纖維體，沿中膈頂端分成左右束支，傳導很快但組織很少，心電圖上看不到。" };
    if (t < m.qOff) {
      var txt = {
        none: "QRS：中膈先由左往右激動（V1 的小 r、V6 的小 q），接著左右心室從心內膜往外同時激動，左心室比較厚，總向量指向左下方。",
        lbbb: "QRS（LBBB）：左束支不通，電流先激動右心室，再慢慢穿過中膈到左心室 → QRS 很寬，向量一路往左後方推進。",
        rbbb: "QRS（RBBB）：左心室照常激動，右心室最後才被從中膈慢慢傳過來的電流激動 → QRS 後段多出往右前方的向量（V1 的 R′）。"
      }[blk] || "";
      return { key: "QRS", seg: "QRS", text: txt };
    }
    if (t < m.tOn) return { key: "ST", seg: "ST", text: "ST 段：心室全部處在平台期（紅色），各處電位一樣，沒有電流流動，所以是平的。" };
    if (t < m.tOff) return { key: "T", seg: "T", text: "T 波：心室再極化（藍色）。心外膜的動作電位比較短、先恢復，所以再極化由外往內，T 波和 QRS 同方向。" + (blk !== "none" ? " 束支阻滯時去極化順序改變，T 波會和 QRS 反向（繼發性 ST-T 變化）。" : "") };
    return { key: "TP", seg: "TP", text: "舒張期：心肌回到靜止狀態，等下一次 SA node 放電。" };
  }

  function fetchRegion() {
    return region ? Promise.resolve(region) : fetch(DATA_URL).then(function (r) { return r.json(); }).then(function (d) { region = d.region; return region; });
  }
}

/* ============================== 12 導程 ============================== */

function createLeads(host) {
  var cells = {};
  LAYOUT.forEach(function (k) {
    var fig = document.createElement("figure");
    fig.className = "vx-lead";
    fig.innerHTML = "<figcaption>" + k + "</figcaption><canvas></canvas>";
    host.appendChild(fig);
    cells[k] = { fig: fig, canvas: fig.querySelector("canvas"), bg: document.createElement("canvas") };
  });
  var sim = null, w = 0, h = 0, dpr = 1, range = 2;

  function layout() {
    var c = cells.I.canvas;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = c.clientWidth; h = c.clientHeight;
    LAYOUT.forEach(function (k) {
      var x = cells[k];
      x.canvas.width = x.bg.width = Math.round(w * dpr);
      x.canvas.height = x.bg.height = Math.round(h * dpr);
    });
    if (sim) paintBackgrounds();
  }
  window.addEventListener("resize", layout);

  var X = function (t) { return t / sim.rr * w; };
  var Y = function (v) { return h / 2 - v / range * (h / 2); };

  function paintBackgrounds() {
    // 方格：1 小格 = 40 ms × 0.1 mV（25 mm/s、10 mm/mV）
    var mmX = w / (sim.rr / 40), mmY = h / (2 * range * 10);
    LAYOUT.forEach(function (k) {
      var g = cells[k].bg.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#fffaf7";
      g.fillRect(0, 0, w, h);
      for (var pass = 0; pass < 2; pass++) {
        var big = pass === 1;
        g.strokeStyle = big ? "rgba(225,120,120,0.55)" : "rgba(240,180,180,0.45)";
        g.lineWidth = big ? 0.8 : 0.5;
        g.beginPath();
        for (var i = 0, x = 0; x <= w; i++, x = i * mmX) if (!big || i % 5 === 0) { g.moveTo(x, 0); g.lineTo(x, h); }
        for (i = 0; ; i++) {
          var d = i * mmY;
          if (d > h / 2) break;
          if (big && i % 5) continue;
          g.moveTo(0, h / 2 - d); g.lineTo(w, h / 2 - d);
          g.moveTo(0, h / 2 + d); g.lineTo(w, h / 2 + d);
        }
        g.stroke();
      }
      trace(g, sim.leads[k], 0, sim.rr, "rgba(40,40,40,0.25)", 1.2);
    });
  }

  function trace(g, x, t0, t1, color, lw) {
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.lineJoin = "round";
    g.beginPath();
    for (var s = Math.floor(t0); s <= Math.min(x.length - 1, t1); s++) {
      var px = X(s), py = Y(Math.max(-range, Math.min(range, x[s])));
      if (s === Math.floor(t0)) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }

  return {
    setData: function (s) {
      sim = s;
      var mx = 0.8;
      LEADS.forEach(function (k) { for (var i = 0; i < s.leads[k].length; i++) mx = Math.max(mx, Math.abs(s.leads[k][i])); });
      range = Math.min(3, Math.ceil(mx * 1.1 * 2) / 2);
      layout();
    },
    draw: function (t) {
      if (!sim || !w) return;
      LAYOUT.forEach(function (k) {
        var c = cells[k], g = c.canvas.getContext("2d");
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(c.bg, 0, 0);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        trace(g, sim.leads[k], 0, t, "#1b1b1b", 1.6);
        g.strokeStyle = "rgba(101,146,205,0.9)";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(X(t), 0); g.lineTo(X(t), h);
        g.stroke();
      });
    }
  };
}

/* ============================== 3D ============================== */

var VERT = [
  "attribute float aAt;",
  "attribute float aRt;",
  "varying float vAt;",
  "varying float vRt;",
  "varying vec3 vN;",
  "varying vec3 vV;",
  "void main() {",
  "  vAt = aAt; vRt = aRt;",
  "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
  "  vN = normalize(normalMatrix * normal);",
  "  vV = -mv.xyz;",
  "  gl_Position = projectionMatrix * mv;",
  "}"
].join("\n");

var LIGHT = [
  "vec3 shade(vec3 c, vec3 n, vec3 v) {",
  "  vec3 l1 = normalize(vec3(0.4, 0.6, 0.7)), l2 = normalize(vec3(-0.6, -0.3, 0.5));",
  "  float d = max(dot(n, l1), 0.0) * 0.65 + max(dot(n, l2), 0.0) * 0.25;",
  "  float sp = pow(max(dot(reflect(-l1, n), normalize(v)), 0.0), 28.0) * 0.18;",
  "  return c * (0.32 + d) + sp;",
  "}"
].join("\n");

var MYO_FRAG = [
  "uniform float uTime;",
  "uniform vec3 uBase;",
  "uniform float uOpacity;",
  "varying float vAt;",
  "varying float vRt;",
  "varying vec3 vN;",
  "varying vec3 vV;",
  LIGHT,
  "void main() {",
  "  float t = uTime;",
  "  float dep = smoothstep(vAt - 1.5, vAt + 1.5, t);",
  "  float rep = smoothstep(vRt - 25.0, vRt + 25.0, t);",
  "  float front = dep * exp(-max(t - vAt, 0.0) / 7.0);",
  "  float blue = rep * (1.0 - smoothstep(vRt + 25.0, vRt + 160.0, t));",
  "  vec3 c = uBase;",
  "  c = mix(c, vec3(0.95, 0.32, 0.22), dep * (1.0 - rep) * 0.9);",
  "  c = mix(c, vec3(0.35, 0.72, 1.0), blue * 0.85);",
  "  c = mix(c, vec3(1.0, 0.93, 0.55), clamp(front, 0.0, 1.0));",
  "  vec3 n = normalize(vN);",
  "  if (!gl_FrontFacing) n = -n;",
  "  gl_FragColor = vec4(shade(c, n, vV), uOpacity);",
  "}"
].join("\n");

var COND_VERT = [
  "attribute float aS;",
  "varying float vS;",
  "varying vec3 vN;",
  "varying vec3 vV;",
  "void main() {",
  "  vS = aS;",
  "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
  "  vN = normalize(normalMatrix * normal);",
  "  vV = -mv.xyz;",
  "  gl_Position = projectionMatrix * mv;",
  "}"
].join("\n");

// 傳導路徑：沿著 s（0 → 1）在 uT0 → uTm（到 uSm）→ uT1 的時間依序被點亮
var COND_FRAG = [
  "uniform float uTime, uT0, uTm, uT1, uSm, uBlocked;",
  "varying float vS;",
  "varying vec3 vN;",
  "varying vec3 vV;",
  LIGHT,
  "void main() {",
  "  float tl = vS < uSm ? mix(uT0, uTm, vS / max(uSm, 1e-3)) : mix(uTm, uT1, (vS - uSm) / max(1.0 - uSm, 1e-3));",
  "  float since = uTime - tl;",
  "  float lit = since >= 0.0 ? 0.35 + 0.65 * exp(-since / 60.0) : 0.0;",
  "  vec3 c = mix(vec3(0.55, 0.48, 0.22), vec3(1.0, 0.95, 0.55), lit);",
  "  if (uBlocked > 0.5) c = vec3(0.45, 0.16, 0.16);",
  "  vec3 n = normalize(vN);",
  "  gl_FragColor = vec4(shade(c, n, vV) + c * lit * 0.5, 1.0);",
  "}"
].join("\n");

function createScene(stage, labelsEl, renderer, data, gltf, state) {
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1a2e);
  var camera = new THREE.PerspectiveCamera(35, 1, 0.005, 5);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  stage.appendChild(renderer.domElement);
  var controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.08;
  controls.maxDistance = 1.2;
  scene.add(gltf);
  // GLB 自帶材質（冠狀動脈、瓣膜、胸廓、電極）需要光源；心肌用自己的 shader
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4660, 1.6));
  var key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(0.4, 0.6, 0.7);
  camera.add(key);
  scene.add(camera);

  var nodePos = data.pos, region = data.region;
  var find = nearestFinder(nodePos, region);
  var myo = [], cond = [], nodesMesh = {}, groups = { coro: [], guide: [], electrode: [] };

  gltf.traverse(function (o) {
    if (!o.isMesh) return;
    var name = o.name;
    if (COLORS[name] !== undefined) {
      // 心肌：每個頂點對應一個運算節點
      var g = o.geometry, p = g.attributes.position, n = p.count;
      var idx = new Uint32Array(n), atrial = name !== "LV" && name !== "RV";
      for (var i = 0; i < n; i++) idx[i] = find(p.getX(i) * 1000, p.getY(i) * 1000, p.getZ(i) * 1000, atrial);
      g.setAttribute("aAt", new THREE.BufferAttribute(new Float32Array(n), 1));
      g.setAttribute("aRt", new THREE.BufferAttribute(new Float32Array(n), 1));
      o.material = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: MYO_FRAG, side: THREE.DoubleSide, transparent: true,
        uniforms: { uTime: { value: 0 }, uBase: { value: new THREE.Color(COLORS[name]) }, uOpacity: { value: 1 } }
      });
      o.userData.node = idx;
      o.userData.adj = adjacency(g);
      o.renderOrder = 2;
      myo.push(o);
    } else if (/^Cond_/.test(name)) {
      var key = name.slice(5), path = data.paths[key];
      if (!path) return;
      o.geometry.setAttribute("aS", new THREE.BufferAttribute(pathParam(o.geometry.attributes.position, path), 1));
      o.material = new THREE.ShaderMaterial({
        vertexShader: COND_VERT, fragmentShader: COND_FRAG,
        uniforms: { uTime: { value: 0 }, uT0: { value: 1e6 }, uTm: { value: 1e6 }, uT1: { value: 1e6 }, uSm: { value: 0.5 }, uBlocked: { value: 0 } }
      });
      o.userData.key = key;
      o.userData.path = path;
      o.renderOrder = 1;
      cond.push(o);
    } else if (/^Node_/.test(name)) {
      o.material = new THREE.MeshBasicMaterial({ color: 0x8a7a30 });
      nodesMesh[name.slice(5)] = o;
      cond.push(o);
    } else if (/^Coronary_/.test(name)) {
      groups.coro.push(o);
    } else if (/^Guide_/.test(name)) {
      if (o.material) { o.material.depthWrite = !o.material.transparent; }
      groups.guide.push(o);
    } else if (/^Electrode_/.test(name)) {
      groups.electrode.push(o);
    } else {
      // 瓣膜、房室纖維環、大血管：維持 GLB 的材質，跟著心肌透明度
      o.userData.passive = true;
      if (o.material) o.material.userData.baseOpacity = o.material.opacity;
      myo.push(o);
    }
  });

  // 心臟向量：箭頭與 QRS 向量環
  var arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.05, 0xffe27a, 0.012, 0.007);
  arrow.renderOrder = 5;
  arrow.traverse(function (o) {
    o.renderOrder = 5;          // 畫在半透明心肌之後，不會被蓋住
    if (o.material) { o.material.depthTest = false; o.material.transparent = true; }
  });
  scene.add(arrow);
  var loop = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.45, depthTest: false }));
  loop.renderOrder = 5;
  scene.add(loop);
  var vecScale = 1;

  // 名稱標籤
  var labels = [];
  function addLabel(text, getPos, cls) {
    var el = document.createElement("span");
    el.className = "hv-label " + (cls || "");
    el.textContent = text;
    labelsEl.appendChild(el);
    labels.push({ el: el, pos: getPos, cls: cls });
  }
  var center = function (name) {
    var o = gltf.getObjectByName(name);
    var b = new THREE.Box3().setFromObject(o);
    return b.getCenter(new THREE.Vector3());
  };
  var lm = function (k) { var v = data.landmarks[k]; return new THREE.Vector3(v[0], v[1], v[2]).multiplyScalar(0.001); };
  [["左心室", center("LV").add(new THREE.Vector3(0.02, -0.01, 0.01)), "hv-label-myo"],
   ["右心室", center("RV").add(new THREE.Vector3(-0.005, -0.01, 0.02)), "hv-label-myo"],
   ["左心房", center("LA"), "hv-label-myo"],
   ["右心房", center("RA").add(new THREE.Vector3(-0.01, 0, 0)), "hv-label-myo"],
   ["SA node", lm("SA"), "hv-label-cond"],
   ["AV node", lm("AVN"), "hv-label-cond"]
  ].forEach(function (x) { addLabel(x[0], function () { return x[1]; }, x[2]); });
  groups.electrode.forEach(function (o) {
    var k = o.name.replace("Electrode_", "");
    if (/^V/.test(k)) addLabel(k, function () { return o.getWorldPosition(new THREE.Vector3()); }, "vx-label-el");
  });

  // 視角
  var views = {
    front: [new THREE.Vector3(0, 0.015, 0.27), new THREE.Vector3(0, 1, 0)],
    left: [new THREE.Vector3(0.27, 0.015, 0), new THREE.Vector3(0, 1, 0)],
    inferior: [new THREE.Vector3(0, -0.27, 0.03), new THREE.Vector3(0, 0, 1)]
  };
  var currentView = "front", touched = false;
  controls.addEventListener("start", function () { touched = true; });
  function view(k) {
    var v = views[k];
    currentView = k;
    // 直式畫面（手機）要退遠一點，整顆心臟才放得進來
    // 打開胸廓時退到胸壁外面
    camera.position.copy(v[0]).multiplyScalar(Math.max(1, 1.15 / camera.aspect) * (state.show.guide ? 2.4 : 1));
    camera.up.copy(v[1]);
    controls.target.set(0, 0, 0);
    controls.update();
  }
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    if (!touched) view(currentView);
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  view("front");

  function applyVisibility() {
    var op = state.opacity;
    myo.forEach(function (o) {
      var m = o.material;
      if (o.userData.passive) {
        var b = m.userData.baseOpacity == null ? 1 : m.userData.baseOpacity;
        m.opacity = Math.min(b, op);
        m.transparent = m.opacity < 1;
        m.depthWrite = m.opacity >= 1;
      } else {
        m.uniforms.uOpacity.value = op;
        m.depthWrite = op >= 0.99;
      }
      o.visible = op > 0.02;
    });
    cond.forEach(function (o) { o.visible = state.show.cond; });
    groups.coro.forEach(function (o) { o.visible = state.show.coro; });
    if (groups.guide.length && groups.guide[0].visible !== state.show.guide) view(currentView);
    groups.guide.forEach(function (o) { o.visible = state.show.guide; });
    groups.electrode.forEach(function (o) { o.visible = state.show.guide; });
    arrow.visible = loop.visible = state.show.vector;
    labels.forEach(function (l) {
      var on = l.cls === "vx-label-el" ? state.show.guide : state.show.labels && (l.cls !== "hv-label-cond" || state.show.cond);
      l.el.hidden = !on;
    });
  }

  function setSim(sim) {
    // 心肌頂點的激動／復極時間
    myo.forEach(function (o) {
      if (o.userData.passive) return;
      var idx = o.userData.node, a = o.geometry.attributes.aAt, r = o.geometry.attributes.aRt;
      for (var i = 0; i < idx.length; i++) {
        var at = sim.at[idx[i]], rt = sim.rt[idx[i]];
        a.array[i] = isFinite(at) ? at : 1e6;
        r.array[i] = isFinite(rt) ? rt : 1e6;
      }
      // 節點間距約 3 mm，直接取最近節點會讓波前一顆一顆的；沿網格平滑兩次
      smoothAttr(a.array, o.userData.adj, 2);
      smoothAttr(r.array, o.userData.adj, 2);
      a.needsUpdate = r.needsUpdate = true;
    });
    // 傳導路徑的時間
    var e = sim.events, br = e.branches, blocked = e.blocked || [];
    var atNode = function (p, atrial) { return sim.at[find(p[0], p[1], p[2], atrial)]; };
    cond.forEach(function (o) {
      var u = o.material.uniforms;
      if (!u) return;
      var k = o.userData.key, path = o.userData.path, t0, t1, tm, sm = 0.5, blk = false;
      if (/^Internodal/.test(k)) { t0 = 0; t1 = e.AVN; }
      else if (k === "Bachmann") { t0 = 0; t1 = atNode(path[path.length - 1], true); }
      else if (k === "His_bundle") {
        // 前段是房室結（慢），後段是希氏束（快）
        t0 = e.AVN; tm = e.His; t1 = e.Bifurcation; sm = 0.25;
      } else {
        var b = { LAF: "LAF", LPF: "LPF", RBB: "RBB" }[k];
        t0 = e.Bifurcation; t1 = br[b];
        blk = blocked.indexOf(b) >= 0;
      }
      u.uT0.value = t0; u.uT1.value = t1; u.uTm.value = tm == null ? (t0 + t1) / 2 : tm; u.uSm.value = sm;
      u.uBlocked.value = blk ? 1 : 0;
    });
    // 向量環（QRS 期間）與縮放
    var v = sim.vector, mx = 0, n = v.length / 3, m = sim.m;
    for (var i = 0; i < n; i++) mx = Math.max(mx, Math.hypot(v[3 * i], v[3 * i + 1], v[3 * i + 2]));
    vecScale = mx > 0 ? 0.07 / mx : 1;
    var q0 = 0, q1 = n - 1;
    var vent = [];
    for (i = 0; i < sim.at.length; i++) if (region[i] < 2 && isFinite(sim.at[i])) vent.push(sim.at[i]);
    q0 = Math.floor(Math.min.apply(null, vent)); q1 = Math.ceil(Math.max.apply(null, vent)) + 5;
    var pts = [];
    for (i = q0; i <= Math.min(q1, n - 1); i++) pts.push(new THREE.Vector3(v[3 * i], v[3 * i + 1], v[3 * i + 2]).multiplyScalar(vecScale));
    loop.geometry.dispose();
    loop.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    state.vecSim = sim;
  }

  var tmp = new THREE.Vector3();
  function render(t) {
    var sim = state.sim;
    myo.forEach(function (o) { if (!o.userData.passive) o.material.uniforms.uTime.value = t; });
    cond.forEach(function (o) { if (o.material.uniforms) o.material.uniforms.uTime.value = t; });
    if (sim) {
      var on = function (k, a, b) { if (nodesMesh[k]) nodesMesh[k].material.color.setHex(t >= a && t <= b ? 0xfff2a0 : 0x8a7a30); };
      on("SA", 0, 25);
      on("AVN", sim.events.AVN, sim.events.His);
      var s = Math.min(sim.vector.length / 3 - 1, Math.max(0, Math.round(t)));
      tmp.set(sim.vector[3 * s], sim.vector[3 * s + 1], sim.vector[3 * s + 2]).multiplyScalar(vecScale);
      var len = tmp.length();
      if (len > 0.002) {
        arrow.setDirection(tmp.clone().normalize());
        arrow.setLength(len, Math.min(0.016, len * 0.35), Math.min(0.009, len * 0.22));
        arrow.visible = state.show.vector;
      } else arrow.visible = false;
    }
    controls.update();
    renderer.render(scene, camera);
    // 標籤位置
    var w = stage.clientWidth, h = stage.clientHeight;
    labels.forEach(function (l) {
      if (l.el.hidden) return;
      var p = l.pos().clone().project(camera);
      l.el.style.transform = "translate(" + ((p.x + 1) / 2 * w).toFixed(1) + "px," + ((1 - p.y) / 2 * h).toFixed(1) + "px)";
      l.el.style.visibility = p.z < 1 ? "visible" : "hidden";
    });
  }

  return { setSim: setSim, render: render, view: view, applyVisibility: applyVisibility };
}

/** 網格頂點的鄰接表（CSR）。 */
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
    nb[fill[a]++] = b; nb[fill[a]++] = c;
    nb[fill[b]++] = a; nb[fill[b]++] = c;
    nb[fill[c]++] = a; nb[fill[c]++] = b;
  }
  return { off: off, nb: nb };
}

/** 頂點屬性沿網格做平均（未激動的 1e6 不參與）。 */
function smoothAttr(x, adj, iters) {
  if (!adj) return;
  var tmp = new Float32Array(x.length);
  for (var k = 0; k < iters; k++) {
    for (var i = 0; i < x.length; i++) {
      if (x[i] >= 1e5) { tmp[i] = x[i]; continue; }
      var s = x[i], c = 1;
      for (var q = adj.off[i]; q < adj.off[i + 1]; q++) {
        var v = x[adj.nb[q]];
        if (v < 1e5) { s += v; c++; }
      }
      tmp[i] = s / c;
    }
    x.set(tmp);
  }
}

/** 毫米座標找最近的運算節點（心房頂點只找心房節點、心室只找心室）。 */
function nearestFinder(pos, region) {
  var cell = 6, maps = [new Map(), new Map()];
  var key = function (x, y, z) { return x + "," + y + "," + z; };
  for (var i = 0; i < region.length; i++) {
    var m = maps[region[i] >= 2 ? 1 : 0];
    var k = key(Math.floor(pos[3 * i] / cell), Math.floor(pos[3 * i + 1] / cell), Math.floor(pos[3 * i + 2] / cell));
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(i);
  }
  return function (x, y, z, atrial) {
    var m = maps[atrial ? 1 : 0], cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    var best = -1, bd = Infinity;
    for (var r = 1; r <= 4 && best < 0; r++) {
      for (var dx = -r; dx <= r; dx++) for (var dy = -r; dy <= r; dy++) for (var dz = -r; dz <= r; dz++) {
        var list = m.get(key(cx + dx, cy + dy, cz + dz));
        if (!list) continue;
        for (var j = 0; j < list.length; j++) {
          var q = list[j], ex = pos[3 * q] - x, ey = pos[3 * q + 1] - y, ez = pos[3 * q + 2] - z, d = ex * ex + ey * ey + ez * ez;
          if (d < bd) { bd = d; best = q; }
        }
      }
    }
    return best < 0 ? 0 : best;
  };
}

/** 管子每個頂點在路徑上的位置（0 → 1）。 */
function pathParam(posAttr, path) {
  var n = path.length, cum = [0];
  for (var i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]));
  var total = cum[n - 1] || 1, out = new Float32Array(posAttr.count);
  for (var v = 0; v < posAttr.count; v++) {
    var x = posAttr.getX(v) * 1000, y = posAttr.getY(v) * 1000, z = posAttr.getZ(v) * 1000, best = 0, bd = Infinity;
    for (i = 0; i < n; i++) {
      var d = (path[i][0] - x) ** 2 + (path[i][1] - y) ** 2 + (path[i][2] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    out[v] = cum[best] / total;
  }
  return out;
}
