#!/bin/bash
# 自動跑測試 hook
# 編輯原始碼後自動執行對應的測試

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | grep -oP '"file_path"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"file_path"\s*:\s*"\([^"]*\)".*/\1/')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# 只在 src/ 下的 .ts/.tsx 檔案觸發
case "$FILE_PATH" in
  src/*.ts|src/*.tsx)
    # 跳過測試檔案本身，避免無限循環
    case "$FILE_PATH" in
      *.test.*|*__tests__*) exit 0 ;;
    esac

    # 嘗試找對應的測試檔案
    DIR=$(dirname "$FILE_PATH")
    BASENAME=$(basename "$FILE_PATH" | sed 's/\.\(ts\|tsx\)$//')
    TEST_FILE="$DIR/__tests__/$BASENAME.test.tsx"
    TEST_FILE2="$DIR/__tests__/$BASENAME.test.ts"

    if [ -f "$TEST_FILE" ]; then
      npx vitest run "$TEST_FILE" --reporter=verbose 2>&1 | tail -20
    elif [ -f "$TEST_FILE2" ]; then
      npx vitest run "$TEST_FILE2" --reporter=verbose 2>&1 | tail -20
    fi
    ;;
esac

exit 0
