#!/bin/bash
# 自動格式化 hook
# 編輯 .ts/.tsx/.js/.jsx/.scss/.css 檔案後自動執行 eslint --fix

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | grep -oP '"file_path"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"file_path"\s*:\s*"\([^"]*\)".*/\1/')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx)
    npx eslint --fix "$FILE_PATH" 2>/dev/null || true
    ;;
esac

exit 0
