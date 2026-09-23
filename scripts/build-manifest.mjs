#!/usr/bin/env node
/**
 * build-manifest.mjs
 *
 * 把來源 PDF 資料夾正規化成 R2 的 canonical key，並產生 assets/data/manifest.json。
 *
 * 「R2 上有什麼」跟「網站顯示什麼」是分開的兩件事：
 *   - dist-r2/（上傳用）收集全部四類：分章詳解、題本、合訂本、全部學期的考古題。
 *   - assets/data/manifest.json（網站用）只寫入合訂本，以及 PAST_EXAM_MIN_TERM
 *     之後的考古題——分章詳解/題本、更早的考古題雖然也上傳了，但 Worker 的
 *     white list 只認 manifest 裡列出的 key，所以不會被網站顯示或存取到。
 *   Google Drive 連結（assets/data/links.json）另外維護，給要整批下載的人。
 *
 *   node scripts/build-manifest.mjs --src "/path/to/07_pdf" [--out dist-r2] [--no-link]
 *
 * 設計重點：來源檔名仍在製作中，隨時可能改。所以這裡不假設單一格式，
 * 而是依序套用多組 pattern；全部試完還解析不出來的檔案會被「列出來並中止」，
 * 絕不靜默略過 —— 靜默略過會讓網站少檔案卻沒人發現。
 *
 * 檔名定稿後重跑這支腳本即可，前端與 Worker 都不用動。
 *
 * R2 的 key 會自動帶內容雜湊（見 withContentHash()）：檔案內容只要一變，
 * key 就會跟著變，不需要手動在檔名加 _v2。這也是 Worker 端把 key 設成
 * 一年期 immutable 快取還能保證安全的原因——key 不變就代表內容真的沒變。
 */
import { readdir, stat, readFile, mkdir, rm, link, copyFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUBJECTS,
  SUBJECT_BY_NO,
  SUBJECT_BY_NAME,
  PREFIXES,
  TYPE_SLUG,
  PAPER_SLUG,
  termSlug,
  PAST_EXAM_MIN_TERM,
} from "./subjects.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

/* ---------------------------------- CLI ---------------------------------- */

function parseArgs(argv) {
  const args = { src: null, out: path.join(ROOT, "dist-r2"), link: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--src") args.src = argv[++i];
    else if (a === "--out") args.out = path.resolve(argv[++i]);
    else if (a === "--no-link") args.link = false;
    else throw new Error(`未知的參數：${a}`);
  }
  if (!args.src) throw new Error("缺少 --src <來源資料夾>");
  args.src = path.resolve(args.src);
  return args;
}

/* -------------------------------- 工具函式 -------------------------------- */

const CHAPTER_DIR = /^(\d{2})_(.+)$/;     // 來源資料夾：02_病理

/**
 * 幫一批已經 dedupe 完的項目，把內容雜湊（sha256 前 10 碼）插進 key 尾端。
 *
 * 一定要在 dedupeByKey() 之後才呼叫：dedupe 是靠「邏輯識別碼」（例如
 * bundles/07_explanation.pdf）判斷新舊格式指向的是不是同一份文件，
 * 如果太早把雜湊混進 key，同一份文件的新舊檔名會因為雜湊不同而被當成
 * 兩份不同的東西，dedupe 邏輯就失效了。
 */
async function withContentHash(items) {
  for (const item of items) {
    const buf = await readFile(item.src);
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 10);
    item.key = item.key.replace(/\.pdf$/, `_${hash}.pdf`);
  }
  return items;
}

async function listPdfs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listPdfs(full)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) out.push(full);
  }
  return out;
}

/** 從來源子資料夾名稱推回科目，是最可靠的來源（檔名可能還沒定稿，資料夾名很穩定）。 */
function subjectFromDir(dirName) {
  const m = dirName.match(CHAPTER_DIR);
  if (!m) return null;
  const [, no, name] = m;
  return SUBJECT_BY_NO.get(no) && SUBJECT_BY_NO.get(no).name === name
    ? SUBJECT_BY_NO.get(no)
    : null;
}

/* -------------------------------- 檔名解析 -------------------------------- */

/**
 * 分章（題本 / 詳解）。依序試：
 *   1. 目標格式 02_病理_詳解_Ch03_代謝、體液與循環障礙.pdf
 *   2. 現行格式 詳解_病理_Ch03_代謝、體液與循環障礙.pdf（序號由資料夾補）
 * 新格式出現時，只要在這個陣列加一條 pattern 就好。
 */
