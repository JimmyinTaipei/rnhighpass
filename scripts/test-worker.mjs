/**
 * Worker 測試：用假的 env.BUCKET / env.ASSETS 驅動真正的 worker/index.js。
 *
 * 需要先跑過 `npm run manifest`（會產生 dist-r2/ 與 manifest.json）。
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../worker/index.js";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = path.join(ROOT, "dist-r2");

const manifest = JSON.parse(await readFile(path.join(ROOT, "assets/data/manifest.json"), "utf8"));
const notUploaded = new Set();

const env = {
  ASSETS: {
    async fetch(req) {
      const p = new URL(req.url ?? req).pathname;
      if (p === "/assets/data/manifest.json") {
        return new Response(await readFile(path.join(ROOT, p.slice(1))), { status: 200 });
      }
      return new Response("static", { status: 200 });
    },
  },
  BUCKET: {
    async head(key) {
      if (notUploaded.has(key)) return null;
      try {
        return { size: (await stat(path.join(DIST, key))).size };
      } catch {
        return null;
      }
    },
    async get(key, opts) {
      if (notUploaded.has(key)) return null;
      let buf;
      try {
        buf = await readFile(path.join(DIST, key));
      } catch {
        return null;
      }
      // 模擬 R2 的 range 回應
      let range;
      const header = opts?.range?.get?.("range");
      if (header) {
        const m = header.match(/bytes=(\d+)-(\d*)/);
        if (m) {
          const offset = Number(m[1]);
          const end = m[2] ? Number(m[2]) : buf.length - 1;
          range = { offset, length: end - offset + 1 };
          buf = buf.subarray(offset, end + 1);
        }
      }
      return {
        size: range ? range.offset + buf.length + 0 : buf.length,
        range,
        httpEtag: '"test"',
        writeHttpMetadata() {},
        // 切成小塊，模擬真實 R2 的多段串流
        body: new ReadableStream({
          start(c) {
            for (let i = 0; i < buf.length; i += 64 * 1024) {
              c.enqueue(new Uint8Array(buf.subarray(i, Math.min(i + 64 * 1024, buf.length))));
            }
            c.close();
          },
        }),
      };
    },
  },
};

const call = (url, init) => worker.fetch(new Request(url, init), env);
const fileUrl = (key) => "https://rnhighpass.com/api/file/" + key.split("/").map(encodeURIComponent).join("/");

let pass = 0, fail = 0;
const check = (ok, label, extra = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? "  — " + extra : ""}`);
  ok ? pass++ : fail++;
};

/* 1. 合訂本單檔下載 */
console.log("\n[合訂本下載]");
{
  // key 帶內容雜湊，不能寫死字串比對；用邏輯身分（科目+類型）找。
  const item = manifest.bundles.find((b) => b.subjectNo === "02" && b.type === "詳解");
  const r = await call(fileUrl(item.key));
  const cd = r.headers.get("content-disposition");
  check(r.status === 200, "回 200", `實際 ${r.status}`);
  check(r.headers.get("content-type") === "application/pdf", "content-type 正確");
  check(cd.startsWith("attachment;"), "標記為 attachment");
  check(cd.includes(encodeURIComponent(item.name)), "中文檔名用 RFC5987 還原", item.name);
  check(r.headers.get("cache-control").includes("immutable"), "長期 immutable 快取");
  check(!!r.headers.get("etag"), "有 etag");
  const body = new Uint8Array(await r.arrayBuffer());
  check(new TextDecoder().decode(body.subarray(0, 4)) === "%PDF", "內容真的是 PDF");
  check(body.length === item.size, "大小與 manifest 一致", `${body.length} vs ${item.size}`);
}

/* 2. 考古題單檔下載 */
console.log("\n[考古題下載]");
{
  const item = manifest.pastExams[0];
  const r = await call(fileUrl(item.key));
  check(r.status === 200, "回 200");
  check(
    r.headers.get("content-disposition").includes(encodeURIComponent(item.name)),
    "檔名正確",
    item.name
  );
}

