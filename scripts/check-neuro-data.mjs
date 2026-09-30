#!/usr/bin/env node
/**
 * check-neuro-data.mjs
 *
 * 檢查神經解剖學資料（assets/data/neuro/*.json）與產生的頁面：
 *   1. 所有 [[type:id]] 連結都指向存在的實體；產生的頁面裡的站內連結都有對應檔案
 *   2. 每條路徑在它出現的節段都連續、範圍合理（φ、r 由小到大，不超出白質）
 *   3. 交叉：代表纖維的起點、終點落在教科書說的那一側（例如 DCML 在脊髓同側、到視丘在對側）
 *   4. 來源：每條路徑至少兩本英文教科書（其中一本是 Barr's 或 Haines）＋一份中文講義或共筆
 *   5. 病灶：由路徑推導出的症狀與 lesions.json 的 expect 一致
 *
 *   node scripts/check-neuro-data.mjs
 *
 * 有任何錯誤就以非零代碼結束；只是提醒的項目會列成 warning。
 */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModel } from "../assets/js/neuro/geometry.js";
import { deficits, deficitKeys } from "../assets/js/neuro/lesion.js";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const J = async (f) => JSON.parse(await readFile(path.join(ROOT, "assets/data/neuro", f + ".json"), "utf8"));
const data = { levels: await J("levels"), tracts: await J("tracts"), structures: await J("structures"), lesions: await J("lesions"), regions: await J("regions"), sources: await J("sources"), nerves: await J("nerves"), visual: await J("visual"), auditory: await J("auditory"), diencephalon: await J("diencephalon"), basal: await J("basal") };
const model = createModel(data);
const TR = data.tracts.tracts;
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