const CHAPTER_PATTERNS = [
  {
    label: "目標格式 {序號}_{科目}_{類型}_Ch{章}_{章名}",
    re: /^(\d{2})_([^_]+)_(詳解|題本)_Ch(\d{2})_(.+)$/,
    map: (m) => ({ no: m[1], subjectName: m[2], type: m[3], ch: m[4], title: m[5] }),
  },
  {
    label: "現行格式 {類型}_{科目}_Ch{章}_{章名}",
    re: /^(詳解|題本)_([^_]+)_Ch(\d{2})_(.+)$/,
    map: (m) => ({ no: null, subjectName: m[2], type: m[1], ch: m[3], title: m[4] }),
  },
];

/** 合訂本。同樣兩種格式都吃。 */
const BUNDLE_PATTERNS = [
  {
    label: "目標格式 {序號}_{科目}_{類型}_合訂本",
    re: /^(\d{2})_([^_]+)_(詳解|題本)_合訂本$/,
    map: (m) => ({ no: m[1], subjectName: m[2], type: m[3] }),
  },
  {
    label: "現行格式 {類型}_{科目}_合訂本",
    re: /^(詳解|題本)_([^_]+)_合訂本$/,
    map: (m) => ({ no: null, subjectName: m[2], type: m[1] }),
  },
];

/**
 * 考古題。來源是空格分隔，且有「106-2 補考」這種多一欄的學期。
 * 正規化成底線分隔、補考併進學期代號：106-2補考_基礎醫學.pdf
 */
const PAST_EXAM_PATTERNS = [
  {
    label: "目標格式 {學期}_[補考_]{考卷}（底線分隔）",
    re: /^(\d{3}-\d)_(?:(補考)_)?(.+)$/,
    map: (m) => ({ term: m[1] + (m[2] || ""), paper: m[3] }),
  },
  {
    label: "舊格式 {學期} [補考] {考卷}（空格分隔）",
    re: /^(\d{3}-\d) (?:(補考) )?(.+)$/,
    map: (m) => ({ term: m[1] + (m[2] || ""), paper: m[3] }),
  },
];

function tryPatterns(base, patterns) {
  for (let rank = 0; rank < patterns.length; rank++) {
    const p = patterns[rank];
    const m = base.match(p.re);
    // rank 越小代表越接近目標格式，改名進行到一半時用來挑出該留哪一份。
    if (m) return { ...p.map(m), _pattern: p.label, _rank: rank };
  }
  return null;
}

/**
 * 同一個 canonical key 可能對應到多個來源檔 —— 改名做到一半、新舊檔並存時就會這樣。
 * 這裡保留最接近目標格式的那一份，其餘記進 shadowed 當作警告回報（不中止）。
 */
const shadowed = [];
function dedupeByKey(items) {
  const best = new Map();
  for (const item of items) {
    const prev = best.get(item.key);
    if (!prev) {
      best.set(item.key, item);
    } else if (item._rank < prev._rank) {
      shadowed.push({ kept: item.src, ignored: prev.src });
      best.set(item.key, item);
    } else if (item._rank > prev._rank) {
      shadowed.push({ kept: prev.src, ignored: item.src });
    } else {
      // 同格式又同 key，這是真的撞名，不能自己選一個。
      problem(`兩個檔案指向同一個 key ${item.key}：\n      ${prev.src}\n      ${item.src}`);
    }
  }
  return [...best.values()];
}

/**
 * 學期排序鍵。年份*1000 + 梯次*10 + 補考旗標，
 * 讓 106-2 < 106-2補考 < 107-1，補考自然排在同學期正試之後。
 */
function termSortKey(term) {
  const m = term.match(/^(\d{3})-(\d)(補考)?$/);
  if (!m) return 0;
  return Number(m[1]) * 1000 + Number(m[2]) * 10 + (m[3] ? 1 : 0);
}

/* --------------------------------- 主流程 --------------------------------- */

const problems = [];
function problem(msg) {
  problems.push(msg);
}

