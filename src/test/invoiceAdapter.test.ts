// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptInvoiceData, decryptInvoiceData, issueB2CInvoice, queryB2CInvoice, makeInvoiceItems, loadInvoiceConfig, type InvoiceConfig, type IssueInvoiceParams } from '../../supabase/functions/_shared/invoice';
const config: InvoiceConfig = { merchantId: '2000132', hashKey: 'ejCk326UnaZWKisg', hashIv: 'q9jcZX8Ib9LM8wYk', isProduction: false };
const params: IssueInvoiceParams = { relateNumber: 'ENSO20260917001', buyerName: '測試', buyerAddress: '台北市測試路一號', buyerEmail: 'buyer@example.test', salesAmount: 100, items: [{ name: '線香', word: '盒', count: 2, price: 50, amount: 100 }] };
const issued = { RtnCode: 1, InvoiceNo: 'AB12345678', InvoiceDate: '2026-09-17 12:00:00', RandomNumber: '0123' };
const queried = { RtnCode: 1, IIS_Mer_ID: config.merchantId, IIS_Relate_Number: params.relateNumber, IIS_Number: 'AB12345678', IIS_Create_Date: issued.InvoiceDate, IIS_Random_Number: '0123', IIS_Issue_Status: '1', IIS_Invalid_Status: '0' };
let fetchMock: ReturnType<typeof vi.fn>;
async function respond(inner: object) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ MerchantID: config.merchantId, TransCode: 1, Data: await encryptInvoiceData(inner, config) }), { status: 200 }));
}
beforeEach(() => {
  vi.stubGlobal('Deno', { env: { get: (name: string) => ({ ECPAY_INVOICE_ENABLED: 'true', ECPAY_INVOICE_MERCHANT_ID: config.merchantId, ECPAY_INVOICE_HASH_KEY: config.hashKey, ECPAY_INVOICE_HASH_IV: config.hashIv } as Record<string, string>)[name] } });
  fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
describe('ECPay invoice adapter', () => {
  it('matches the official AES128 published ciphertext exactly', async () => {
    const payload = { Name: 'Test', ID: 'A123456789' };
    const cipher = 'uvI4yrErM37XNQkXGAgRgJAgHn2t72jahaMZzYhWL1HmvH4WV18VJDP2i9pTbC+tby5nxVExLLFyAkbjbS2Dvg==';
    expect(await encryptInvoiceData(payload, config)).toBe(cipher);
    expect(await decryptInvoiceData(cipher, config)).toEqual(payload);
  });
  it('rejects old 32-byte invoice keys', async () => {
    expect(loadInvoiceConfig()).toEqual(config);
    await expect(encryptInvoiceData({}, { ...config, hashKey: 'a'.repeat(32) })).rejects.toThrow('16 bytes');
  });
  it('sends a correct paper invoice envelope with address and exact item totals', async () => {
    await respond(issued);
    expect(await issueB2CInvoice(params, config)).toMatchObject({ invoiceNumber: 'AB12345678', randomNumber: '0123' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://einvoice-stage.ecpay.com.tw/B2CInvoice/Issue');
    const body = JSON.parse(init.body);
    expect(body.RqHeader.Timestamp).toBeGreaterThan(1e9);
    const data = await decryptInvoiceData<Record<string, unknown>>(body.Data, config);
    expect(data).toMatchObject({ Print: '1', CustomerAddr: params.buyerAddress, TaxType: '1', vat: '1', CarrierType: '', SalesAmount: 100 });
  });
  it('supports explicit ECPay carrier without paper address', async () => {
    await respond(issued);
    await issueB2CInvoice({ ...params, buyerAddress: undefined, carrierType: '1' }, config);
    const data = await decryptInvoiceData<Record<string, unknown>>(JSON.parse(fetchMock.mock.calls[0][1].body).Data, config);
    expect(data).toMatchObject({ Print: '0', CarrierType: '1', CarrierNum: '' });
  });
  it.each([
    { buyerAddress: '' }, { items: [{ ...params.items[0], amount: 99 }] },
    { carrierType: '3' as const, carrierNum: '/bad' }, { donation: '1' as const, loveCode: '' },
    { buyerIdentifier: '12345678', print: '0' as const }, { relateNumber: 'bad-number' },
  ])('rejects invalid payload before network (%j)', async patch => {
    await expect(issueB2CInvoice({ ...params, ...patch }, config)).rejects.toThrow('[invoice]');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('recovers existing invoice by stable relate number and query-specific fields', async () => {
    await respond(queried);
    expect(await queryB2CInvoice(params.relateNumber, config)).toMatchObject({ invoiceNumber: issued.InvoiceNo, invoiceDate: issued.InvoiceDate });
    expect(fetchMock.mock.calls[0][0]).toContain('/B2CInvoice/GetIssue');
  });
  it.each([{ RtnCode: 1600002 }, { ...queried, IIS_Invalid_Status: '1' }, { ...queried, IIS_Relate_Number: 'OTHER' }, { ...queried, IIS_Number: '' }])('does not treat an uncertain query as not-found (%j)', async inner => {
    await respond(inner);
    await expect(queryB2CInvoice(params.relateNumber, config)).rejects.toThrow('[invoice]');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('propagates timeout without automatically issuing again', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(issueB2CInvoice(params, config)).rejects.toThrow('timeout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed provider success', async () => {
    await respond({ RtnCode: 1 });
    await expect(issueB2CInvoice(params, config)).rejects.toThrow('缺少有效');
  });
  it('allocates discounts and retains exact per-unit multiplication and quantities', () => {
    const items = makeInvoiceItems([{ name: 'A', count: 3, price: 100 }, { name: 'B', count: 2, price: 50 }], 101, 60);
    expect(items.reduce((sum, i) => sum + i.amount, 0)).toBe(359);
    expect(items.every(i => i.count * i.price === i.amount && i.price >= 0)).toBe(true);
    expect(items.filter(i => i.name === 'A').reduce((sum, i) => sum + i.count, 0)).toBe(3);
    expect(items.filter(i => i.name === 'B').reduce((sum, i) => sum + i.count, 0)).toBe(2);
  });
});

