// src/services/payment/client.ts — 前端付款入口（薄薄一層）
//
// 這一層刻意什麼都不做：
//   • 不簽章（HashKey 只存在 Supabase secrets，瀏覽器拿不到）
//   • 不驗簽（驗簽在 payment-notify，公開端點的唯一防線）
//   • 不傳金額（金額由 payment-create 從 DB 重算；傳了也不會被採用）
// 它只做兩件事：呼叫 payment-create、把回來的欄位組成表單送去綠界。
//
// 為什麼要 POST 一張表單而不是 302 轉址：
// 綠界 AIO CheckOut 只接受 POST，參數又多到不可能塞進 query string，
// 所以標準做法是「後端算好欄位 → 前端組隱藏表單 → 自動送出」。
//
// 為什麼欄位是資料而不是後端組好的 HTML：
// 後端回 HTML 再用 innerHTML 塞進頁面，等於自己開一個 XSS 入口。

import { supabase } from "@/lib/supabase";

/** payment-create 的回應。fields 已含 CheckMacValue，前端不得修改任何一個值。 */
export interface PaymentFormPayload {
  /** 綠界的付款頁網址（測試環境會是 payment-stage.ecpay.com.tw） */
  action: string;
  /** 要 POST 出去的完整欄位；少一個或改一個值都會導致綠界驗簽失敗 */
  fields: Record<string, string>;
  merchantTradeNo: string;
  amount: number;
  orderNo: string;
}

/** Edge Function 回的錯誤格式（見 supabase/functions/_shared/response.ts）。 */
interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export class PaymentError extends Error {
  /** 穩定代碼，例如 order_not_payable / amount_mismatch / unauthorized */
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
  }
}

/**
 * supabase-js 在「函式回了非 2xx」時，error.message 只會是
 * "Edge Function returned a non-2xx status code"，真正的原因在 error.context
 * （原始 Response）裡。不把它讀出來，使用者就只會看到一句無用的英文。
 */
async function toPaymentError(error: unknown): Promise<PaymentError> {
  const context = (error as { context?: unknown })?.context;
  if (context && typeof (context as Response).json === "function") {
    try {
      const body = (await (context as Response).json()) as ApiErrorBody;
      if (body?.error?.message) {
        return new PaymentError(body.error.code ?? "unknown", body.error.message);
      }
    } catch {
      // 回應不是 JSON（例如 gateway timeout 的 HTML）→ 落到下面的通用訊息
    }
  }
  return new PaymentError(
    "invoke_failed",
    error instanceof Error && error.message
      ? error.message
      : "無法連線到付款服務，請稍後再試",
  );
}

/**
 * 向 payment-create 索取已簽章的綠界表單欄位。
 * 需要使用者已登入（Edge Function 會驗 JWT 並確認訂單是本人的）。
 */
export async function createPaymentForm(orderId: string): Promise<PaymentFormPayload> {
  if (!orderId) throw new PaymentError("invalid_order_id", "缺少訂單編號");

  const { data, error } = await supabase.functions.invoke<PaymentFormPayload>(
    "payment-create",
    { body: { orderId } }, // 只傳 orderId —— 金額由伺服器算
  );

  if (error) throw await toPaymentError(error);
  if (!data?.action || !data?.fields) {
    throw new PaymentError("invalid_response", "付款服務回應格式異常");
  }
  return data;
}

/**
 * 把欄位組成隱藏表單並送出（會離開目前頁面）。
 *
 * 用 document.createElement 而非字串拼 HTML：值裡若有引號或 `<`，
 * 字串拼法會直接變成 HTML 注入，createElement + value 則永遠被當純文字。
 */
export function submitPaymentForm(payload: PaymentFormPayload): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = payload.action;
  form.style.display = "none";
  // 不用 target="_blank"：彈出視窗會被瀏覽器攔，付款流程直接斷掉。
  form.target = "_self";

  for (const [name, value] of Object.entries(payload.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

/**
 * 一步完成：取得表單 → 轉往綠界。
 *
 * 成功時瀏覽器會離開本頁，所以這個 Promise 實際上不會「正常結束後還跑後續程式」。
 * 失敗時丟 PaymentError，呼叫端請顯示 err.message（已經是繁中）。
 */
export async function startEcpayPayment(orderId: string): Promise<void> {
  const payload = await createPaymentForm(orderId);
  submitPaymentForm(payload);
}