async function collectChapters(srcRoot, dirName, type, prefix) {
  const base = path.join(srcRoot, dirName);
  const items = [];
  if (!existsSync(base)) {
    problem(`找不到來源資料夾：${base}`);
    return items;
  }

  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (entry.name.includes("合訂本")) continue; // 合訂本另外處理
    const subject = subjectFromDir(entry.name);
    if (!subject) {
      problem(`無法從資料夾名稱判斷科目：${path.join(dirName, entry.name)}`);
      continue;
    }

    for (const file of await listPdfs(path.join(base, entry.name))) {
      const fileName = path.basename(file);
      const rawBase = path.basename(fileName, ".pdf");

      const parsed = tryPatterns(rawBase, CHAPTER_PATTERNS);
      if (!parsed) {
        problem(`檔名無法解析（分章）：${path.relative(srcRoot, file)}`);
        continue;
      }
      if (parsed.type !== type) {
        problem(`檔名類型與所在資料夾不符（預期 ${type}）：${path.relative(srcRoot, file)}`);
        continue;
      }
      if (parsed.subjectName !== subject.name) {
        problem(
          `檔名科目「${parsed.subjectName}」與資料夾「${entry.name}」不符：` +
            path.relative(srcRoot, file)
        );
        continue;
      }
      if (parsed.no && parsed.no !== subject.no) {
        problem(
          `檔名序號「${parsed.no}」與資料夾序號「${subject.no}」不符：` +
            path.relative(srcRoot, file)
        );
        continue;
      }

      // name：使用者下載到的中文檔名（需求書格式）。key：R2 上的 ASCII 路徑
      // （withContentHash() 稍後會在 dedupe 之後幫它加上內容雜湊）。
      const name = `${subject.no}_${subject.name}_${type}_Ch${parsed.ch}_${parsed.title}.pdf`;
      const key = `${prefix}/${subject.no}_Ch${parsed.ch}.pdf`;
      const { size } = await stat(file);

      items.push({
        key,
        name,
        src: file,
        subjectNo: subject.no,
        subject: subject.name,
        type,
        ch: parsed.ch,
        chapterTitle: parsed.title,
        pairId: `${subject.no}_Ch${parsed.ch}`,
        size,
        _rank: parsed._rank,
      });
    }
  }

  const unique = dedupeByKey(items);
  await withContentHash(unique);
  unique.sort((a, b) => a.subjectNo.localeCompare(b.subjectNo) || a.ch.localeCompare(b.ch));
  return unique;
}

async function collectBundles(srcRoot, dirNames) {
  const items = [];
  for (const dirName of dirNames) {
    const base = path.join(srcRoot, dirName);
    if (!existsSync(base)) continue;
    for (const entry of await readdir(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.includes("合訂本")) continue;

      for (const file of await listPdfs(path.join(base, entry.name))) {
        const fileName = path.basename(file);
        const rawBase = path.basename(fileName, ".pdf");

        const parsed = tryPatterns(rawBase, BUNDLE_PATTERNS);
        if (!parsed) {
          problem(`檔名無法解析（合訂本）：${path.relative(srcRoot, file)}`);
          continue;
        }
        const subject = parsed.no ? SUBJECT_BY_NO.get(parsed.no) : SUBJECT_BY_NAME.get(parsed.subjectName);
        if (!subject || subject.name !== parsed.subjectName) {
          problem(`合訂本科目無法對應「${parsed.subjectName}」：${path.relative(srcRoot, file)}`);
          continue;
        }

        const name = `${subject.no}_${subject.name}_${parsed.type}_合訂本.pdf`;
        const key = `${PREFIXES.bundles}/${subject.no}_${TYPE_SLUG[parsed.type]}.pdf`;
        const { size } = await stat(file);

        items.push({
          key,
          name,
          src: file,
          subjectNo: subject.no,
          subject: subject.name,
          type: parsed.type,
          size,
          _rank: parsed._rank,
        });
      }
    }
  }
  const unique = dedupeByKey(items);
  await withContentHash(unique);
  unique.sort((a, b) => a.subjectNo.localeCompare(b.subjectNo) || a.type.localeCompare(b.type));
  return unique;
}

