#!/usr/bin/env bash
# 從各科「詳解合訂本」的第一頁產生首頁用的科目封面圖。
#
#   bash scripts/make-covers.sh [dist-r2 路徑]
#
# 讀 dist-r2/ 而不是原始來源資料夾，因為 dist-r2 裡的檔名已經正規化過，
# 不會受來源檔名還在改的影響。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${1:-$ROOT/dist-r2}"
BUNDLES="$DIST/合訂本"
OUT="$ROOT/assets/images/covers"

for cmd in pdftoppm sips; do
  command -v "$cmd" >/dev/null || { echo "✗ 找不到 $cmd（pdftoppm 請用 brew install poppler）" >&2; exit 1; }
done
[ -d "$BUNDLES" ] || { echo "✗ 找不到 $BUNDLES，請先執行 npm run manifest" >&2; exit 1; }

mkdir -p "$OUT"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

count=0
for pdf in "$BUNDLES"/*_詳解_合訂本.pdf; do
  [ -e "$pdf" ] || { echo "✗ $BUNDLES 裡沒有詳解合訂本" >&2; exit 1; }
  base="$(basename "$pdf" .pdf)"
  subject="${base%%_詳解_合訂本}"          # 01_生解_詳解_合訂本 → 01_生解

  # -r 100 先算出夠大的圖，再用 sips 縮到寬 600px 並壓成 jpg。
  pdftoppm -jpeg -r 100 -f 1 -l 1 -singlefile "$pdf" "$tmp/$subject"
  sips -Z 600 -s format jpeg -s formatOptions 80 \
       "$tmp/$subject.jpg" --out "$OUT/$subject.jpg" >/dev/null
  echo "  ✓ $subject.jpg"
  count=$((count + 1))
done

echo ""
echo "✓ 產生 $count 張封面 → assets/images/covers/"
du -sh "$OUT" | awk '{print "  合計 "$1}'
