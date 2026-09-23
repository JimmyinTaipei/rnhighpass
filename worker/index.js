/**
 * 多保命 rnhighpass.com
 *
 * 同一個 Worker 同時負責：
 *   - 靜態網站（env.ASSETS）
 *   - /api/file/<key>  單檔下載
 *
 * 因為 API 與網站同源，R2 bucket 不需要開 public access，也完全不用設 CORS。
 *
 * 網站上只有單檔下載、沒有多檔打包，所以這裡只是把 R2 的串流轉手出去，
 * 幾乎不耗 CPU —— Workers 免費方案就夠用。
 *
 * R2 的 key 一律是 ASCII（例如 bundles/02_explanation.pdf），
 * 使用者要看到的中文檔名存在 manifest 的 name 欄位，下載時才透過
 * Content-Disposition 還原。原因見 scripts/subjects.mjs 的 PREFIXES 註解。
 */

/* ------------------------------ manifest ------------------------------ */

// module scope 的快取，同一個 isolate 內只讀一次。
// 部署新版本會換新的 isolate，所以不需要手動失效。
let manifestPromise = null;

/**
 * 從靜態資產讀 manifest，建出 key → 中文檔名 的對照表。
 *
 * 這份表同時當作 key 的白名單：只有 manifest 裡真的有的 key 才能下載。
 * 比單純比對路徑前綴嚴格得多 —— 前綴比對擋不掉 bucket 裡不該公開的檔案。
 */
function loadManifest(env, baseUrl) {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const res = await env.ASSETS.fetch(new URL("/assets/data/manifest.json", baseUrl));
      if (!res.ok) throw new Error(`讀不到 manifest（${res.status}）`);
      const data = await res.json();
      const names = new Map();
      for (const group of ["bundles", "chapters", "pastExams"]) {
        for (const item of data[group] || []) names.set(item.key, item.name);
      }
      return names;
    })().catch((err) => {
      manifestPromise = null; // 失敗不要一直沿用壞掉的快取
      throw err;
    });
  }
  return manifestPromise;
}

/* -------------------------------- 工具 -------------------------------- */

/** RFC 5987：中文檔名要用 filename* 才不會在各家瀏覽器亂碼。 */
function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/* ----------------------------- 單檔下載 ----------------------------- */

async function handleFile(url, request, env) {
  let key;
  try {
    key = decodeURIComponent(url.pathname.slice("/api/file/".length));
  } catch {
    return jsonError(400, "key 編碼錯誤");
  }

  const names = await loadManifest(env, url);
  const name = names.get(key);
  if (!name) return jsonError(404, "檔案不存在");

  // 支援 Range，手機上下載大檔斷線後才能續傳。
  const range = request.headers.get("range");
  const object = await env.BUCKET.get(key, range ? { range: request.headers } : undefined);
  if (!object) return jsonError(404, "檔案不存在");

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("content-type", "application/pdf");
  headers.set("content-disposition", contentDisposition(name));
  // key 已經版本化，同一個 key 的內容永遠不會變，可以安心長期快取。
  headers.set("cache-control", "public, max-age=31536000, immutable");

  if (object.range && range) {
    const { offset = 0, length = object.size } = object.range;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
}

/* -------------------------------- 路由 -------------------------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/file/")) return await handleFile(url, request, env);
    } catch (err) {
      return jsonError(500, err.message || "伺服器錯誤");
    }

    // 其餘全部交給靜態資產。
    return env.ASSETS.fetch(request);
  },
};
