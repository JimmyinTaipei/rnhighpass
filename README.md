# 多保命 RN High Pass

護理國考複習資源網站，免費提供給學弟妹使用。純靜態前端 + Cloudflare Worker，
網域 `rnhighpass.com`。

## 技術棧

- 前端：純 HTML / CSS / JavaScript，不使用框架、不需要 build 工具
- 部署：Cloudflare **Worker + Static Assets**（不是 Pages），設定檔 `wrangler.jsonc`
- 檔案儲存：Cloudflare **R2**（private bucket，不對外公開）

網站與 API 同源，所以 **不需要設定 CORS，R2 也不用開 public access**。

Worker 只做單檔下載（把 R2 的串流轉手出去），幾乎不耗 CPU，
**Workers 免費方案就夠用**。

## 網站上放什麼

| 頁面 | 內容 |
|---|---|
| 首頁 `/`「題目下載」 | 分頁切換：分章詳解合訂本（11 本）、分章題本合訂本（11 本）、最新一期考古題（5 份），點封面直接下載 |
| 更多考題 `/downloads/more.html` | 分章詳解／題本逐章下載（各 162 章）、全部 26 個學期的考古題（130 份），底下附 Google Drive 整批下載 |
| 使用教學 `/guide.html`、問題回饋 `/feedback.html` | 使用說明、回饋表單、社群連結 |

476 個檔案全部放在 R2、都可以從網站下載。Google Drive 的連結（`assets/data/links.json`）
留給想一次下載整個資料夾的人。

首頁與更多考題的內容都由 `assets/data/manifest.json` 在瀏覽器端產生，
**HTML 裡不寫死任何檔案 key**——key 帶內容雜湊，檔案一更新就會變。

## 目錄結構

```
.
├── index.html                首頁（題目下載）
├── downloads/
│   ├── more.html             更多考題
│   └── past-exams.html       舊網址，轉址到 more.html#past
├── guide.html                使用教學
├── feedback.html             問題回饋 + 社群連結
├── worker/index.js           /api/file 單檔下載
├── scripts/
│   ├── subjects.mjs          科目主檔與 ASCII 對照表
│   ├── build-manifest.mjs    來源資料夾 → 正規化 + 產生 manifest
│   ├── make-covers.sh        抽 PDF 第一頁當封面圖
│   └── upload-r2.sh          批次上傳到 R2（可中斷續傳）
├── assets/
│   ├── data/manifest.json    檔案清單（產生物，要 commit）
│   ├── data/links.json       Drive / 社群連結（手動編輯）
│   ├── css/style.css         全站樣式（頁首、漢堡選單、回到頂端）
│   ├── css/downloads.css     下載頁樣式（分頁、封面卡、側欄、章節卡）
│   ├── js/main.js            全站共用：漢堡選單、回到頂端、window.RN 小工具
│   ├── js/home.js            首頁題目下載
│   ├── js/more.js            更多考題
│   ├── js/subject-icons.js   11 科 icon（與多保命測驗一致）
│   ├── js/site-links.js      把 links.json 填進頁面
│   └── images/covers/
│       ├── bundles/          合訂本封面 22 張（{序號}_{explanation|workbook}.jpg）
│       └── past-exams/       考古題封面 130 張（{學期}_{考卷}.jpg，檔名同 R2 key 的 ASCII 寫法）
└── tools/nursing/            臨床小工具
```

## 檔案命名規則

**使用者下載到的檔名**（manifest 的 `name`）：

| 類型 | 格式 | 範例 |
|---|---|---|
| 合訂本 | `{序號}_{科目}_{類型}_合訂本.pdf` | `02_病理_詳解_合訂本.pdf` |
| 考古題 | `{學期}_{考卷}.pdf` | `115-1_基礎醫學.pdf`、`106-2補考_基礎醫學.pdf` |

科目序號一律兩碼，避免破十之後排序錯亂。

**R2 上實際的 key**（manifest 的 `key`）一律是 ASCII：

```
bundles/02_explanation_e144ac16ae.pdf     → 02_病理_詳解_合訂本.pdf
bundles/02_workbook_f5dc19d864.pdf        → 02_病理_題本_合訂本.pdf
past-exams/115-1_basic_a1b2c3d4e5.pdf     → 115-1_基礎醫學.pdf
```

> **為什麼 key 不用中文**：`wrangler r2 object put` 會把非 ASCII 的 key
> 百分比編碼後才存進 R2（v3、v4 實測皆然），但 R2 網頁後台拖拉上傳存的是原始 UTF-8。
> 兩種編碼混用會讓檔案「明明在 bucket 裡卻抓不到」，而且不會有任何錯誤訊息。
> 改用 ASCII key 之後，不管用哪個工具上傳結果都一致。
> 使用者下載到的仍然是上表的中文檔名 —— Worker 會從 manifest 查出 `name`，
> 再用 `Content-Disposition: filename*=UTF-8''…` 送出。

### 更新檔案：不用做任何事，正常改完重新產生 manifest 就好

R2 的 key 尾端那串英數字（`_e144ac16ae`）是**檔案內容的雜湊值**，由
`scripts/build-manifest.mjs` 的 `withContentHash()` 自動算出來、自動加上去
的——**不需要手動改檔名、不需要加 `_v2`**。檔案內容只要有變，重新跑
`npm run manifest` 算出來的雜湊就會不一樣，key 自然跟著變成一個新的 URL。