/* 1. 連結 */
const keys = new Set();
Object.keys(TR).forEach((id) => keys.add("tract:" + id));
Object.keys(data.structures.structures).forEach((id) => keys.add("structure:" + id));
Object.keys(data.lesions.lesions).forEach((id) => keys.add("lesion:" + id));
Object.keys(data.regions.regions).forEach((id) => keys.add("region:" + id));
data.levels.segments.forEach((s) => keys.add("level:" + s.id));
data.levels.brainLevels.forEach((b) => keys.add("level:" + b.id));
Object.keys(data.nerves.nerves).forEach((id) => keys.add("nerve:" + id));
for (const f of ["tracts", "structures", "lesions", "regions", "levels", "nerves"]) {
  const text = JSON.stringify(data[f], (k, v) => (k === "_doc" ? undefined : v));
  for (const m of text.matchAll(/\[\[([a-z]+):([a-z0-9-]+)(?:\|[^\]]*)?\]\]/g)) {
    if (!keys.has(m[1] + ":" + m[2])) err(`${f}.json：連結 [[${m[1]}:${m[2]}]] 指向不存在的實體`);
  }
}
for (const [id, t] of Object.entries(TR)) {
  t.lesions.forEach((l) => { if (!keys.has("lesion:" + l)) err(`${id}：相關病灶 ${l} 不存在`); });
  if (t.decussation.level && !keys.has("level:" + t.decussation.level)) err(`${id}：交叉 level ${t.decussation.level} 不存在`);
}
async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out); else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}
let pageCount = 0;
try {
  const files = await walk(path.join(ROOT, "resources/neuro"));
  pageCount = files.length;
  const exists = new Map();
  // 讀者拿不到的共筆、講義、考古：不可寫出學校、檔名、頁碼
  const PRIVATE = /陽明|北醫|PDF 第|神解 ?0\d|共筆 ?B\d|共筆 ?p\.|\d{3} ?級?(期中|期末)?考古(?!題)/;
  const idx = await readFile(path.join(ROOT, "assets/data/neuro/neuro-index.json"), "utf8").catch(() => "");
  if (PRIVATE.test(idx)) err(`neuro-index.json：出現共筆出處「${idx.match(PRIVATE)[0]}」`);
  for (const f of files) {
    const html = await readFile(f, "utf8");
    if (PRIVATE.test(html)) err(`${path.relative(ROOT, f)}：出現共筆出處「${html.match(PRIVATE)[0]}」`);
    for (const m of html.matchAll(/href="(\/[^"#?]+)/g)) {
      const u = m[1];
      if (!exists.has(u)) exists.set(u, stat(path.join(ROOT, decodeURI(u))).then(() => true, () => false));
      if (!(await exists.get(u))) err(`${path.relative(ROOT, f)}：連結 ${u} 找不到檔案`);
    }
  }
} catch (e) {
  err("讀取 resources/neuro 失敗（先跑 node scripts/build-neuro.mjs）：" + e.message);
}

/* 2. 路徑的連續性與範圍 */
for (const [tid, t] of Object.entries(TR)) {
  for (const b of t.bundles) {
    if (!b.phi) continue;
    const lo = model.segIdx[b.present[1]], hi = model.segIdx[b.present[0]];
    if (lo == null || hi == null || lo > hi) { err(`${tid}.${b.id}：present 範圍錯誤 ${b.present}`); continue; }
    for (let i = lo; i <= hi; i++) {
      const rg = model.region(b, i + 0.5);
      const name = `${tid}.${b.id} @ ${model.segs[i].name}`;
      if (!rg) { err(`${name}：這一節沒有範圍（路徑中斷）`); continue; }
      if (!(rg.phi[0] < rg.phi[1])) err(`${name}：φ 範圍顛倒 ${rg.phi.map((v) => v.toFixed(1))}`);
      if (rg.phi[0] < 0 || rg.phi[1] > 180) err(`${name}：φ 超出 0–180`);
      if (!(rg.r[0] < rg.r[1]) || rg.r[0] < 0 || rg.r[1] > 1.001) err(`${name}：r 範圍不合理 ${rg.r}`);
      if (rg.phi[1] - rg.phi[0] < 2) warn(`${name}：φ 範圍只有 ${(rg.phi[1] - rg.phi[0]).toFixed(1)}°，幾乎看不到`);
    }
  }
}

/* 3. 交叉：代表纖維（負責右側身體）的起點與終點應該在哪一側。R = 病人右（x < 0）、L = 左（x > 0） */
const SIDES = {
  dcml: { start: "R", end: "L" }, als: { start: "R", end: "L" },
  dsct: { start: "R", end: "R" }, vsct: { start: "R", end: "R" }, cuneocerebellar: { start: "R", end: "R" }, rsct: { start: "R", end: "R" },
  lcst: { start: "L", end: "R" }, acst: { start: "L", end: "R" }, rubrospinal: { start: "L", end: "R" }, tectospinal: { start: "L", end: "R" },
  lvst: { start: "R", end: "R" }, mvst: { start: "R", end: "R" }, prst: { start: "R", end: "R" }, mrst: { start: "R", end: "R" }, hypothalamospinal: { start: "R", end: "R" },
  // 腦幹路徑：三叉神經感覺路徑（右臉 → 左 VPM／S1）、皮質延髓徑（左皮質 → 右顏面／舌下神經核）、水平注視（右 PPRF → 左動眼神經核）
  trigeminal: { start: "R", end: "L" }, cbt: { start: "L", end: "R" }, "mlf-gaze": { start: "R", end: "L" },
  // 視覺：右眼顳側視網膜 → 右 V1、鼻側 → 左 V1；瞳孔光反射：光照右眼 → 直接反射到右瞳孔、間接反射到左瞳孔
  visual: { start: "R", end: { temporal: "R", nasal: "L" } }, plr: { start: "R", end: { direct: "R", consensual: "L" } },
  // 小腦（以右小腦為例）：左大腦 → 右小腦；左下橄欖核 → 右小腦；右小腦 → 交叉兩次 → 右脊髓前角；右前庭 → 右前庭神經核
  pontocerebellar: { start: "L", end: "R" }, olivocerebellar: { start: "L", end: "R" }, dentatothalamic: { start: "R", end: "R" }, vestibulocerebellar: { start: "R", end: "R" },
  // 聽覺（右耳）：單耳與經斜方體的雙耳路線到左側皮質、經同側上橄欖核的到右側；前庭眼反射（頭向右轉）→ 右內直肌；前庭皮質以對側為主
  auditory: { start: "R", end: { dcn: "L", "vcn-c": "L", "vcn-i": "R" } }, vor: { start: "R", end: "R" }, vestibulothalamic: { start: "R", end: "L" },
  // 間腦（以右側為例）：海馬 → 乳頭體 → 前核 → 扣帶迴都在同側；視上核、室旁核 → 垂體後葉
  mammillothalamic: { start: "R", end: "R" }, hypothalamohypophysial: { start: "R", end: { son: "R", pvn: "R" } },
  // 基底核（右半球）：整個迴路不交叉
  "bg-direct": { start: "R", end: "R" }, "bg-indirect": { start: "R", end: "R" }, nigrostriatal: { start: "R", end: "R" }
};
for (const tid of data.tracts.order) {
  const exp = SIDES[tid];
  if (!exp) { err(`${tid}：交叉檢查表沒有這條路徑`); continue; }
  const tr = TR[tid];
  const runs = tr.inputs
    ? model.segs.slice(model.segIdx[tr.inputs.to], model.segIdx[tr.inputs.from] + 1).map((s) => [s.id, null])
    : (tr.variants || [{ id: null }]).map((v) => [null, v.id]);
  for (const [seg0, variant] of runs) {
    const seg = seg0 || variant || "—";
    const ch = model.chainFor(tid, seg0, "R", "equal", variant);
    const all = ch.flatMap((n) => n.pts);
    if (all.some((p) => !p || [p.x, p.y, p.z].some((v) => !Number.isFinite(v)))) { err(`${tid} @ ${seg}：神經元鏈有無效座標`); continue; }
    // 中樞內的第一個點：上行路徑略過背根神經節與進入點；下行路徑是皮質或腦幹的核；視覺路徑從視網膜開始
    const first = tr.kind === "ascending" ? all[2] : all[0];
    // 終點：上行、視覺＝最後一個神經元的終點；下行＝前角（最後一個神經元的起點）
    const last = /^(ascending|visual|cerebellar|auditory|vestibular|diencephalon|basal)$/.test(tr.kind) ? all[all.length - 1] : ch[ch.length - 1].pts[0];
    const endSide = typeof exp.end === "string" ? exp.end : exp.end[variant];
    const sideOf = (p) => (p.x < -0.05 ? "R" : p.x > 0.05 ? "L" : "M");
    if (sideOf(first) !== exp.start) err(`${tid} @ ${seg}：起點應在${exp.start === "R" ? "右" : "左"}側，實際 x = ${first.x.toFixed(2)}`);
    if (sideOf(last) !== endSide) err(`${tid} @ ${seg}：終點應在${endSide === "R" ? "右" : "左"}側，實際 x = ${last.x.toFixed(2)}`);
  }
}

/* 4. 來源 */
const isZh = (s) => data.sources[s.src]?.pageKind === "pdf";
for (const [tid, t] of Object.entries(TR)) {
  const en = t.sources.filter((s) => !isZh(s)), zh = t.sources.filter(isZh);
  const core = en.some((s) => s.src === "barr" || s.src === "haines");
  const msg = `${tid}：來源 英文 ${en.length}、中文 ${zh.length}${core ? "" : "（沒有 Barr's 或 Haines）"}`;
  if (en.length < 2 || zh.length < 1 || !core) (t.highYield >= 2 ? err : warn)(msg);
  t.sources.forEach((s) => { if (!data.sources[s.src]) err(`${tid}：未知來源 ${s.src}`); else if (!s.p && s.src !== "hy" && s.src !== "brs") warn(`${tid}：${s.src} 沒有頁碼`); });
}
for (const [id, n] of Object.entries(data.nerves.nerves)) {
  const en = n.sources.filter((s) => !isZh(s)), zh = n.sources.filter(isZh);
  if (en.length < 2 || zh.length < 1 || !en.some((s) => s.src === "barr" || s.src === "haines")) err(`nerve ${id}：來源 英文 ${en.length}、中文 ${zh.length}`);
  n.components.forEach((c) => {
    if (!data.structures.structures[c.nucleus]) err(`nerve ${id}：神經核 ${c.nucleus} 不存在`);
    if (!data.nerves.columns[c.col]) err(`nerve ${id}：未知功能分類 ${c.col}`);
  });
  n.syndromes.forEach((l) => { if (!data.lesions.lesions[l]) err(`nerve ${id}：症候群 ${l} 不存在`); });
  if (!n.special && !data.levels.brainLevels.some((b) => b.id === n.exitLevel)) err(`nerve ${id}：exitLevel ${n.exitLevel} 不存在`);
}
for (const [id, s] of Object.entries(data.structures.structures)) {
  (s.nerves || []).forEach((n) => { if (!data.nerves.nerves[n]) err(`structure ${id}：腦神經 ${n} 不存在`); });
  if (s.nuc) for (let i = 1; i < s.nuc.length; i++) if (s.nuc[i][0] < s.nuc[i - 1][0]) err(`structure ${id}：nuc 路徑的 y 要由下往上排`);
}
for (const [k, list] of [["structures", data.structures.structures], ["lesions", data.lesions.lesions], ["regions", data.regions.regions]]) {
  for (const [id, o] of Object.entries(list)) {
    if (!o.sources || !o.sources.length) err(`${k}.${id}：沒有來源`);
    else o.sources.forEach((s) => { if (!data.sources[s.src]) err(`${k}.${id}：未知來源 ${s.src}`); });
  }
}

/* 配色：每條路徑屬於一個色系；淺底（#f3f5f9）與深底（#0f1a2e）上的對比都要夠 */
{
  const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [tid, t] of Object.entries(TR)) {
    if (!t.family || !data.tracts.families[t.family]) err(`${tid}：沒有色系（family）`);
    if (!/^#[0-9a-f]{6}$/i.test(t.color)) { err(`${tid}：顏色格式 ${t.color}`); continue; }
    const c = Math.min(cr(t.color, "#f3f5f9"), cr(t.color, "#0f1a2e"));
    if (c < 2.2) err(`${tid}：顏色 ${t.color} 在淺底或深底上對比只有 ${c.toFixed(2)}`);
  }
}

/* 別名：縮寫要和全名寫在一起「全名 (縮寫)」，不可再單獨列一次 */
for (const [k, list] of [["tracts", TR], ["structures", data.structures.structures], ["lesions", data.lesions.lesions], ["nerves", data.nerves.nerves]]) {
  for (const [id, o] of Object.entries(list)) {
    const al = o.aliases || [];
    const inParen = new Set(al.flatMap((a) => [...a.matchAll(/\(([^)]+)\)/g)].map((m) => m[1])));
    al.forEach((a) => { if (inParen.has(a)) err(`${k}.${id}：別名「${a}」已經寫在全名的括號裡，不要重複`); });
    if (new Set(al).size !== al.length) err(`${k}.${id}：別名重複`);
  }
}

