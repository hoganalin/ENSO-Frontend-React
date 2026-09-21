// supabase/functions/payment-notify/index.ts
// 綠界 AIO 的伺服器端背景回調（設定在表單的 **ReturnURL**，AIO 沒有 NotifyURL）。
//
// 這支函式是「訂單完成」的唯一真實來源。瀏覽器回來的那一條路（OrderResultURL）
// 只能用來顯示畫面，絕對不能用來發購物金 —— 使用者可以關掉分頁、可以改請求。
//
// 冪等性是硬需求：綠界在沒收到 `1|OK` 時會重送，而且使用者按重新整理、
// 網路重試都可能讓同一筆回調進來兩次。重複處理的後果是「購物金發兩次」。
// migration 008 的 RPC 以單一交易完成付款、訂單與購物金，並以訂單鎖序列化重試。
//
// 部署注意：這支函式必須 `--no-verify-jwt`，綠界不會帶 Supabase 的 JWT。
// 也就是說端點是公開的 —— 所以「驗簽 + 驗金額」是唯一的防線，不能省。

import {
  formDataToRecord,
  loadEcpayConfig,
  parseNotifyPayload,
  verifyCheckMacValue,
} from "../_shared/ecpay.ts";
import { ecpayAck } from "../_shared/response.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { processDeliveryJobs } from "../_shared/delivery.ts";



interface OrderRecord {
  id: string;
  order_no: string;
  status: string;
  buyer_id: string | null;
  referrer_id: string | null;
  subtotal: number;
  total: number;
  referrer_tier_snapshot: string | null;
  recipient: unknown;
}


Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return ecpayAck(false, "Method Not Allowed");
  }

  // ── 1. 取出綠界 POST 的表單 ─────────────────────────────
  let payload: Record<string, string>;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      payload = formDataToRecord(new URLSearchParams(await req.text()));
    } else {
      // 綠界正式送的是 form-urlencoded；multipart 只是保險。
      payload = formDataToRecord(await req.formData());
    }
  } catch (err) {
    console.error("[payment-notify] 無法解析 body", err);
    return ecpayAck(false, "Bad Request");
  }

  // ── 2. 驗簽（公開端點的唯一防線）───────────────────────
  let config;
  try {
    config = loadEcpayConfig();
  } catch (err) {
    console.error("[payment-notify] 設定不完整", err);
    // 回 0|... 讓綠界重送：設定補上之後這筆就會被補做。
    return ecpayAck(false, "Server Misconfigured");
  }

  const signatureOk = await verifyCheckMacValue(payload, config);
  if (!signatureOk) {
    console.error(
      `[payment-notify] CheckMacValue 驗證失敗 MerchantTradeNo=${payload.MerchantTradeNo ?? "?"}`,
    );
    // 簽章不符代表來源不可信 —— 回 0 但**不要**重試處理，也不要動任何資料。
    return ecpayAck(false, "CheckMacValue Error");
  }

  const result = parseNotifyPayload(payload);
  if (!result.merchantTradeNo) {
    return ecpayAck(false, "Missing MerchantTradeNo");
  }

  if (payload.MerchantID !== config.merchantId) return ecpayAck(false, "Merchant Mismatch");
  if (!/^\d+$/.test(payload.TradeAmt ?? "") || !Number.isSafeInteger(result.amount)) return ecpayAck(false, "Invalid Amount");
  if (config.isProduction && result.simulatePaid) return ecpayAck(false, "Simulated Payment Rejected");

  const admin = createAdminClient();

  try {
    // The RPC commits payment, order and referral credit together. A paid transaction
    // without settled_at (left by the old handler) is repaired on retry.
    const { data, error } = await admin.rpc("settle_ecpay_payment", {
      p_merchant_trade_no: result.merchantTradeNo,
      p_gateway_trade_no: result.gatewayTradeNo,
      p_amount: result.amount,
      p_payment_type: result.paymentType,
      p_paid: result.paid,
      p_payload: payload,
    });
    if (error) throw new Error(error.message);
    const settlement = data as { outcome: string; order: OrderRecord; credit: number };
    if (settlement.outcome === "review_required") {
      console.error(`[payment-notify] Payment requires reconciliation: ${result.merchantTradeNo}`);
    }
    if (settlement.outcome !== "settled") return ecpayAck(true);
    const order = settlement.order;
    const credit = { issued: settlement.credit > 0, amount: settlement.credit };
    // migration 009 enqueues delivery jobs in the settlement transaction.
    // Background failure never changes the financial acknowledgement; jobs remain inspectable.
    const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (work: Promise<unknown>) => void } }).EdgeRuntime;
    if (runtime) runtime.waitUntil(processDeliveryJobs(admin,3).catch(error => console.error("[delivery]",error)));
    console.log(
      `[payment-notify] 完成 order=${order.order_no} amount=${result.amount} ` +
        `credit=${credit.amount} tradeNo=${result.gatewayTradeNo}` +
        (result.simulatePaid ? " (SimulatePaid)" : ""),
    );
    return ecpayAck(true);
  } catch (err) {
    console.error("[payment-notify] 處理失敗", err);
    // 回 0|... 讓綠界重送；靠上面的冪等閘門保證重送不會重複發錢。
    return ecpayAck(false, "Internal Error");
  }
});
