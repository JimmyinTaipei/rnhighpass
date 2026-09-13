# 多保命 RN High Pass

護理國考分章題本分享網站，免費提供給學弟妹使用。純靜態網站，未來部署到
Cloudflare Pages 並綁定自訂網域 `rnhighpass.com`。

## 技術棧

- 純 HTML / CSS / JavaScript，不使用任何框架，不需要 build 工具
- 可直接部署到 Cloudflare Pages（或任何靜態網站託管服務）

## 目錄結構

```
.
├── index.html          首頁
├── assets/
│   ├── css/
│   │   └── style.css   全站樣式
│   └── js/
│       └── main.js     互動功能（目前為空，之後陸續加入）
└── tools/               各種小工具頁面（例如點滴速率計算機），未來新增
```

新增工具時，直接在 `tools/` 底下建立新的 `.html` 頁面（例如
`tools/iv-drip-calculator.html`），並在首頁「工具」區塊加上連結卡片即可。

## 本機預覽

在專案資料夾下執行：

```
python3 -m http.server 8000
```

然後用瀏覽器打開 `http://localhost:8000`。

也可以直接用瀏覽器打開 `index.html`，或使用 VS Code 的 Live Server 擴充功能。

## 部署

部署到 Cloudflare Pages：

1. 將此專案推送到 GitHub（或直接用 Cloudflare Pages 的 Direct Upload）
2. 在 Cloudflare Pages 建立專案，framework preset 選 "None"，build command 留空，
   輸出目錄設為專案根目錄（`/`）
3. 綁定自訂網域 `rnhighpass.com`
