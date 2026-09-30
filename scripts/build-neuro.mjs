#!/usr/bin/env node
/**
 * build-neuro.mjs
 *
 * 從 assets/data/neuro/*.json 產生神經解剖學單元的所有靜態頁（resources/neuro/）
 * 與 hover 預覽用的索引 assets/data/neuro/neuro-index.json。
 *
 *   node scripts/build-neuro.mjs
 *
 * 文字欄位裡的 [[type:id]] 或 [[type:id|顯示文字]] 會轉成站內連結，並自動收集成每一頁底下的
 * 「提到這裡的頁面」。連到不存在的實體時直接報錯中止，不會產生壞掉的連結。
 * 產生的 HTML 會 commit 進 repo，和其他靜態頁一樣直接部署。
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModel, sectionSVG, brainSectionSVG, nucleiAt, nervesAt } from "../assets/js/neuro/geometry.js";
import { deficits } from "../assets/js/neuro/lesion.js";
import { fieldSVG, pathwaySVG, visualLoss } from "../assets/js/neuro/visual.js";
import { cbMapSVG } from "../assets/js/neuro/cerebellum.js";
import { auditorySVG, auditoryLoss, hearingSummary } from "../assets/js/neuro/auditory.js";
import { ellAt, diencSectionSVG } from "../assets/js/neuro/diencephalon.js";
import { circuitSVG, circuitLegend, bgCompare, bgKnock } from "../assets/js/neuro/basal.js";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA = path.join(ROOT, "assets/data/neuro");
const OUT = path.join(ROOT, "resources/neuro");
const BASE = "/resources/neuro";

const J = async (f) => JSON.parse(await readFile(path.join(DATA, f + ".json"), "utf8"));
const data = {
  levels: await J("levels"), tracts: await J("tracts"), structures: await J("structures"),
  lesions: await J("lesions"), regions: await J("regions"), sources: await J("sources"), nerves: await J("nerves"),
  visual: await J("visual"), auditory: await J("auditory"), diencephalon: await J("diencephalon"), basal: await J("basal")
};
const model = createModel(data);
const TR = data.tracts.tracts, ST = data.structures.structures, LE = data.lesions.lesions, RG = data.regions.regions;
const NV = data.nerves.nerves, COLS = data.nerves.columns;

/* ---------------- 實體索引 ---------------- */
const entities = {};   // "type:id" → { type, id, url, zh, en, ... }
function reg(type, id, o) { entities[type + ":" + id] = Object.assign({ type, id, url: `${BASE}/${type}/${id}.html` }, o); }
Object.entries(TR).forEach(([id, t]) => reg("tract", id, { zh: t.zh, en: t.en, abbr: t.abbr, aliases: t.aliases, summary: t.summary, color: t.color, highYield: t.highYield }));
Object.entries(ST).forEach(([id, s]) => reg("structure", id, { zh: s.zh, en: s.en, abbr: s.abbr, aliases: s.aliases, summary: s.summary }));
Object.entries(LE).forEach(([id, l]) => reg("lesion", id, { zh: l.zh, en: l.en, aliases: l.aliases, summary: l.summary, highYield: l.highYield }));
Object.entries(RG).forEach(([id, r]) => reg("region", id, { zh: r.zh, en: r.en, summary: r.summary }));
Object.entries(NV).forEach(([id, n]) => reg("nerve", id, { zh: n.zh, en: n.en, abbr: "CN " + n.num, aliases: n.aliases, summary: n.summary, highYield: n.highYield }));
model.segs.forEach((s) => reg("level", s.id, { zh: s.name + " 節段", en: "Spinal segment " + s.name, summary: levelSummary(s) }));
data.levels.brainLevels.forEach((b) => reg("level", b.id, { zh: b.name, en: b.en, summary: b.desc }));

function levelSummary(s) {
  const bits = [];
  if (s.vertebra) bits.push("約在 " + s.vertebra + " 椎體高度");
  if (s.dermatome) bits.push("皮節：" + s.dermatome);
  if (s.reflex) bits.push(s.reflex);
  return bits.join("；") + (s.note ? "。" + s.note : "");
}

/* ---------------- 文字處理 ---------------- */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const backlinks = {};  // "type:id" → Map(url → title)
let currentPage = null;

function link(key, label) {
  const e = entities[key];
  if (!e) throw new Error(`連結指向不存在的實體：${key}（在 ${currentPage?.url}）`);
  if (currentPage && currentPage.key && currentPage.key !== key) {
    (backlinks[key] ||= new Map()).set(currentPage.url, currentPage.title);
  }
  return `<a href="${e.url}" data-neuro="${key}">${esc(label ?? e.zh)}</a>`;
}
/** 把 [[type:id|文字]] 轉成連結，其餘文字跳脫。 */
function rich(text) {
  const out = [];
  let last = 0;
  const re = /\[\[([a-z]+):([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;
  let m;
  while ((m = re.exec(text))) {
    out.push(esc(text.slice(last, m.index)));
    out.push(link(m[1] + ":" + m[2], m[3]));
    last = re.lastIndex;
  }
  out.push(esc(text.slice(last)));
  return out.join("");
}
/** 資料來源：教科書列出頁碼；共筆、講義、考古題讀者拿不到，合併成一行「參考自醫學系共筆」，不寫學校與頁碼。 */
function srcList(list) {
  if (!list || !list.length) return "";
  list.forEach((s) => { if (!data.sources[s.src]) throw new Error("未知的來源：" + s.src); });
  const books = list.filter((s) => !data.sources[s.src].notes);
  const notes = list.length > books.length ? `<li><b>參考自醫學系共筆</b></li>` : "";
  return `<ul class="nx-sources">${books.map((s) => {
    const src = data.sources[s.src];
    const pg = s.p ? `，p. ${esc(s.p)}` : "";
    return `<li><b>${esc(src.short)}</b>${pg}<span class="nx-src-title">${esc(src.title)}</span></li>`;
  }).join("")}${notes}</ul>`;
}
const stars = (n) => n ? `<span class="nx-hy" title="常考程度">${"★".repeat(n)}${"☆".repeat(3 - n)}</span>` : "";
const segName = (id) => model.segs[model.segIdx[id]].name;
/** 腦部 y → 最接近的切面。 */
function nearestBrainLevel(y) {
  return data.levels.brainLevels.filter((b) => b.y < 150).reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a));
}
/** 腦部 y → 大致的位置名稱。 */
function yName(y) {
  if (y < 0) return "上頸髓";
  if (y < 12) return "延髓下段";
  if (y < 22) return "延髓中段";
  if (y < 32) return "延髓上段";
  if (y < 40) return "橋腦下段";
  if (y < 52) return "橋腦中段";
  if (y < 60) return "橋腦上段";
  if (y < 67) return "中腦下段";
  if (y <= 80) return "中腦上段";
  if (y < 85) return "間腦下段";
  if (y < 92) return "視丘中段";
  return "視丘上段";
}

/* ---------------- 版面 ---------------- */
const TABS = [
  ["index", "總覽", `${BASE}/index.html`],
  ["3d", "3D 模型", `${BASE}/3d.html`],
  ["tracts", "傳導路徑", `${BASE}/tracts.html`],
  ["nerves", "腦神經", `${BASE}/nerves.html`],
  ["levels", "各節段切面", `${BASE}/levels.html`],
  ["lesions", "常考病灶", `${BASE}/lesions.html`]
];

function shell({ title, description, body, tab, crumbs, three, scripts = [] }) {
  const tabs = TABS.map(([id, label, href]) => `<a class="tab" href="${href}"${id === tab ? ' aria-current="page"' : ""}>${label}</a>`).join("\n        ");
  const crumb = crumbs && crumbs.length ? `<nav class="nx-crumbs" aria-label="路徑">${crumbs.map(([t, h]) => h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`).join('<span aria-hidden="true">›</span>')}</nav>` : "";
  const importmap = three ? `
  <script type="importmap">
    { "imports": { "three": "/assets/vendor/three/three.module.min.js", "three/addons/": "/assets/vendor/three/" } }
  </script>` : "";
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}｜多保命 RN High Pass</title>
  <meta name="description" content="${esc(description)}">
  <link rel="icon" type="image/png" href="/assets/images/多保命.png">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/downloads.css">
  <link rel="stylesheet" href="/assets/css/guide.css">
  <link rel="stylesheet" href="/assets/css/neuro.css">${importmap}
</head>
<body>

  <header class="site-header">
    <div class="container header-inner">
      <a class="brand-group" href="/">
        <img src="/assets/images/多保命.png" alt="多保命 Logo" class="brand-logo">
        <h1 class="brand">多保命 <span class="brand-en">RN High Pass</span></h1>
      </a>
      <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="main-nav" aria-label="開啟選單">
        <svg class="icon-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        <svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <nav class="main-nav" id="main-nav" aria-label="主選單">
        <a href="/quiz.html" class="nav-soon">多保命測驗</a>
        <a href="https://exam.rnhighpass.com">國考模擬測驗</a>
        <a href="/">題目下載</a>
        <a href="/downloads/more.html">更多考題</a>
        <a href="/guide.html">使用教學</a>
        <a href="/feedback.html">問題回饋</a>
        <a href="/resources.html" aria-current="page">相關資源</a>
        <a href="/sponsor.html">贊助我們</a>
      </nav>
    </div>
  </header>

  <section class="section nx-page">
    <div class="container nx-wide">
      <p class="nx-kicker"><a href="${BASE}/index.html">神經解剖學</a> <span class="wip-badge">開發中・未驗證正確性</span></p>
      <nav class="tabs" aria-label="神經解剖學分頁">
        ${tabs}
      </nav>
      ${crumb}
${body}
    </div>
  </section>

  <footer class="site-footer">
    <div class="container">
      <p class="footer-social">
        <a href="https://www.instagram.com/rnhighpass/" target="_blank" rel="noopener">Instagram</a>
        <span aria-hidden="true">·</span>
        <a href="https://www.threads.com/@rnhighpass" target="_blank" rel="noopener">Threads</a>
      </p>
      <p class="copyright">&copy; 2026 多保命 RN High Pass</p>
    </div>
  </footer>

  <script src="/assets/js/main.js" defer></script>
  <script type="module" src="/assets/js/neuro/preview.js"></script>
${scripts.map((s) => `  <script type="module" src="${s}"></script>`).join("\n")}
</body>
</html>
`;
}

const pages = [];   // { url, file, render() }
function addPage(url, key, title, render) { pages.push({ url, key, title, render }); }

function backlinksBlock(key) {
  const m = backlinks[key];
  if (!m || !m.size) return "";
  const items = [...m.entries()].filter(([u]) => u !== entities[key]?.url)
    .sort((a, b) => a[1].localeCompare(b[1], "zh-Hant"))
    .map(([u, t]) => `<li><a href="${u}">${esc(t)}</a></li>`).join("");
  return items ? `<section class="nx-block"><h3>提到這裡的頁面</h3><ul class="nx-backlinks">${items}</ul></section>` : "";
}
const BACKLINK_SLOT = "<!--BACKLINKS-->";

function viewerBlock(opts) {
  // 3D 區塊：由 /assets/js/neuro/viewer.js 接手；data-* 決定要顯示什麼
  const attrs = Object.entries(opts).map(([k, v]) => ` data-${k}="${esc(v)}"`).join("");
  return `<div class="nx-viewer"${attrs}>
        <div class="nx-stage-wrap">
          <div class="nx-stage" aria-label="3D 模型，可拖曳旋轉、滾輪或雙指縮放"></div>
          <div class="nx-labels" aria-hidden="true"></div>
          <div class="nx-tip" hidden></div>
          <p class="nx-loading">3D 模型載入中…</p>
        </div>
        <div class="nx-panel"></div>
      </div>
      <noscript><p class="note">3D 模型需要開啟 JavaScript。</p></noscript>`;
}

/** 3D 用哪一支程式：視覺路徑、瞳孔反射、視神經用 visual-viewer.js，其他用 viewer.js。 */
const viewerScript = (engine) => engine === "visual" ? "/assets/js/neuro/visual-viewer.js" : "/assets/js/neuro/viewer.js";
const isVisualTract = (tid) => TR[tid].kind === "visual";
const BGD = data.basal;

/* ---------------- 視覺路徑的圖 ---------------- */
const VCELLS = data.visual.cells;
const NO_LOSS = { R: [], L: [] };
function pupilTable(pu) {
  const yn = (v) => v ? '<td class="is-ok">縮小</td>' : '<td class="is-bad">不縮</td>';
  return `<table class="nx-table nx-table-s nx-pupil">
              <thead><tr><th></th><th>右瞳孔</th><th>左瞳孔</th></tr></thead>
              <tbody>
                <tr><th>光照右眼</th>${yn(pu.light.R.R)}${yn(pu.light.R.L)}</tr>
                <tr><th>光照左眼</th>${yn(pu.light.L.R)}${yn(pu.light.L.L)}</tr>
                <tr><th>看近物</th>${yn(pu.near.R)}${yn(pu.near.L)}</tr>
              </tbody>
            </table>`;
}
const pupilNormal = (pu) => ["R", "L"].every((e) => ["R", "L"].every((p) => pu.light[e][p])) && pu.near.R && pu.near.L;
function fieldLegend() {
  return `<ul class="nx-legend nx-vf-legend">${Object.entries(VCELLS).filter(([k]) => k !== "_doc").map(([, c]) => `<li><i style="background:${c.color}"></i>${esc(c.zh)}</li>`).join("")}</ul>`;
}
function visualFigure(opts = {}) {
  const loss = opts.zones ? visualLoss(model, opts.zones) : null;
  return `<div class="nx-vfig">
            <figure class="nx-big nx-vpath-fig">${pathwaySVG(model, { zones: opts.zones, cut: loss, mark: opts.mark, pupil: opts.pupil, label: opts.label })}
              <figcaption>由頭頂往下看（前方在上、病人左側在左）。纖維的顏色代表它負責的視野${loss ? "；灰色虛線是被病灶切斷的纖維" : ""}。</figcaption>
            </figure>
            <div class="nx-vside">
              <h4>${loss ? "視野（黑色 = 看不到）" : "視野的 8 格與纖維顏色"}</h4>
              ${fieldSVG(loss ? loss.lost : NO_LOSS, { cells: VCELLS })}
              <p class="nx-note">視野圖畫成病人看出去的樣子：左眼在左、右眼在右；內圈是黃斑（中心視野）。</p>
              ${loss && loss.pupil && (opts.forcePupil || !pupilNormal(loss.pupil)) ? `<h4>瞳孔反射</h4>${pupilTable(loss.pupil)}` : ""}
              ${loss ? "" : fieldLegend()}
            </div>
          </div>`;
}

