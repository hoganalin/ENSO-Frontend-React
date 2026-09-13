# `services/payment/` —— 前端只剩一層薄薄的轉接

金流（綠界 ECPay）、電子發票、簡訊（三竹 Mitake）**已經搬到伺服器端**：
`supabase/functions/`。這個資料夾現在只剩下 `client.ts` 一支會進 build。

```
瀏覽器                              Supabase Edge Function            第三方
client.ts ──functions.invoke()──▶  payment-create ───簽章──────────▶ 綠界付款頁
（不簽章、不驗簽、不傳金額）          （金鑰只存在這一層）
                                    payment-notify ◀──ReturnURL──── 綠界
                                    （訂單完成的唯一真實來源）
```

## 現在有什麼

| 檔案 | 狀態 |
|---|---|
| `client.ts` | ✅ **進 build、有測試**（`src/test/paymentClient.test.ts`）。呼叫 `payment-create` 並把回來的欄位組成隱藏表單 POST 去綠界。 |
| `ecpay.ts` | ⛔ 舊的瀏覽器端實作，已被 `supabase/functions/_shared/ecpay.ts` 取代。仍在 `tsconfig.json` 的 `exclude` 裡。**不要 import。** |
| `index.ts` | ⛔ 同上。`handlePaymentSuccess()` 那條「瀏覽器驗簽後完成訂單」的路已經廢棄。 |
| `../sms/mitake.ts` | ⛔ 同上，已被 `supabase/functions/_shared/mitake.ts` 取代。 |

這三支之所以還留在檔案樹裡，只是因為 `src/pages/PaymentPage.tsx` 還 import 它們
（那支也一併被 exclude，且沒有任何 router 指向它）。等 `PaymentPage` 改寫成用
`client.ts` 之後，這三支加上 `PaymentPage.tsx` 應該一起刪掉。

## 怎麼用

```ts
import { startEcpayPayment, PaymentError } from "@/services/payment/client";

try {
  await startEcpayPayment(orderId);   // 成功時瀏覽器會離開本頁前往綠界
} catch (err) {
  if (err instanceof PaymentError) {
    // err.message 已經是繁中，可直接顯示；err.code 用來分流
    // 例：order_not_payable / amount_mismatch / unauthorized / already_paid
    Swal.fire({ icon: "error", title: "無法付款", text: err.message });
  }
}
```

前端**不需要**（也不該）做這些事：算 CheckMacValue、驗 CheckMacValue、
傳金額給後端、在付款完成後呼叫 `completeOrder()`。最後那件事特別重要 ——
訂單完成一律由 `payment-notify` 負責，前端重複呼叫只會製造重複發放購物金的風險。

## 舊實作踩到的坑（重寫時全部修掉）

前六項是原本這份 README 就記錄的；7~11 是這次對照綠界官方 SDK
（`ecpay_aio_nodejs@1.2.2` 的 `helper.js` 與 `ECpayPayment.xml`）才發現的。

| # | 問題 | 舊位置 | 現在 |
|---|---|---|---|
| 1 | 金鑰打包進瀏覽器 bundle（`VITE_ECPAY_HASH_KEY`） | `ecpay.ts:193` | 改用 Supabase secrets，`.env.example` 已移除 |
| 2 | `import crypto from 'crypto'`（Node API + 同步 hash） | `ecpay.ts:4` | 改用 Web Crypto `crypto.subtle.digest`（非同步） |
| 3 | `react-router-dom` 未安裝 | `PaymentPage.tsx:4` | 尚未修（`PaymentPage.tsx` 仍被 exclude） |
| 4 | `MerchantTradeNo` 塞 UUID（36 字，綠界限 `^\w{4,20}$`） | `ecpay.ts:69` | `ENSO-XXXXXXXX` → `ENSO_XXXXXXXX`（`-` 不合法，`_` 合法且可逆） |
| 5 | 回調的 orderNo 被當成 UUID 去 `.eq("id", …)` | `index.ts:63` | 回調改用 `payment_transactions.merchant_trade_no` 定位訂單 |
| 6 | `EncryptType: 1`（數字）、`paymentMethod: 'ALL'` 不在 union | `ecpay.ts:87`、`index.ts:36` | 字串 `"1"`；union 補上 ALL / ATM / ApplePay |
| 7 | **簽章原文漏了欄位名稱** —— 正確格式是 `HashKey=<key>&…&HashIV=<iv>`，舊版只串了值 | `ecpay.ts:52` | 已修，並與官方 SDK 逐字元比對通過 |
| 8 | **AIO V5 沒有 `NotifyURL` 這個參數** —— 背景回調是 `ReturnURL`，舊版送的 `NotifyURL` 會被綠界忽略，永遠收不到回調 | `ecpay.ts:80` | 改送 `ReturnURL`；測試會斷言表單裡沒有 `NotifyURL` |
| 9 | 回調判斷讀 `TradeStatus` / `TotalAmount`，但回調實際欄位是 `RtnCode` / `TradeAmt` → 永遠判定失敗 | `ecpay.ts:150,166` | 改讀 `RtnCode === '1'` 與 `TradeAmt` |
| 10 | `MerchantTradeDate` 用 `toLocaleString('zh-TW')`，在 UTC 伺服器上會慢 8 小時，且格式受 ICU 版本影響 | `ecpay.ts:70` | 自己算 UTC+8 的 `yyyy/MM/dd HH:mm:ss` |
| 11 | 三竹回應用 `split('|')` 解析，但三竹回的是 INI 區塊（`statuscode=1`），且成功值不是 `'0'` | `mitake.ts:180` | 改為 INI 解析，`0/1/2/4` 視為已受理 |
| 12 | 表單送出用字串拼 HTML + `innerHTML` | `ecpay.ts:95` | 改為 `createElement`／`input.value`，值永遠是純文字 |

另外，**付款成功與否原本只靠前端回報**，即使簽章正確也可被重放。現在有
`payment-notify` 這支 webhook，並用三道閘做冪等（交易狀態條件更新、
購物金 earn 前置檢查、`store_credit_ledger` 的唯一索引）。

## 還缺什麼才算真的能收錢

1. **真實的綠界商店代號**，以及用測試卡跑過一次完整流程。
   目前**沒有任何一筆真實付款走過這條路**。
2. **`PaymentPage` 重寫**：改成呼叫 `client.ts`，並且只顯示狀態、不做任何驗簽。
   寫好之後把 `tsconfig.json` 的 `exclude` 清乾淨、刪掉 `ecpay.ts` / `index.ts` / `sms/mitake.ts`。
3. **電子發票還是骨架**，見 `supabase/functions/README.md`。
4. **訂單金額仍由瀏覽器寫進 DB**（`orders` 的 insert policy 不檢查金額）。
   `payment-create` 有驗算補救，但不是根治。

`/payment/mock/:orderId`（`PaymentMock.tsx`）維持原樣可用：它會呼叫
`completeOrderWithRetry()` 走完整條商業邏輯（發購物金、寫 `sms_log`），
只有「收款」與「實際送出簡訊」是模擬的。上正式金流之後，那條路要拿掉，
否則等於留了一個「不用付錢就能完成訂單」的後門。
