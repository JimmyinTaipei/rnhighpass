// 用 headless Chrome（DevTools Protocol）操作線上的國考模擬測驗，截下第二篇要用的畫面
// 用法：node social/post2/capture.mjs            → 截圖存到 social/post2/shots/
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'shots');
mkdirSync(outDir, { recursive: true });

const BASE = 'https://exam.rnhighpass.com';
// 題目與答案：直接讀測驗站專案打包的考卷 JSON
const QUESTIONS = join(process.env.HOME, 'Projects/多保命測驗/rnhighpass-quiz/src/data/mock-exam/115-2_BM.json');
const PORT = 9333;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rnhp-'))}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return new WebSocket(page.webSocketDebuggerUrl);
    } catch { /* Chrome 還沒起來 */ }
    await sleep(200);
  }
  throw new Error('連不上 Chrome');
}

const ws = await connect();
await new Promise((r) => ws.once('open', r));
let seq = 0;
const pending = new Map();
ws.on('message', (m) => {
  const msg = JSON.parse(m);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? expr);
  return r.result.value;
};

// 找「文字完全相符」的可點元素（按鈕、連結、label），找不到就退而求其次用包含
async function click(text) {
  const ok = await evaluate(`(() => {
    const t = ${JSON.stringify(text)};
    const els = [...document.querySelectorAll('button, a, label, [role=button], [role=radio], input[type=radio]')];
    const norm = (e) => (e.innerText || e.value || '').replace(/\\s+/g, ' ').trim();
    const el = els.find((e) => norm(e) === t) || els.find((e) => norm(e).includes(t));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`);
  if (!ok) {
    const btns = await evaluate(`[...document.querySelectorAll('button, a, label, [role=button], [role=radio]')].map((e) => (e.innerText || '').replace(/\\s+/g, ' ').trim()).filter(Boolean).join(' | ')`);
    throw new Error(`找不到可點的「${text}」，畫面上有：${btns}`);
  }
  await sleep(500);
}

async function shot(name) {
  await sleep(600);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(name);
}

async function go(path) {
  await send('Page.navigate', { url: BASE + path });
  await sleep(2500);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  // 桌機比例（模擬考介面是照考選部桌機畫面做的），2 倍解析度讓截圖放大後仍清楚
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });

  // 1. 登入：用畫面小鍵盤輸入身分證字號
  await go('/mock-exam');
  for (const k of 'A123456789') await click(k);
  await shot('01-login');
  await click('送出');
  await sleep(1500);

  // 2. 選梯次與科目
  await go('/mock-exam/select');
  await shot('02-select');

  // 3. 確認頁 → 成績選項 → 等候 → 作答
  await go('/mock-exam/115-2/BM');
  await shot('03-confirm');
  await click('確定');
  await shot('04-score-options');
  await click('確定');
  await shot('05-waiting');
  await click('直接開始作答');
  await sleep(800);

  // 4. 之後的畫面用「預先寫好的作答紀錄」，截出來比較像真的考到一半／考完
  //    （存檔格式見 rnhighpass-quiz/src/lib/mock-exam/session.ts）
  const questions = JSON.parse(readFileSync(QUESTIONS, 'utf8'));
  const letters = ['A', 'B', 'C', 'D'];
  const correctOf = (q) => (q.answer.match(/[A-D]/) ?? ['A'])[0];
  const wrongOf = (q) => letters.find((l) => l !== correctOf(q));
  const orders = Object.fromEntries(questions.map((q, i) =>
    [q.id, letters.map((_, k) => letters[(k + i) % 4])]));
  const marks = { 3: 'triangle', 5: 'square', 12: 'triangle', 14: 'circle', 23: 'triangle', 25: 'square', 34: 'circle' };
  const session = ({ answered, wrongEvery, finished, index }) => ({
    version: 1,
    startedAt: Date.now() - (finished ? 48 : 23) * 60 * 1000,
    finishedAt: finished ? Date.now() : null,
    orders,
    answers: Object.fromEntries(questions.slice(0, answered).map((q, i) =>
      [q.id, i % wrongEvery === wrongEvery - 1 ? wrongOf(q) : correctOf(q)])),
    marks: Object.fromEntries(Object.entries(marks).map(([n, m]) => [questions[n - 1].id, m])),
    index,
    zoom: 100,
    showScore: true,
  });
  const seed = async (s) => {
    await evaluate(`localStorage.setItem('mock-exam:v1:115-2:BM', ${JSON.stringify(JSON.stringify(s))})`);
    await go('/mock-exam/115-2/BM');
  };

  // 作答中：答了 38 題，停在有 ▲ 註記的第 12 題
  await seed(session({ answered: 38, wrongEvery: 7, finished: false, index: 11 }));
  await click('繼續作答');
  await shot('06-question');

  await click('瀏覽作答情形');
  await shot('07-overview');
  await click('繼續作答');

  await click('提前交卷');
  await shot('08-early-dialog');
  await click('確定交卷');
  await sleep(800);
  await shot('09-ended');

  // 考完：50 題全答、錯 8 題 → 84 分
  await seed(session({ answered: 50, wrongEvery: 6, finished: true, index: 0 }));
  await shot('10-result');
} finally {
  ws.close();
  chrome.kill();
}
