// supabase/functions/_shared/invoice.ts
// 綠界電子發票（B2C）開立 —— **骨架，尚未接通**。
//
// ⚠️⚠️ 誠實聲明 ⚠️⚠️
// 本檔案的「傳輸信封」（AES-256-CBC + base64 + URL encode、RqHeader.Timestamp）
// 是依綠界電子發票 API v3 的公開說明實作的，但**沒有任何一次真實呼叫被驗證過**，
// 我們也沒有發票商店代號可以測。所有「我不確定」的地方都標成 TODO(invoice-api)，
// 請對照綠界《電子發票 API 技術文件》逐項確認後再移除標記。
//
// 設計上刻意「不會安靜地假成功」：
//   • ECPAY_INVOICE_ENABLED 不等於 "true" → 直接 throw（不回傳假的成功結果）。
//   • 回應格式對不上 → throw，不猜欄位。
//   • payment-notify 會把這裡的 throw 接住、寫成 invoices.status='failed' 並記錄錯誤訊息，
//     但**不會**因此讓付款回調失敗（付款是真的成功了，讓綠界一直重送更糟）。
//
// ── 另一條路（強烈建議先評估）─────────────────────────────
// 綠界「全方位金流」的 AIO CheckOut 本身就能帶開發票：在付款表單加上
// InvoiceMark=Y 與一組發票欄位，付款成功時綠界自動開票，**完全不需要這支 API**。
// 這組欄位的名稱有官方 SDK（ecpay_aio_nodejs 的 ECpayPayment.xml）可核對，
// 可信度比本檔案高。清單見 supabase/functions/README.md 的「發票」一節。
// 若採用那條路，本檔案可以整份刪除。

export interface InvoiceConfig {
  /** 發票商店代號（與金流的 MerchantID 可能不同，是另一個商店帳號） */
  merchantId: string;
  /** 發票專用 HashKey（32 碼 → AES-256 金鑰） */
  hashKey: string;
  /** 發票專用 HashIV（16 碼 → AES-CBC IV） */
  hashIv: string;
  isProduction: boolean;
}

// TODO(invoice-api): 確認這兩個端點路徑。
// 目前寫的是 B2CInvoice/Issue（v3 的「開立發票」）。
// 需要向綠界確認：(a) 正式／測試網域是否為 einvoice / einvoice-stage，
// (b) 路徑是否為 /B2CInvoice/Issue，(c) 是否需要 PlatformID。
const ISSUE_ENDPOINT = {
  production: "https://einvoice.ecpay.com.tw/B2CInvoice/Issue",
  stage: "https://einvoice-stage.ecpay.com.tw/B2CInvoice/Issue",
} as const;

export function loadInvoiceConfig(): InvoiceConfig {
  const merchantId = Deno.env.get("ECPAY_INVOICE_MERCHANT_ID") ?? "";
  const hashKey = Deno.env.get("ECPAY_INVOICE_HASH_KEY") ?? "";
  const hashIv = Deno.env.get("ECPAY_INVOICE_HASH_IV") ?? "";
  const missing = [
    !merchantId && "ECPAY_INVOICE_MERCHANT_ID",
    !hashKey && "ECPAY_INVOICE_HASH_KEY",
    !hashIv && "ECPAY_INVOICE_HASH_IV",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`[invoice] 缺少 Supabase secrets：${missing.join(", ")}`);
  }
  if (hashKey.length !== 32 || hashIv.length !== 16) {
    // AES-256-CBC 需要 32 bytes 金鑰、16 bytes IV。長度不對就不要試著補零，
    // 補了只會得到一個「加密成功但對方解不開」的假象。
    throw new Error(
      `[invoice] HashKey 需 32 碼、HashIV 需 16 碼（收到 ${hashKey.length} / ${hashIv.length}）`,
    );
  }
  return {
    merchantId,
    hashKey,
    hashIv,
    isProduction: Deno.env.get("ECPAY_INVOICE_IS_PRODUCTION") === "true",
  };
}

/** 發票功能是否已被明確開啟。沒開就不要偷偷跳過，要讓呼叫端拿到明確錯誤。 */
export function isInvoiceEnabled(): boolean {
  return Deno.env.get("ECPAY_INVOICE_ENABLED") === "true";
}

