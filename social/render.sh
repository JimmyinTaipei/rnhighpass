#!/usr/bin/env bash
# 把 social/<post>/slides.html 每一張截成 1080×1350 的 PNG
# 用法：social/render.sh post1
set -euo pipefail
cd "$(dirname "$0")"
post="${1:-post1}"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
out="$post/out"
mkdir -p "$out"
count=$(grep -c '<section class="slide' "$post/slides.html")
for i in $(seq 1 "$count"); do
  f=$(printf '%s/%02d.png' "$out" "$i")
  "$chrome" --headless=new --disable-gpu --hide-scrollbars \
    --allow-file-access-from-files --force-device-scale-factor=1 \
    --window-size=1080,1350 --virtual-time-budget=3000 \
    --screenshot="$PWD/$f" "file://$PWD/$post/slides.html?slide=$i" 2>/dev/null
  echo "$f"
done
