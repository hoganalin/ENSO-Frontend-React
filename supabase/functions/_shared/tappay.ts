// supabase/functions/_shared/tappay.ts
// TapPay 伺服器端設定 + Pay-by-Prime 扣款。只在 Edge Function 內使用。
//
// 機密只存在 Supabase function secrets（TAPPAY_PARTNER_KEY / TAPPAY_MERCHANT_ID），
// 絕不出現在前端。前端只負責用 App ID / App Key 取得一次性的 prime。

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
}

export interface PayByPrimeResult {
  status: number; // 0 = 成功
  msg: string;
  recTradeId: string;
  bankTransactionId: string;
  authCode: string;
  raw: Record<string, unknown>;
}

/** 呼叫 TapPay Pay-by-Prime。金額一律由呼叫端（從 DB 驗算）帶入，不信任前端。 */
export async function payByPrime(
  cfg: TappayConfig,
  input: PayByPrimeInput,
): Promise<PayByPrimeResult> {
  const res = await fetch(`${cfg.apiBase}/tpc/payment/pay-by-prime`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.partnerKey,
    },
    body: JSON.stringify({
      prime: input.prime,
      partner_key: cfg.partnerKey,
      merchant_id: cfg.merchantId,
      amount: input.amount,
      currency: "TWD",
      order_number: input.orderNumber,
      details: input.details,
      cardholder: input.cardholder,
      remember: false,
    }),
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = { status: -1, msg: `TapPay 回應解析失敗 (HTTP ${res.status})` };
  }

  return {
    status: typeof body.status === "number" ? (body.status as number) : -1,
    msg: String(body.msg ?? "unknown"),
    recTradeId: String(body.rec_trade_id ?? ""),
    bankTransactionId: String(body.bank_transaction_id ?? ""),
    authCode: String(body.auth_code ?? ""),
    raw: body,
  };
}