// ─────────────────────────────────────────────────────────────
// AES-256-CBC 信封（Web Crypto，沒有 Node crypto）
// ─────────────────────────────────────────────────────────────

async function importAesKey(
  hashKey: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(hashKey),
    { name: "AES-CBC" },
    false,
    usages,
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// 回傳型別要寫成 Uint8Array<ArrayBuffer>（而非預設的 ArrayBufferLike），
// 否則 crypto.subtle.decrypt 的 BufferSource 參數會型別不符。
function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * 明文 JSON → URL encode → AES-256-CBC（PKCS#7，Web Crypto 自動補）→ base64。
 *
 * TODO(invoice-api): 確認 URL encode 的大小寫規則。綠界後端是 .NET，
 * 金流那邊的簽章要求「小寫 + 空白轉 +」；發票 API 的文件只說 UrlEncode，
 * 沒說大小寫。這裡用 encodeURIComponent（大寫 %XX、空白 %20）原樣送出。
 */
export async function encryptInvoiceData(
  payload: unknown,
  config: InvoiceConfig,
): Promise<string> {
  const encoded = encodeURIComponent(JSON.stringify(payload));
  const key = await importAesKey(config.hashKey, ["encrypt"]);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: new TextEncoder().encode(config.hashIv) },
    key,
    new TextEncoder().encode(encoded),
  );
  return toBase64(new Uint8Array(cipher));
}

/** base64 → AES 解密 → URL decode → JSON.parse。 */
export async function decryptInvoiceData<T>(
  data: string,
  config: InvoiceConfig,
): Promise<T> {
  const key = await importAesKey(config.hashKey, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: new TextEncoder().encode(config.hashIv) },
    key,
    fromBase64(data),
  );
  const text = decodeURIComponent(new TextDecoder().decode(plain));
  return JSON.parse(text) as T;
}

// ─────────────────────────────────────────────────────────────
// 開立發票
// ─────────────────────────────────────────────────────────────

export interface InvoiceItem {
  name: string;
  count: number;
  /** 單位，例如「個」 */
  word: string;
  /** 單價（含稅） */
  price: number;
  /** 小計（含稅）= price * count */
  amount: number;
}

export interface IssueInvoiceParams {
  /** 自訂編號，對綠界必須唯一。我們用 order_no（發票與訂單一對一）。 */
  relateNumber: string;
  /** 買方名稱（個人可填會員姓名或「消費者」） */
  buyerName: string;
  buyerEmail?: string;
  /** 買方手機（純數字） */
  buyerPhone?: string;
  /** 統一編號（8 碼）。有填代表開公司發票（B2B），會影響 Print 與載具規則。 */
  buyerIdentifier?: string;
  /** 含稅總額，必須等於 Items 的 amount 總和 */
  salesAmount: number;
  items: InvoiceItem[];
  /**
   * 載具類型。'' = 無載具（需索取紙本或存入會員載具），
   * '1' = 綠界會員載具，'2' = 自然人憑證，'3' = 手機條碼。
   */
  carrierType?: "" | "1" | "2" | "3";
  /** 載具號碼（手機條碼如 /ABC+123） */
  carrierNum?: string;
  /** 捐贈：'0' 不捐贈、'1' 捐贈（需填 loveCode） */
  donation?: "0" | "1";
  loveCode?: string;
  /** 是否列印紙本：'0' 不列印、'1' 列印。有統編時綠界要求 '1'。 */
  print?: "0" | "1";
}

export interface IssueInvoiceResult {
  invoiceNumber: string;
  /** `yyyy-MM-dd HH:mm:ss` */
  invoiceDate: string;
  randomNumber: string;
  /** 綠界原始回應（解密後），存進 invoices.response_payload 供對帳 */
  raw: Record<string, unknown>;
}

/**
 * 呼叫綠界開立 B2C 電子發票。
 *
 * **未設定 ECPAY_INVOICE_ENABLED=true 時直接 throw**，不會回傳假成功。
 * 這是刻意的：發票沒開成功卻讓訂單顯示「已開票」，是會被國稅局盯的。
 */
