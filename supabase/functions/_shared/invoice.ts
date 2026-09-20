// Server-only environment port; tests provide a stub without importing Deno globals.
const serverEnv = () => (globalThis as unknown as { Deno: { env: { get(name: string): string | undefined } } }).Deno.env;
// ECPay B2C: https://developers.ecpay.com.tw/7896/ (Issue), /7923/ (GetIssue), /7958/ (AES).
// Live credentials, invoice allocation and paper delivery must be verified before enabling.
export interface InvoiceConfig {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  isProduction: boolean;
}
function validateConfig(config: InvoiceConfig): void {
  if (!/^\d{1,10}$/.test(config.merchantId)) throw new Error('[invoice] 無效的發票商店代號');
  if (new TextEncoder().encode(config.hashKey).length !== 16 || new TextEncoder().encode(config.hashIv).length !== 16) {
    throw new Error('[invoice] 發票 HashKey 與 HashIV 必須各為 16 bytes（AES-128-CBC）');
  }
}
export function loadInvoiceConfig(): InvoiceConfig {
  const config = {
    merchantId: serverEnv().get('ECPAY_INVOICE_MERCHANT_ID') ?? '',
    hashKey: serverEnv().get('ECPAY_INVOICE_HASH_KEY') ?? '',
    hashIv: serverEnv().get('ECPAY_INVOICE_HASH_IV') ?? '',
    isProduction: serverEnv().get('ECPAY_INVOICE_IS_PRODUCTION') === 'true',
  };
  validateConfig(config);
  return config;
}
export function isInvoiceEnabled(): boolean {
  return serverEnv().get('ECPAY_INVOICE_ENABLED') === 'true';
}
async function key(config: InvoiceConfig, usage: KeyUsage): Promise<CryptoKey> {
  validateConfig(config);
  return crypto.subtle.importKey('raw', new TextEncoder().encode(config.hashKey), 'AES-CBC', false, [usage]);
}
export async function encryptInvoiceData(payload: unknown, config: InvoiceConfig): Promise<string> {
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: new TextEncoder().encode(config.hashIv) },
    await key(config, 'encrypt'), new TextEncoder().encode(encodeURIComponent(JSON.stringify(payload))),
  );
  return btoa(Array.from(new Uint8Array(encrypted), b => String.fromCharCode(b)).join(''));
}
export async function decryptInvoiceData<T>(data: string, config: InvoiceConfig): Promise<T> {
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: new TextEncoder().encode(config.hashIv) }, await key(config, 'decrypt'), bytes,
  );
  // .NET form UrlEncode may encode spaces as +. Encoded literal plus (%2B) remains intact.
  return JSON.parse(decodeURIComponent(new TextDecoder().decode(decrypted).replace(/\+/g, ' '))) as T;
}
export interface InvoiceItem { name: string; count: number; word: string; price: number; amount: number }
export interface IssueInvoiceParams {
  relateNumber: string;
  buyerName: string;
  buyerAddress?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  buyerIdentifier?: string;
  salesAmount: number;
  items: InvoiceItem[];
  carrierType?: '' | '1' | '2' | '3';
  carrierNum?: string;
  donation?: '0' | '1';
  loveCode?: string;
  print?: '0' | '1';
}
export interface IssueInvoiceResult {
  invoiceNumber: string;
  invoiceDate: string;
  randomNumber: string;
  raw: Record<string, unknown>;
}
function relate(value: string): void {
  if (!/^[a-zA-Z0-9]{1,50}$/.test(value)) throw new Error('[invoice] RelateNumber 必須為 1 至 50 碼英數字');
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[invoice] ${message}`);
}
/** Allocate a whole-TWD merchandise discount proportionally; split differing unit prices to keep quantity and exact totals. */
export function makeInvoiceItems(
  items: Array<{ name: string; count: number; price: number; word?: string }>,
  discount: number,
  shipping = 0,
): InvoiceItem[] {
  assert(items.length > 0 && items.length <= 499, '商品數量無效');
  assert(items.every(i => Number.isSafeInteger(i.count) && i.count > 0 && i.count < 1e8 && Number.isSafeInteger(i.price) && i.price >= 0), '商品金額或數量無效');
  const subtotal = items.reduce((sum, i) => sum + i.count * i.price, 0);
  assert(Number.isSafeInteger(subtotal) && subtotal > 0 && Number.isSafeInteger(discount) && discount >= 0 && discount <= subtotal, '折扣金額無效');
  assert(Number.isSafeInteger(shipping) && shipping >= 0, '運費無效');
  // BigInt avoids multiplication overflow for proportional allocation.
  const weighted = items.map((i, index) => {
    const numerator = BigInt(i.count * i.price) * BigInt(subtotal - discount);
    return { index, amount: Number(numerator / BigInt(subtotal)), remainder: numerator % BigInt(subtotal) };
  });
  let remaining = subtotal - discount - weighted.reduce((sum, i) => sum + i.amount, 0);
  const ranked = [...weighted].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked) { if (remaining-- > 0) row.amount++; }
  const result: InvoiceItem[] = [];
  items.forEach((i, index) => {
    const amount = weighted[index].amount;
    const price = Math.floor(amount / i.count);
    const higherCount = amount % i.count;
    const add = (count: number, unitPrice: number) => {
      if (count) result.push({ name: i.name, count, word: i.word ?? '個', price: unitPrice, amount: count * unitPrice });
    };
    add(i.count - higherCount, price);
    add(higherCount, price + 1);
  });
  if (shipping) result.push({ name: '運費', count: 1, word: '筆', price: shipping, amount: shipping });
  return result;
}
async function request(operation: 'Issue' | 'GetIssue', data: unknown, config: InvoiceConfig): Promise<Record<string, unknown>> {
  assert(isInvoiceEnabled(), '電子發票尚未啟用');
  validateConfig(config);
  const host = config.isProduction ? 'einvoice.ecpay.com.tw' : 'einvoice-stage.ecpay.com.tw';
  const response = await fetch(`https://${host}/B2CInvoice/${operation}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ MerchantID: config.merchantId, RqHeader: { Timestamp: Math.floor(Date.now() / 1000) }, Data: await encryptInvoiceData(data, config) }),
  });
  assert(response.ok, `HTTP ${response.status}`);
  const envelope = await response.json();
  assert(envelope?.TransCode === 1 && typeof envelope.Data === 'string', `綠界傳輸失敗：${String(envelope?.TransCode)}`);
  assert(!envelope.MerchantID || String(envelope.MerchantID) === config.merchantId, '回應商店代號不符');
  const inner = await decryptInvoiceData<Record<string, unknown>>(envelope.Data, config);
  assert(inner && typeof inner === 'object' && !Array.isArray(inner), '回應資料格式錯誤');
  return inner;
}
function result(inner: Record<string, unknown>, query = false): IssueInvoiceResult {
  const invoiceNumber = String(inner[query ? 'IIS_Number' : 'InvoiceNo'] ?? '');
  const invoiceDate = String(inner[query ? 'IIS_Create_Date' : 'InvoiceDate'] ?? '');
  const randomNumber = String(inner[query ? 'IIS_Random_Number' : 'RandomNumber'] ?? '');
  assert(/^[A-Z]{2}\d{8}$/.test(invoiceNumber) && invoiceDate.length >= 10 && /^\d{4}$/.test(randomNumber), '回應缺少有效發票號碼、日期或隨機碼');
  return { invoiceNumber, invoiceDate, randomNumber, raw: inner };
}
export async function issueB2CInvoice(params: IssueInvoiceParams, config: InvoiceConfig): Promise<IssueInvoiceResult> {
  relate(params.relateNumber);
  const carrierType = params.carrierType ?? '';
  const carrierNum = params.carrierNum ?? '';
  const donation = params.donation ?? '0';
  const identifier = params.buyerIdentifier ?? '';
  // No carrier means the merchant must print and deliver a paper invoice.
  const print = params.print ?? (donation === '1' || carrierType ? '0' : '1');
  assert(['', '1', '2', '3'].includes(carrierType) && ['0', '1'].includes(print) && ['0', '1'].includes(donation), '發票選項無效');
  assert(!identifier || /^\d{8}$/.test(identifier), '統一編號格式錯誤');
  assert(donation !== '1' || (print === '0' && !identifier && /^\d{3,7}$/.test(params.loveCode ?? '')), '捐贈發票設定無效');
  assert(!identifier || (carrierType ? carrierType === '3' || print === '0' : print === '1'), '統編發票列印與載具設定不符');
  assert(carrierType !== '' && carrierType !== '1' || carrierNum === '', '此載具不得指定編號');
  assert(carrierType !== '2' || /^[A-Z]{2}\d{14}$/.test(carrierNum), '自然人憑證格式錯誤');
  assert(carrierType !== '3' || /^\/[0-9A-Z+.-]{7}$/.test(carrierNum), '手機載具格式錯誤');
  assert(print !== '1' || (params.buyerName.trim() && params.buyerAddress?.trim()), '紙本發票需姓名及寄送地址');
  assert(params.buyerName.length <= 60 && (params.buyerAddress ?? '').length <= 100, '姓名或地址超過發票長度限制');
  assert(!!params.buyerEmail || !!params.buyerPhone, '發票需電子信箱或手機');
  assert(!params.buyerEmail || (params.buyerEmail.length <= 80 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.buyerEmail)), '發票電子信箱格式錯誤');
  assert(!params.buyerPhone || /^\d{1,20}$/.test(params.buyerPhone), '發票手機需純數字');
  assert(Number.isSafeInteger(params.salesAmount) && params.salesAmount > 0 && params.salesAmount < 1e12, '發票總金額無效');
  assert(params.items.length > 0 && params.items.length <= 999 && params.items.every(i => i.name.trim() && i.name.length <= 500 && i.word.trim() && i.word.length <= 6 && Number.isSafeInteger(i.count) && i.count > 0 && i.count < 1e8 && Number.isSafeInteger(i.price) && i.price >= 0 && i.price < 1e10 && Number.isSafeInteger(i.amount) && i.amount === i.price * i.count), '發票品項或小計無效');
  assert(params.items.reduce((sum, i) => sum + i.amount, 0) === params.salesAmount, '發票品項合計與總金額不符');
  const inner = await request('Issue', {
    MerchantID: config.merchantId, RelateNumber: params.relateNumber, CustomerIdentifier: identifier,
    CustomerName: params.buyerName, CustomerAddr: params.buyerAddress ?? '', CustomerPhone: params.buyerPhone ?? '', CustomerEmail: params.buyerEmail ?? '',
    Print: print, Donation: donation, LoveCode: donation === '1' ? params.loveCode : '', CarrierType: carrierType, CarrierNum: carrierNum,
    TaxType: '1', SalesAmount: params.salesAmount, InvType: '07', vat: '1',
    Items: params.items.map((i, index) => ({ ItemSeq: index + 1, ItemName: i.name, ItemCount: i.count, ItemWord: i.word, ItemPrice: i.price, ItemAmount: i.amount })),
  }, config);
  assert(String(inner.RtnCode) === '1', `開票失敗：RtnCode=${String(inner.RtnCode)}`);
  return result(inner);
}
/** Recover an ambiguous issue response using the original, stable RelateNumber.
 * Public error documentation (7954) does not publish a verified not-found code.
 * Therefore every failed query throws; never interpret an unknown failure as permission to issue again.
 */
export async function queryB2CInvoice(relateNumber: string, config: InvoiceConfig): Promise<IssueInvoiceResult | null> {
  relate(relateNumber);
  const inner = await request('GetIssue', { MerchantID: config.merchantId, RelateNumber: relateNumber }, config);
  assert(String(inner.RtnCode) === '1', `查詢未能確認發票，請對帳：RtnCode=${String(inner.RtnCode)}`);
  assert(String(inner.IIS_Mer_ID) === config.merchantId && String(inner.IIS_Relate_Number).toUpperCase() === relateNumber.toUpperCase(), '查詢發票不屬於此商店或訂單');
  assert(String(inner.IIS_Issue_Status) === '1' && String(inner.IIS_Invalid_Status) === '0', '查詢發票未開立或已作廢，請對帳');
  return result(inner, true);
}