/* ---------------- 小腦的圖 ---------------- */
// 每條路徑在小腦攤開圖上要強調的部分
const SPINOCB = { zones: ["vermis", "intermediate"], nuclei: ["fastigial", "interposed"] };
const CB_HL = {
  pontocerebellar: { zones: ["lateral"], nuclei: ["dentate"] }, dentatothalamic: { zones: ["lateral"], nuclei: ["dentate"] },
  olivocerebellar: { all: true }, vestibulocerebellar: { lobes: ["fn"], nuclei: ["fastigial"] },
  dsct: SPINOCB, vsct: SPINOCB, cuneocerebellar: SPINOCB, rsct: SPINOCB
};
function cbFigure(opts = {}) {
  return `<figure class="nx-big nx-cbfig">${cbMapSVG(model, opts)}
            <figcaption>${esc(opts.caption || "小腦皮質攤開圖（上＝前葉、下＝小葉結節葉；中間是蚓部，兩側是中間區與外側區），下方是小腦核。病人右側畫在右邊。")}</figcaption>
          </figure>`;
}
function cbHlOf(cb) {
  if (!cb || cb.all) return null;
  if (cb.zone) return { zones: [cb.zone], nuclei: [{ vermis: "fastigial", intermediate: "interposed", lateral: "dentate" }[cb.zone]] };
  if (cb.lobe) return { lobes: [cb.lobe], zones: cb.lobe === "fn" ? ["fn"] : [] };
  if (cb.nucleus) return { nuclei: [cb.nucleus], zones: [{ fastigial: "vermis", interposed: "intermediate", dentate: "lateral" }[cb.nucleus]] };
  return null;
}

/* ---------------- 聽覺的圖 ---------------- */
function audFigure(opts = {}) {
  const loss = opts.zones ? auditoryLoss(model, opts.zones) : null;
  const table = loss ? `<table class="nx-table nx-table-s nx-hear">
              <thead><tr><th></th><th>三條路線還通的</th><th>結果</th></tr></thead>
              <tbody>${hearingSummary(loss).map((h) => `<tr><th>${h.zh}</th><td>${h.total - h.cut} / ${h.total}</td>${h.deaf ? '<td class="is-bad">聽不到</td>' : h.cut ? '<td class="is-ok">聽得到（方向判斷受影響）</td>' : '<td class="is-ok">正常</td>'}</tr>`).join("")}</tbody>
            </table>` : "";
  return `<figure class="nx-big nx-audfig">${auditorySVG(model, { zones: opts.zones, label: opts.label })}
            <figcaption>${esc(opts.caption || "由前方看（病人右側在左邊）。橘色是右耳、紫色是左耳的三條代表路線：背側耳蝸神經核 → 對側；腹側耳蝸神經核 → 斜方體 → 對側上橄欖核；腹側耳蝸神經核 → 同側上橄欖核。")}${loss ? "灰色虛線是被病灶切斷的部分。" : ""}</figcaption>
          </figure>${table}`;
}

/* ---------------- 傳導路徑頁 ---------------- */
function tractSections(tid) {
  const t = TR[tid];
  const segsToShow = ["c7", "t6", "l4", "s2"].filter((sid) => t.bundles.some((b) => b.phi && model.present(b, model.segIdx[sid] + 0.5)));
  const cells = segsToShow.map((sid) => `<figure class="nx-mini"><a href="${BASE}/level/${sid}.html" data-neuro="level:${sid}">${sectionSVG(model, sid, { highlight: [tid], scale: 14, labels: false, detail: "low", label: segName(sid) + " 橫切面" })}</a><figcaption>${segName(sid)}</figcaption></figure>`);
  const brainYs = data.levels.brainLevels.filter((b) => b.y < 80 && t.bundles.some((bd) => model.brainAt(bd, b.y, "R")))
    .map((b) => [b.id, b.y]);
  const pick = brainYs.length > 5 ? brainYs.filter((_, i) => i % 2 === 0) : brainYs;
  pick.forEach(([id, y]) => {
    const bl = data.levels.brainLevels.find((b) => b.id === id);
    cells.push(`<figure class="nx-mini"><a href="${BASE}/level/${id}.html" data-neuro="level:${id}">${brainSectionSVG(model, y, { highlight: [tid], scale: 7, labels: false, label: bl.name })}</a><figcaption>${esc(bl.name.replace(/（.*）/, ""))}</figcaption></figure>`);
  });
  return cells.length ? `<div class="nx-minis">${cells.join("")}</div>` : "";
}

function tractPage(tid) {
  const t = TR[tid];
  const key = "tract:" + tid;
  const kindZh = t.kind === "ascending" ? "上行（感覺）" : t.kind === "descending" ? "下行（運動）" : t.kind === "visual" ? "視覺" : t.kind === "cerebellar" ? "小腦" : t.kind === "auditory" ? "聽覺" : t.kind === "vestibular" ? "前庭" : t.kind === "diencephalon" ? "間腦" : t.kind === "basal" ? "基底核" : "腦幹內";
  const vis = isVisualTract(tid);
  const neurons = t.neurons.map((n) => {
    const ord = n.label || (/^\d+$/.test(String(n.order)) ? `第 ${n.order} 級神經元` : n.order === "UMN" ? "上運動神經元（UMN）" : n.order === "LMN" ? "下運動神經元（LMN）" : n.order);
    return `<li class="nx-neuron" data-order="${esc(n.order)}">
          <p class="nx-neuron-ord">${ord}</p>
          <dl>
            <dt>細胞本體</dt><dd>${rich(n.soma)}</dd>
            <dt>路線</dt><dd>${rich(n.route)}</dd>
            <dt>終止於</dt><dd>${rich(n.synapse)}</dd>
          </dl>
        </li>`;
  }).join("");
  const dec = t.decussation.level ? `${rich(t.decussation.text)}（${link("level:" + t.decussation.level)}）` : rich(t.decussation.text);
  const body = `
      <article class="nx-entity">
        <header class="nx-head" style="--c:${t.color}">
          <p class="nx-type">傳導路徑・${kindZh} ${stars(t.highYield)}</p>
          <h2>${esc(t.zh)}${t.abbr ? ` <span class="nx-abbr">${esc(t.abbr)}</span>` : ""}</h2>
          <p class="nx-en">${esc(t.en)}</p>
          <p class="guide-lead">${rich(t.summary)}</p>
        </header>

        ${viewerBlock(vis ? { mode: "tract", tract: tid, compact: "1", engine: "visual" } : { mode: "tract", tract: tid, compact: "1" })}
        ${open3d(region3d(tid), "&amp;tract=" + tid, "在完整 3D 中開啟 →")}

        <div class="nx-grid">
          <section class="nx-block">
            <h3>其他名稱</h3>
            <ul class="nx-chips">${t.aliases.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
            ${t.tradition ? `<p class="nx-note">${rich(t.tradition)}</p>` : ""}
          </section>
          <section class="nx-block">
            <h3>功能</h3>
            <ul>${t.modality.map((m) => `<li>${rich(m)}</li>`).join("")}</ul>
          </section>
        </div>

        <section class="nx-block">
          <h3>神經元鏈</h3>
          <ol class="nx-neurons">${neurons}</ol>
        </section>

        <section class="nx-block">
          <h3>在哪裡交叉</h3>
          <p>${dec}</p>
        </section>

        ${vis ? `<section class="nx-block">
          <h3>路線與視野</h3>
          ${visualFigure({ pupil: tid === "plr" })}
        </section>` : `<section class="nx-block">
          <h3>在各切面的位置</h3>
          ${tractSections(tid)}
          <p class="nx-note">點切面可以看那一節所有的路徑。</p>
        </section>`}
        ${t.kind === "auditory" ? `<section class="nx-block">
          <h3>兩耳到兩側皮質</h3>
          ${audFigure({ label: "聽覺路線圖" })}
        </section>` : ""}
        ${CB_HL[tid] ? `<section class="nx-block">
          <h3>在小腦的哪一區</h3>
          ${cbFigure({ hl: CB_HL[tid], label: t.zh + " 相關的小腦區域", caption: "亮起來的是這條路徑相關的皮質區與小腦核（上＝前葉、下＝小葉結節葉；病人右側畫在右邊）。" })}
        </section>` : ""}

        ${t.somatotopy.length ? `<section class="nx-block"><h3>${vis ? "視網膜定位（retinotopy）" : t.kind === "auditory" ? "頻率定位（tonotopy）與雙耳比較" : t.kind === "vestibular" ? "排列" : "體表定位（somatotopy）"}</h3><ul>${t.somatotopy.map((s) => `<li>${rich(s)}</li>`).join("")}</ul></section>` : ""}

        <section class="nx-block">
          <h3>臨床</h3>
          <ul>${t.clinical.map((s) => `<li>${rich(s)}</li>`).join("")}</ul>
          ${t.lesions.length ? `<p>相關病灶：${t.lesions.map((l) => link("lesion:" + l)).join("、")}</p>` : ""}
        </section>

        <section class="nx-block">
          <h3>資料來源</h3>
          ${srcList(t.sources)}
        </section>
        ${BACKLINK_SLOT}
      </article>`;
  return shell({
    title: `${t.zh}${t.abbr ? "（" + t.abbr.split(" / ")[0] + "）" : ""}`,
    description: `${t.zh}（${t.en}）：${t.summary}`,
    body, tab: "tracts", three: true,
    crumbs: [["傳導路徑", `${BASE}/tracts.html`], [t.zh]],
    scripts: [viewerScript(vis ? "visual" : "")]
  });
}

