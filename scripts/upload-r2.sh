#!/usr/bin/env bash
# 把 dist-r2/ 底下的檔案上傳到 R2。
#
#   bash scripts/upload-r2.sh [--force] [--bucket <名稱>]
#
# 可重複執行：成功上傳的 key 會記在 .r2-uploaded.log，再跑一次會自動跳過，
# 中途斷線直接重跑即可接續。--force 則忽略紀錄、全部重傳。
#
# 476 個檔案逐一上傳大約要跑十幾分鐘。檔案多的時候建議改用 rclone，
# 作法見 README 的「大量上傳」一節。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist-r2"
LOG="$ROOT/.r2-uploaded.log"
BUCKET="rnhighpass-files"
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --force)  FORCE=1; shift ;;
    --bucket) BUCKET="$2"; shift 2 ;;
    *) echo "未知參數：$1" >&2; exit 1 ;;
  esac
done

[ -d "$DIST" ] || { echo "✗ 找不到 ${DIST}，請先執行 npm run manifest" >&2; exit 1; }

# wrangler 需要 Node 22 以上；這台機器的預設可能是舊版，這裡主動提示。
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "✗ wrangler 需要 Node.js 22 以上，目前是 $(node -v)" >&2
  echo "  請先切換版本，例如：nvm use 22" >&2
  exit 1
fi

[ "$FORCE" -eq 1 ] && : > "$LOG"
touch "$LOG"

total=$(find "$DIST" -name "*.pdf" | wc -l | tr -d ' ')
done_n=0; skip_n=0; fail_n=0; i=0

echo "準備上傳 ${total} 個檔案到 bucket「${BUCKET}」"
echo ""

while IFS= read -r file; do
  key="${file#"$DIST"/}"
  i=$((i + 1))

  if grep -qxF "$key" "$LOG"; then
    skip_n=$((skip_n + 1))
    continue
  fi

  printf "[%3d/%3d] %s … " "$i" "$total" "$key"
  if npx wrangler r2 object put "$BUCKET/$key" \
       --file "$file" --content-type application/pdf --remote >/dev/null 2>&1; then
    echo "$key" >> "$LOG"
    done_n=$((done_n + 1))
    echo "OK"
  else
    fail_n=$((fail_n + 1))
    echo "失敗"
  fi
done < <(find "$DIST" -name "*.pdf" | sort)

echo ""
echo "上傳完成：新增 ${done_n}．略過 ${skip_n}．失敗 ${fail_n}"
[ "$fail_n" -gt 0 ] && { echo "有檔案失敗，重跑這支腳本會只補失敗的部分。" >&2; exit 1; }
echo "紀錄檔：$(basename "$LOG")（刪掉它或加 --force 可重新全部上傳）"