/* 2b. 分章檔案單檔下載 */
console.log("\n[分章下載]");
{
  const item = manifest.chapters.find((c) => c.subjectNo === "05" && c.type === "題本" && c.ch === "03");
  const r = await call(fileUrl(item.key));
  check(r.status === 200, "回 200", `實際 ${r.status}`);
  check(
    r.headers.get("content-disposition").includes(encodeURIComponent(item.name)),
    "檔名正確",
    item.name
  );
  const oldest = manifest.pastExams.find((e) => e.term === "105-1");
  const r2 = await call(fileUrl(oldest.key));
  check(r2.status === 200, "最早學期的考古題也能下載", oldest.name);
}

/* 3. Range 續傳 */
console.log("\n[Range 續傳]");
{
  const target = manifest.bundles.find((b) => b.subjectNo === "02" && b.type === "詳解");
  const r = await call(fileUrl(target.key), { headers: { range: "bytes=100-199" } });
  check(r.status === 206, "回 206 Partial Content", `實際 ${r.status}`);
  check(!!r.headers.get("content-range"), "有 content-range", r.headers.get("content-range") || "");
  const body = new Uint8Array(await r.arrayBuffer());
  check(body.length === 100, "回傳 100 bytes", `實際 ${body.length}`);
}

/* 4. 存取控制 */
console.log("\n[存取控制]");
for (const [key, label] of [
  ["bundles/02_explanation.txt", "非 PDF"],
  ["bundles/99_explanation.pdf", "manifest 裡沒有的 key"],
  ["explanations/02_Ch03.pdf", "沒有內容雜湊的舊分章 key"],
  ["past-exams/105-1_basic.pdf", "沒有內容雜湊的舊考古題 key"],
]) {
  const r = await call(fileUrl(key));
  check(r.status === 404, `擋下：${label}`, `回 ${r.status}`);
}
// 路徑跳脫要用「百分比編碼」測：未編碼的 ../ 會被 URL 正規化掉，
// 根本進不到 Worker（會變成另一個路徑、落到靜態資產）。
// 編碼過的才會原封不動傳進 handleFile，也才是真正要擋的攻擊向量。
for (const [raw, label] of [
  ["..%2F..%2Fetc%2Fpasswd", "編碼路徑跳脫"],
  ["bundles%2F..%2F..%2Fsecret.pdf", "編碼相對路徑"],
  ["%2e%2e%2f%2e%2e%2fsecret.pdf", "編碼 %2e%2e 跳脫"],
]) {
  const r = await call("https://rnhighpass.com/api/file/" + raw);
  check(r.status === 404, `擋下：${label}`, `回 ${r.status}`);
}
{
  const missingItem = manifest.bundles.find((b) => b.subjectNo === "01" && b.type === "詳解");
  notUploaded.add(missingItem.key);
  const r = await call(fileUrl(missingItem.key));
  notUploaded.clear();
  check(r.status === 404, "manifest 有但 R2 沒有 → 404", `回 ${r.status}`);
}

/* 5. 打包功能已移除 */
console.log("\n[打包功能已移除]");
{
  const r = await call("https://rnhighpass.com/api/zip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keys: ["bundles/02_explanation.pdf"] }),
  });
  // 路由已不存在 → 落到靜態資產，不會是 zip
  check(r.headers.get("content-type") !== "application/zip", "/api/zip 不再回 zip",
    `content-type: ${r.headers.get("content-type")}`);
}

/* 6. manifest 範圍 */
console.log("\n[manifest 範圍]");
{
  check(manifest.bundles.length === 22, "22 本合訂本", `實際 ${manifest.bundles.length}`);
  const types = new Set(manifest.chapters.map((c) => c.type));
  check(types.has("詳解") && types.has("題本"), "分章同時有詳解與題本", `${manifest.chapters.length} 章`);
  const terms = [...new Set(manifest.pastExams.map((e) => e.term))];
  check(terms.length === manifest.pastExams.length / 5, "每個學期 5 份考古題", `${terms.length} 個學期`);
  check(manifest.pastExams.every((e) => e.cover), "每份考古題都有封面路徑");
  const keys = [...manifest.bundles, ...manifest.chapters, ...manifest.pastExams].map((i) => i.key);
  check(new Set(keys).size === keys.length, "key 無重複");
  check(keys.every((k) => /^[\x20-\x7E]+$/.test(k)), "key 全為 ASCII");
}

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass} 通過，${fail} 失敗\n`);
process.exit(fail ? 1 : 0);
