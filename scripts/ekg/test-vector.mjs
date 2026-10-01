#!/usr/bin/env node
/**
 * 心電向量模型的檢查：正常竇性、LBBB、RBBB，量測並畫圖。
 *
 *     node scripts/ekg/test-vector.mjs            # 量測 + 畫 SVG 到 scripts/ekg/build/
 *
 * 檢查項目（正常拍）：P 寬、PR、QRS 寬、QRS 電軸（−30°～+90°）、aVR QRS 主波向下、
 * V1→V6 R 波遞增與轉換區（V3–V4）、II 與 V5 的 T 波直立、II 的 P 波直立。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createModel, simulate, ecg, LEADS } from "../../assets/js/ekg/vector/engine.js";

const ROOT = new URL("../../", import.meta.url);
const data = JSON.parse(readFileSync(new URL("assets/data/ekg/heart-nodes.json", ROOT)));
const OUT = new URL("scripts/ekg/build/", ROOT);
mkdirSync(OUT, { recursive: true });

let t0 = performance.now();
const md = createModel(data);
console.log(`模型 ${md.n} 節點，前置運算 ${(performance.now() - t0).toFixed(0)} ms`);

function measure(sim, e) {
  const o = sim.opts;
  const vent = [...sim.at].filter((_, i) => md.region[i] < 2);
  const atr = [...sim.at].filter((_, i) => md.region[i] >= 2);
  const qOn = Math.min(...vent), qOff = Math.max(...vent);
  const win = (x, a, b) => x.slice(Math.max(0, Math.floor(a)), Math.floor(b));
  const area = (x) => x.reduce((s, v) => s + v, 0);
  const L = e.leads;
  const qrs = (k) => win(L[k], qOn, qOff + 5);
  const axis = Math.atan2(area(qrs("aVF")), area(qrs("I"))) * 180 / Math.PI;
  const rs = {};
  for (let v = 1; v <= 6; v++) {
    const x = qrs("V" + v);
    rs["V" + v] = [Math.max(0, ...x), -Math.min(0, ...x)].map((a) => +a.toFixed(2));
  }
  const tEnd = Math.max(...sim.rt.filter((_, i) => md.region[i] < 2));
  const tWin = (k) => area(win(L[k], qOff + 60, tEnd + 30));
  const pWin = (k) => area(win(L[k], 0, Math.max(...atr)));
  return {
    P: Math.max(...atr).toFixed(0), PR: qOn.toFixed(0), QRS: (qOff - qOn).toFixed(0),
    QT: (tEnd - qOn + 20).toFixed(0), axis: axis.toFixed(0),
    aVR_QRS: area(qrs("aVR")) < 0 ? "負" : "正",
    P_II: pWin("II") > 0 ? "正" : "負", T_II: tWin("II") > 0 ? "正" : "負",
    T_V5: tWin("V5") > 0 ? "正" : "負", T_V1: tWin("V1") > 0 ? "正" : "負",
    RS: rs,
  };
}

function svg(e, title) {
  const W = 1200, rowH = 90, left = 50, ms = 0.9;       // 每 ms 0.9 px
  const H = rowH * 12 + 40;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif" font-size="13">`;
  s += `<rect width="100%" height="100%" fill="#fff"/><text x="10" y="22" font-size="16">${title}</text>`;
  LEADS.forEach((k, r) => {
    const y0 = 40 + r * rowH + rowH / 2;
    for (let x = left; x < W; x += 36) s += `<line x1="${x}" y1="${y0 - rowH / 2}" x2="${x}" y2="${y0 + rowH / 2}" stroke="#f3c2c2" stroke-width="0.5"/>`;
    for (let m = -1; m <= 1; m += 0.5) s += `<line x1="${left}" y1="${y0 - m * 30}" x2="${W}" y2="${y0 - m * 30}" stroke="${m === 0 ? "#e99" : "#f3c2c2"}" stroke-width="0.5"/>`;
    const x = e.leads[k];
    let d = "";
    for (let i = 0; i < x.length && left + i * ms < W; i++) d += `${i ? "L" : "M"}${(left + i * ms).toFixed(1)},${(y0 - x[i] * 30).toFixed(1)}`;
    s += `<path d="${d}" fill="none" stroke="#111" stroke-width="1.3"/><text x="8" y="${y0 + 4}">${k}</text>`;
  });
  return s + "</svg>";
}

const cases = [["normal", "none"], ["lbbb", "lbbb"], ["rbbb", "rbbb"]];
let cal = null;
for (const [name, block] of cases) {
  t0 = performance.now();
  const sim = simulate(md, { block });
  const t1 = performance.now();
  const e = ecg(md, sim, 1, cal);
  const t2 = performance.now();
  if (!cal) cal = e.cal;            // 之後的阻滯都用正常拍的校正，振幅才可以比較
  const m = measure(sim, e);
  console.log(`\n[${name}] 激動 ${(t1 - t0).toFixed(0)} ms、導程 ${(t2 - t1).toFixed(0)} ms`);
  console.log(`  P ${m.P}  PR ${m.PR}  QRS ${m.QRS}  QT≈${m.QT}  電軸 ${m.axis}°  aVR QRS ${m.aVR_QRS}  P(II) ${m.P_II}  T(II) ${m.T_II}  T(V5) ${m.T_V5}  T(V1) ${m.T_V1}`);
  console.log("  R/S (mV):", Object.entries(m.RS).map(([k, [r, s]]) => `${k} ${r}/${s}`).join("  "));
  writeFileSync(new URL(`ecg-${name}.svg`, OUT), svg(e, `${name}  QRS ${m.QRS} ms  電軸 ${m.axis}°`));
}
