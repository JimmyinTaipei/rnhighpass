#!/usr/bin/env bash
# 從 PDF 第一頁產生網站用的封面圖：詳解／題本合訂本各 11 張 + 每份考古題一張。
#
#   bash scripts/make-covers.sh [--force] [dist-r2 路徑]
#
# 要處理哪些檔案、輸出到哪裡，全部讀 dist-r2/covers.json（npm run manifest 產生），
# 這裡不解析任何檔名。已經存在的封面會跳過，--force 則全部重做。
#
# 只用 macOS 內建工具：qlmanage 把第一頁算成高解析 PNG，sips 縮圖並轉成 jpg。
# （sips 直接讀 PDF 只能算到 72 dpi，寬度只有 499px，放大後會糊。）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORCE=0
DIST="$ROOT/dist-r2"
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    *) DIST="$1"; shift ;;
  esac
done
LIST="$DIST/covers.json"

for cmd in qlmanage sips node; do
  command -v "$cmd" >/dev/null || { echo "✗ 找不到 ${cmd}（這支腳本需要 macOS）" >&2; exit 1; }
done
[ -f "$LIST" ] || { echo "✗ 找不到 ${LIST}，請先執行 npm run manifest" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

made=0
skipped=0
while IFS=$'\t' read -r key out width; do
  dest="$ROOT/$out"
  if [ "$FORCE" -eq 0 ] && [ -f "$dest" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  src="$DIST/$key"
  [ -f "$src" ] || { echo "✗ 找不到 $src" >&2; exit 1; }
  mkdir -p "$(dirname "$dest")"

  # -s 是長邊像素；頁面比例約 1:1.42，算到寬度的 1.5 倍再縮，確保夠清楚。
  qlmanage -t -s $((width * 3 / 2)) -o "$tmp" "$src" >/dev/null 2>&1
  png="$tmp/$(basename "$src").png"
  [ -f "$png" ] || { echo "✗ 無法產生第一頁：$src" >&2; exit 1; }
  sips --resampleWidth "$width" -s format jpeg -s formatOptions 80 "$png" --out "$dest" >/dev/null
  rm -f "$png"
  echo "  ✓ $out"
  made=$((made + 1))
done < <(node -e '
  for (const c of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")))
    console.log([c.key, c.out, c.width].join("\t"));
' "$LIST")

echo ""
echo "✓ 產生 $made 張封面，略過 $skipped 張已存在的（--force 可全部重做）"
du -sh "$ROOT/assets/images/covers" | awk '{print "  合計 "$1}'
