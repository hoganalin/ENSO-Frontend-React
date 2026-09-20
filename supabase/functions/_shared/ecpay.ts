// supabase/functions/_shared/ecpay.ts
// 綠界 ECPay 全方位金流（AIO CheckOut V5）—— 簽章產生／驗證與表單組裝。
//
// 這份檔案是從 src/services/payment/ecpay.ts（瀏覽器版，已停用）重寫的，
// 演算法對齊綠界官方 Node SDK `ecpay_aio_nodejs@1.2.2`
// （lib/ecpay_payment/helper.js 的 gen_chk_mac_value / urlencode_dot_net）
// 與同一包裡的參數定義檔 ECpayPayment.xml。
//
// 重寫時修掉的坑（舊版瀏覽器實作全中）：
//  1. 用 Web Crypto（crypto.subtle.digest，非同步）取代 Node 的 crypto，
//     因為 Deno / 瀏覽器都沒有同步的 createHash。
//  2. 簽章原文必須是 `HashKey=xxx&<排序後參數>&HashIV=yyy`——舊版漏了
//     `HashKey=` / `HashIV=` 這兩個「欄位名稱」，只串了值，簽出來一定不符。
//  3. URL encode 必須模擬 .NET 的 HttpUtility.UrlEncode：小寫、空白變 `+`、
//     且 `'` → %27、`~` → %7e（encodeURIComponent 不會轉這兩個）。
//  4. MerchantTradeNo 的合法格式是 `^\w{4,20}$`（ECpayPayment.xml），
//     也就是「英數字與底線、4~20 字」。訂單 UUID（36 字、含 `-`）送出去必被退件；
//     order_no `ENSO-XXXXXXXX` 的那個 `-` 也不合法 → 轉成 `_`（可逆）。
//  5. EncryptType 是字串 "1"，不是數字 1。
//  6. ChoosePayment 的合法值是 ALL / Credit / WebATM / ATM / CVS / BARCODE / ApplePay，
//     舊版的 union 沒有 ALL 和 ATM，但程式卻傳 'ALL'。
//  7. **AIO V5 沒有 NotifyURL 這個參數。** 伺服器端背景回調是 `ReturnURL`，
//     `OrderResultURL` 才是付款完成後把使用者 POST 回商店的網址。
//     舊版傳的 NotifyURL 會被綠界忽略 → 永遠收不到回調。
//  8. MerchantTradeDate 必須是台北時間（UTC+8）的 `yyyy/MM/dd HH:mm:ss`。
//     舊版用 `toLocaleString('zh-TW')`，在 UTC 的伺服器上會送出慢 8 小時的時間，
//     而且不同 ICU 版本輸出格式不保證一致（可能出現「上午/下午」）。

export interface EcpayConfig {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  /** false = 測試環境（payment-stage） */
  isProduction: boolean;
}

/** ECpayPayment.xml → AioCheckOut/ChoosePayment 的合法值。 */
export type ChoosePayment =
  | "ALL"
  | "Credit"
  | "WebATM"
  | "ATM"
  | "CVS"
  | "BARCODE"
  | "ApplePay";

export const AIO_CHECKOUT_URL = {
  production: "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5",
  stage: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
} as const;

/** 從 Deno.env 讀設定；缺任何一項就直接拋錯（不要靜默用空字串簽章）。 */
export function loadEcpayConfig(): EcpayConfig {
  const merchantId = Deno.env.get("ECPAY_MERCHANT_ID") ?? "";
  const hashKey = Deno.env.get("ECPAY_HASH_KEY") ?? "";
  const hashIv = Deno.env.get("ECPAY_HASH_IV") ?? "";
  const missing = [
    !merchantId && "ECPAY_MERCHANT_ID",
    !hashKey && "ECPAY_HASH_KEY",
    !hashIv && "ECPAY_HASH_IV",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`[ecpay] 缺少 Supabase secrets：${missing.join(", ")}`);
  }
  return {
    merchantId,
    hashKey,
    hashIv,
    isProduction: Deno.env.get("ECPAY_IS_PRODUCTION") === "true",
  };
}

export function checkoutUrl(config: EcpayConfig): string {
  return config.isProduction ? AIO_CHECKOUT_URL.production : AIO_CHECKOUT_URL.stage;
}