export async function issueB2CInvoice(
  params: IssueInvoiceParams,
  config: InvoiceConfig,
): Promise<IssueInvoiceResult> {
  if (!isInvoiceEnabled()) {
    throw new Error(
      "[invoice] 電子發票尚未啟用：需先向綠界申請發票商店代號，" +
        "設定 ECPAY_INVOICE_* secrets，並確認本檔案所有 TODO(invoice-api)，" +
        "最後設 ECPAY_INVOICE_ENABLED=true。",
    );
  }

  const sum = params.items.reduce((acc, i) => acc + i.amount, 0);
  if (sum !== params.salesAmount) {
    // 綠界會退件，但等它退不如自己先擋——錯誤訊息清楚得多。
    throw new Error(
      `[invoice] 品項小計合計 ${sum} 與 SalesAmount ${params.salesAmount} 不符`,
    );
  }

  // TODO(invoice-api): 以下欄位名稱與必填規則需對照綠界《電子發票 API》確認。
  // 目前依 v3「開立發票」的欄位命名撰寫，特別要確認的是：
  //   • TaxType（'1' 應稅／'2' 零稅率／'3' 免稅／'9' 混合）與 ItemTaxType 的搭配規則
  //   • InvType（'07' 一般稅額／'08' 特種稅額）
  //   • Items 陣列的欄位名（ItemName / ItemCount / ItemWord / ItemPrice / ItemAmount）
  //   • vat（'1' = 商品單價已含稅）
  //   • 無載具 + 不捐贈 + Print='0' 時綠界是否允許（B2C 規則會互相牽制）
  const data = {
    MerchantID: config.merchantId,
    RelateNumber: params.relateNumber,
    CustomerIdentifier: params.buyerIdentifier ?? "",
    CustomerName: params.buyerName,
    CustomerAddr: "",
    CustomerPhone: params.buyerPhone ?? "",
    CustomerEmail: params.buyerEmail ?? "",
    ClearanceMark: "",
    Print: params.print ?? (params.buyerIdentifier ? "1" : "0"),
    Donation: params.donation ?? "0",
    LoveCode: params.loveCode ?? "",
    CarrierType: params.carrierType ?? "",
    CarrierNum: params.carrierNum ?? "",
    TaxType: "1",
    SalesAmount: params.salesAmount,
    InvoiceRemark: "",
    InvType: "07",
    vat: "1",
    Items: params.items.map((item, index) => ({
      ItemSeq: index + 1,
      ItemName: item.name,
      ItemCount: item.count,
      ItemWord: item.word,
      ItemPrice: item.price,
      ItemTaxType: "1",
      ItemAmount: item.amount,
    })),
  };

  const endpoint = config.isProduction
    ? ISSUE_ENDPOINT.production
    : ISSUE_ENDPOINT.stage;

  const body = {
    MerchantID: config.merchantId,
    // TODO(invoice-api): 確認 Timestamp 是否為 10 位 Unix 秒，以及允許的時間誤差。
    RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
    Data: await encryptInvoiceData(data, config),
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[invoice] HTTP ${res.status}：${text.slice(0, 300)}`);
  }

  // TODO(invoice-api): 確認回應外層欄位（TransCode / TransMsg / Data）
  // 與內層（RtnCode / RtnMsg / InvoiceNo / InvoiceDate / RandomNumber）的名稱。
  let envelope: { TransCode?: number; TransMsg?: string; Data?: string };
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error(`[invoice] 回應不是 JSON：${text.slice(0, 300)}`);
  }
  if (envelope.TransCode !== 1 || !envelope.Data) {
    throw new Error(
      `[invoice] 綠界拒絕請求：TransCode=${envelope.TransCode} ${envelope.TransMsg ?? ""}`,
    );
  }

  const inner = await decryptInvoiceData<Record<string, unknown>>(
    envelope.Data,
    config,
  );
  if (String(inner.RtnCode) !== "1") {
    throw new Error(
      `[invoice] 開票失敗：RtnCode=${inner.RtnCode} ${String(inner.RtnMsg ?? "")}`,
    );
  }
  const invoiceNumber = String(inner.InvoiceNo ?? "");
  if (!invoiceNumber) {
    throw new Error("[invoice] 回應缺少 InvoiceNo，不能當成開票成功");
  }

  return {
    invoiceNumber,
    invoiceDate: String(inner.InvoiceDate ?? ""),
    randomNumber: String(inner.RandomNumber ?? ""),
    raw: inner,
  };
}
