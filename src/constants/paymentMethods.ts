/**
 * ECPay (綠界金流) 付款方式清單
 *
 * 這份清單對應綠界正式金流支援的付款方式。在本專案中用於：
 * 1. Checkout 頁的付款方式 radio group
 * 2. /payment/mock/[orderId] 綠界模擬頁依付款方式渲染不同 UI
 * 3. 後台 AdminOrders / PaymentLedger 的彩色 badge 分類
 *
 * 注意：本專案不真的呼叫綠界 API，所有「交易」都是前端模擬。
 */

export type PaymentCategory = "card" | "transfer" | "cvs" | "wallet" | "qr";

export interface PaymentMethod {
  id: string;
  label: string; // 中文顯示名稱
  shortLabel: string; // 適合 badge 的短版
  category: PaymentCategory;
  icon: string; // Bootstrap Icons class
  description: string; // 選項底下的一行說明
  ecpayCode: string; // 對應綠界 PaymentType 代碼
}

/**
 * 綠界 PaymentType 官方代碼對照：
 *   Credit_CreditCard              信用卡一次付清
 *   Credit_CreditCardPeriod        信用卡分期
 *   ATM_BOT / ATM_FIRST / ATM_TAISHIN / ATM_CHINATRUST  ATM 虛擬帳號
 *   CVS_CVS                        超商代碼
 *   BARCODE_BARCODE                超商條碼
 *   WebATM_TAISHIN                 WebATM
 *   Applepay                       Apple Pay
 *   Googlepay                      Google Pay（綠界代收）
 *   LinePay                        LINE Pay
 *   TWQR_OPAY                      台灣 Pay
 */
export const PAYMENT_METHODS: PaymentMethod[] = [
  // ── 卡片類 ──
  {
    id: "credit_onetime",
    label: "信用卡一次付清",
    shortLabel: "信用卡",
    category: "card",
    icon: "bi-credit-card-2-front",
    description: "Visa / Master / JCB / 銀聯",
    ecpayCode: "Credit_CreditCard",
  },
  {
    id: "credit_installment_3",
    label: "信用卡分期 3 期",
    shortLabel: "分期 3 期",
    category: "card",
    icon: "bi-credit-card",
    description: "0 利率分期（指定銀行）",
    ecpayCode: "Credit_CreditCardPeriod",
  },
  {
    id: "credit_installment_6",
    label: "信用卡分期 6 期",
    shortLabel: "分期 6 期",
    category: "card",
    icon: "bi-credit-card",
    description: "0 利率分期（指定銀行）",
    ecpayCode: "Credit_CreditCardPeriod",
  },
  {
    id: "credit_installment_12",
    label: "信用卡分期 12 期",
    shortLabel: "分期 12 期",
    category: "card",
    icon: "bi-credit-card",
    description: "0 利率分期（指定銀行）",
    ecpayCode: "Credit_CreditCardPeriod",
  },
  // ── 行動支付 ──
  {
    id: "applepay",
    label: "Apple Pay",
    shortLabel: "Apple Pay",
    category: "wallet",
    icon: "bi-apple",
    description: "iPhone / iPad / Apple Watch",
    ecpayCode: "ApplePay",
  },
  {
    id: "googlepay",
    label: "Google Pay",
    shortLabel: "Google Pay",
    category: "wallet",
    icon: "bi-google",
    description: "Android 行動支付",
    ecpayCode: "GooglePay",
  },
  {
    id: "linepay",
    label: "LINE Pay",
    shortLabel: "LINE Pay",
    category: "wallet",
    icon: "bi-line",
    description: "LINE 行動支付",
    ecpayCode: "LinePay",
  },
  // ── 轉帳類 ──
  {
    id: "atm",
    label: "ATM 虛擬帳號",
    shortLabel: "ATM",
    category: "transfer",
    icon: "bi-bank",
    description: "取得虛擬帳號後 3 天內轉帳",
    ecpayCode: "ATM_TAISHIN",
  },
  {
    id: "webatm",
    label: "網路 ATM",
    shortLabel: "WebATM",
    category: "transfer",
    icon: "bi-laptop",
    description: "線上即時轉帳",
    ecpayCode: "WebATM_TAISHIN",
  },
  // ── 超商類 ──
  {
    id: "cvs",
    label: "超商代碼繳費",
    shortLabel: "CVS 代碼",
    category: "cvs",
    icon: "bi-shop",
    description: "7-11 / 全家 / 萊爾富 / OK",
    ecpayCode: "CVS_CVS",
  },
  {
    id: "barcode",
    label: "超商條碼繳費",
    shortLabel: "條碼",
    category: "cvs",
    icon: "bi-upc-scan",
    description: "列印條碼後到超商繳費",
    ecpayCode: "BARCODE_BARCODE",
  },
  // ── QR 類 ──
  {
    id: "twqr",
    label: "台灣 Pay QR Code",
    shortLabel: "台灣 Pay",
    category: "qr",
    icon: "bi-qr-code",
    description: "跨行 QR Code 支付",
    ecpayCode: "TWQR_OPAY",
  },
];

export const PAYMENT_CATEGORIES: Record<
  PaymentCategory,
  { label: string; colorClass: string }
> = {
  card: { label: "信用卡", colorClass: "bg-emerald-100 text-emerald-700" },
  wallet: { label: "行動支付", colorClass: "bg-purple-100 text-purple-700" },
  transfer: { label: "轉帳", colorClass: "bg-sky-100 text-sky-700" },
  cvs: { label: "超商", colorClass: "bg-amber-100 text-amber-700" },
  qr: { label: "QR Code", colorClass: "bg-rose-100 text-rose-700" },
};

/** 依 id 取得付款方式 metadata；找不到回傳 null。 */
export function getPaymentMethod(id: string | undefined): PaymentMethod | null {
  if (!id) return null;
  return PAYMENT_METHODS.find((m) => m.id === id) ?? null;
}

/**
 * 產生綠界格式的 MerchantTradeNo：8–20 字元英數字，全大寫。
 * 官方規則：英數混和，不含特殊符號。我們用 "ECPAY" + timestamp + 3 位隨機。
 */
export function generateMerchantTradeNo(): string {
  const ts = Date.now().toString(36).toUpperCase(); // 約 8–9 字元
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `ECPAY${ts}${rand}`.slice(0, 20);
}

/**
 * 產生看起來像綠界 CheckMacValue 的 64 碼大寫 hex。
 * 注意：這不是真的簽章，只是 demo 用。真實情境必須用 HashKey/HashIV 在 server 端簽。
 */
export function generateCheckMacValue(): string {
  const chars = "0123456789ABCDEF";
  let out = "";
  for (let i = 0; i < 64; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}