// ─────────────────────────────────────────────────────────────
// 簽章（CheckMacValue）
// ─────────────────────────────────────────────────────────────

/**
 * 模擬 .NET 的 HttpUtility.UrlEncode（綠界後端是 .NET，簽章要一模一樣）。
 * 與官方 SDK helper.js 的 urlencode_dot_net(case_tr='DOWN') 等價。
 */
function dotNetUrlEncodeLower(raw: string): string {
  return encodeURIComponent(raw)
    .toLowerCase()
    // encodeURIComponent 不會轉 ' 和 ~，但 .NET 會。
    .replace(/'/g, "%27")
    .replace(/~/g, "%7e")
    // .NET 把空白編成 +，不是 %20。
    .replace(/%20/g, "+");
}

/**
 * 組簽章原文：`HashKey=<key>&<依參數名排序>&HashIV=<iv>`。
 * 排序規則與官方 SDK 相同——忽略大小寫的字典序。
 */
export function buildCheckMacRawString(
  params: Record<string, string>,
  config: EcpayConfig,
): string {
  for (const forbidden of ["CheckMacValue", "HashKey", "HashIV"]) {
    if (forbidden in params) {
      // 把 CheckMacValue 自己含進去簽，是驗簽永遠失敗的經典原因。
      throw new Error(`[ecpay] 簽章參數不得包含 ${forbidden}`);
    }
  }
  const body = Object.keys(params)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return `HashKey=${config.hashKey}&${body}&HashIV=${config.hashIv}`;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 產生 CheckMacValue（EncryptType=1 → SHA256，大寫 hex）。 */
export async function generateCheckMacValue(
  params: Record<string, string>,
  config: EcpayConfig,
): Promise<string> {
  const raw = buildCheckMacRawString(params, config);
  const hex = await sha256Hex(dotNetUrlEncodeLower(raw));
  return hex.toUpperCase();
}

/** 固定時間比較，避免用 `===` 比字串洩漏前綴資訊。 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 驗證綠界回傳的 CheckMacValue。
 * 規則：把 CheckMacValue 拿掉，其餘**全部**欄位（含空值）一起重算。
 * 少算一個欄位就會不符，所以不要自作聰明過濾 payload。
 */
export async function verifyCheckMacValue(
  payload: Record<string, string>,
  config: EcpayConfig,
): Promise<boolean> {
  const received = payload.CheckMacValue;
  if (!received) return false;
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === "CheckMacValue") continue;
    rest[k] = v;
  }
  const expected = await generateCheckMacValue(rest, config);
  return timingSafeEqual(received.toUpperCase(), expected);
}

// ─────────────────────────────────────────────────────────────
// MerchantTradeNo ⇄ order_no
// ─────────────────────────────────────────────────────────────

const MERCHANT_TRADE_NO_PATTERN = /^\w{4,20}$/;

/**
 * order_no（`ENSO-XXXXXXXX`）→ MerchantTradeNo（`ENSOXXXXXXXX`）。
 *
 * 綠界實際要求只允許英文字母與數字；連字號與底線都會被拒絕。
 *
 * attempt > 1 時加 `_<n>` 後綴：綠界的 MerchantTradeNo 在同一商店必須唯一，
 * 使用者第一次付款失敗要重新付時，沿用同一組編號會被退件。
 */
export function toMerchantTradeNo(orderNo: string, attempt = 1): string {
  const base = orderNo.replace(/[^A-Za-z0-9]/g, "");
  const candidate = attempt > 1 ? `${base}${attempt}` : base;
  if (!/^[A-Za-z0-9]{4,20}$/.test(candidate)) {
    throw new Error(
      `[ecpay] MerchantTradeNo 不合法（需符合 ^\\w{4,20}$）：${candidate}`,
    );
  }
  return candidate;
}

/**
 * MerchantTradeNo → order_no。
 * 只還原第一個 `_`（`ENSO_` 的那個）並去掉重試後綴；
 * 真正的權威來源仍是 payment_transactions.merchant_trade_no，
 * 這個函式只是回調找不到交易紀錄時的救援路徑。
 */
export function orderNoFromMerchantTradeNo(merchantTradeNo: string): string {
  return merchantTradeNo;
}

