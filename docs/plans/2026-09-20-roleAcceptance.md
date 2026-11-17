# 角色驗收與經銷入口（2026-09-20）

## 實際驗證

- `npx supabase db query --linked --file supabase/tests/roleAcceptance.sql`：PASS。六角色 customer/distributor/support/warehouse/finance/admin，以 SET LOCAL ROLE authenticated 實際啟用 RLS，覆蓋訂單與明細可見性、通知可見性、拒絕直接改訂單、拒絕冒用管理員 RPC、訂閱續期權限。服務端 actor 檢查覆蓋收件資料、出貨、通知對帳。測試 fixture 全部 transaction rollback，未改真人訂單。
- `npx vitest run src/test/distributorAcceptance.test.tsx --pool=threads --maxWorkers=2`：3 passed。
- `npm run build`：通過；既有 Sass deprecation 與 bundle size 警告仍在。
- 以上 SQL 與 React 測試不等於多角色瀏覽器驗收。

## 新功能

- `/distributor`：經銷角色限定；有效訂閱的折減預估、訂閱到期狀態、多商品數量一次加入既有購物車、自己的訂單對帳與狀態。
- 價格由結帳服務重算，批量加入僅傳商品 ID/數量；資料查詢使用 profile.id 並受既有 RLS 約束。
- `/partner-resources`：標明測試示範的教育教材與可選取複製推薦文案；連至自己的推薦資訊。
- `MemberPage` 增加入口，無資料庫 migration 或部署。

## 原始需求核對

已透過 DOCX zip XML 讀取系統需求，文件明列：VIP 限定商品與優先活動、推薦素材、經銷批量採購/對帳/教育、客服退換貨與備註、倉管揀貨、行銷內容/分群/訊息、財務獎金结算。經銷及素材入口已補；其餘各子項應由整合驗收逐一確認，不應把第三方模擬串接完成等同全需求完成。

庫存結帳預留/逾時釋放不是原始 DOCX 明列項目；可列為額外改進，不應取代原始功能優先序。
