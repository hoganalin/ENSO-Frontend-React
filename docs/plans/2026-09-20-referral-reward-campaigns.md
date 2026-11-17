# 推薦活動加碼（2026-09-20）

獨立 referral_reward_campaigns 與原 promotions 折扣引擎區隔。一般會員等級的推薦人在付款結算時，取得原 referral_cashback_rate 基礎購物金及一個有效加碼活動（priority 大者優先，同優先序依建立時間、ID 決定）。空 referrer_ids 代表所有符合資格推薦人；開始時間含、結束時間不含，使用伺服器付款結算時間。

活動 fixed 使用整數 NT$，percent 使用商品小計百分比、四捨五入整數。加碼合併同一筆 earn，保留現有 unique earn per order 保護。referral_reward_snapshots 保存活動名稱、公式及計算結果，日後編輯活動不影響既有金額。退款用累計比例逆轉該筆完整購物金，含加碼。

後台活動頁可建立或停用活動，管理員寫入、財務唯讀。指定推薦人以會員姓名及推薦碼勾選，不顯示資料庫 ID。買家折扣、發票金額與付款金額均不變。

SQL 驗收：supabase/tests/referral_reward_campaigns.sql（BEGIN/ROLLBACK），涵蓋固定、比例、優先順序、expired/future、白名單、重複付款回調、部分退款回沖與不可變快照。主 agent 執行遠端部署及驗收；本分工不直接部署。後台 build 已通過。