這樣設計是為了讓 `Cache-Control: immutable` 這種一年期長快取真正安全：
key 不變 = 內容保證沒變（雜湊相同代表位元組相同），才能放心讓瀏覽器永遠不重新驗證。
早期版本曾經用「手動在檔名加 `_v2`」的方式做版本化，但這個機制要求每次改內容都要
記得手動改檔名——一旦忘記（例如直接覆蓋原檔案重新輸出），檔案內容變了但 key 沒變，
瀏覽器的 immutable 快取會繼續顯示舊版本、而且完全不會有錯誤訊息提示，非常難察覺。
改成自動雜湊之後這個風險就不存在了。

> **注意**：因為雜湊是內容決定的，**每次改動來源檔案、重新產生 manifest 後，
> 對應的 key 都會變成新的**。舊 key 對應的物件不會自動從 R2 刪除（不影響網站，
> 只是變成沒人引用的孤兒物件），需要的話可以之後手動清理，不影響日常操作。

## 更新流程

來源資料夾預設是 `~/Downloads/0_護理國考分章/07_pdf`。

```sh
nvm use 22                 # wrangler 需要 Node 22 以上
npm install

npm run manifest -- --src "/Users/jimmy/Downloads/0_護理國考分章/07_pdf"
npm run covers             # 補上缺少的封面（新學期）；封面設計改了要加 -- --force 全部重做
npm run upload             # 上傳到 R2（可中斷續傳）
npm run deploy             # 部署網站與 Worker
git add assets/data/manifest.json assets/images/covers && git commit -m "更新檔案清單"
```

`build-manifest.mjs` 會做五項檢查，任何一項沒過就中止，不會產出半套清單：

1. 每一章都要同時有詳解與題本
2. 每科章節必須從 Ch01 連號、沒有缺口
3. 每科都要有詳解與題本兩本合訂本
4. 每個學期的考古題份數必須一致
5. key 不得重複

封面圖不是從檔名推的：`npm run manifest` 會順便寫出 `dist-r2/covers.json`
（R2 key → 封面輸出路徑），`npm run covers` 照這份清單用 macOS 內建的
`qlmanage` + `sips` 抽第一頁，不需要另外安裝 poppler。

### 檔名之後又改了怎麼辦

腳本不寫死任何檔名，而是依序套用 `scripts/build-manifest.mjs` 裡的
`CHAPTER_PATTERNS` / `BUNDLE_PATTERNS` / `PAST_EXAM_PATTERNS`。
目前同時吃得下合訂本與考古題的新舊兩種命名。

出現新格式時，只要在對應陣列加一條 pattern 就好，**前端與 Worker 都不用改**。
解析不出來的檔案會被列出來並中止，不會默默漏掉。

改名做到一半、新舊檔並存時，腳本會自動採用比較接近目標格式的那一份，
並把被略過的舊檔列成警告 —— 舊檔刪掉後警告就會消失。

## 外部連結設定（`assets/data/links.json`）

Google Drive 與社群連結都集中在這個檔案，**手動編輯**，不會被 `npm run manifest` 蓋掉：

```json
{
  "drive": { "explanations": "…", "workbooks": "…", "pastExams": "…" },
  "social": { "threads": "", "instagram": "" }
}
```

`assets/js/site-links.js` 會把它填進標了 `data-link="drive.explanations"` 的元素。
**空字串的連結會自動隱藏**，整個區塊的連結都沒填就把區塊收掉 ——
所以社群網址補上之前不會出現死連結，補上去也不用改程式。

## R2 設定

```sh
npx wrangler r2 bucket create rnhighpass-files
```

**維持 private**：不要開 public access、也不需要設 CORS。所有存取都經由
Worker 的 `BUCKET` binding，而 Worker 只放行 manifest 裡真的有的 key。

### 大量上傳

`npm run upload` 是用 `wrangler r2 object put` 逐檔上傳，476 個檔案大約十幾分鐘（已上傳過的會自動跳過）。
想快一點可以改用 rclone（R2 相容 S3 API）：到 Cloudflare 後台建一組 R2 API Token，
設定 rclone remote 之後：

```sh
rclone copy dist-r2/ r2:rnhighpass-files/ --transfers 16 --progress
```

因為 key 都是 ASCII，rclone 與 wrangler 上傳的結果完全一致，兩種混著用也沒問題。

## 本機開發

```sh
npm run serve      # http://127.0.0.1:8788
npm test           # Worker 的單元測試（31 項）
```

`npm run serve` 用 Node 直接驅動 `worker/index.js`，並把 `dist-r2/` 當成 R2 來讀，
所以 **執行前要先跑過 `npm run manifest`**。它不需要 Node 22、也不會有
`wrangler dev` 在根目錄當 assets 時反覆重載的問題，開發時建議用這個。

要跑真正的 workerd 環境時：

```sh
nvm use 22
npx wrangler dev
```

`.assetsignore` 會把 `node_modules`、`dist-r2`、`scripts`、`worker` 等
排除在靜態資產之外 —— 少了它，`wrangler deploy` 會因為 `node_modules` 裡
有超過 25 MB 的檔案而失敗。

## 部署

```sh
nvm use 22
npx wrangler deploy
```

Custom Domain `rnhighpass.com` 已在 Cloudflare dashboard 的 Workers 專案設定中綁定。
