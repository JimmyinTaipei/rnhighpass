/**
 * 相關資源的額外下載檔（目前只有「醫事國考生化」）：產生 assets/data/extras.json、
 * 把 PDF 放進 dist-r2/ 等 upload-r2.sh 上傳、並從 PDF 第一頁做封面圖。
 *
 *   node scripts/build-extras.mjs --src "/path/to/82_考題整理/08_share/pdf"
 *
 * 刻意不併進 manifest.json：build-manifest.mjs 每次都會整份重寫 manifest 並清空 dist-r2/，
 * 這裡的項目放進去下次就會被洗掉。Worker 另外讀 extras.json 當下載白名單。
 *
 * key 規則與 manifest 相同：純 ASCII、尾端帶內容雜湊（sha256 前 10 碼），可長期 immutable 快取。
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, link, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const EXTRAS_JSON = path.join(ROOT, "assets/data/extras.json");
const COVER_WIDTH = 600;

// 醫事國考生化：08_share/pdf/{01_分章題本,02_分章詳解}/02_醫事國考/00_各科合訂本/國考_B{n}{題本|詳解}_{冊名}.pdf
const BIOCHEM = {
  group: "biochem",
  collection: "02_醫事國考",
  kinds: [
    { dir: "02_分章詳解", type: "詳解", slug: "explanation" },
    { dir: "01_分章題本", type: "題本", slug: "workbook" },
  ],
  fileRe: /^國考_B(\d)(題本|詳解)_(.+)\.pdf$/,
};

function parseArgs(argv) {
  const args = { src: null, out: path.join(ROOT, "dist-r2"), covers: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--src") args.src = argv[++i];
    else if (a === "--out") args.out = path.resolve(argv[++i]);
    else if (a === "--no-covers") args.covers = false;
    else throw new Error(`未知參數：${a}`);
  }
  if (!args.src) throw new Error("請用 --src 指定分享版 PDF 資料夾（…/08_share/pdf）");
  return args;
}

async function collectBiochem(src) {
  const items = [];
  for (const kind of BIOCHEM.kinds) {
    const dir = path.join(src, kind.dir, BIOCHEM.collection, "00_各科合訂本");
    for (const file of (await readdir(dir)).sort()) {
      const m = file.match(BIOCHEM.fileRe);
      if (!m) continue;
      if (m[2] !== kind.type) throw new Error(`${file} 放錯資料夾（${kind.dir}）`);
      const full = path.join(dir, file);
      const buf = await readFile(full);
      if (buf.subarray(0, 4).toString() !== "%PDF") throw new Error(`${file} 不是 PDF`);
      const hash = createHash("sha256").update(buf).digest("hex").slice(0, 10);
      const book = Number(m[1]);
      items.push({
        key: `extras/${BIOCHEM.group}/b${book}_${kind.slug}_${hash}.pdf`,
        name: `醫事國考生化_B${book}${kind.type}_${m[3]}.pdf`,
        book,
        bookName: m[3],
        type: kind.type,
        size: buf.length,
        cover: `assets/images/covers/extras/${BIOCHEM.group}/b${book}_${kind.slug}.jpg`,
        src: full,
      });
    }
  }
  for (const kind of BIOCHEM.kinds) {
    const books = items.filter((i) => i.type === kind.type).map((i) => i.book).sort();
    if (books.join() !== "1,2,3,4") throw new Error(`${kind.type} 應有 B1–B4，實際：${books.join() || "無"}`);
  }
  return items;
}

async function stage(items, out, group) {
  const dir = path.join(out, "extras", group);
  await rm(dir, { recursive: true, force: true }); // 清掉舊雜湊的檔案
  await mkdir(dir, { recursive: true });
  for (const item of items) {
    const dest = path.join(out, item.key);
    try {
      await link(item.src, dest);
    } catch {
      await copyFile(item.src, dest);
    }
  }
}

/** 與 make-covers.sh 相同：qlmanage 算第一頁高解析 PNG，sips 縮成 600 寬 jpg。 */
async function makeCovers(items, out) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "extras-cover-"));
  try {
    for (const item of items) {
      const src = path.join(out, item.key);
      const dest = path.join(ROOT, item.cover);
      await mkdir(path.dirname(dest), { recursive: true });
      execFileSync("qlmanage", ["-t", "-s", String((COVER_WIDTH * 3) / 2), "-o", tmp, src], { stdio: "ignore" });
      const png = path.join(tmp, path.basename(src) + ".png");
      if (!existsSync(png)) throw new Error(`無法產生第一頁：${src}`);
      execFileSync("sips", ["--resampleWidth", String(COVER_WIDTH), "-s", "format", "jpeg",
        "-s", "formatOptions", "80", png, "--out", dest], { stdio: "ignore" });
      await rm(png, { force: true });
      console.log(`  ✓ ${item.cover}`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
const items = await collectBiochem(args.src);
await stage(items, args.out, BIOCHEM.group);
if (args.covers) await makeCovers(items, args.out);

const data = {
  generatedAt: new Date().toISOString(),
  [BIOCHEM.group]: items.map(({ src, ...rest }) => rest),
};
await writeFile(EXTRAS_JSON, JSON.stringify(data, null, 2) + "\n");

const total = items.reduce((s, i) => s + i.size, 0);
console.log(`\n✓ ${items.length} 份檔案 → ${path.relative(ROOT, EXTRAS_JSON)}（合計 ${(total / 1024 / 1024).toFixed(1)} MB）`);
console.log(`  已放進 ${path.relative(ROOT, args.out)}/extras/${BIOCHEM.group}/，接著執行 npm run upload`);