/* 視覺路徑的幾何 */
if (!model.vis) err("visual.json 沒有載入");
else {
  const V = model.vis;
  const bad = (pts) => pts.some((p) => !p || ![p.x, p.y, p.z].every(Number.isFinite));
  if (V.fibers.length !== 16) err(`視覺纖維應該有 16 種，實際 ${V.fibers.length}`);
  V.fibers.forEach((f) => {
    if (bad(f.rgc) || bad(f.rad.pts)) err(`視覺纖維 ${f.id}：座標無效`);
    // 交叉規則：顳側視野（鼻側視網膜）才交叉；視神經徑一定在視野的對側
    if (f.crossed !== (f.fs === f.eye)) err(`視覺纖維 ${f.id}：交叉與否不對`);
    const end = f.rad.pts[f.rad.pts.length - 1];
    if ((end.x < 0 ? "R" : "L") === f.fs) err(`視覺纖維 ${f.id}：${f.fs} 半邊視野應該到對側的視覺皮質`);
  });
  ["R", "L"].forEach((s) => { if (bad(V.eff[s].cn3) || bad(V.eff[s].cil) || bad(V.branch[s])) err(`瞳孔反射路線（${s}）：座標無效`); });
}

/* 聽覺路線的幾何 */
if (!model.aud) err("auditory.json 沒有載入");
else {
  const bad = (pts) => !pts.length || pts.some((p) => !p || ![p.x, p.y, p.z].every(Number.isFinite));
  ["R", "L"].forEach((ear) => {
    model.aud.routes(ear).forEach((r) => {
      r.segs.forEach((sg) => { if (bad(sg.pts)) err(`聽覺路線 ${ear} ${r.id}.${sg.stage}：座標無效`); });
      const a1 = r.segs[r.segs.length - 1].pts[0];
      const want = r.id === "vcn-i" ? ear : ear === "R" ? "L" : "R";
      if ((a1.x < 0 ? "R" : "L") !== want) err(`聽覺路線 ${ear} ${r.id}：應該到${want === "R" ? "右" : "左"}側聽覺皮質`);
    });
    if (bad(model.aud.spiral(ear)) || bad(model.aud.vestibularNerve(ear))) err(`內耳（${ear}）：座標無效`);
  });
}

/* 5. 病灶 */
for (const lid of data.lesions.order) {
  const l = data.lesions.lesions[lid];
  const got = deficitKeys(deficits(model, l.zones)), exp = [...l.expect].sort();
  if (JSON.stringify(got) !== JSON.stringify(exp)) err(`${lid}：推導出的症狀 ${got.join(" ")} ≠ 預期 ${exp.join(" ")}`);
}

/* 結果 */
warnings.forEach((w) => console.log("  注意 " + w));
if (errors.length) {
  errors.forEach((e) => console.error("  錯誤 " + e));
  console.error(`\n神經解剖學資料檢查：${errors.length} 個錯誤、${warnings.length} 個提醒。`);
  process.exit(1);
}
console.log(`神經解剖學資料檢查通過：${data.tracts.order.length} 條路徑、${data.nerves.order.length} 對腦神經、${data.lesions.order.length} 個病灶、${pageCount} 頁，${warnings.length} 個提醒。`);
