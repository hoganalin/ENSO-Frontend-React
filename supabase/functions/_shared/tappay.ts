// supabase/functions/_shared/tappay.ts
// TapPay 伺服器端設定 + Pay-by-Prime 扣款 + 交易查詢。只在 Edge Function 內使用。
//
// 機密只存在 Supabase function secrets（TAPPAY_PARTNER_KEY / TAPPAY_MERCHANT_ID）。

export interface TappayConfig {
  partnerKey: string;
  merchantId: string;
  isProduction: boolean;
  apiBase: string;
}

export function loadTappayConfig(): TappayConfig {
  const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY") ?? "";
  const merchantId = Deno.env.get("TAPPAY_MERCHANT_ID") ?? "";
  const env = (Deno.env.get("TAPPAY_ENV") ?? "sandbox").toLowerCase();
  if (!partnerKey || !merchantId) {
    throw new Error("[tappay] 缺少 TAPPAY_PARTNER_KEY 或 TAPPAY_MERCHANT_ID");
  }
  const isProduction = env === "production" || env === "prod";
  const apiBase = isProduction
    ? "https://prod.tappaysdk.com"
    : "https://sandbox.tappaysdk.com";
  return { partnerKey, merchantId, isProduction, apiBase };
}

export interface PayByPrimeInput {
  prime: string;
  amount: number;
  orderNumber: string;
  details: string;
  cardholder: { phone_number: string; name: string; email: string };
  /** 電子支付（如 LINE Pay）必填：付款完成後前端轉導 + 後端 server-to-server 通知。 */
  resultUrl?: { frontend_redirect_url: string; backend_notify_url: string };
}

export interface PayByPrimeResult {
  status: number; // 0 = 受理成功（LINE Pay 此時仍為待付款，需 payment_url 完成）
  msg: string;
  recTradeId: string;
  bankTransactionId: string;
  authCode: string;
  /** 電子支付回傳的付款頁網址，前端需轉導過去。信用卡不會有。 */
  paymentUrl: string;
  raw: Record<string, unknown>;
}

/** 呼叫 TapPay Pay-by-Prime。金額一律由呼叫端（從 DB 驗算）帶入，不信任前端。 */
export async function payByPrime(
  cfg: TappayConfig,
  input: PayByPrimeInput,
): Promise<PayByPrimeResult> {
  const body: Record<string, unknown> = {
    prime: input.prime,
    partner_key: cfg.partnerKey,
    merchant_id: cfg.merchantId,
    amount: input.amount,
    currency: "TWD",
    order_number: input.orderNumber,
    details: input.details,
    cardholder: input.cardholder,
    remember: false,
  };
  if (input.resultUrl) body.result_url = input.resultUrl;

  const res = await fetch(`${cfg.apiBase}/tpc/payment/pay-by-prime`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": cfg.partnerKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000), // 銀行尖峰可能較慢
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = { status: -1, msg: `TapPay 回應解析失敗 (HTTP ${res.status})` };
  }

  return {
    status: typeof data.status === "number" ? (data.status as number) : -1,
    msg: String(data.msg ?? "unknown"),
    recTradeId: String(data.rec_trade_id ?? ""),
    bankTransactionId: String(data.bank_transaction_id ?? ""),
    authCode: String(data.auth_code ?? ""),
    paymentUrl: String(data.payment_url ?? ""),
    raw: data,
  };
}

export interface TransactionRecord {
  found: boolean;
  recordStatus: number; // 1 = OK(完成/已付款), 0 = 已授權未請款, 4 = 待付款, 2/3 = 退款, 5 = 取消, -1 = 錯誤
  isCaptured: boolean;
  amount: number;
  orderNumber: string;
  raw: Record<string, unknown>;
}

/**
 * 以 rec_trade_id 向 TapPay 查詢交易的權威狀態（LINE Pay 等非同步付款的結算依據）。
 * record_status === 1 才代表真的付款完成，不可只信任 notify 內容。
 */
export async function queryTransaction(
  cfg: TappayConfig,
  recTradeId: string,
): Promise<TransactionRecord> {
  const res = await fetch(`${cfg.apiBase}/tpc/transaction/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": cfg.partnerKey },
    body: JSON.stringify({
      partner_key: cfg.partnerKey,
      filters: { rec_trade_id: recTradeId },
      records_per_page: 1,
      page: 0,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  const records = Array.isArray(data.trade_records) ? data.trade_records as Record<string, unknown>[] : [];
  const rec = records[0];
  if (!rec) {
    return { found: false, recordStatus: -1, isCaptured: false, amount: 0, orderNumber: "", raw: data };
  }
  return {
    found: true,
    recordStatus: typeof rec.record_status === "number" ? (rec.record_status as number) : -1,
    isCaptured: rec.is_captured === true,
    amount: typeof rec.amount === "number" ? (rec.amount as number) : 0,
    orderNumber: String(rec.order_number ?? ""),
    raw: rec,
  };
}
