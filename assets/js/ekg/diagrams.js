/**
 * 心電圖教學的示意圖（全部由本站自行繪製的 SVG）：
 *   <figure class="ekg-diagram" data-diagram="…">
 *     circuit-avnrt / circuit-avnrt-atypical / circuit-avrt-ortho / circuit-avrt-anti  折返迴圈
 *     hexaxial     Einthoven 三角與六軸參考系統（每個肢導的＋極在哪）
 *     chest-leads  電極貼片位置（可切換 IEC／AHA 顏色）
 *     territory    冠狀動脈 ↔ 12 導程分區（可點選）
 */
var NS = "http://www.w3.org/2000/svg";
var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function el(tag, attrs, text) {
  var n = document.createElementNS(NS, tag);
  for (var k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

function svgRoot(w, h, label) {
  return el("svg", { viewBox: "0 0 " + w + " " + h, class: "ekg-dsvg", role: "img", "aria-label": label });
}

function arrowDefs(svg, id, color) {
  var defs = svg.querySelector("defs") || svg.appendChild(el("defs", {}));
  var m = el("marker", { id: id, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" });
  m.appendChild(el("path", { d: "M0 0L10 5L0 10z", fill: color }));
  defs.appendChild(m);
  return "url(#" + id + ")";
}

var uid = 0;

/* ------------------------------ 折返迴圈 ------------------------------ */

var CIRCUITS = {
  "circuit-avnrt": {
    label: "典型 AVNRT（slow–fast）",
    // 慢路徑（右）往下、快路徑（左）往上
    loop: "M130 64 C170 78 170 106 130 120 C90 106 90 78 130 64",
    exits: [["M130 120 L130 158", "下傳心室 → 窄 QRS"], ["M130 64 L130 36", "同時逆傳心房 → 倒 P 貼在 QRS 尾"]],
    kent: false,
    note: "迴圈在 AV node 裡：慢路徑下傳、快路徑上傳。心房與心室幾乎同時被活化，所以逆傳 P 藏在 QRS 裡或緊接在後（short RP）。"
  },
  "circuit-avnrt-atypical": {
    label: "非典型 AVNRT（fast–slow）",
    loop: "M130 64 C90 78 90 106 130 120 C170 106 170 78 130 64",
    exits: [["M130 120 L130 158", "下傳心室 → 窄 QRS"], ["M130 64 L130 36", "慢慢逆傳 → 倒 P 離 QRS 較遠"]],
    kent: false,
    note: "方向相反：快路徑下傳、慢路徑上傳。逆傳要走慢路徑，倒 P 出現得比較晚（long RP）。"
  },
  "circuit-avrt-ortho": {
    label: "順向 AVRT（orthodromic）",
    loop: "M130 60 L130 166 Q130 186 150 186 L242 186 Q262 186 262 166 L262 56 Q262 36 242 36 L150 36 Q130 36 130 56 Z",
    exits: [],
    kent: true,
    note: "經 AV node 正常下傳（窄 QRS），再經旁路（Kent bundle）逆傳回心房。逆傳要繞過整個心室，倒 P 落在 ST 段（RP > 2 小格）。"
  },
  "circuit-avrt-anti": {
    label: "逆向 AVRT（antidromic）",
    loop: "M130 60 L130 56 Q130 36 150 36 L242 36 Q262 36 262 56 L262 166 Q262 186 242 186 L150 186 Q130 186 130 166 Z",
    exits: [],
    kent: true,
    note: "經旁路下傳，心室從旁路的位置開始、在心肌間慢慢傳（寬 QRS，像 VT），再經 AV node 逆傳回心房。"
  }
};

function drawCircuit(fig, key) {
  var c = CIRCUITS[key];
  var svg = svgRoot(320, 222, c.label + "：折返迴圈示意圖");
  fig.insertBefore(svg, fig.firstChild); // 先放進文件，getTotalLength 才量得到
  var id = "ar" + (++uid);
  var grey = arrowDefs(svg, id + "g", "#7b8494");
  // 心房、心室
  svg.appendChild(el("rect", { x: 20, y: 8, width: 280, height: 52, rx: 10, class: "cd-atrium" }));
  svg.appendChild(el("text", { x: 34, y: 28, class: "cd-label" }, "心房"));
  svg.appendChild(el("rect", { x: 20, y: 160, width: 280, height: 54, rx: 10, class: "cd-ventricle" }));
  svg.appendChild(el("text", { x: 34, y: 206, class: "cd-label" }, "心室"));
  // 房室之間的絕緣纖維環
  svg.appendChild(el("path", { d: "M20 138 H300", class: "cd-ring" }));
  svg.appendChild(el("text", { x: 24, y: 132, class: "cd-small" }, "纖維環（絕緣）"));
  if (c.kent) {
    // AVRT：AV node 當成一條正常的路
    svg.appendChild(el("path", { d: "M130 64 L130 160", class: "cd-path" }));
  } else {
    // AVNRT：AV node 裡有快、慢兩條路
    svg.appendChild(el("path", { d: "M130 64 C90 78 90 106 130 120", class: "cd-path" }));
    svg.appendChild(el("path", { d: "M130 64 C170 78 170 106 130 120", class: "cd-path" }));
    svg.appendChild(el("path", { d: "M130 120 L130 160", class: "cd-path" }));
    svg.appendChild(el("text", { x: 80, y: 96, class: "cd-small", "text-anchor": "end" }, "快路徑"));
    svg.appendChild(el("text", { x: 180, y: 96, class: "cd-small" }, "慢路徑"));
  }
  svg.appendChild(el("text", { x: 138, y: 150, class: "cd-small" }, "His"));
  svg.appendChild(el("circle", { cx: 130, cy: 64, r: 5, class: "cd-node" }));
  svg.appendChild(el("text", { x: 138, y: 58, class: "cd-small" }, "AV node"));
  if (c.kent) {
    svg.appendChild(el("path", { d: "M262 60 L262 160", class: "cd-path cd-kent" }));
    svg.appendChild(el("text", { x: 254, y: 100, class: "cd-small", "text-anchor": "end" }, "旁路"));
    svg.appendChild(el("text", { x: 254, y: 114, class: "cd-small", "text-anchor": "end" }, "Kent bundle"));
  }
  // 迴圈（紅色，帶箭頭）
  var loopId = "loop" + uid;
  svg.appendChild(el("path", { id: loopId, d: c.loop, class: "cd-loop" }));
  // 在迴圈中段放幾個方向箭頭
  var tmp = el("path", { d: c.loop });
  svg.appendChild(tmp);
  var len = tmp.getTotalLength ? tmp.getTotalLength() : 0;
  if (len) {
    [0.2, 0.45, 0.7, 0.92].forEach(function (f) {
      var a = tmp.getPointAtLength(len * f), b = tmp.getPointAtLength(len * f + 1);
      var ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      svg.appendChild(el("path", { d: "M-5 -4L4 0L-5 4z", class: "cd-arrow", transform: "translate(" + a.x.toFixed(1) + " " + a.y.toFixed(1) + ") rotate(" + ang.toFixed(0) + ")" }));
    });
  }
  svg.removeChild(tmp);
  c.exits.forEach(function (e) {
    svg.appendChild(el("path", { d: e[0], class: "cd-exit", "marker-end": grey }));
  });
  // 跑動的亮點
  var dot = el("circle", { r: 6, class: "cd-dot" });
  if (!reduceMotion) {
    var am = el("animateMotion", { dur: "2.4s", repeatCount: "indefinite", rotate: "auto" });
    var mp = el("mpath", {});
    mp.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#" + loopId);
    mp.setAttribute("href", "#" + loopId);
    am.appendChild(mp);
    dot.appendChild(am);
  } else {
    dot.setAttribute("cx", 130); dot.setAttribute("cy", 64);
  }
  svg.appendChild(dot);
  if (!fig.querySelector("figcaption")) {
    fig.appendChild(el("figcaption", {}));
  }
  var cap = fig.querySelector("figcaption");
  if (!cap.textContent.trim()) cap.textContent = c.label + "：" + c.note;
}

/* ------------------------------ 六軸系統 ------------------------------ */

function drawHexaxial(fig) {
  var W = 640, H = 372;
  var svg = svgRoot(W, H, "Einthoven 三角與六軸參考系統：各肢體導程的正極位置");
  var red = arrowDefs(svg, "hx" + (++uid), "#2c5a96");
  // 左：Einthoven 三角
  var RA = [60, 60], LA = [260, 60], LL = [160, 260];
  var tri = [["I", RA, LA, "0°"], ["II", RA, LL, "+60°"], ["III", LA, LL, "+120°"]];
  svg.appendChild(el("text", { x: 160, y: 20, class: "cd-title", "text-anchor": "middle" }, "Einthoven 三角（雙極導程）"));
  tri.forEach(function (t) {
    var a = t[1], b = t[2];
    // 兩端各縮短一點，箭頭才不會被電極圓圈蓋住
    var L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    var a2 = [a[0] + ux * 10, a[1] + uy * 10], b2 = [b[0] - ux * 13, b[1] - uy * 13];
    svg.appendChild(el("path", { d: "M" + a2[0] + " " + a2[1] + "L" + b2[0] + " " + b2[1], class: "hx-lead", "marker-end": red }));
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    var dx = t[0] === "I" ? 0 : t[0] === "II" ? -22 : 22, dy = t[0] === "I" ? -10 : 4;
    svg.appendChild(el("text", { x: mx + dx, y: my + dy, class: "hx-name", "text-anchor": "middle" }, t[0]));
  });
  [[RA, "右手 RA", "end", -10, 0], [LA, "左手 LA", "start", 10, 0], [LL, "左腳 LL", "middle", 0, 26]].forEach(function (v) {
    svg.appendChild(el("circle", { cx: v[0][0], cy: v[0][1], r: 7, class: "hx-elec" }));
    svg.appendChild(el("text", { x: v[0][0] + v[3], y: v[0][1] + v[4] + 4, class: "cd-label", "text-anchor": v[2] }, v[1]));
  });
  svg.appendChild(el("text", { x: 160, y: 318, class: "cd-small", "text-anchor": "middle" }, "箭頭指向＝正極"));
  svg.appendChild(el("text", { x: 160, y: 334, class: "cd-small", "text-anchor": "middle" }, "I：右手→左手　II：右手→左腳　III：左手→左腳"));

  // 右：六軸
  var cx = 470, cy = 160, r = 112;
  svg.appendChild(el("text", { x: cx, y: 20, class: "cd-title", "text-anchor": "middle" }, "六軸參考系統（額面）"));
  // 正常電軸範圍 −30° ~ +90°
  var arc = function (a0, a1, rr) {
    var p = function (a) { return [cx + rr * Math.cos(a * Math.PI / 180), cy + rr * Math.sin(a * Math.PI / 180)]; };
    var s = p(a0), e = p(a1);
    return "M" + cx + " " + cy + "L" + s[0].toFixed(1) + " " + s[1].toFixed(1) + "A" + rr + " " + rr + " 0 0 1 " + e[0].toFixed(1) + " " + e[1].toFixed(1) + "Z";
  };
  svg.appendChild(el("path", { d: arc(-30, 90, r), class: "hx-normal" }));
  var leads = [["I", 0], ["II", 60], ["III", 120], ["aVF", 90], ["aVL", -30], ["aVR", -150]];
  leads.forEach(function (l) {
    var a = l[1] * Math.PI / 180, x = Math.cos(a), y = Math.sin(a);
    svg.appendChild(el("path", { d: "M" + (cx - x * r) + " " + (cy - y * r) + "L" + cx + " " + cy, class: "hx-neg" }));
    svg.appendChild(el("path", { d: "M" + cx + " " + cy + "L" + (cx + x * r) + " " + (cy + y * r), class: "hx-pos", "marker-end": red }));
    var lx = cx + x * (r + 22), ly = cy + y * (r + 16) + 4;
    svg.appendChild(el("text", { x: lx, y: ly, class: "hx-name", "text-anchor": "middle" }, "+" + l[0]));
    svg.appendChild(el("text", { x: lx, y: ly + 13, class: "cd-small", "text-anchor": "middle" }, (l[1] > 0 ? "+" : "") + l[1] + "°"));
  });
  // 正常電流方向（約 +60°）
  var na = 60 * Math.PI / 180;
  svg.appendChild(el("path", { d: "M" + cx + " " + cy + "L" + (cx + Math.cos(na) * r * 0.62) + " " + (cy + Math.sin(na) * r * 0.62), class: "hx-vector", "marker-end": arrowDefs(svg, "hv" + uid, "#d64545") }));
  svg.appendChild(el("text", { x: 350, y: 342, class: "cd-small" }, "淺藍色扇形＝正常電軸（−30° ～ +90°）"));
  svg.appendChild(el("text", { x: 350, y: 358, class: "cd-small hx-vtext" }, "紅色箭頭＝正常心室電流方向（約 +60°）"));
  fig.insertBefore(svg, fig.firstChild);
}

/* ------------------------------ 電極位置 ------------------------------ */

var ELEC_COLORS = {
  iec: { RA: "#d63b3b", LA: "#f2c230", LL: "#2e9e4f", RL: "#222", V1: "#d63b3b", V2: "#f2c230", V3: "#2e9e4f", V4: "#8a5a2b", V5: "#222", V6: "#8e4bb8" },
  aha: { RA: "#fff", LA: "#222", LL: "#d63b3b", RL: "#2e9e4f", V1: "#d63b3b", V2: "#f2c230", V3: "#2e9e4f", V4: "#2f6fd6", V5: "#f08a24", V6: "#8e4bb8" }
};

function drawChest(fig) {
  var svg = svgRoot(320, 380, "12 導程心電圖電極貼片位置圖");
  // 軀幹輪廓（面向病人：病人右側在畫面左邊）
  svg.appendChild(el("path", { d: "M110 30 Q160 50 210 30 L262 52 Q292 66 296 110 L300 250 Q300 290 280 310 L270 360 L50 360 L40 310 Q20 290 20 250 L24 110 Q28 66 58 52 Z", class: "ch-body" }));
  // 鎖骨、胸骨
  svg.appendChild(el("path", { d: "M68 70 Q110 60 150 76 M170 76 Q210 60 252 70", class: "ch-bone" }));
  svg.appendChild(el("rect", { x: 150, y: 76, width: 20, height: 140, rx: 6, class: "ch-sternum" }));
  svg.appendChild(el("text", { x: 160, y: 232, class: "cd-small", "text-anchor": "middle" }, "胸骨"));
  // 肋間（示意）：第 2～6 肋間
  for (var i = 0; i < 5; i++) {
    var y = 96 + i * 26;
    svg.appendChild(el("path", { d: "M58 " + (y + 6) + " Q100 " + (y - 4) + " 148 " + y + " M172 " + y + " Q220 " + (y - 4) + " 262 " + (y + 6), class: "ch-rib" }));
  }
  svg.appendChild(el("text", { x: 54, y: 152, class: "cd-small", "text-anchor": "end" }, "4th"));
  svg.appendChild(el("text", { x: 54, y: 178, class: "cd-small", "text-anchor": "end" }, "5th"));
  // 參考線：左鎖骨中線、前腋線、腋中線
  [[212, "鎖骨中線"], [246, "前腋線"], [276, "腋中線"]].forEach(function (l) {
    svg.appendChild(el("path", { d: "M" + l[0] + " 84 V270", class: "ch-guide" }));
    svg.appendChild(el("text", { x: l[0], y: 282, class: "cd-tiny", "text-anchor": "middle" }, l[1]));
  });
  var dots = {
    V1: [138, 148], V2: [182, 148], V4: [212, 174], V3: [197, 161], V5: [246, 174], V6: [276, 174],
    RA: [66, 92], LA: [254, 92], RL: [84, 334], LL: [236, 334]
  };
  var g = el("g", { class: "ch-dots" });
  Object.keys(dots).forEach(function (k) {
    var d = dots[k], limb = k.length === 2 && k[0] !== "V";
    var c = el("circle", { cx: d[0], cy: d[1], r: limb ? 11 : 9, class: "ch-dot", "data-key": k });
    g.appendChild(c);
    var off = { V1: [0, -14], V2: [0, -14], V3: [13, -9, "start"], V4: [0, 25], V5: [0, 25], V6: [0, 25] }[k] || [0, 26];
    g.appendChild(el("text", { x: d[0] + off[0], y: d[1] + off[1], class: "ch-name", "text-anchor": off[2] || "middle" }, k));
  });
  svg.appendChild(g);
  fig.insertBefore(svg, fig.firstChild);

  var paint = function (scheme) {
    g.querySelectorAll(".ch-dot").forEach(function (c) { c.setAttribute("fill", ELEC_COLORS[scheme][c.dataset.key]); });
    fig.querySelectorAll("[data-scheme]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.scheme === scheme ? "true" : "false"); });
  };
  fig.querySelectorAll("[data-scheme]").forEach(function (b) {
    b.addEventListener("click", function () { paint(b.dataset.scheme); });
  });
  paint("iec");
}

/* ------------------------------ 冠狀動脈分區 ------------------------------ */

var ZONES = {
  inferior: { name: "下壁", color: "#e07b2e", leads: ["II", "III", "aVF"], recip: ["I", "aVL"], artery: ["rca", "pda"],
    text: "II、III、aVF 的 ST 上升 → 下壁 MI，多數是右冠狀動脈（RCA，少數為 LCx）。對側性變化：I、aVL 的 ST 下降。下壁 MI 要加做右胸導程（V4R）看有沒有右心室梗塞，並小心 Nitroglycerin。" },
  lateral: { name: "側壁", color: "#8e5ac8", leads: ["I", "aVL", "V5", "V6"], recip: ["II", "III", "aVF"], artery: ["lcx", "om"],
    text: "I、aVL、V5、V6 的 ST 上升 → 側壁 MI，多為左迴旋支（LCx）或 LAD 的對角支。對側性變化：II、III、aVF 的 ST 下降。" },
  septal: { name: "中膈", color: "#3d8fd6", leads: ["V1", "V2"], recip: [], artery: ["lad"],
    text: "V1、V2 的 ST 上升 → 中膈 MI，左前降支（LAD）的中膈分支。常與前壁合併（V1–V4 = 前中膈）。" },
  anterior: { name: "前壁", color: "#1f5fa8", leads: ["V3", "V4"], recip: ["II", "III", "aVF"], artery: ["lad", "diag"],
    text: "V3、V4 的 ST 上升 → 前壁 MI，左前降支（LAD）。V1–V6 加上 I、aVL 都上升＝廣泛前壁，常是 LAD 近端或左主幹阻塞，範圍最大。" },
  posterior: { name: "後壁", color: "#c0467a", leads: [], recip: ["V1", "V2", "V3"], artery: ["pda", "lcx"],
    text: "沒有導程直接面對後壁：V1–V3 出現 ST 下降、R 波變高（鏡像），要想到後壁 MI（RCA 或 LCx），可加做 V7–V9 確認。" }
};
var LEAD_ZONE = { I: "lateral", aVL: "lateral", V5: "lateral", V6: "lateral", II: "inferior", III: "inferior", aVF: "inferior", V1: "septal", V2: "septal", V3: "anterior", V4: "anterior", aVR: null };
var GRID = [["I", "aVR", "V1", "V4"], ["II", "aVL", "V2", "V5"], ["III", "aVF", "V3", "V6"]];

function drawTerritory(fig) {
  var wrap = document.createElement("div");
  wrap.className = "terr-wrap";

  // 冠狀動脈（前面觀，示意）
  var heart = svgRoot(300, 300, "冠狀動脈示意圖（前面觀）");
  heart.setAttribute("viewBox", "-60 0 410 305");
  heart.appendChild(el("path", { d: "M92 88 Q60 110 58 160 Q58 220 118 262 Q150 284 170 292 Q214 262 240 214 Q262 168 250 124 Q238 88 196 82 Q150 76 92 88 Z", class: "terr-heart" }));
  heart.appendChild(el("path", { d: "M120 84 Q118 40 150 26 Q186 16 200 44 L204 60", class: "terr-aorta" }));
  heart.appendChild(el("text", { x: 158, y: 16, class: "cd-small", "text-anchor": "middle" }, "主動脈"));
  var art = {
    rca: "M126 88 Q88 96 74 132 Q64 170 80 212 Q98 246 128 262",
    pda: "M128 262 Q150 272 168 284",
    lm: "M140 86 Q158 88 170 96",
    lad: "M170 96 Q178 150 172 200 Q168 250 170 290",
    diag: "M174 150 Q200 164 214 200",
    lcx: "M170 96 Q214 94 236 124 Q252 150 248 180",
    om: "M240 138 Q226 170 232 210"
  };
  var artNames = { rca: ["RCA 右冠狀動脈", 50, 140, "end"], lad: ["LAD 左前降支", 150, 236, "end"], lcx: ["LCx 左迴旋支", 262, 118, "start"], pda: ["PDA 後降支", 176, 296, "start"], diag: ["對角支", 222, 214, "start"], om: ["鈍緣支", 240, 226, "start"], lm: ["左主幹", 176, 86, "start"] };
  var artEls = {};
  Object.keys(art).forEach(function (k) {
    var zone = k === "rca" || k === "pda" ? "inferior" : k === "lcx" || k === "om" ? "lateral" : k === "lm" ? null : "anterior";
    var p = el("path", { d: art[k], class: "terr-artery", "data-artery": k, stroke: zone ? ZONES[zone].color : "#555" });
    if (k === "pda") p.setAttribute("stroke-dasharray", "5 4");
    heart.appendChild(p);
    artEls[k] = p;
    var n = artNames[k];
    heart.appendChild(el("text", { x: n[1], y: n[2], class: "cd-small terr-aname", "text-anchor": n[3] }, n[0]));
  });

  // 12 導程格子
  var grid = svgRoot(320, 190, "12 導程依心臟區域上色");
  var cells = {};
  GRID.forEach(function (row, r) {
    row.forEach(function (lead, c) {
      var z = LEAD_ZONE[lead], x = 8 + c * 77, y = 8 + r * 58;
      var g = el("g", { class: "terr-cell", "data-lead": lead, tabindex: 0, role: "button", "aria-label": lead + (z ? "：" + ZONES[z].name : "") });
      g.appendChild(el("rect", { x: x, y: y, width: 72, height: 52, rx: 8, fill: z ? ZONES[z].color : "#b9bec8" }));
      g.appendChild(el("text", { x: x + 36, y: y + 25, class: "terr-lead", "text-anchor": "middle" }, lead));
      g.appendChild(el("text", { x: x + 36, y: y + 42, class: "terr-zone", "text-anchor": "middle" }, z ? ZONES[z].name : "—"));
      grid.appendChild(g);
      cells[lead] = g;
    });
  });

  var left = document.createElement("div");
  left.className = "terr-col";
  left.appendChild(heart);
  var right = document.createElement("div");
  right.className = "terr-col";
  right.appendChild(grid);
  var btns = document.createElement("div");
  btns.className = "terr-btns";
  btns.setAttribute("role", "group");
  btns.setAttribute("aria-label", "選擇梗塞部位");
  var info = document.createElement("p");
  info.className = "terr-info";
  info.setAttribute("aria-live", "polite");
  right.appendChild(btns);
  right.appendChild(info);
  wrap.appendChild(left);
  wrap.appendChild(right);
  fig.insertBefore(wrap, fig.firstChild);

  var select = function (key) {
    var z = key && ZONES[key];
    wrap.classList.toggle("has-sel", !!z);
    Object.keys(cells).forEach(function (l) {
      cells[l].classList.toggle("is-on", !!z && z.leads.indexOf(l) >= 0);
      cells[l].classList.toggle("is-recip", !!z && z.recip.indexOf(l) >= 0);
    });
    Object.keys(artEls).forEach(function (a) { artEls[a].classList.toggle("is-on", !!z && z.artery.indexOf(a) >= 0); });
    btns.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.zone === (key || "") ? "true" : "false"); });
    info.innerHTML = "";
    if (z) {
      var b = document.createElement("b");
      b.textContent = z.name + "：";
      info.appendChild(b);
      info.appendChild(document.createTextNode(z.text));
      if (z.recip.length) {
        var s = document.createElement("span");
        s.className = "terr-recip-note";
        s.textContent = "（虛線框＝對側性 ST 下降的導程）";
        info.appendChild(s);
      }
    } else {
      info.textContent = "點上面的按鈕、導程格子或血管，看看哪些導程對應哪一區、通常是哪一條血管。";
    }
  };
  [["", "全部"]].concat(Object.keys(ZONES).map(function (k) { return [k, ZONES[k].name]; })).forEach(function (z) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "terr-btn";
    b.dataset.zone = z[0];
    b.textContent = z[1];
    if (z[0]) b.style.setProperty("--zc", ZONES[z[0]].color);
    b.addEventListener("click", function () { select(z[0] || null); });
    btns.appendChild(b);
  });
  Object.keys(cells).forEach(function (l) {
    var go = function () { select(LEAD_ZONE[l]); };
    cells[l].addEventListener("click", go);
    cells[l].addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  Object.keys(artEls).forEach(function (a) {
    artEls[a].addEventListener("click", function () {
      select(a === "rca" || a === "pda" ? "inferior" : a === "lcx" || a === "om" ? "lateral" : a === "lm" ? null : "anterior");
    });
  });
  select(null);
}

/* ------------------------------ 進入點 ------------------------------ */

document.querySelectorAll("figure.ekg-diagram[data-diagram]").forEach(function (fig) {
  var k = fig.dataset.diagram;
  try {
    if (CIRCUITS[k]) drawCircuit(fig, k);
    else if (k === "hexaxial") drawHexaxial(fig);
    else if (k === "chest-leads") drawChest(fig);
    else if (k === "territory") drawTerritory(fig);
  } catch (e) { console.error(e); }
});
