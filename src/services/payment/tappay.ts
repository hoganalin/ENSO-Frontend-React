// src/services/payment/tappay.ts — TapPay 前端付款（信用卡）
//
// 前端只做兩件事：
//   1. 用 App ID / App Key 載入 TapPay SDK、渲染刷卡欄位、取得一次性 prime。
//   2. 把 prime + orderId 交給 tappay-pay Edge Function，由後端扣款。
// 卡號只存在 TapPay 的 iframe 裡，永遠不會進到我們的程式或伺服器。
//
// 需要的環境變數（前端，建置時注入；App ID/App Key 本來就會曝露給瀏覽器）：
//   VITE_TAPPAY_APP_ID   TapPay App ID（數字）
//   VITE_TAPPAY_APP_KEY  TapPay App Key
//   VITE_TAPPAY_ENV      sandbox | production（預設 sandbox）

import { supabase } from "@/lib/supabase";
import { PaymentError } from "./errors";

const env = import.meta.env as Record<string, string | undefined>;
const SDK_URL = "https://js.tappaysdk.com/sdk/tpdirect/v5.19.0";
const APP_ID = Number(env.VITE_TAPPAY_APP_ID ?? "0");
const APP_KEY = env.VITE_TAPPAY_APP_KEY ?? "";
const TAPPAY_ENV = (env.VITE_TAPPAY_ENV ?? "sandbox") === "production" ? "production" : "sandbox";

interface TappayFieldsStatus {
  canGetPrime: boolean;
  status: { number: number; expiry: number; ccv: number };
}
interface TappayPrimeResult {
  status: number;
  msg: string;
  card: { prime: string };
}
interface TPDirect {
  setupSDK(appId: number, appKey: string, serverType: "sandbox" | "production"): void;
  card: {
    setup(config: unknown): void;
    getTappayFieldsStatus(): TappayFieldsStatus;
    getPrime(cb: (result: TappayPrimeResult) => void): void;
  };
}
declare global {
  interface Window {
    TPDirect?: TPDirect;
  }
}

let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (typeof window !== "undefined" && window.TPDirect) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      sdkPromise = null;
      reject(new PaymentError("sdk_load_failed", "付款元件載入失敗，請檢查網路後重試"));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

let setupDone = false;
async function ensureSetup(): Promise<TPDirect> {
  await loadSdk();
  const tappay = window.TPDirect;
  if (!tappay) throw new PaymentError("sdk_unavailable", "付款元件無法使用");
  if (!APP_ID || !APP_KEY) {
    throw new PaymentError("tappay_not_configured", "付款尚未設定完成，請聯繫網站管理員");
  }
  if (!setupDone) {
    tappay.setupSDK(APP_ID, APP_KEY, TAPPAY_ENV);
    setupDone = true;
  }
  return tappay;
}

/** 在指定的三個容器內渲染 TapPay 的卡號 / 到期日 / 安全碼欄位。 */
export async function setupCardFields(
  numberEl: HTMLElement,
  expiryEl: HTMLElement,
  ccvEl: HTMLElement,
): Promise<void> {
  const tappay = await ensureSetup();
  tappay.card.setup({
    fields: {
      number: { element: numberEl, placeholder: "**** **** **** ****" },
      expirationDate: { element: expiryEl, placeholder: "MM / YY" },
      ccv: { element: ccvEl, placeholder: "安全碼" },
    },
    styles: {
      input: { color: "#f5eee0", "font-size": "16px", "font-family": "inherit" },
      "input.ccv": { "font-size": "16px" },
      ".valid": { color: "#8fc08f" },
      ".invalid": { color: "#e07a5f" },
    },
  });
}

/** 取得一次性付款憑證 prime；欄位不完整會丟出可顯示的錯誤。 */
export function getPrime(): Promise<string> {
  const tappay = window.TPDirect;
  return new Promise<string>((resolve, reject) => {
    if (!tappay) {
      reject(new PaymentError("sdk_unavailable", "付款元件無法使用"));
      return;
    }
    const status = tappay.card.getTappayFieldsStatus();
    if (!status.canGetPrime) {
      reject(new PaymentError("card_incomplete", "請確認卡號、到期日與安全碼皆正確"));
      return;
    }
    tappay.card.getPrime((result) => {
      if (result.status !== 0) {
        reject(new PaymentError("get_prime_failed", result.msg || "取得付款憑證失敗"));
        return;
      }
      resolve(result.card.prime);
    });
  });
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}
interface TappayPayResponse {
  success: boolean;
  orderNo: string;
  recTradeId: string;
  amount: number;
}

async function toPaymentError(error: unknown): Promise<PaymentError> {
  const context = (error as { context?: unknown })?.context;
  if (context && typeof (context as Response).json === "function") {
    try {
      const body = (await (context as Response).json()) as ApiErrorBody;
      if (body?.error?.message) {
        return new PaymentError(body.error.code ?? "unknown", body.error.message);
      }
    } catch {
      // fall through
    }
  }
  return new PaymentError(
    "invoke_failed",
    error instanceof Error && error.message ? error.message : "無法連線到付款服務，請稍後再試",
  );
}

/** 把 prime 交給後端扣款。成功回傳訂單編號與 TapPay 交易序號。 */
export async function payWithTappay(
  orderId: string,
  prime: string,
): Promise<{ orderNo: string; recTradeId: string }> {
  if (!orderId) throw new PaymentError("invalid_order_id", "缺少訂單編號");
  const { data, error } = await supabase.functions.invoke<TappayPayResponse>("tappay-pay", {
    body: { orderId, prime },
  });
  if (error) throw await toPaymentError(error);
  if (!data?.success) throw new PaymentError("invalid_response", "付款服務回應格式異常");
  return { orderNo: data.orderNo, recTradeId: data.recTradeId };
}