/* ---------------- 結構頁 ---------------- */
function structurePage(sid) {
  const s = ST[sid];
  const key = "structure:" + sid;
  let where = "";
  if (s.cord) {
    const [a, b] = s.cord.segs;
    where = `<p>位置：脊髓 ${link("level:" + a, segName(a))}–${link("level:" + b, segName(b))}${s.region ? "（" + link("region:" + s.region) + "）" : ""}</p>`;
  } else if (s.funiculus) {
    const inIt = [];
    data.tracts.order.forEach((tid) => TR[tid].bundles.forEach((b) => { if (b.funiculus === s.funiculus) inIt.push(link("tract:" + tid, b.zh)); }));
    where = `<p>裡面的路徑：${[...new Set(inIt)].join("、")}</p>`;
  } else if (s.level) {
    where = `<p>位置：${link("level:" + s.level)}${s.region ? "（" + link("region:" + s.region) + "）" : ""}</p>`;
  } else if (s.region) {
    where = `<p>區域：${link("region:" + s.region)}</p>`;
  }
  const kindZh = { ganglion: "神經節", fiber: "纖維束", gray: "灰質", funiculus: "白質索", nucleus: "神經核", cortex: "大腦皮質", region: "區域", organ: "感覺器官" }[s.kind] || "結構";
  const col = s.col && COLS[s.col] ? `<span class="nx-colchip" style="--c:${COLS[s.col].color}">${s.col}・${esc(COLS[s.col].zh)}</span>` : "";
  let fig = "";
  if (s.region === "auditory" || sid === "cochlear-nuclei" || sid === "inferior-colliculus") {
    fig = `<section class="nx-block"><h3>在聽覺路線上的位置</h3>${audFigure({ label: s.zh + " 在聽覺路線上" })}
            <p class="nx-note"><a href="${BASE}/3d.html?region=auditory">在 3D 中看 →</a></p></section>`;
  }
  if (s.cb) {
    fig = `<section class="nx-block"><h3>在小腦的位置</h3>${cbFigure({ hl: cbHlOf(s.cb), label: s.zh + " 的位置" })}
            <p class="nx-note"><a href="${BASE}/3d.html?region=cerebellum">在 3D 中看 →</a></p></section>`;
  } else if (s.nuc) {
    const ys = s.nuc.map((w) => w[0]);
    const y = (Math.min(...ys) + Math.max(...ys)) / 2;
    const lv = nearestBrainLevel(y);
    fig = `<figure class="nx-big nx-small">${brainSectionSVG(model, y, { scale: 12, nucleus: sid, label: s.zh + " 的位置" })}
            <figcaption>${esc(s.zh)}的位置（粗框，左右兩側都有）。範圍約從${esc(yName(Math.min(...ys)))}到${esc(yName(Math.max(...ys)))}；最接近的切面：${link("level:" + lv.id)}。</figcaption></figure>`;
  }
  if (s.vis) {
    fig = `<section class="nx-block"><h3>在視覺路徑上的位置</h3>${visualFigure({ mark: { lat: s.vis.lat, z: s.vis.z, r: s.vis.r, side: s.vis.side || "both" }, pupil: sid === "ciliary-ganglion", label: s.zh + " 的位置" })}
            <p class="nx-note">紅色圓圈標出${esc(s.zh)}的位置${s.vis.lat === 0 ? "（在中線）" : "（左右兩側都有）"}。<a href="${BASE}/3d.html?region=visual">在 3D 中看 →</a></p></section>`;
  }
  if (s.ell || s.thal || s.parts || /^(thalamus|hypothalamus|internal-capsule)$/.test(sid)) {
    const y0 = s.ell ? s.ell[0] : s.parts ? ST[s.parts[0]].ell[0] : s.nuc ? (s.nuc[0][0] + s.nuc[s.nuc.length - 1][0]) / 2 : s.vis ? s.vis.y : sid === "internal-capsule" ? 96 : sid === "hypothalamus" ? 83 : 88.5;
    const y = Math.min(106, Math.max(80.6, y0));
    const th = s.thal, DIg = data.diencephalon;
    const TYPE = { relay: "中繼核", association: "聯合核", nonspecific: "非特異核", reticular: "網狀核" };
    const conn = th ? `<div class="nx-table-wrap"><table class="nx-table nx-table-s">
              <thead><tr><th colspan="2">${esc(DIg.groups[th.group].zh)}・${TYPE[th.type]}${th.fn ? "：" + esc(th.fn) : ""}</th></tr></thead>
              <tbody>
                ${th.in.map((l) => `<tr><th class="nx-in">傳入</th><td>${esc(l.zh)}</td></tr>`).join("")}
                ${th.out.map((l) => `<tr><th class="nx-out">傳出</th><td>${esc(l.zh)}${l.ic ? `（經內囊${esc(DIg.ic.parts[l.ic].zh)}）` : ""}</td></tr>`).join("") || `<tr><th class="nx-out">傳出</th><td>不投射到皮質，回頭抑制其他視丘核</td></tr>`}
              </tbody>
            </table></div>` : "";
    const diFig = `<section class="nx-block"><h3>在間腦的位置${th ? "與連結" : ""}</h3>
            <div class="nx-section-wrap">
              <figure class="nx-big">${diencSectionSVG(model, y, { scale: 6.5, nucleus: s.ell || s.nuc || s.vis ? sid : s.parts ? s.parts[1] : null, label: s.zh + " 的位置" })}
                <figcaption>大腦的水平切面（後方在上；觀看者的左邊是病人右側）。${s.ell || s.nuc || s.vis ? "粗框是" + esc(s.zh) + "（左右兩側都有）。" : ""}最接近的切面：${link("level:" + nearestBrainLevel(y).id)}。</figcaption>
              </figure>
              <div class="nx-section-legend">${conn}<p class="nx-note"><a href="${BASE}/3d.html?region=${s.region === "basal-ganglia" ? "basal-ganglia" : "diencephalon" + (s.ell || th ? "&amp;nucleus=" + sid : "")}">在 3D 中看${th ? "它的連結" : ""} →</a></p></div>
            </div></section>`;
    fig = s.region === "auditory" || s.vis ? fig + diFig : diFig;
  }
  const bgNode = BGD.circuit.nodes.filter((n) => n.structs.indexOf(sid) >= 0)[0];
  if (s.bg || bgNode || s.parts) {
    const bgi = s.bg ? `<table class="nx-table nx-table-s"><tbody>
                <tr><th>神經傳導物質</th><td>${esc(s.bg.nt)}</td></tr>
                <tr><th>在迴路中的角色</th><td>${esc(s.bg.role)}</td></tr>
              </tbody></table>` : "";
    fig += `<section class="nx-block"><h3>在基底核迴路中的位置</h3>
            <div class="nx-section-wrap">
              <div class="nx-bg-card nx-bg-fig">${circuitSVG(BGD, { label: "基底核迴路（正常）" })}${circuitLegend()}</div>
              <div class="nx-section-legend">${bgi}${bgNode ? `<p>迴路圖上的「${esc(bgNode.zh)}」。</p>` : ""}<p class="nx-note"><a href="${BASE}/3d.html?region=basal-ganglia">在 3D 中看迴路 →</a></p></div>
            </div></section>`;
  }
  const nerves = (s.nerves || []).map((n) => link("nerve:" + n, NV[n].zh + "（" + NV[n].num + "）"));
  const body = `
      <article class="nx-entity">
        <header class="nx-head">
          <p class="nx-type">結構・${kindZh} ${col}</p>
          <h2>${esc(s.zh)}${s.abbr ? ` <span class="nx-abbr">${esc(s.abbr)}</span>` : ""}</h2>
          <p class="nx-en">${esc(s.en)}</p>
          <p class="guide-lead">${rich(s.summary)}</p>
        </header>
        ${fig}
        <section class="nx-block">
          ${where}
          ${nerves.length ? `<p>相關腦神經：${nerves.join("、")}</p>` : ""}
          ${s.facts.length ? `<ul>${s.facts.map((f) => `<li>${rich(f)}</li>`).join("")}</ul>` : ""}
          ${s.aliases?.length ? `<h3>其他名稱</h3><ul class="nx-chips">${s.aliases.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
        </section>
        <section class="nx-block">
          <h3>資料來源</h3>
          ${srcList(s.sources)}
        </section>
        ${BACKLINK_SLOT}
      </article>`;
  return shell({
    title: s.zh, description: `${s.zh}（${s.en}）：${s.summary.replace(/\[\[[^|\]]+\|?([^\]]*)\]\]/g, "$1")}`,
    body, tab: "", crumbs: [["結構"], [s.zh]]
  });
}

/* ---------------- 節段頁 ---------------- */
function tractsAtSeg(sid) {
  const pos = model.segIdx[sid] + 0.5;
  const rows = [];
  data.tracts.groups.forEach((g) => {
    const items = [];
    g.tracts.forEach((tid) => TR[tid].bundles.forEach((b) => {
      if (b.phi && model.present(b, pos)) items.push(`<li><i style="background:${TR[tid].color}"></i>${link("tract:" + tid, b.zh)}</li>`);
    }));
    if (items.length) rows.push(`<div><h4>${g.name}</h4><ul class="nx-legend">${items.join("")}</ul></div>`);
  });
  return rows.join("");
}
function specialAt(sid) {
  const i = model.segIdx[sid];
  const list = [];
  Object.entries(ST).forEach(([id, s]) => {
    if (!s.cord || s.cord.site === "drg" || /^(c1|co1)$/.test(s.cord.segs[0]) && /^(c1|co1)$/.test(s.cord.segs[1])) return;
    const a = model.segIdx[s.cord.segs[0]], b = model.segIdx[s.cord.segs[1]];
    if (i >= a && i <= b) list.push(link("structure:" + id));
  });
  return list;
}
function levelPage(s) {
  const i = s.idx, prev = model.segs[i - 1], next = model.segs[i + 1];
  const sp = specialAt(s.id);
  const body = `
      <article class="nx-entity">
        <header class="nx-head">
          <p class="nx-type">脊髓節段・${link("region:spinal-cord")}</p>
          <h2>${esc(s.name)} 節段</h2>
          <p class="guide-lead">${esc(levelSummary(s))}</p>
        </header>
        <nav class="nx-prevnext">
          ${prev ? `<a href="${BASE}/level/${prev.id}.html">‹ ${prev.name}</a>` : `<a href="${BASE}/level/med-caudal.html">‹ 延髓尾端</a>`}
          <a href="${BASE}/3d.html?region=spinal-cord&amp;level=${s.id}">在 3D 中看這一節</a>
          ${next ? `<a href="${BASE}/level/${next.id}.html">${next.name} ›</a>` : "<span></span>"}
        </nav>
        <div class="nx-section-wrap">
          <figure class="nx-big">${sectionSVG(model, s.id, { scale: 30, label: s.name + " 橫切面（後方在上，觀看者左邊 = 病人右側）" })}
            <figcaption>${esc(s.name)} 橫切面示意圖（後方在上；觀看者的左邊是病人右側）。游標移到色塊上可以看名稱，點一下前往該路徑。</figcaption>
          </figure>
          <div class="nx-section-legend">${tractsAtSeg(s.id)}</div>
        </div>
        ${sp.length ? `<section class="nx-block"><h3>這一節的特殊灰質</h3><p>${sp.join("、")}</p></section>` : ""}
        <section class="nx-block">
          <h3>說明</h3>
          <ul>
            ${s.vertebra ? `<li>約在 ${esc(s.vertebra)} 椎體高度（成人；節段越往下，比對應的椎骨高越多）。</li>` : ""}
            ${s.dermatome ? `<li>皮節：${esc(s.dermatome)}</li>` : ""}
            ${s.reflex ? `<li>反射：${esc(s.reflex)}</li>` : ""}
            ${s.note ? `<li>${rich(s.note)}</li>` : ""}
            <li>切面形狀是依 Haines Atlas（p.98–104）與 Barr's、Haines 的描述畫成的示意圖；尺寸為約略值。</li>
          </ul>
        </section>
        ${BACKLINK_SLOT}
      </article>`;
  return shell({
    title: `${s.name} 脊髓節段`, description: `${s.name} 脊髓節段的橫切面與經過的傳導路徑。${levelSummary(s)}`,
    body, tab: "levels", crumbs: [["各節段切面", `${BASE}/levels.html`], [s.name]],
    scripts: ["/assets/js/neuro/page.js"]
  });
}
function brainLevelPage(b, idx) {
  const list = data.levels.brainLevels;
  const prev = list[idx - 1], next = list[idx + 1];
  const hasSection = b.y < 150;
  const isDiLv = b.y > 80;
  const passing = [];
  data.tracts.order.forEach((tid) => TR[tid].bundles.forEach((bd) => {
    if (model.brainAt(bd, b.y, "R")) passing.push(`<li><i style="background:${TR[tid].color}"></i>${link("tract:" + tid, bd.zh)}</li>`);
  }));
  const structs = Object.entries(ST).filter(([, s]) => s.level === b.id && !s.nuc).map(([id]) => link("structure:" + id));
  const nucIds = isDiLv ? [...new Set(ellAt(model, b.y).map((n) => n.id).concat(nucleiAt(model, b.y).map((n) => n.id)))] : hasSection ? [...new Set(nucleiAt(model, b.y).map((n) => n.id))] : [];
  const nucs = nucIds.map((id) => {
    const c = ST[id].col && COLS[ST[id].col];
    return `<li><i style="background:${ST[id].color || (c ? c.color : "#b9b2c8")}"></i>${link("structure:" + id)}</li>`;
  });
  const nvs = hasSection ? [...new Set(nervesAt(model, b.y).map((n) => n.id))].map((id) => `<li><i style="background:#d98b1f"></i>${link("nerve:" + id, NV[id].zh + "（" + NV[id].num + "）")}</li>`) : [];
  const legend = (passing.length ? `<div><h4>經過這裡的路徑</h4><ul class="nx-legend">${passing.join("")}</ul></div>` : "") +
    (nucs.length ? `<div><h4>神經核</h4><ul class="nx-legend">${nucs.join("")}</ul></div>` : "") +
    (nvs.length ? `<div><h4>腦神經纖維</h4><ul class="nx-legend">${nvs.join("")}</ul></div>` : "");
  const body = `
      <article class="nx-entity">
        <header class="nx-head">
          <p class="nx-type">腦部切面</p>
          <h2>${esc(b.name)}</h2>
          <p class="nx-en">${esc(b.en)}</p>
          <p class="guide-lead">${rich(b.desc)}</p>
        </header>
        <nav class="nx-prevnext">
          ${prev ? `<a href="${BASE}/level/${prev.id}.html">‹ ${esc(prev.name)}</a>` : `<span></span>`}
          <a href="${BASE}/3d.html?region=${b.id === "basal-ganglia" ? "basal-ganglia" : isDiLv ? "diencephalon" : "brainstem"}&amp;y=${b.y}">在 3D 中看這一層</a>
          ${next ? `<a href="${BASE}/level/${next.id}.html">${esc(next.name)} ›</a>` : `<a href="${BASE}/level/c1.html">C1 ›</a>`}
        </nav>
        ${hasSection ? `<div class="nx-section-wrap">
          <figure class="nx-big">${brainSectionSVG(model, b.y, { scale: 16, label: b.name + " 示意切面" })}
            <figcaption>${isDiLv ? `大腦的水平切面（和腦幹切面同一個方向：後方在上；觀看者的左邊是病人右側）。視丘各核依核群上色（${["anterior", "medial", "intralaminar", "lateral", "ventral", "meta", "hypothalamus"].map((g) => `<span class="nx-colchip" style="--c:${data.diencephalon.groups[g].color}">${data.diencephalon.groups[g].zh}</span>`).join(" ")}），內囊依段上色，小圓點是經過的路徑。` : `示意切面（後方在上；觀看者的左邊是病人右側）。神經核依功能分類上色（${Object.entries(COLS).map(([k, c]) => `<span class="nx-colchip" style="--c:${c.color}">${k}</span>`).join(" ")}），橘色線是腦神經纖維。`}</figcaption>
          </figure>
          <div class="nx-section-legend">${legend}</div>
        </div>` : passing.length ? `<section class="nx-block"><h3>經過這裡的路徑</h3><ul class="nx-legend">${passing.join("")}</ul></section>` : ""}
        ${structs.length ? `<section class="nx-block"><h3>這一層的結構</h3><p>${structs.join("、")}</p></section>` : ""}
        ${BACKLINK_SLOT}
      </article>`;
  return shell({
    title: b.name, description: `${b.name}：${b.desc}`, body, tab: "levels",
    crumbs: [["各節段切面", `${BASE}/levels.html`], [b.name]], scripts: ["/assets/js/neuro/page.js"]
  });
}