async function collectPastExams(srcRoot, dirName) {
  const base = path.join(srcRoot, dirName);
  const items = [];
  if (!existsSync(base)) {
    problem(`找不到考古題資料夾：${base}`);
    return items;
  }

  for (const file of await listPdfs(base)) {
    const fileName = path.basename(file);
    const rawBase = path.basename(fileName, ".pdf");

    const parsed = tryPatterns(rawBase, PAST_EXAM_PATTERNS);
    if (!parsed) {
      problem(`檔名無法解析（考古題）：${path.relative(srcRoot, file)}`);
      continue;
    }

    const slug = PAPER_SLUG[parsed.paper];
    if (!slug) {
      problem(
        `考卷名稱「${parsed.paper}」不在 PAPER_SLUG 對照表裡，請到 scripts/subjects.mjs 補上：` +
          path.relative(srcRoot, file)
      );
      continue;
    }
    const name = `${parsed.term}_${parsed.paper}.pdf`;
    const key = `${PREFIXES.pastExams}/${termSlug(parsed.term)}_${slug}.pdf`;
    const { size } = await stat(file);

    items.push({
      key,
      name,
      src: file,
      term: parsed.term,
      termSort: termSortKey(parsed.term),
      paper: parsed.paper,
      size,
      _rank: parsed._rank,
    });
  }

  // 回傳全部學期——網站要顯示哪個範圍留給呼叫端（main()）決定，
  // 這裡負責的是「來源資料夾裡實際有什麼」。
  // 預設由新到舊，補考排在同學期正試之後。
  const unique = dedupeByKey(items);
  await withContentHash(unique);
  unique.sort((a, b) => b.termSort - a.termSort || a.paper.localeCompare(b.paper, "zh-Hant"));
  return unique;
}

/* -------------------------------- 一致性檢查 ------------------------------- */

function runChecks({ explanations, workbooks, bundles, pastExams }) {
  const errors = [];

  // 1. 每個 pairId 必須同時有題本與詳解（「查看對應詳解」全靠這個）
  const expIds = new Set(explanations.map((i) => i.pairId));
  const wbIds = new Set(workbooks.map((i) => i.pairId));
  for (const id of expIds) if (!wbIds.has(id)) errors.push(`詳解有但題本缺少：${id}`);
  for (const id of wbIds) if (!expIds.has(id)) errors.push(`題本有但詳解缺少：${id}`);

  // 2. 每科章節必須從 01 連號、無缺口
  for (const collection of [
    ["分章詳解", explanations],
    ["題本", workbooks],
  ]) {
    const [label, items] = collection;
    const bySubject = new Map();
    for (const i of items) {
      if (!bySubject.has(i.subjectNo)) bySubject.set(i.subjectNo, []);
      bySubject.get(i.subjectNo).push(Number(i.ch));
    }
    for (const [no, chapters] of bySubject) {
      chapters.sort((a, b) => a - b);
      for (let i = 0; i < chapters.length; i++) {
        if (chapters[i] !== i + 1) {
          errors.push(`${label} ${no} 章節不連號，預期 Ch${String(i + 1).padStart(2, "0")}，實際 Ch${String(chapters[i]).padStart(2, "0")}`);
          break;
        }
      }
    }
  }

  // 3. 每科都要有詳解與題本兩本合訂本
  for (const s of SUBJECTS) {
    for (const type of ["詳解", "題本"]) {
      if (!bundles.some((b) => b.subjectNo === s.no && b.type === type)) {
        errors.push(`缺少合訂本：${s.no}_${s.name}_${type}`);
      }
    }
  }

  // 4. 每個學期的考古題份數必須一致（以出現最多的份數為基準）
  const byTerm = new Map();
  for (const e of pastExams) byTerm.set(e.term, (byTerm.get(e.term) || 0) + 1);
  const counts = [...byTerm.values()];
  const expected = counts.length ? counts.sort((a, b) => b - a)[Math.floor(counts.length / 2)] : 0;
  for (const [term, n] of byTerm) {
    if (n !== expected) errors.push(`考古題 ${term} 有 ${n} 份，其他學期是 ${expected} 份`);
  }

  // 5. key 不可重複（重複代表會互相覆蓋）
  const seen = new Map();
  for (const item of [...explanations, ...workbooks, ...bundles, ...pastExams]) {
    if (seen.has(item.key)) errors.push(`key 重複：${item.key}\n    ${seen.get(item.key)}\n    ${item.src}`);
    else seen.set(item.key, item.src);
  }

  return errors;
}

/* ---------------------------------- 執行 ---------------------------------- */

