#!/bin/bash
# 🔧 中優先級問題 2 修復：npm 依賴衝突解決方案

echo "🔧 ENSO 前台 - npm 依賴修復腳本"
echo "================================"

# Step 1: 清理 npm 快取
echo "📦 Step 1: 清理 npm 快取..."
npm cache clean --force

# Step 2: 刪除 node_modules 和 package-lock.json
echo "🗑️  Step 2: 刪除舊的 node_modules 和 lock 文件..."
rm -rf node_modules package-lock.json

# Step 3: 使用 legacy-peer-deps 重新安裝
echo "📥 Step 3: 重新安裝依賴 (使用 --legacy-peer-deps)..."
npm install --legacy-peer-deps

# Step 4: 驗證安裝
echo "✅ Step 4: 驗證安裝..."
npm list --depth=0

echo ""
echo "✅ npm 依賴修復完成！"
echo ""
echo "現在可以執行以下命令："
echo "  npm run dev     - 啟動開發伺服器"
echo "  npm run build   - 編譯生產版本"
echo "  npm run test    - 運行測試"