/* ---------------- 病灶頁 ---------------- */
function lesionPage(lid) {
  const l = LE[lid];
  const z = l.zones[0];
  const d = deficits(model, l.zones);
  const main = d.filter((x) => !x.minor), minor = d.filter((x) => x.minor);
  let figure, page3d;
  const isVis = l.region === "visual";
  const vloss = z.brain ? visualLoss(model, l.zones) : null;
  const isCb = l.region === "cerebellum";
  if (isCb) {
    const zb = z.brain, y = (zb.y[0] + zb.y[1]) / 2, bs = model.brainstemAt(y);
    const inStem = zb.boxes.some((b) => b.lat[0] < bs.a && b.z[1] > bs.zc - bs.b && b.z[0] < bs.zc + bs.b && ((b.lat[0] / bs.a) ** 2 + ((Math.max(b.z[0], Math.min(bs.zc, b.z[1])) - bs.zc) / bs.b) ** 2) < 1);
    const cortexHit = d.some((x) => /^cb-/.test(x.kind));
    figure = (cortexHit ? cbFigure({ zones: l.zones, label: l.zh + " 病灶範圍示意", caption: "紅點是病灶切到的小腦皮質，紅框是被切到的小腦核（上＝前葉、下＝小葉結節葉；病人右側畫在右邊）。" }) : "") +
      (inStem ? `<figure class="nx-big nx-small">${brainSectionSVG(model, y, { scale: 12, brainLesion: zb, label: l.zh + " 在腦幹切面上" })}<figcaption>病灶在${esc(yName(y))}切面上的位置（${link("level:" + nearestBrainLevel(y).id)}）。</figcaption></figure>` : "");
    page3d = "cerebellum";
  } else if (l.region === "basal-ganglia") {
    const figs = l.zones.filter((zz) => zz.brain).map((zz) => {
      const zb = zz.brain, y = (zb.y[0] + zb.y[1]) / 2;
      return y > 80.2
        ? `<figure class="nx-big">${diencSectionSVG(model, Math.min(106, y), { scale: 6.5, brainLesion: zb, label: l.zh + " 病灶範圍示意" })}<figcaption>紅色是病灶範圍（${zb.side === "both" ? "雙側" : zb.side === "R" ? "右側" : "左側"}）；最接近的切面：${link("level:" + nearestBrainLevel(y).id)}。</figcaption></figure>`
        : `<figure class="nx-big nx-small">${brainSectionSVG(model, y, { scale: 12, brainLesion: zb, label: l.zh + " 病灶範圍示意" })}<figcaption>紅色是病灶範圍（${esc(yName(y))}，${zb.side === "both" ? "雙側" : zb.side === "R" ? "右側" : "左側"}）；最接近的切面：${link("level:" + nearestBrainLevel(y).id)}。</figcaption></figure>`;
    });
    figure = `<div>${figs.join("")}</div>`;
    page3d = "basal-ganglia";
  } else if (l.region === "diencephalon") {
    const figs = l.zones.filter((zz) => zz.brain).map((zz) => {
      const zb = zz.brain, y = Math.min(106, Math.max(80.6, (zb.y[0] + zb.y[1]) / 2));
      return `<figure class="nx-big">${diencSectionSVG(model, y, { scale: 6.5, brainLesion: zb, label: l.zh + " 病灶範圍示意" })}
            <figcaption>紅色是病灶範圍（${zb.side === "both" ? "雙側" : zb.side === "R" ? "右側" : "左側"}）${(zb.y[0] + zb.y[1]) / 2 < 80.6 ? "，實際位置比這一層再低一點（視交叉、垂體柄的高度）" : ""}；最接近的切面：${link("level:" + nearestBrainLevel(y).id)}。</figcaption>
          </figure>`;
    });
    const vl = vloss && (vloss.lost.R.length || vloss.lost.L.length);
    figure = `<div>${figs.join("")}${vl ? `<h4>視野（黑色 = 看不到）</h4><div class="nx-vside">${fieldSVG(vloss.lost, { cells: VCELLS })}</div>` : ""}</div>`;
    page3d = "diencephalon";
  } else if (l.region === "auditory") {
    const zb = z.brain, y = (zb.y[0] + zb.y[1]) / 2, bs = model.brainstemAt(y);
    const inStem = y < 80 && zb.boxes.some((b) => b.lat[0] < bs.a);
    figure = `<div>${audFigure({ zones: l.zones, label: l.zh + " 切斷哪些聽覺路線" })}</div>` +
      (inStem ? `<figure class="nx-big nx-small">${brainSectionSVG(model, y, { scale: 12, brainLesion: zb, label: l.zh + " 在腦幹切面上" })}<figcaption>病灶在${esc(yName(y))}切面上的位置（${link("level:" + nearestBrainLevel(y).id)}）。</figcaption></figure>` : "");
    page3d = "auditory";
  } else if (isVis) {
    figure = visualFigure({ zones: l.zones, forcePupil: true, pupil: /^(cn3-compression|adie|argyll-robertson)$/.test(lid), label: l.zh + " 病灶範圍示意" });
    page3d = "visual";
  } else if (z.brain) {
    const zb = z.brain, y = (zb.y[0] + zb.y[1]) / 2;
    figure = `<figure class="nx-big">${brainSectionSVG(model, y, { scale: 15, brainLesion: zb, label: l.zh + " 病灶範圍示意" })}
            <figcaption>紅色是病灶範圍（${esc(yName(zb.y[0]))}${yName(zb.y[0]) !== yName(zb.y[1]) ? "到" + esc(yName(zb.y[1])) : ""}${zb.side === "both" ? "，雙側" : zb.side === "R" ? "，右側" : "，左側"}；最接近的切面：${link("level:" + nearestBrainLevel(y).id)}）。</figcaption>
          </figure>`;
    page3d = "brainstem";
  } else {
    const segA = z.segs[0], segB = z.segs[1];
    figure = `<figure class="nx-big">${sectionSVG(model, segA, { scale: 28, lesion: { side: z.side, parts: z.parts }, label: l.zh + " 病灶範圍示意" })}
            <figcaption>紅色斜線是病灶範圍（${segName(segA)}${segA !== segB ? "–" + segName(segB) : ""}${z.side === "both" ? "，雙側" : z.side === "R" ? "，右側" : "，左側"}）。</figcaption>
          </figure>`;
    page3d = "spinal-cord";
  }
  const kn = bgKnock(model, l.zones);
  const bgFig = kn.length ? `<section class="nx-block"><h3>基底核迴路的變化</h3>
          <div class="nx-section-wrap">
            <div class="nx-bg-card nx-bg-fig">${circuitSVG(BGD, { knock: kn, label: l.zh + " 的基底核迴路" })}${circuitLegend()}</div>
            <div class="nx-section-legend"><p>${esc(bgCompare(BGD, kn).motorZh)}。</p><p class="nx-note">打叉的是失去功能的核；箭頭是和正常比較的活性變化，由迴路的興奮／抑制推導（Barr p.208；Haines p.383–390）。</p><p class="nx-note"><a href="${BASE}/3d.html?region=basal-ganglia">在 3D 裡比較四種狀況 →</a></p></div>
          </div></section>` : "";
  const body = `
      <article class="nx-entity">
        <header class="nx-head">
          <p class="nx-type">常考病灶 ${stars(l.highYield)}</p>
          <h2>${esc(l.zh)}</h2>
          <p class="nx-en">${esc(l.en)}</p>
          <p class="guide-lead">${rich(l.summary)}</p>
        </header>
        ${isVis ? `${figure}
        <section class="nx-block">
          <h3>由路徑推導出的症狀</h3>
          <ul class="nx-deficits">${main.map((x) => `<li>${esc(x.text)}</li>`).join("")}</ul>
          <p><a class="btn-outline nx-btn" href="${BASE}/3d.html?region=${page3d}&amp;lesion=${lid}">在 3D 中模擬</a></p>
        </section>` : `<div class="nx-section-wrap">
          ${figure}
          <div class="nx-section-legend">
            <h4>由路徑推導出的症狀</h4>
            <ul class="nx-deficits">${main.map((x) => `<li>${esc(x.text)}</li>`).join("")}</ul>
            ${minor.length ? `<p class="nx-note">次要：${minor.map((x) => esc(x.text)).join("；")}</p>` : ""}
            ${vloss && vloss.pupil && !pupilNormal(vloss.pupil) ? `<h4>瞳孔反射</h4>${pupilTable(vloss.pupil)}` : ""}
            <p><a class="btn-outline nx-btn" href="${BASE}/3d.html?region=${page3d}&amp;lesion=${lid}">在 3D 中模擬${l.adjustable ? "（可以換節段、換邊）" : ""}</a></p>
          </div>
        </div>`}
        ${l.note ? `<p class="nx-note">${rich(l.note)}</p>` : ""}
        ${bgFig}
        <section class="nx-block">
          <h3>重點</h3>
          <ul>${l.points.map((p) => `<li>${rich(p)}</li>`).join("")}</ul>
        </section>
        <section class="nx-block">
          <h3>原因</h3>
          <p>${rich(l.cause)}</p>
          ${l.aliases?.length ? `<h3>其他名稱</h3><ul class="nx-chips">${l.aliases.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
        </section>
        <section class="nx-block">
          <h3>資料來源</h3>
          ${srcList(l.sources)}
        </section>
        ${BACKLINK_SLOT}
      </article>`;
  return shell({
    title: l.zh, description: `${l.zh}（${l.en}）：${l.summary}`, body, tab: "lesions",
    crumbs: [["常考病灶", `${BASE}/lesions.html`], [l.zh]], scripts: ["/assets/js/neuro/page.js"]
  });
}

/* ---------------- 區域頁 ---------------- */
/** 路徑的色系：同一類路徑用同一個色系、不同深淺。 */
function famLegend() {
  const F = data.tracts.families;
  return `<ul class="nx-fams" aria-label="路徑顏色的色系">${Object.entries(F).filter(([f]) => data.tracts.order.some((t) => TR[t].family === f))
    .map(([f, x]) => `<li><span class="nx-fam-sw">${data.tracts.order.filter((t) => TR[t].family === f).map((t) => `<i style="background:${TR[t].color}" title="${esc(TR[t].zh)}"></i>`).join("")}</span>${esc(x.zh)}</li>`).join("")}</ul>`;
}

/* ---------------- 3D 整合頁 ---------------- */
/** 各區域 3D 的使用說明（整合頁依區域切換顯示）。 */
function howtoList(rid) {
  if (rid === "basal-ganglia") return `<ul>
            <li><b>迴路</b>：右邊選「直接路徑」、「間接路徑」或「黑質紋狀體」，3D 會畫出那一條的神經元鏈（右半球），光點從皮質走到紋狀體、蒼白球、視丘再回到皮質。</li>
            <li><b>狀況</b>：選正常、Parkinson 病、Huntington 病或視丘下核受損，迴路圖會依興奮／抑制推導出每一個核比正常更活躍（↑）或更安靜（↓）；3D 裡發亮＝更活躍、變淡＝更安靜、灰色＝失去功能。</li>
            <li><b>位置</b>：紋狀體畫成半透明，看得到裡面的蒼白球外節、內節；尾狀核沿側腦室彎成 C 字，尾端進入顳葉；黑質在中腦的大腦腳背側。</li>
            <li><b>切面</b>：拖曳滑桿，從中腦（黑質）往上到基底核與內囊的水平切面。</li>
            <li><b>病灶</b>：Parkinson 病、單側黑質受損、Huntington 病、Wilson 病與偏身投擲症，會列出推導出的症狀與迴路的變化。</li>
          </ul>`;
  if (rid === "spinal-cord") return `<ul>
            <li><b>旋轉、縮放</b>：拖曳可以旋轉，滾輪或兩指縮放；右上角的按鈕可以切換視角。</li>
            <li><b>選路徑</b>：在右邊勾選要顯示的路徑；點路徑名稱會畫出一條代表性的神經元鏈，並用光點動畫從起點走到終點（第 1、2、3 級神經元顏色不同）。</li>
            <li><b>切面</b>：拖曳節段滑桿，3D 模型上會出現切面，右邊同步顯示這一節的 2D 橫切面。</li>
            <li><b>病灶</b>：切到「病灶」分頁選一個常考的病灶，模型上會標出範圍，並列出由路徑推導出的症狀。</li>
            <li><b>比例</b>：預設每一節畫成一樣長，方便看清楚；勾選「真實長度」會改成接近成人的比例（胸髓很長、薦髓很短）。</li>
          </ul>`;
  if (rid === "brainstem") return `<ul>
            <li><b>腦神經</b>：在「腦神經」分頁點一條神經，模型會亮出它的神經核與纖維走向（例如顏面神經繞過外旋神經核的內膝、滑車神經在背側交叉）。</li>
            <li><b>神經核的顏色</b>：依功能分類上色——${Object.entries(COLS).map(([k, c]) => `<span class="nx-colchip" style="--c:${c.color}">${k} ${esc(c.short)}</span>`).join(" ")}。</li>
            <li><b>路徑</b>：三叉神經感覺路徑、皮質延髓徑、水平注視路徑（MLF）都可以按「路線」看神經元鏈。</li>
            <li><b>病灶</b>：選一個腦幹症候群，模型會標出範圍並列出推導出的症狀——腦神經的症狀在同側、長路徑的症狀在對側，就是「交叉性」的由來。</li>
          </ul>`;
  if (rid === "cerebellum") return `<ul>
            <li><b>分區</b>：在「分區」分頁切換「縱向分區」與「分葉」的顏色；小腦是半透明的，可以看到裡面的頂核、中間核與齒狀核。</li>
            <li><b>路徑</b>：按「路線」看神經元鏈。齒狀核–視丘–皮質路徑會一路畫到脊髓前角，可以看到「交叉兩次、最後還是同側」。</li>
            <li><b>病灶</b>：選一個病灶，模型標出範圍，右下角的攤開圖標出切到的皮質與小腦核，並列出推導出的症狀。</li>
          </ul>`;
  if (rid === "diencephalon") return `<ul>
            <li><b>視丘核</b>：右邊依核群列出視丘各核，點一個（或直接點 3D 裡的核），藍線是它的傳入、橘線是傳出——經內囊哪一段、到哪一區皮質。一打開先選 VL（小腦與蒼白球 → 運動皮質）。</li>
            <li><b>切面</b>：拖曳滑桿往上，就是大腦的水平切面：看得到內囊的前肢、膝部、後肢，以及夾在旁邊的尾狀核、豆狀核與視丘。</li>
            <li><b>路徑</b>：乳頭視丘徑（Papez 迴路）與下視丘垂體徑可以按「路線」看神經元鏈；內側蹄系、脊髓丘腦徑、小腦的路徑也都止於這裡的核。</li>
            <li><b>病灶</b>：視丘症候群、內囊梗塞、偏身投擲症、Korsakoff 症候群與顱咽管瘤。</li>
          </ul>`;
  if (rid === "auditory") return `<ul>
            <li><b>聽覺路徑</b>：一打開就是右耳的聽覺路徑。在右邊切換「單耳」、「雙耳：對側」、「雙耳：同側」三種走法，或切到左耳，可以看到每一耳都同時送到兩側的聽覺皮質。</li>
            <li><b>內耳</b>：按「內耳」視角放大右耳：耳蝸依頻率上色（紅＝底部高頻、藍＝頂部低頻），綠色是三個半規管、前庭與耳石器；顳橫回也依頻率上色。</li>
            <li><b>前庭眼反射</b>：在路徑清單按「前庭眼反射」的「路線」，選頭往哪邊轉，光點會從半規管走到對側外旋神經核、再經 MLF 回到同側動眼神經核。</li>
            <li><b>病灶</b>：選一個病灶，模型標出範圍並推導出症狀；右下角是腦幹切面，可以看到斜方體、外側蹄系與上橄欖核的位置。</li>
          </ul>`;
  if (rid === "visual") return `<ul>
            <li><b>視野與纖維</b>：視野分成 8 格（左／右、上／下、周邊／黃斑），每一格一個顏色，兩眼負責同一格視野的纖維顏色相同。點右邊視野圖的格子，模型只亮那一格的纖維，可以看它在哪裡交叉、走 Meyer 環還是頂葉、止於距狀溝哪一段。</li>
            <li><b>瞳孔反射</b>：選光照哪一眼，光點會沿著傳入端走到兩側的頂蓋前核、再到兩側 EW 核與動眼神經，兩眼的瞳孔一起縮小。</li>
            <li><b>病灶</b>：選一個病灶，被切斷的纖維變成灰色，右邊的視野圖與瞳孔反射表會跟著改變。</li>
          </ul>`;
  return "";
}
/** 整合頁上方的區域切換（順序即按鈕順序）。 */
const HUB = [
  ["spinal-cord", "脊髓", "3D 脊髓與傳導路徑"],
  ["brainstem", "腦幹與腦神經", "3D 腦幹與腦神經"],
  ["cerebellum", "小腦", "3D 小腦"],
  ["diencephalon", "間腦", "3D 間腦與視丘各核"],
  ["basal-ganglia", "基底核", "3D 基底核與直接／間接路徑"],
  ["visual", "視覺與瞳孔", "3D 視覺路徑與瞳孔反射"],
  ["auditory", "聽覺與前庭", "3D 聽覺與前庭"]
];
function hubPage() {
  const tabs = HUB.map(([rid, zh], i) => `<button type="button" class="nx-hub-tab" data-region="${rid}" data-title="${esc(HUB[i][2])}" aria-pressed="${i === 0}">${esc(zh)}</button>`).join("");
  const infos = HUB.map(([rid, zh], i) => `<section class="nx-block nx-hub-info" data-for="${rid}"${i ? " hidden" : ""}>
          <h3>怎麼使用：${esc(zh)}</h3>
          ${howtoList(rid)}
          <p><a href="${BASE}/region/${rid}.html">${esc(RG[rid].zh)}的重點、表格與切面 →</a></p>
        </section>`).join("\n        ");
  const body = `
      <h2 class="nx-hub-title">3D 模型</h2>
      <nav class="nx-hub-tabs" aria-label="選擇區域">${tabs}</nav>
      <div class="nx-hub-stage">
        ${viewerBlock({ mode: "region", region: HUB[0][0], hub: "1" })}
      </div>
      <p class="nx-note">拖曳旋轉、滾輪或兩指縮放；右上角可以切換淺色、深色背景。模型是依課本描述自行繪製的示意圖，比例不是真實測量。</p>
      ${infos}`;
  return shell({ title: "3D 模型", description: "神經解剖學 3D 模型：脊髓、腦幹與腦神經、小腦、間腦、視覺與聽覺路徑，可以選路徑看神經元鏈、拖曳切面、模擬病灶。", body, tab: "3d", three: true, scripts: ["/assets/js/neuro/hub.js"] });
}
/** 區域頁頂端：開啟整合 3D 頁、並直接切到這個區域。 */
const open3d = (rid, q = "", label = "開啟 3D 模型 →") => `<p class="nx-open3d"><a class="btn-outline nx-btn" href="${BASE}/3d.html?region=${rid}${q}">${label}</a></p>`;
/** 路徑在整合頁的哪一個區域看最完整。 */
const region3d = (tid) => { const k = TR[tid].kind; return k === "visual" ? "visual" : k === "cerebellar" ? "cerebellum" : k === "diencephalon" ? "diencephalon" : k === "basal" ? "basal-ganglia" : k === "auditory" || k === "vestibular" ? "auditory" : !TR[tid].inputs ? "brainstem" : "spinal-cord"; };

function regionPage(rid) {
  const r = RG[rid];
  let extra = "";
  if (rid === "spinal-cord") {
    extra = `
        ${open3d("spinal-cord")}`;
  } else if (rid === "brainstem") {
    extra = `
        ${open3d("brainstem")}
        <section class="nx-block">
          <h3>腦神經</h3>
          <div class="nx-table-wrap">${nerveTable()}</div>
        </section>
        <section class="nx-block">
          <h3>腦幹症候群</h3>
          <ul class="nx-inline">${data.lesions.order.filter((id) => LE[id].region === "brainstem").map((id) => `<li>${link("lesion:" + id)}</li>`).join("")}</ul>
        </section>`;
  } else if (rid === "cerebellum") {
    const row = (zone, zh, nuc, ped, target, fn, les) => `<tr><td><span class="nx-colchip" style="--c:${ST[zone].color}">${zh}</span></td><td>${nuc}</td><td>${ped}</td><td>${target}</td><td>${fn}</td><td>${les}</td></tr>`;
    extra = `
        ${open3d("cerebellum")}
        <section class="nx-block">
          <h3>三個功能區</h3>
          <div class="nx-table-wrap"><table class="nx-table">
            <thead><tr><th>皮質區</th><th>小腦核</th><th>主要傳入</th><th>輸出到</th><th>功能</th><th>受損</th></tr></thead>
            <tbody>
              ${row("flocculonodular-lobe", "前庭小腦（小葉結節葉）", link("structure:fastigial") + "（也直接到前庭核）", "前庭神經與前庭神經核（下小腦腳的近繩狀體）", "同側前庭神經核、網狀結構", "平衡、頭眼協調", link("lesion:cb-flocculonodular"))}
              ${row("vermis", "脊髓小腦：蚓部", link("structure:fastigial"), "脊髓小腦徑、前庭、網狀結構", "前庭神經核、網狀結構（→ 軀幹肌）", "姿勢、步態", link("lesion:cb-vermis"))}
              ${row("intermediate-zone", "脊髓小腦：中間區", link("structure:interposed"), "脊髓小腦徑（肢體的本體感覺）", "上小腦腳 → 對側紅核、視丘 VL", "修正進行中的肢體動作", "和外側區一起：同側肢體")}
              ${row("lateral-zone", "橋腦小腦：外側區", link("structure:dentate"), "對側橋腦核（中小腦腳）", "上小腦腳 → 對側視丘 VL → 運動皮質", "規劃精細動作的時序", link("lesion:cb-hemisphere"))}
            </tbody>
          </table></div>
          <p class="nx-note">依 Barr p.165–171、Haines p.396, 405–410 整理。攀緣纖維（對側下橄欖核）分布到所有區。</p>
        </section>
        <section class="nx-block">
          <h3>攤開圖</h3>
          <div class="nx-grid">${cbFigure({ label: "小腦縱向分區" })}${cbFigure({ color: "lobe", label: "小腦分葉", caption: "同一張圖改成依分葉上色：紅＝前葉、藍＝後葉、橘＝小葉結節葉。" })}</div>
        </section>
        <section class="nx-block">
          <h3>小腦病灶</h3>
          <ul class="nx-inline">${data.lesions.order.filter((id) => LE[id].region === "cerebellum").map((id) => `<li>${link("lesion:" + id)}</li>`).join("")}</ul>
          <p>也會影響小腦功能：${link("lesion:lateral-medullary")}（下小腦腳）、${link("lesion:benedikt")}（上小腦腳交叉後，症狀在對側）。</p>
        </section>`;
  } else if (rid === "diencephalon") {
    const DIg = data.diencephalon, TYPE = { relay: "中繼核", association: "聯合核", nonspecific: "非特異核", reticular: "網狀核" };
    const gOrder = ["anterior", "medial", "intralaminar", "lateral", "ventral", "meta", "reticular"];
    const thalIds = Object.keys(ST).filter((id) => ST[id].thal).sort((a, b) => gOrder.indexOf(ST[a].thal.group) - gOrder.indexOf(ST[b].thal.group));
    const thalRows = thalIds.map((id) => {
      const th = ST[id].thal;
      return `<tr><td><span class="nx-colchip" style="--c:${DIg.groups[th.group].color}">${esc(DIg.groups[th.group].zh)}</span><br>${link("structure:" + id)}</td><td>${TYPE[th.type]}</td><td>${th.in.map((l) => esc(l.zh)).join("<br>")}</td><td>${th.out.map((l) => esc(l.zh) + (l.ic ? `<br><span class="nx-en">內囊${esc(DIg.ic.parts[l.ic].zh)}</span>` : "")).join("<br>") || "其他視丘核（抑制）"}</td><td>${esc(th.fn)}</td></tr>`;
    }).join("");
    const PART = { chiasmatic: "視交叉區（前）", tuberal: "結節區（中）", mammillary: "乳頭區（後）" }, ZONE = { medial: "內側區", lateral: "外側區", periventricular: "室周區" };
    const hypRows = ["chiasmatic", "tuberal", "mammillary"].map((pt) => Object.keys(ST).filter((id) => ST[id].hyp && ST[id].hyp.part === pt)
      .map((id, i, arr) => `<tr>${i === 0 ? `<td rowspan="${arr.length}">${PART[pt]}</td>` : ""}<td>${link("structure:" + id)}</td><td>${ZONE[ST[id].hyp.zone]}</td><td>${rich(ST[id].summary.split("：").slice(-1)[0].replace(/。$/, ""))}</td></tr>`).join("")).join("");
    const sec = (y, id, cap) => `<figure class="nx-mini nx-di-mini"><a href="${BASE}/level/${id}.html" data-neuro="level:${id}">${diencSectionSVG(model, y, { scale: 5, label: cap })}</a><figcaption>${esc(cap)}</figcaption></figure>`;
    extra = `
        ${open3d("diencephalon")}
        <section class="nx-block">
          <h3>視丘各核的連結</h3>
          <div class="nx-table-wrap"><table class="nx-table">
            <thead><tr><th>核</th><th>類型</th><th>傳入</th><th>傳出</th><th>功能</th></tr></thead>
            <tbody>${thalRows}</tbody>
          </table></div>
          <p class="nx-note">依 Barr Table 11-1（p.182–183）與 Haines p.215–220 整理。除了網狀核，每一個核都投射到皮質，而且皮質會回送纖維到同一個核（Barr p.178）。</p>
        </section>
        <section class="nx-block">
          <h3>三層水平切面</h3>
          <div class="nx-minis">${sec(81, "dienc-caudal", "間腦下段（乳頭體、膝狀體）")}${sec(88.5, "thalamus", "視丘中段（VPL、VPM、VL）")}${sec(96, "internal-capsule", "內囊（前肢、膝部、後肢）")}</div>
          <p class="nx-note">後方在上、觀看者的左邊是病人右側（和腦幹切面同一個方向）。點圖看那一層。</p>
        </section>
        <section class="nx-block">
          <h3>內囊各段</h3>
          <div class="nx-table-wrap"><table class="nx-table">
            <thead><tr><th>段</th><th>位置</th><th>主要纖維</th></tr></thead>
            <tbody>
              <tr><td><span class="nx-colchip" style="--c:${DIg.ic.parts.anterior.color}">前肢</span></td><td>尾狀核頭與豆狀核之間</td><td>前視丘放射（背內側核 ↔ 前額葉、前核 → 扣帶迴）、額橋腦纖維</td></tr>
              <tr><td><span class="nx-colchip" style="--c:${DIg.ic.parts.genu.color}">膝部</span></td><td>豆狀核尖端內側、視丘前核外側</td><td>皮質延髓纖維；VA、VL → 運動區</td></tr>
              <tr><td><span class="nx-colchip" style="--c:${DIg.ic.parts.posterior.color}">後肢</span></td><td>視丘與豆狀核之間</td><td>皮質脊髓纖維（後半：上肢 → 軀幹 → 下肢由前往後）</td></tr>
              <tr><td><span class="nx-colchip" style="--c:${DIg.ic.parts["posterior-s"].color}">後肢後段</span></td><td>同上，更後面</td><td>體感覺放射（VPL、VPM → 中央後回）</td></tr>
              <tr><td><span class="nx-colchip" style="--c:${DIg.ic.parts.retro.color}">後豆狀部</span></td><td>豆狀核後方</td><td>視放射（外側膝狀體 → 距狀溝）、頂顳橋腦纖維、枕核 ↔ 聯合皮質</td></tr>
              <tr><td><span class="nx-colchip" style="--c:${DIg.ic.parts.sub.color}">豆狀核下部</span></td><td>豆狀核後部的下方</td><td>聽放射（內側膝狀體 → 顳橫回）、Meyer 環的視放射</td></tr>
            </tbody>
          </table></div>
          <p class="nx-note">每一段都有視丘皮質與皮質視丘纖維（Barr p.247, 253–255；Haines p.220）。後肢的小梗塞就能造成對側偏癱（${link("lesion:ic-lacunar")}）。</p>
        </section>
        <section class="nx-block">
          <h3>下視丘各核</h3>
          <div class="nx-table-wrap"><table class="nx-table">
            <thead><tr><th>區</th><th>核</th><th>區帶</th><th>功能</th></tr></thead>
            <tbody>${hypRows}</tbody>
          </table></div>
          <p class="nx-note">由前往後分視交叉區、結節區、乳頭區；以穹窿為界分內側區與外側區（Barr p.188；Haines p.220–221）。前下視丘刺激 → 副交感反應，後、外側 → 交感反應（Barr p.190）。</p>
        </section>
        <section class="nx-block">
          <h3>間腦的病灶</h3>
          <ul class="nx-inline">${data.lesions.order.filter((id) => LE[id].region === "diencephalon").map((id) => `<li>${link("lesion:" + id)}</li>`).join("")}</ul>
          <p>也和間腦有關：${link("lesion:parinaud")}（松果腺腫瘤壓迫頂蓋）、${link("lesion:optic-tract")}（前脈絡膜動脈）、${link("tract:hypothalamospinal", "下視丘脊髓徑受損的 Horner 症候群")}。</p>
        </section>`;
  } else if (rid === "basal-ganglia") {
    const nt = ["caudate", "putamen", "nucleus-accumbens", "gpe", "gpi", "subthalamic", "snc", "snr"].map((id) => `<tr><td>${link("structure:" + id)}</td><td>${esc(ST[id].bg.nt)}</td><td>${esc(ST[id].bg.role)}</td></tr>`).join("");
    const cond = (c) => `<figure class="nx-bg-card nx-bg-mini">${circuitSVG(BGD, { cond: c.id, label: "基底核迴路：" + c.zh })}<figcaption><b>${esc(c.zh)}</b>：${esc(bgCompare(BGD, c.knock).motorZh)}${c.lesion ? `（${link("lesion:" + c.lesion)}）` : ""}</figcaption></figure>`;
    const sec = (y, id, cap) => `<figure class="nx-mini nx-di-mini"><a href="${BASE}/level/${id}.html" data-neuro="level:${id}">${brainSectionSVG(model, y, { scale: y > 80 ? 5 : 9, label: cap })}</a><figcaption>${esc(cap)}</figcaption></figure>`;
    const B2 = BGD.bundles;
    extra = `
        ${open3d("basal-ganglia")}
        <section class="nx-block">
          <h3>直接路徑與間接路徑</h3>
          <div class="nx-bg-grid">${BGD.circuit.conditions.map(cond).join("")}</div>
          ${circuitLegend()}
          <p class="nx-note">迴路圖是依 Barr Fig. 12-6 與 Haines Fig. 26.10–26.14 的興奮／抑制關係，由程式推導各核的活性變化；權重只是為了讓方向正確，數值沒有生理意義。</p>
        </section>
        <section class="nx-block">
          <h3>兩條路徑的比較</h3>
          <div class="nx-table-wrap"><table class="nx-table">
            <thead><tr><th></th><th>${link("tract:bg-direct", "直接路徑")}</th><th>${link("tract:bg-indirect", "間接路徑")}</th></tr></thead>
            <tbody>
              <tr><th>紋狀體神經元</th><td>GABA＋P 物質，D1 受體</td><td>GABA＋腦啡肽，D2 受體</td></tr>
              <tr><th>路線</th><td>紋狀體 ─抑制→ 蒼白球內節 ─抑制→ 視丘</td><td>紋狀體 ─抑制→ 外節 ─抑制→ 視丘下核 ─興奮→ 內節 ─抑制→ 視丘</td></tr>
              <tr><th>對視丘 VA、VL</th><td>去抑制（更活躍）</td><td>抑制得更多</td></tr>
              <tr><th>對動作</th><td>促進想要的動作</td><td>壓住不想要的動作</td></tr>
              <tr><th>多巴胺（黑質緻密部）</th><td>興奮（D1）</td><td>抑制（D2）</td></tr>
              <tr><th>這條路徑變弱時</th><td>動作減少（Parkinson）</td><td>動作過多（Huntington 早期、偏身投擲症）</td></tr>
            </tbody>
          </table></div>
          <p class="nx-note">依 Barr p.208–209、Haines p.383–389 整理。多巴胺對兩條路徑的作用相反，但結果都讓視丘更活躍、促進動作。</p>
        </section>
        <section class="nx-block">
          <h3>各核的神經傳導物質</h3>
          <div class="nx-table-wrap"><table class="nx-table">
            <thead><tr><th>核</th><th>神經傳導物質</th><th>角色</th></tr></thead>
            <tbody>${nt}</tbody>
          </table></div>
          <p class="nx-note">皮質到紋狀體、視丘下核的纖維與視丘皮質纖維都是麩胺酸（興奮）；紋狀體、蒼白球、黑質網狀部的投射都是 GABA（抑制）（Barr p.207–208）。</p>
        </section>
        <section class="nx-block">
          <h3>纖維束與 Forel 區</h3>
          <ul>${Object.entries(B2).filter(([k]) => k !== "_doc").map(([, b]) => `<li><b>${esc(b.zh)}</b>：${esc(b.text)}</li>`).join("")}</ul>
          <p class="nx-note">Barr p.207–208；Haines p.381–384（Fig. 26.8–26.9）。視丘束（H1）裡同時也有齒狀核到 VL 的小腦纖維。</p>
        </section>
        <section class="nx-block">
          <h3>切面</h3>
          <div class="nx-minis">${sec(70, "midbrain", "中腦（黑質、紅核）")}${sec(81, "dienc-caudal", "間腦下段（視丘下核）")}${sec(93.5, "basal-ganglia", "基底核（尾狀核頭、豆狀核）")}</div>
          <p class="nx-note">後方在上、觀看者的左邊是病人右側。點圖看那一層。</p>
        </section>
        <section class="nx-block">
          <h3>基底核的病灶</h3>
          <ul class="nx-inline">${data.lesions.order.filter((id) => LE[id].region === "basal-ganglia" || (LE[id].alsoIn || []).includes("basal-ganglia")).map((id) => `<li>${link("lesion:" + id)}</li>`).join("")}</ul>
          <p>基底核受損不會癱瘓；癱瘓要想到內囊（${link("lesion:ic-lacunar")}）。</p>
        </section>`;
  } else if (rid === "auditory") {
    const row = (lid, where) => {
      const loss = auditoryLoss(model, LE[lid].zones), hs = hearingSummary(loss);
      const ear = (h) => h.deaf ? '<td class="is-bad">聽不到</td>' : h.cut ? '<td class="is-ok">聽得到</td>' : '<td class="is-ok">正常</td>';
      return `<tr><td>${link("lesion:" + lid)}</td><td>${esc(where)}</td>${ear(hs[0])}${ear(hs[1])}<td>${loss.vest.R || loss.vest.L ? "有（眩暈、眼震，往患側倒）" : "—"}</td></tr>`;
    };
    extra = `
        ${open3d("auditory")}
        <section class="nx-block">
          <h3>兩耳到兩側皮質</h3>
          ${audFigure({ label: "聽覺路線圖" })}
        </section>
        <section class="nx-block">
          <h3>病灶在哪裡，才會單耳全聾？</h3>
          <div class="nx-table-wrap"><table class="nx-table">
            <thead><tr><th>病灶</th><th>位置</th><th>右耳</th><th>左耳</th><th>前庭症狀</th></tr></thead>
            <tbody>
              ${row("labyrinthine-artery", "右側內耳")}
              ${row("acoustic-neuroma", "右側內耳道（前庭耳蝸神經）")}
              ${row("lateral-lemniscus", "右側外側蹄系（耳蝸神經核以上）")}
              ${row("auditory-cortex", "右側顳橫回")}
            </tbody>
          </table></div>
          <p class="nx-note">規則：耳蝸神經核（含）以下的病灶 → 同側耳聾；以上的單側病灶 → 兩耳都聽得到，只影響對側聲音方向的判斷（Barr p.321, 330；Haines p.312）。</p>
        </section>
        <section class="nx-block">
          <h3>前庭核的四個出口</h3>
          <div class="nx-table-wrap"><table class="nx-table">
            <thead><tr><th>到哪裡</th><th>路徑</th><th>功能</th></tr></thead>
            <tbody>
              <tr><td>小腦</td><td>${link("tract:vestibulocerebellar")}（下小腦腳的近繩狀體）</td><td>平衡、頭眼協調</td></tr>
              <tr><td>眼動神經核（III、IV、VI）</td><td>${link("tract:vor")}（內側縱束上行）</td><td>頭動時穩定視線</td></tr>
              <tr><td>脊髓</td><td>${link("tract:lvst")}（同側，全長）、${link("tract:mvst")}（MLF 下行，只到頸髓）</td><td>姿勢、伸肌張力；頭頸位置</td></tr>
              <tr><td>視丘 → 皮質</td><td>${link("tract:vestibulothalamic")}</td><td>意識到頭的位置與動作</td></tr>
            </tbody>
          </table></div>
          <p class="nx-note">依 Barr p.333, 337–339、Haines p.327–333 整理。</p>
        </section>
        <section class="nx-block">
          <h3>聽覺與前庭的病灶</h3>
          <ul class="nx-inline">${data.lesions.order.filter((id) => LE[id].region === "auditory").map((id) => `<li>${link("lesion:" + id)}</li>`).join("")}</ul>
          <p>也有前庭症狀：${link("lesion:lateral-medullary")}（前庭神經核）、${link("lesion:cb-flocculonodular")}（前庭小腦）；和 MLF 有關：${link("lesion:ino")}。</p>
        </section>`;
  } else if (rid === "visual") {
    extra = `
        ${open3d("visual")}
        <section class="nx-block">
          <h3>路線與視野</h3>
          ${visualFigure({ pupil: true })}
        </section>
        <section class="nx-block">
          <h3>視野缺損與瞳孔異常</h3>
          <ul class="nx-inline">${data.lesions.order.filter((id) => LE[id].region === "visual").map((id) => `<li>${link("lesion:" + id)}</li>`).join("")}</ul>
          <p>也和視覺有關：${link("lesion:parinaud")}（光—近反射分離＋向上注視麻痺）、${link("nerve:cn3")}、${link("tract:hypothalamospinal", "Horner 症候群（交感）")}。</p>
        </section>`;
  }
  const levels = rid === "spinal-cord"
    ? `<section class="nx-block"><h3>各節段</h3><ul class="nx-seglist">${model.segs.map((s) => `<li>${link("level:" + s.id, s.name)}</li>`).join("")}</ul></section>`
    : "";
  const brainLv = { brainstem: data.levels.brainLevels.filter((b) => b.y < 80).map((b) => b.id), diencephalon: ["dienc-caudal", "thalamus", "internal-capsule"], "basal-ganglia": ["midbrain", "dienc-caudal", "basal-ganglia", "internal-capsule"], cortex: ["cortex"], cerebellum: [], visual: [], auditory: ["med-rostral", "pons-caudal", "pons", "midbrain-ic", "thalamus"] }[rid];
  const blv = brainLv && brainLv.length ? `<section class="nx-block"><h3>切面</h3><p>${brainLv.map((id) => link("level:" + id)).join("、")}</p></section>` : "";
  const structs = Object.entries(ST).filter(([, s]) => s.region === rid).map(([id]) => link("structure:" + id));
  const tracts = data.tracts.order.filter((tid) => rid === "brainstem" ? TR[tid].bundles.some((b) => b.brain)
    : rid === "spinal-cord" ? TR[tid].bundles.some((b) => b.phi)
      : rid === "cerebellum" ? TR[tid].kind === "cerebellar" || !!CB_HL[tid]
      : rid === "visual" ? isVisualTract(tid)
      : rid === "basal-ganglia" ? TR[tid].kind === "basal" || tid === "dentatothalamic"
      : rid === "diencephalon" ? TR[tid].kind === "diencephalon" || /^(dcml|als|trigeminal|dentatothalamic|visual|auditory|vestibulothalamic|lcst|cbt|hypothalamospinal)$/.test(tid)
      : rid === "auditory" ? /^(auditory|vestibular)$/.test(TR[tid].kind) || /^(lvst|mvst|vestibulocerebellar|mlf-gaze)$/.test(tid) : !isVisualTract(tid)).map((tid) => link("tract:" + tid));
  const body = `
      <article class="nx-entity">
        <header class="nx-head">
          <p class="nx-type">區域${r.status !== "ready" ? '・<span class="nx-soon">持續擴充中</span>' : ""}</p>
          <h2>${esc(r.zh)}</h2>
          <p class="nx-en">${esc(r.en)}</p>
          <p class="guide-lead">${rich(r.summary)}</p>
        </header>
        ${extra}
        ${r.facts.length ? `<section class="nx-block"><h3>重點</h3><ul>${r.facts.map((f) => `<li>${rich(f)}</li>`).join("")}</ul></section>` : ""}
        ${levels}${blv}
        ${structs.length ? `<section class="nx-block"><h3>結構</h3><p>${structs.join("、")}</p></section>` : ""}
        <section class="nx-block"><h3>傳導路徑</h3><p>${tracts.join("、")}</p></section>
        <section class="nx-block"><h3>資料來源</h3>${srcList(r.sources)}</section>
        ${BACKLINK_SLOT}
      </article>`;
  return shell({
    title: r.zh,
    description: `${r.zh}：${r.summary}`, body, tab: "",
    crumbs: [["區域"], [r.zh]]
  });
}

/* ---------------- 腦神經 ---------------- */
function colChips(n) {
  return [...new Set(n.components.map((c) => c.col))].map((c) => `<span class="nx-colchip" style="--c:${COLS[c].color}" title="${esc(COLS[c].zh)}">${c}</span>`).join(" ");
}
function nerveTable() {
  const rows = data.nerves.order.map((id) => {
    const n = NV[id];
    const nuclei = [...new Set(n.components.map((c) => c.nucleus))].map((sid) => link("structure:" + sid)).join("、");
    return `<tr>
              <td><b>${n.num}</b> ${link("nerve:" + id, n.zh)} ${stars(n.highYield)}<br><span class="nx-en">${esc(n.en)}</span></td>
              <td>${colChips(n)}</td>
              <td>${nuclei}</td>
              <td>${esc(n.special ? "不經腦幹（視交叉 → 視神經徑 → 外側膝狀核）" : n.exit)}<br><span class="nx-en">${esc(n.foramen)}</span></td>
              <td>${rich(n.lesion[0])}</td>
            </tr>`;
  }).join("");
  return `<table class="nx-table">
            <thead><tr><th>腦神經</th><th>功能分類</th><th>神經核</th><th>出腦幹／出顱</th><th>受損時</th></tr></thead>
            <tbody>
            <tr class="nx-muted"><td><b>I</b> 嗅神經<br><span class="nx-en">Olfactory nerve</span></td><td>SVA</td><td>嗅球（不經腦幹）</td><td>篩板</td><td>之後的嗅覺單元再補</td></tr>
            ${rows}</tbody>
          </table>`;
}
function nervePage(id) {
  const n = NV[id];
  const comps = n.components.map((c) => `<tr><td><span class="nx-colchip" style="--c:${COLS[c.col].color}">${c.col}</span><br><span class="nx-en">${esc(COLS[c.col].zh)}</span></td><td>${link("structure:" + c.nucleus)}</td><td>${rich(c.fn)}</td></tr>`).join("");
  const lv = data.levels.brainLevels.find((b) => b.id === n.exitLevel);
  const nucIds = [...new Set(n.components.map((c) => c.nucleus))].filter((sid) => ST[sid].nuc);
  const figs = [];
  if (lv) figs.push(`<figure class="nx-mini nx-mini-l"><a href="${BASE}/level/${lv.id}.html" data-neuro="level:${lv.id}">${brainSectionSVG(model, lv.y, { scale: 8, nerve: id, labels: false, label: lv.name })}</a><figcaption>${esc(lv.name)}</figcaption></figure>`);
  nucIds.slice(0, 3).forEach((sid) => {
    const ys = ST[sid].nuc.map((w) => w[0]), y = (Math.min(...ys) + Math.max(...ys)) / 2;
    if (lv && Math.abs(lv.y - y) < 3) return;
    figs.push(`<figure class="nx-mini nx-mini-l"><a href="${BASE}/structure/${sid}.html" data-neuro="structure:${sid}">${brainSectionSVG(model, y, { scale: 8, nucleus: sid, nerve: id, labels: false, label: ST[sid].zh })}</a><figcaption>${esc(ST[sid].zh)}</figcaption></figure>`);
  });
  const visN = n.special === "visual";
  const body = `
      <article class="nx-entity">
        <header class="nx-head" style="--c:#d98b1f">
          <p class="nx-type">腦神經 ${n.num} ${stars(n.highYield)}</p>
          <h2>${esc(n.zh)} <span class="nx-abbr">CN ${n.num}</span></h2>
          <p class="nx-en">${esc(n.en)}</p>
          <p class="guide-lead">${rich(n.summary)}</p>
        </header>

        ${viewerBlock(visN ? { mode: "nerve", nerve: id, compact: "1", engine: "visual" } : { mode: "nerve", nerve: id, compact: "1" })}
        ${open3d(visN ? "visual" : "brainstem", visN ? "" : "&amp;nerve=" + id, "在完整 3D 中開啟 →")}

        <section class="nx-block">
          <h3>組成</h3>
          <div class="nx-table-wrap"><table class="nx-table nx-table-s">
            <thead><tr><th>功能分類</th><th>神經核</th><th>支配／功能</th></tr></thead>
            <tbody>${comps}</tbody>
          </table></div>
        </section>

        <div class="nx-grid">
          <section class="nx-block">
            <h3>${visN ? "走向、出顱" : "出腦幹、出顱"}</h3>
            <p>${esc(n.exit)}${lv ? `（${link("level:" + lv.id)}）` : ""}</p>
            <p>出顱：${esc(n.foramen)}</p>
          </section>
          <section class="nx-block">
            <h3>其他名稱</h3>
            <ul class="nx-chips">${n.aliases.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
          </section>
        </div>

        <section class="nx-block">
          <h3>走向</h3>
          <p>${rich(n.course)}</p>
          ${visN ? visualFigure({ pupil: true }) : figs.length ? `<div class="nx-minis">${figs.join("")}</div>` : ""}
        </section>

        <section class="nx-block">
          <h3>受損時</h3>
          <ul>${n.lesion.map((x) => `<li>${rich(x)}</li>`).join("")}</ul>
          ${n.umn ? `<p><b>上運動神經元（皮質延髓投射）：</b>${rich(n.umn)}</p>` : ""}
          ${n.syndromes.length ? `<p>相關症候群：${n.syndromes.map((l) => link("lesion:" + l)).join("、")}</p>` : ""}
        </section>

        <section class="nx-block">
          <h3>資料來源</h3>
          ${srcList(n.sources)}
        </section>
        ${BACKLINK_SLOT}
      </article>`;
  return shell({
    title: `${n.zh}（CN ${n.num}）`, description: `${n.zh}（${n.en}）：${n.summary}`, body, tab: "nerves", three: true,
    crumbs: [["腦神經", `${BASE}/nerves.html`], [n.zh]], scripts: [viewerScript(visN ? "visual" : "")]
  });
}
function nervesListPage() {
  const cols = Object.entries(COLS).map(([k, c]) => `<li><span class="nx-colchip" style="--c:${c.color}">${k}</span> ${esc(c.zh)}：${esc(c.note)}</li>`).join("");
  const body = `
      <h2>腦神經</h2>
      <p class="guide-lead">II 到 XII 對腦神經的神經核、功能分類、出腦幹與出顱的位置，以及受損時的表現。神經核在腦幹裡排成幾條縱向的「柱」：越靠中線是運動，越外側是感覺。視神經（II）不經過腦幹，在<a href="${BASE}/region/visual.html">視覺單元</a>裡。</p>
      <section class="nx-block">
        <div class="nx-table-wrap">${nerveTable()}</div>
      </section>
      <section class="nx-block">
        <h3>功能分類（顏色）</h3>
        <ul>${cols}</ul>
        <p class="nx-note">Haines 改用 SE／VE／SA／VA 四類（把鰓弓運動歸為 SE），本站沿用國考與共筆常用的七類寫法（Haines p.195–197）。</p>
      </section>
      <section class="nx-block">
        <h3>3D</h3>
        <p><a class="btn-outline nx-btn" href="${BASE}/3d.html?region=brainstem">打開 3D 腦幹 →</a></p>
      </section>`;
  return shell({ title: "腦神經（II–XII）", description: "腦神經 II–XII 的神經核、功能分類、出腦幹位置與受損表現對照表。", body, tab: "nerves" });
}

/* ---------------- 列表頁 ---------------- */
function tractsListPage() {
  const rows = data.tracts.groups.map((g) => `
        <section class="nx-block">
          <h3>${g.name}</h3>
          <div class="nx-table-wrap"><table class="nx-table">
            <thead><tr><th>路徑</th><th>其他名稱</th><th>第 1 級 → 終點</th><th>交叉</th><th>常考</th></tr></thead>
            <tbody>${g.tracts.map((tid) => {
              const t = TR[tid];
              const first = t.neurons[0], last = t.neurons[t.neurons.length - 1];
              return `<tr>
              <td><i class="nx-dot" style="background:${t.color}"></i>${link("tract:" + tid)}<br><span class="nx-en">${esc(t.en)}</span></td>
              <td class="nx-aliases">${t.aliases.slice(0, 6).map(esc).join("、")}</td>
              <td>${rich(first.soma)} → ${rich(last.synapse)}</td>
              <td>${rich(t.decussation.text.split("。")[0])}</td>
              <td>${stars(t.highYield)}</td>
            </tr>`;
            }).join("")}</tbody>
          </table></div>
        </section>`).join("");
  const body = `
      <h2>傳導路徑名稱對照表</h2>
      <p class="guide-lead">同一條路徑在不同課本、共筆裡常常有不同的名字。這張表把正式名稱、常見別名、起點、終點與交叉位置放在一起；點名稱可以看完整的神經元鏈與 3D 路線。</p>
      <section class="nx-block"><h3>顏色</h3><p>同一類路徑用同一個色系、不同深淺；3D、切面與各頁的圖例都用同一套顏色。</p>${famLegend()}</section>
      ${rows}`;
  return shell({ title: "傳導路徑名稱對照表", description: "脊髓傳導路徑的中英文名稱、別名、起點、終點與交叉位置對照。", body, tab: "tracts" });
}
function levelsListPage() {
  const cells = model.segs.map((s) => `<a class="nx-thumb" href="${BASE}/level/${s.id}.html" data-neuro="level:${s.id}">${sectionSVG(model, s.id, { scale: 9, labels: false, detail: "low", label: s.name })}<span>${s.name}</span></a>`).join("");
  const brain = data.levels.brainLevels.map((b) => `<li>${link("level:" + b.id)}</li>`).join("");
  const body = `
      <h2>各節段切面</h2>
      <p class="guide-lead">脊髓 31 個節段的橫切面，可以看到灰質形狀怎麼隨節段改變（頸膨大、胸髓的側角與 Clarke 核、腰薦膨大），以及每一條路徑從哪一節開始出現。</p>
      <section class="nx-block"><h3>腦部切面</h3><ul class="nx-inline">${brain}</ul></section>
      <section class="nx-block"><h3>脊髓</h3><div class="nx-thumbs">${cells}</div></section>`;
  return shell({ title: "各節段切面", description: "脊髓 31 個節段的橫切面與傳導路徑位置。", body, tab: "levels" });
}
/** 視覺病灶的位置名稱。 */
function visWhere(lid, zb) {
  const side = zb.side === "both" ? "" : zb.side === "R" ? "右" : "左";
  const name = { "optic-nerve": "視神經", junctional: "視神經與視交叉交界", chiasm: "視交叉正中", "lateral-chiasm": "視交叉外側", "optic-tract": "視神經徑",
    "meyer-loop": "顳葉（Meyer 環）", "parietal-radiation": "頂葉的視放射", occipital: "枕葉距狀溝", "occipital-pole": "枕葉後端",
    "cn3-compression": "動眼神經（蛛網膜下腔）", adie: "睫狀神經節", "argyll-robertson": "頂蓋前核（兩側）" }[lid] || "";
  return side ? `${side}側${name}` : name;
}
function lesionsListPage() {
  const row = (lid) => {
    const l = LE[lid];
    const d = deficits(model, l.zones).filter((x) => !x.minor);
    const z = l.zones[0];
    const where = LE[lid].region === "visual" ? visWhere(lid, z.brain)
      : LE[lid].region === "diencephalon" ? ({ "thalamic-syndrome": "右側視丘腹後核（VPL、VPM）", "ic-lacunar": "右側內囊後肢與膝部", hemiballismus: "右側視丘下核", korsakoff: "兩側乳頭體＋背內側核", craniopharyngioma: "鞍上（視交叉、垂體柄）" }[lid] || "")
      : LE[lid].region === "basal-ganglia" ? ({ parkinson: "兩側黑質緻密部", hemiparkinson: "右側黑質緻密部", huntington: "兩側尾狀核（紋狀體）", wilson: "兩側殼核（豆狀核）" }[lid] || "")
      : LE[lid].region === "auditory" ? ({ "acoustic-neuroma": "右側內耳道（前庭耳蝸神經）", "labyrinthine-artery": "右側內耳", "lateral-lemniscus": "右側外側蹄系（橋腦上段）", "auditory-cortex": "右側顳橫回" }[lid] || "")
      : LE[lid].region === "cerebellum" ? ({ "cb-hemisphere": "右側小腦半球＋齒狀核", "cb-vermis": "前葉蚓部（中線）", "cb-flocculonodular": "小結與第四腦室頂（中線）", scp: "右側上小腦腳（橋腦上段，交叉前）" }[lid] || "")
      : z.brain
      ? `${yName(z.brain.y[0])}${yName(z.brain.y[0]) !== yName(z.brain.y[1]) ? "–" + yName(z.brain.y[1]) : ""}（${z.brain.side === "both" ? "雙側" : z.brain.side === "R" ? "右" : "左"}）`
      : `${segName(z.segs[0])}${z.segs[0] !== z.segs[1] ? "–" + segName(z.segs[1]) : ""}（${z.side === "both" ? "雙側" : z.side === "R" ? "右" : "左"}）`;
    const vl = LE[lid].region === "visual" ? visualLoss(model, l.zones).lost : null;
    const vf = vl && (vl.R.length || vl.L.length) ? `<div class="nx-vf-mini">${fieldSVG(vl, { cells: VCELLS, sides: false, label: l.zh + " 的視野" })}</div>` : "";
    return `<tr>
              <td>${link("lesion:" + lid)} ${stars(l.highYield)}<br><span class="nx-en">${esc(l.en)}</span></td>
              <td>${esc(where)}${vf}</td>
              <td><ul class="nx-deficits">${d.map((x) => `<li>${esc(x.text)}</li>`).join("")}</ul></td>
            </tr>`;
  };
  const table = (region) => `<div class="nx-table-wrap"><table class="nx-table${region === "visual" ? " nx-table-vis" : ""}">
        <thead><tr><th>病灶</th><th>範例範圍</th><th>症狀</th></tr></thead>
        <tbody>${data.lesions.order.filter((id) => LE[id].region === region).map(row).join("")}</tbody>
      </table></div>`;
  const body = `
      <h2>常考病灶與症狀</h2>
      <p class="guide-lead">每一個病灶的症狀都是由「哪幾條路徑、神經核、腦神經纖維被切到，它們在哪裡交叉」自動推導出來的，並與教科書的描述比對過。表中是預設的範圍與側別；在 3D 模擬裡，脊髓半切、完全橫斷、前脊髓動脈症候群可以改節段。</p>
      <section class="nx-block"><h3>脊髓</h3>${table("spinal")}</section>
      <section class="nx-block"><h3>腦幹</h3>${table("brainstem")}
        <p class="nx-note">腦幹病灶的共同規則：腦神經（核或纖維）的症狀在病灶同側，已經交叉過的長路徑（皮質脊髓、內側蹄系、前外側系統）症狀在對側——所以叫「交叉性」偏癱或感覺缺損。</p>
      </section>
      <section class="nx-block"><h3>小腦</h3>${table("cerebellum")}
        <p class="nx-note">小腦的規則：病灶在哪一側，肢體症狀就在哪一側（交叉兩次）；中線的病灶影響軀幹、步態與平衡，兩側都受影響。上小腦腳交叉之後（中腦以上）的病灶症狀才在對側。</p>
      </section>
      <section class="nx-block"><h3>間腦</h3>${table("diencephalon")}
        <p class="nx-note">間腦與內囊的病灶，症狀大多在對側（內囊、視丘、視丘下核）；中線結構（乳頭體、垂體柄）的病灶兩側都受影響。</p>
      </section>
      <section class="nx-block"><h3>基底核</h3>${table("basal-ganglia")}
        <p class="nx-note">基底核的迴路不交叉，最後經皮質脊髓徑交叉，所以單側病灶的症狀在對側。基底核受損不會癱瘓：動作太少（Parkinson）或太多（舞蹈症、投擲症）。偏身投擲症（視丘下核）列在間腦。</p>
      </section>
      <section class="nx-block"><h3>聽覺與前庭</h3>${table("auditory")}
        <p class="nx-note">聽覺的規則：耳蝸神經核（含）以下的病灶造成同側耳聾；以上的單側病灶兩耳都還聽得到（聽覺雙側上傳），只影響聲音方向的判斷。</p>
      </section>
      <section class="nx-block"><h3>視覺路徑與瞳孔</h3>${table("visual")}
        <p class="nx-note">視野圖畫成病人看出去的樣子（左眼在左、右眼在右），黑色是看不到的部分。視交叉以前的病灶只影響一眼；視交叉是雙顳側；視交叉以後都是對側的同側偏盲。</p>
      </section>`;
  return shell({ title: "常考病灶與症狀", description: "常考的脊髓病灶、腦幹症候群、小腦、間腦與基底核病灶、聽覺與前庭病灶、視野缺損與瞳孔異常的範圍與症狀。", body, tab: "lesions" });
}
function indexPage() {
  const regions = data.regions.order.map((rid) => {
    const r = RG[rid];
    return `<a class="guide-card" href="${BASE}/region/${rid}.html">
            <div>
              <p class="guide-card-title">${esc(r.zh)} ${r.status === "ready" ? "" : '<span class="nx-soon">擴充中</span>'}</p>
              <p class="guide-card-desc">${esc(r.summary.replace(/\[\[[^|\]]+\|?([^\]]*)\]\]/g, "$1"))}</p>
              <span class="guide-card-more">查看 →</span>
            </div>
          </a>`;
  }).join("");
  const groups = famLegend() + data.tracts.groups.map((g) => `<div class="nx-group"><h4>${g.name}</h4><ul class="nx-legend">${g.tracts.map((tid) => `<li><i style="background:${TR[tid].color}"></i>${link("tract:" + tid)}${TR[tid].abbr ? ` <span class="nx-en">${esc(TR[tid].abbr)}</span>` : ""}</li>`).join("")}</ul></div>`).join("");
  const lesions = (region) => data.lesions.order.filter((lid) => LE[lid].region === region).map((lid) => `<li>${link("lesion:" + lid)}</li>`).join("");
  const nerves = data.nerves.order.map((id) => `<li>${link("nerve:" + id, NV[id].num + " " + NV[id].zh)}</li>`).join("");
  const body = `
      <h2>神經解剖學：傳導路徑</h2>
      <p class="guide-lead">把常考的傳導路徑與腦神經做成可以旋轉的 3D 模型：每一條路徑從哪裡出發、在哪一個節段走在哪個位置、在哪裡交叉、在哪裡換站，都可以一路跟著看。目前有脊髓、腦幹與腦神經、小腦、間腦（視丘各核與內囊）、基底核（直接與間接路徑）、視覺路徑與瞳孔反射、聽覺與前庭七個單元，之後會陸續加上邊緣系統與大腦皮質。</p>

      <div class="nx-search">
        <label for="nx-q">查名稱（中文、英文、縮寫都可以）</label>
        <input id="nx-q" type="search" placeholder="例如：DCML、脊髓丘腦、pyramidal、Wallenberg、顏面神經、Meyer、外側蹄系、聽神經瘤" autocomplete="off">
        <ul class="nx-results" id="nx-results" hidden></ul>
      </div>

      <p class="nx-open3d"><a class="btn-outline nx-btn" href="${BASE}/3d.html">開啟 3D 模型 →</a></p>

      <section class="nx-block">
        <h3>區域</h3>
        <div class="guide-cards">${regions}</div>
      </section>
      <section class="nx-block">
        <h3>傳導路徑</h3>
        <div class="nx-groups">${groups}</div>
        <p><a href="${BASE}/tracts.html">名稱對照表 →</a></p>
      </section>
      <section class="nx-block">
        <h3>腦神經</h3>
        <ul class="nx-inline">${nerves}</ul>
        <p><a href="${BASE}/nerves.html">腦神經對照表 →</a></p>
      </section>
      <section class="nx-block">
        <h3>常考病灶</h3>
        <h4>脊髓</h4>
        <ul class="nx-inline">${lesions("spinal")}</ul>
        <h4>腦幹</h4>
        <ul class="nx-inline">${lesions("brainstem")}</ul>
        <h4>小腦</h4>
        <ul class="nx-inline">${lesions("cerebellum")}</ul>
        <h4>間腦</h4>
        <ul class="nx-inline">${lesions("diencephalon")}</ul>
        <h4>基底核</h4>
        <ul class="nx-inline">${lesions("basal-ganglia")}</ul>
        <h4>聽覺與前庭</h4>
        <ul class="nx-inline">${lesions("auditory")}</ul>
        <h4>視覺路徑與瞳孔</h4>
        <ul class="nx-inline">${lesions("visual")}</ul>
      </section>
      <section class="nx-block">
        <h3>關於這個單元</h3>
        <ul>
          <li>內容以醫師國考指定用書 Barr's The Human Nervous System 與 Haines Fundamental Neuroscience 為主，並對照 Haines Atlas、Noback、High-Yield、BRS 與醫學系共筆。每一頁底下都列出教科書的頁碼；課本之間說法不同的地方會兩種都寫。</li>
          <li>3D 模型與所有切面都是本站依課本描述，用程式自行繪製的示意圖，形狀與比例不是真實測量資料。之後會逐步換成開放的真實解剖資料（例如 Spinal Cord Toolbox 的 PAM50 脊髓白質圖譜）。</li>
          <li>滑鼠移到任何一個連結上，會先跳出簡介；手機上點第一下看簡介，再點「前往」。</li>
          <li>本單元僅供學習使用，不能取代正式教科書。3D 繪圖使用 <a href="https://threejs.org/" rel="noopener">three.js</a>（MIT License）。</li>
        </ul>
      </section>`;
  return shell({ title: "神經解剖學：傳導路徑 3D", description: "3D 互動脊髓、腦幹、腦神經、小腦、間腦、基底核、視覺與聽覺前庭路徑：每一條 tract 在各節段的位置、交叉與換站，腦神經核的位置，並可模擬常考的脊髓、腦幹病灶、Parkinson 病、視野缺損與聽力喪失。", body, tab: "index", scripts: ["/assets/js/neuro/page.js"] });
}

/* ---------------- 預覽索引 ---------------- */
function plain(text) { return String(text || "").replace(/\[\[[a-z]+:[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/\[\[([a-z]+):([a-z0-9-]+)\]\]/g, (m, t, id) => entities[t + ":" + id]?.zh || id); }
function miniTractSVG(tid) {
  // 預覽卡片用：只畫輪廓、灰質與這一條路徑
  const t = TR[tid];
  const seg = ["c7", "t6", "l4"].find((sid) => t.bundles.some((b) => b.phi && model.present(b, model.segIdx[sid] + 0.5)));
  if (!seg) return "";
  const pos = model.segIdx[seg] + 0.5, k = 8;
  const P = (pts) => pts.map((p, i) => (i ? "L" : "M") + (p.x * k).toFixed(1) + " " + (p.z * k).toFixed(1)).join("") + "Z";
  let s = `<svg viewBox="${-7.5 * k} ${-5.2 * k} ${15 * k} ${10.4 * k}" class="nx-pv-svg"><path class="nx-wm" d="${P(model.outlineRing(pos, 64))}"/><path class="nx-gm" d="${P(model.grayRing(pos, 120))}"/>`;
  t.bundles.forEach((b) => {
    const rg = b.phi && model.region(b, pos);
    if (!rg) return;
    [-1, 1].forEach((side) => { s += `<path fill="${t.color}" d="${P(model.regionRing(rg, side, 5))}"/>`; });
  });
  return s + `<text x="${-7 * k}" y="${4.8 * k}" class="nx-pv-seg">${segName(seg)}</text></svg>`;
}
function buildIndex() {
  const out = {};
  Object.entries(entities).forEach(([key, e]) => {
    const o = { t: e.type, u: e.url, zh: e.zh, en: e.en };
    if (e.abbr) o.ab = e.abbr;
    if (e.aliases) o.al = e.aliases;
    if (e.summary) o.s = plain(e.summary);
    if (e.highYield) o.hy = e.highYield;
    if (e.type === "nerve") {
      const n = NV[e.id];
      o.ch = [...new Set(n.components.map((c) => ST[c.nucleus].zh))];
      o.x = (n.special ? "走向：" : "出腦幹：") + n.exit;
    }
    if (e.type === "tract") {
      const t = TR[e.id];
      o.c = t.color;
      o.k = t.kind;
      o.ch = t.neurons.map((n) => plain(n.soma).replace(/（.*?）/g, "")).concat([plain(t.neurons[t.neurons.length - 1].synapse).replace(/（.*?）/g, "")]);
      o.x = plain(t.decussation.text).split("。")[0];
      o.svg = miniTractSVG(e.id);
    }
    out[key] = o;
  });
  return out;
}

/* ---------------- 輸出 ---------------- */
addPage(`${BASE}/index.html`, null, "神經解剖學", indexPage);
addPage(`${BASE}/3d.html`, null, "3D 模型", hubPage);
addPage(`${BASE}/tracts.html`, null, "傳導路徑名稱對照表", tractsListPage);
addPage(`${BASE}/levels.html`, null, "各節段切面", levelsListPage);
addPage(`${BASE}/lesions.html`, null, "常考病灶與症狀", lesionsListPage);
addPage(`${BASE}/nerves.html`, null, "腦神經", nervesListPage);
data.nerves.order.forEach((id) => addPage(entities["nerve:" + id].url, "nerve:" + id, NV[id].zh, () => nervePage(id)));
data.tracts.order.forEach((id) => addPage(entities["tract:" + id].url, "tract:" + id, TR[id].zh, () => tractPage(id)));
Object.keys(ST).forEach((id) => addPage(entities["structure:" + id].url, "structure:" + id, ST[id].zh, () => structurePage(id)));
model.segs.forEach((s) => addPage(entities["level:" + s.id].url, "level:" + s.id, s.name + " 節段", () => levelPage(s)));
data.levels.brainLevels.forEach((b, i) => addPage(entities["level:" + b.id].url, "level:" + b.id, b.name, () => brainLevelPage(b, i)));
data.lesions.order.forEach((id) => addPage(entities["lesion:" + id].url, "lesion:" + id, LE[id].zh, () => lesionPage(id)));
data.regions.order.forEach((id) => addPage(entities["region:" + id].url, "region:" + id, RG[id].zh, () => regionPage(id)));

// 第一輪：產生內容並收集反向連結；第二輪：填入反向連結
const rendered = pages.map((p) => { currentPage = p; return { p, html: p.render() }; });
currentPage = null;

await rm(OUT, { recursive: true, force: true });
for (const { p, html } of rendered) {
  const file = path.join(ROOT, p.url);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html.replace(BACKLINK_SLOT, p.key ? backlinksBlock(p.key) : ""));
}
await writeFile(path.join(DATA, "neuro-index.json"), JSON.stringify(buildIndex()));
console.log(`神經解剖學：產生 ${rendered.length} 頁，索引 ${Object.keys(entities).length} 個實體。`);
