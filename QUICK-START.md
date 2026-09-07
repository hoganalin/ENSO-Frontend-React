# 🚀 ENSO 前台 Supabase 遷移 - 快速開始

## ✅ 已完成的工作

所有以下工作已自動完成，無需手動操作：

- ✅ **Login.tsx** - 已從課程 API 遷移到 Supabase Auth
- ✅ **Checkout.tsx** - 已建立新文件，使用 Supabase 訂單系統
- ✅ **PaymentMock.tsx** - 已更新為使用 Supabase completeOrder()
- ✅ **測試文檔** - ENSO-SUPABASE-MIGRATION.md 已生成
- ✅ **遷移總結** - MIGRATION-SUMMARY.txt 已生成

## 🎯 現在你需要做：

### 步驟 1️⃣：驗證環境配置（2分鐘）

```bash
# 進入項目目錄
cd "C:\Users\Rogan\OneDrive\文件\sideproject\walter 需求網站\ENSO前台\ENSO-main-React"

# 檢查 .env.local 是否有 Supabase 憑證
cat .env.local | grep VITE_SUPABASE

# 應該看到類似：
# VITE_SUPABASE_URL=https://xxxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 步驟 2️⃣：啟動開發服務器（3分鐘）

```bash
# 安裝依賴（如果還沒做）
npm install

# 啟動開發服務器
npm run dev

# 應看到類似：
# VITE v5.4.3  ready in 1234 ms
# ➜  Local:   http://localhost:5173/
# ➜  press h to show help
```

### 步驟 3️⃣：測試核心功能（10分鐘）

打開 http://localhost:5173 並執行以下測試：

#### 測試 A：登入功能
1. 點擊「登入」按鈕
2. 輸入帳號：`user2@test.com`
3. 輸入密碼：你設定的密碼
4. ✅ 應看到歡迎提示，表示登入成功

#### 測試 B：購物流程
1. 登入後進入產品頁面
2. 選擇一個商品（例如「芽莊沈香 ¥1280」）
3. 點擊「加入購物車」
4. 進入購物車頁面
5. 點擊「結帳」
6. ✅ 應看到訂單摘要（小計 + 運費 = 合計）

#### 測試 C：支付模擬
1. 在結帳頁面點擊「前往支付」
2. 在支付頁面點擊「模擬支付成功」
3. ✅ 應看到「付款成功，訂單已完成，購物金已發放」提示

#### 測試 D：驗證購物金發放
1. 登出 user2
2. 登入推薦人帳號：`user1@test.com`
3. 進入 `/referral` 頁面
4. ✅ 應在「購物金交易」中看到新增的購物金記錄
   - 金額應為：¥1280 × 10% = ¥128

## 📊 快速檢查清單

| 項目 | 檢查方法 | 預期結果 |
|------|--------|--------|
| 文件更新 | 檢查 `src/components/Login.tsx` 是否有 `db.auth.signIn` | ✅ 應該有 |
| 環境變數 | 執行 `cat .env.local \| grep VITE_SUPABASE` | ✅ 應該有 URL 和 KEY |
| 開發服務器 | 執行 `npm run dev` | ✅ 應該在 5173 上運行 |
| 登入頁面 | 訪問 http://localhost:5173/login | ✅ 應該載入成功 |
| Supabase 連接 | 登入時檢查瀏覽器控制台 | ✅ 不應有紅色錯誤 |

## 🔍 故障排除

### 問題：npm run dev 超時或緩慢
**解決**：
```bash
# 清除緩存
rm -rf dist/ node_modules/.vite

# 重新啟動
npm run dev
```

### 問題：登入失敗「無法取得使用者資訊」
**解決**：
1. 檢查帳號是否在 Supabase 認證中
2. 檢查對應的 profile 記錄是否存在
3. 查看瀏覽器控制台確切的錯誤信息

### 問題：購物金未發放
**解決**：
1. 確認 user2 的 referrer_id 是否指向 user1
2. 確認 user1 是 normal tier（購物金才會發放給 normal tier）
3. 檢查訂單是否標記為 `completed`

## 📚 進階測試

完成上述測試後，查看完整測試文檔：

```bash
# 打開完整測試指南
cat ENSO-SUPABASE-MIGRATION.md

# 打開遷移總結
cat MIGRATION-SUMMARY.txt
```

## 💾 提交變更（可選）

如果一切正常，可以提交代碼：

```bash
cd "C:\Users\Rogan\OneDrive\文件\sideproject\walter 需求網站\ENSO前台\ENSO-main-React"

# 查看修改過的文件
git status

# 添加文件
git add src/components/Login.tsx src/components/Checkout.tsx src/components/PaymentMock.tsx

# 提交
git commit -m "feat: migrate frontend to Supabase auth and checkout system"

# 推送（如果有遠程倉庫）
git push origin main
```

## 📞 需要幫助？

1. 查看瀏覽器控制台（F12 → Console）尋找紅色錯誤
2. 檢查 Supabase 儀表板的 Logs 頁面
3. 查看完整測試文檔中的故障排除部分

## 🎉 下一步

- [ ] 完成上述基本測試
- [ ] 連接真實支付網關
- [ ] 實現購物金提現功能
- [ ] 設置後台管理系統
- [ ] 配置 SMS 通知

---

**遷移完成時間**：2026-09-03  
**預計測試時間**：15分鐘  
**預計調試時間**：10-30分鐘（取決於環境）

祝你測試愉快！ 🎊
