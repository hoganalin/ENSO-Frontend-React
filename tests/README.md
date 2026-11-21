# 測試說明(Integration / E2E / Postman)

> 本專案架構:Supabase(Postgres)+ Deno Edge Functions + React/Vite + TapPay 3DS。
> 測試一律打「本機 Supabase」或本機前端,**絕不碰正式專案 `dznzipfuqtpkvklmlywt`、絕不用正式 TapPay 金鑰**。
> 完整決策與計畫見專案文件 `queenmaeve-測試計畫.md`。

## 前置(你的 Windows)
1. 啟動 **Docker Desktop**。
2. `supabase start`(起本機 Postgres + Edge Functions;記下 API URL / anon / service_role key)。
3. `supabase db reset`(套用所有 migration,含庫存預留/可售量)。
4. 建測試帳號:`node scripts/seed-test-accounts.mjs`(會員 `e2e-member@test.local` / `E2e-Password-123`、admin `e2e-admin@test.local`)。
5. 安裝測試套件(首次):`npm i`(會裝 @playwright/test、newman)、`npx playwright install chromium`。
6. 本機金鑰若非 CLI 預設,請設環境變數:`TEST_SUPABASE_URL`、`TEST_SUPABASE_ANON_KEY`、`TEST_SUPABASE_SERVICE_ROLE_KEY`。

## 四個指令
| 指令 | 說明 | 需要 |
|---|---|---|
| `npm run test:unit` | 現有 28 個單元/元件測試(jsdom,不碰 DB) | 無 |
| `npm run test:integration` | 打本機 Supabase 的 `checkout-create`/`admin-order-action`,驗建單/寫入/運費/總額/下單預留(可售−、實體不變)/完成實扣/失敗不留半截 | supabase start |
| `npm run test:e2e` | Playwright 可見瀏覽器:登入→加入購物車→結帳→建單→TapPay 3DS(**你手動過 OTP**)→回站驗「已付款」+截圖 | 本機 vite dev + 本機 Supabase + TapPay sandbox |
| `npm run postman` | newman 跑 Postman collection(登入存 JWT→帶 Bearer→打 edge/rest) | supabase start + seed 帳號 |

另:`npm run postman:gen` 產生 `openapi.json`(PostgREST 自動 OpenAPI + 手補 Edge Functions)。

## E2E 付款那步(重要)
信用卡 3DS 的 OTP 在發卡行頁面,**不可由程式輸入卡號/OTP**。E2E 以 `headless:false` 開可見瀏覽器,跑到付款頁後**由你手動完成 OTP**;測試會輪詢「付款成功/已付款」最多 5 分鐘,出現即截圖(`tests/e2e/__screenshots__/payment-success.png`)並通過,逾時則該測 skip。
E2E 的選擇器為 best-effort,若按鈕文字/欄位與實際不同,請於 `tests/e2e/checkout.e2e.spec.ts` 微調。

## 安全
- 整合測試與 seed 內建「非本機即拒連」防呆(偵測到正式 ref 直接拋錯)。
- 測試資料只在本機;E2E/整合產生的訂單隨本機 `supabase db reset` 清除。
