#!/bin/bash
# 敏感檔案保護 hook
# 阻止編輯 .env, *.lock, *.sqlite 等敏感檔案

PROTECTED_PATTERNS=(
  ".env"
  ".env.*"
  "*.lock"
  "*.sqlite"
  "*.sqlite3"
  "*.pem"
  "*.key"
)

# 從 stdin 讀取 JSON input
INPUT=$(cat)

# 取得被編輯的檔案路徑
FILE_PATH=$(echo "$INPUT" | grep -oP '"file_path"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"file_path"\s*:\s*"\([^"]*\)".*/\1/')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

BASENAME=$(basename "$FILE_PATH")

for PATTERN in "${PROTECTED_PATTERNS[@]}"; do
  case "$BASENAME" in
    $PATTERN)
      echo "BLOCKED: 禁止編輯敏感檔案 '$BASENAME'。如需修改請手動操作。"
      exit 2
      ;;
  esac
done

exit 0