// ─────────────────────────────────────────────────────────────
// 表單組裝
// ─────────────────────────────────────────────────────────────

/** 台北時間（UTC+8）的 `yyyy/MM/dd HH:mm:ss`——綠界只吃這個格式。 */
export function formatMerchantTradeDate(now: Date): string {
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${taipei.getUTCFullYear()}/${p(taipei.getUTCMonth() + 1)}/` +
    `${p(taipei.getUTCDate())} ${p(taipei.getUTCHours())}:` +
    `${p(taipei.getUTCMinutes())}:${p(taipei.getUTCSeconds())}`
  );
}

/**
 * 清掉綠界會噎到的字元並截長度。
 * `#` 是 ItemName 的品項分隔符號，商品名稱裡若有 `#` 會把品項數量弄亂，
 * 所以**單一欄位**一律把 `#` 換成空白。
 *
 * ⚠️ 不要拿這個函式去洗「已經用 `#` 串好的 ItemName」——會把分隔符號一起洗掉，
 * 綠界就只會看到一個品項。組完之後請用 capLength()。
 */
function sanitizeText(text: string, maxLength: number): string {
  return text
    // deno-lint-ignore no-control-regex -- 控制字元本來就是要清掉的目標
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/#/g, " ")
    .trim()
    .slice(0, maxLength);
}

function capLength(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export interface CheckoutItem {
  title: string;
  qty: number;
  unitPrice: number;
}

export interface BuildCheckoutParams {
  merchantTradeNo: string;
  /** 整數台幣；必須由伺服器從 DB 重算，不可信任前端傳來的金額 */
  totalAmount: number;
  items: CheckoutItem[];
  tradeDesc: string;
  /** 伺服器端背景回調（= payment-notify 的網址）。這就是 AIO 的「NotifyURL」。 */
  returnUrl: string;
  /** 付款完成後把使用者（瀏覽器）POST 回商店的網址 */
  orderResultUrl?: string;
  /** 綠界頁面上「返回商店」按鈕（GET） */
  clientBackUrl?: string;
  choosePayment?: ChoosePayment;
  /** 寫進 CustomField1，回調時會原樣帶回，方便對帳 */
  customField1?: string;
  now?: Date;
  /** 電子發票參數（InvoiceMark=Y）。傳入時隨 AIO 金流自動開票。 */
  invoice?: {
    /** 購買人名稱（≤20字）*/
    customerName: string;
    /** 購買人 Email（≤100字）*/
    customerEmail: string;
    /** 購買人地址（≤200字，選填）*/
    customerAddr?: string;
    /** 購買人電話（≤20字，選填）*/
    customerPhone?: string;
  };
}

/**
 * 組出 AIO CheckOut V5 的完整欄位（含 CheckMacValue）。
 *
 * 回傳的是「欄位」而不是 HTML：HTML 字串在伺服器端組好再丟給前端 innerHTML，
 * 等於自己開一個 XSS 入口。前端拿欄位自己建 form 反而更安全。
 */
export async function buildAioCheckoutFields(
  params: BuildCheckoutParams,
  config: EcpayConfig,
): Promise<{ action: string; fields: Record<string, string> }> {
  if (!Number.isInteger(params.totalAmount) || params.totalAmount < 1) {
    // 綠界 TotalAmount 必須是 >= 1 的整數（ECpayPayment.xml: minimal 1）。
    throw new Error(`[ecpay] TotalAmount 必須是正整數，收到 ${params.totalAmount}`);
  }
  if (!MERCHANT_TRADE_NO_PATTERN.test(params.merchantTradeNo)) {
    throw new Error(`[ecpay] MerchantTradeNo 不合法：${params.merchantTradeNo}`);
  }

  // ItemName 格式：`名稱 x 數量#名稱 x 數量...`，上限 200 字
  // （官方 SDK ECpayPayment.xml 的 pattern 是 ^.{0,200}$）。
  // 注意：先逐項 sanitize（去掉品項名稱裡的 `#`），串好之後只截長度。
  const itemName = capLength(
    params.items.length > 0
      ? params.items.map((i) => `${sanitizeText(i.title, 40)} x ${i.qty}`).join("#")
      : "ENSO 商品",
    200,
  );

  const fields: Record<string, string> = {
    MerchantID: config.merchantId,
    MerchantTradeNo: params.merchantTradeNo,
    MerchantTradeDate: formatMerchantTradeDate(params.now ?? new Date()),
    PaymentType: "aio",
    TotalAmount: String(params.totalAmount),
    TradeDesc: sanitizeText(params.tradeDesc || "ENSO 線上購物", 200),
    ItemName: itemName,
    // ⚠️ ReturnURL = 伺服器端背景回調（payment-notify），不是給使用者看的頁面。
    ReturnURL: params.returnUrl,
    ChoosePayment: params.choosePayment ?? "ALL",
    // 字串 "1"，不是數字 1（整份 formData 都必須是字串才能簽章）。
    EncryptType: "1",
  };

  if (params.orderResultUrl) fields.OrderResultURL = params.orderResultUrl;
  if (params.clientBackUrl) fields.ClientBackURL = params.clientBackUrl;
  if (params.invoice) {
    fields.InvoiceMark = "Y";
    fields.CustomerName = sanitizeText(params.invoice.customerName || "消費者", 20);
    fields.CustomerEmail = (params.invoice.customerEmail || "").slice(0, 100);
    fields.CustomerAddr = (params.invoice.customerAddr ?? "").slice(0, 200);
    fields.CustomerPhone = (params.invoice.customerPhone ?? "").slice(0, 20);
    fields.TaxType = "1";   // 應稅
    fields.Print = "1";     // 列印（不需要 CarrierNum 即可通過驗證）
    fields.Donation = "0";  // 不捐贈
    fields.CarrierType = "";
    fields.CarrierNum = "";
    fields.LoveCode = "";
  }
  if (params.customField1) fields.CustomField1 = sanitizeText(params.customField1, 50);

  fields.CheckMacValue = await generateCheckMacValue(fields, config);
  return { action: checkoutUrl(config), fields };
}

// ─────────────────────────────────────────────────────────────
// 回調解析
// ─────────────────────────────────────────────────────────────

export interface NotifyResult {
  /** 綠界回傳的交易編號（我方送出的 MerchantTradeNo） */
  merchantTradeNo: string;
  /** 綠界自己的交易編號 */
  gatewayTradeNo: string;
  /** 是否付款成功（RtnCode === '1'） */
  paid: boolean;
  rtnCode: string;
  rtnMsg: string;
  /** 實收金額（整數台幣）。⚠️ 回調的欄位叫 TradeAmt，不是送出時的 TotalAmount。 */
  amount: number;
  /** Credit / WebATM / ATM_TAISHIN / CVS ... */
  paymentType: string;
  /** `yyyy/MM/dd HH:mm:ss`（台北時間） */
  paymentDate: string;
  /** 測試環境模擬付款會是 '1'，正式環境為 '0' 或不存在 */
  simulatePaid: boolean;
}

/**
 * 解析 AIO 的 ReturnURL 回調欄位。
 *
 * 兩個要特別記住的差異（舊版瀏覽器實作兩個都搞錯）：
 *   • 成功判斷是 `RtnCode === '1'`；`TradeStatus` 是 QueryTradeInfo 的欄位，
 *     回調裡沒有這個欄位，讀出來永遠是 undefined → 舊版判斷永遠失敗。
 *   • 金額欄位是 `TradeAmt`；`TotalAmount` 只存在於「送出」的表單。
 */
export function parseNotifyPayload(payload: Record<string, string>): NotifyResult {
  const amountRaw = payload.TradeAmt ?? payload.TotalAmount ?? "0";
  return {
    merchantTradeNo: payload.MerchantTradeNo ?? "",
    gatewayTradeNo: payload.TradeNo ?? "",
    paid: payload.RtnCode === "1",
    rtnCode: payload.RtnCode ?? "",
    rtnMsg: payload.RtnMsg ?? "",
    amount: Number.parseInt(amountRaw, 10) || 0,
    paymentType: payload.PaymentType ?? "",
    paymentDate: payload.PaymentDate ?? "",
    simulatePaid: payload.SimulatePaid === "1",
  };
}

/** 把 `application/x-www-form-urlencoded` 的 body 轉成純物件。 */
export function formDataToRecord(form: FormData | URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    out[k] = typeof v === "string" ? v : "";
  }
  return out;
}