async function stage(items, outDir, useLink) {
  for (const item of items) {
    const dest = path.join(outDir, item.key);
    await mkdir(path.dirname(dest), { recursive: true });
    // 預設用硬連結，476 個檔案將近 1GB，不需要真的複製一份。
    if (useLink) {
      try {
        await link(item.src, dest);
        continue;
      } catch (err) {
        if (err.code !== "EXDEV") throw err; // 跨磁碟就退回複製
      }
    }
    await copyFile(item.src, dest);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`來源：${args.src}`);

  const explanations = await collectChapters(args.src, "02_分章詳解", "詳解", PREFIXES.explanations);
  const workbooks = await collectChapters(args.src, "01_分章題本", "題本", PREFIXES.workbooks);
  const bundles = await collectBundles(args.src, ["01_分章題本", "02_分章詳解"]);
  const pastExamsAll = await collectPastExams(args.src, "03_考古題本"); // 全部學期，供上傳用

  if (problems.length) {
    console.error(`\n✗ 有 ${problems.length} 個檔案無法處理：\n`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error("\n檔名可能又改了。請到 scripts/build-manifest.mjs 的 *_PATTERNS 加上對應格式。");
    process.exit(1);
  }

  if (shadowed.length) {
    console.warn(`\n⚠ 有 ${shadowed.length} 個舊檔名的檔案被略過（新舊檔名並存，已採用新格式那份）：\n`);
    for (const s of shadowed.slice(0, 5)) {
      console.warn(`  略過 ${path.relative(args.src, s.ignored)}`);
      console.warn(`  採用 ${path.relative(args.src, s.kept)}\n`);
    }
    if (shadowed.length > 5) console.warn(`  …另外還有 ${shadowed.length - 5} 組\n`);
    console.warn("  改名完成後記得把舊檔刪掉，這個警告就會消失。");
  }

  const errors = runChecks({ explanations, workbooks, bundles, pastExams: pastExamsAll });
  if (errors.length) {
    console.error(`\n✗ 一致性檢查未通過（${errors.length} 項）：\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // 網站顯示的子集：只有合訂本 + PAST_EXAM_MIN_TERM 之後的考古題。
  // 分章詳解/題本、更早的考古題還是會上傳到 R2（見下方 stage(all,...)），
  // 只是不寫進這份 manifest —— Worker 的 white list 只認 manifest 裡的 key，
  // 沒列進去就抓不到，網站顯示內容因此不受影響。
  const minSort = termSortKey(PAST_EXAM_MIN_TERM);
  const pastExamsSite = pastExamsAll.filter((e) => e.termSort >= minSort);

  const strip = ({ src, _rank, ...rest }) => rest;
  const manifest = {
    generatedAt: new Date().toISOString(),
    subjects: SUBJECTS.map((s) => ({ ...s, cover: `assets/images/covers/${s.no}_${s.name}.jpg` })),
    prefixes: PREFIXES,
    pastExamMinTerm: PAST_EXAM_MIN_TERM,
    bundles: bundles.map(strip),
    pastExams: pastExamsSite.map(strip),
  };

  const manifestPath = path.join(ROOT, "assets/data/manifest.json");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  // dist-r2/ 全部 stage：分章詳解/題本、合訂本、全部學期的考古題，供 npm run upload 使用。
  const all = [...explanations, ...workbooks, ...bundles, ...pastExamsAll];
  await rm(args.out, { recursive: true, force: true });
  await stage(all, args.out, args.link);

  const totalBytes = all.reduce((sum, i) => sum + i.size, 0);
  const allTerms = [...new Set(pastExamsAll.map((e) => e.term))];
  const siteTerms = [...new Set(pastExamsSite.map((e) => e.term))];
  console.log("\n✓ 一致性檢查全數通過");
  console.log(
    `  上傳到 R2：分章詳解 ${explanations.length}．題本 ${workbooks.length}．合訂本 ${bundles.length}．` +
      `考古題 ${pastExamsAll.length}（${allTerms.length} 個學期：${allTerms.join("、")}）`
  );
  console.log(`  合計 ${all.length} 個檔案，${(totalBytes / 1024 ** 2).toFixed(0)} MB`);
  console.log(
    `\n  網站顯示：合訂本 ${bundles.length}．考古題 ${pastExamsSite.length}` +
      `（${siteTerms.length} 個學期：${siteTerms.join("、")}）`
  );
  console.log(`  分章詳解／題本、${PAST_EXAM_MIN_TERM} 之前的考古題已上傳但網站不顯示，改導 Google Drive。`);
  console.log(`\n  manifest → ${path.relative(ROOT, manifestPath)}`);
  console.log(`  待上傳   → ${path.relative(ROOT, args.out)}/`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
