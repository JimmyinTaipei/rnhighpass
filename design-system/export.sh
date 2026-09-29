#!/usr/bin/env bash
# 輸出 Canva 用素材：
#   out/backgrounds/*.png   背景圖層（2160×2700，@2x）
#   out/previews/*.png      範本預覽（1080×1350）
#   out/canva/*.pdf         每個範本一頁 PDF，文字保留為文字，匯入 Canva 可編輯
# 用法：design-system/export.sh
set -euo pipefail
cd "$(dirname "$0")"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
common=(--headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --virtual-time-budget=3000)
mkdir -p out/backgrounds out/previews out/canva

bgnames=(bg-full bg-gradient-waves bg-gradient bg-waves-transparent bg-cloud-transparent)
for i in 1 2 3 4 5; do
  n=${bgnames[$((i-1))]}
  extra=(); [[ $i -ge 4 ]] && extra=(--default-background-color=00000000)
  "$chrome" "${common[@]}" ${extra[@]+"${extra[@]}"} --force-device-scale-factor=2 --window-size=1080,1350 \
    --screenshot="$PWD/out/backgrounds/$n.png" "file://$PWD/bg.html?slide=$i" 2>/dev/null
  echo "out/backgrounds/$n.png"
done

names=(01-cover 02-intro 03-stats 04-screenshot 05-compare 06-steps 07-cards 08-cta)
for i in $(seq 1 ${#names[@]}); do
  n=${names[$((i-1))]}
  "$chrome" "${common[@]}" --force-device-scale-factor=1 --window-size=1080,1350 \
    --screenshot="$PWD/out/previews/$n.png" "file://$PWD/templates.html?slide=$i" 2>/dev/null
  # PDF：用 print.css 讓頁面尺寸就是 1080×1350
  "$chrome" "${common[@]}" --no-pdf-header-footer --print-to-pdf="$PWD/out/canva/$n.pdf" \
    "file://$PWD/templates.html?slide=$i&print=1" 2>/dev/null
  echo "$n"
done
