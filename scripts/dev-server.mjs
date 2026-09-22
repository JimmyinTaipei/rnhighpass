/** 本機測試伺服器：靜態檔 + 用真正的 worker/index.js 處理 /api/*。 */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import worker from "../worker/index.js";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = path.join(ROOT, "dist-r2");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg", ".png": "image/png", ".pdf": "application/pdf" };

async function serveStatic(pathname) {
  let p = decodeURIComponent(pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) return new Response("no", { status: 403 });
  try {
    const buf = await readFile(file);
    return new Response(buf, { status: 200,
      headers: { "content-type": TYPES[path.extname(file)] || "application/octet-stream" } });
  } catch { return new Response("Not found", { status: 404 }); }
}

const env = {
  ASSETS: { fetch: (req) => serveStatic(new URL(req.url ?? req).pathname) },
  BUCKET: {
    async head(k){ try { return { size: (await stat(path.join(DIST,k))).size }; } catch { return null; } },
    async get(k){ let b; try { b = await readFile(path.join(DIST,k)); } catch { return null; }
      return { size:b.length, httpEtag:'"t"', writeHttpMetadata(){},
        body: new ReadableStream({ start(c){ for(let i=0;i<b.length;i+=256*1024)
          c.enqueue(new Uint8Array(b.subarray(i,Math.min(i+256*1024,b.length)))); c.close(); } }) }; } },
};

http.createServer(async (req, res) => {
  const url = "http://localhost:8788" + req.url;
  const chunks = []; for await (const c of req) chunks.push(c);
  const init = { method: req.method, headers: req.headers };
  if (chunks.length) init.body = Buffer.concat(chunks);
  const out = await worker.fetch(new Request(url, init), env);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  if (out.body) Readable.fromWeb(out.body).pipe(res); else res.end();
}).listen(8788, () => console.log("ready on 8788"));
