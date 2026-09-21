// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), lookup: vi.fn(), from: vi.fn() }));
vi.mock("../../supabase/functions/_shared/ecpay.ts", () => ({
  loadEcpayConfig: () => ({ merchantId: "TEST" }), verifyCheckMacValue: mocks.verify,
}));
vi.mock("../../supabase/functions/_shared/supabaseAdmin.ts", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
let handler: (req: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal("Deno", { env: { get: () => "https://shop.example" }, serve: (fn: typeof handler) => { handler = fn; } });
  const entry = "../../supabase/functions/payment-result/index.ts";
  await import(/* @vite-ignore */ entry);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue(true);
  mocks.lookup.mockResolvedValue({ data: { order_id: "order-1", amount: 1080 }, error: null });
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) });
});
const request = (fields: Record<string,string> = {}) => new Request("https://edge.example/payment-result", {
  method: "POST", body: new URLSearchParams({ MerchantID: "TEST", MerchantTradeNo: "ENSO1", TradeAmt: "1080", ...fields }),
});
describe("browser payment return", () => {
  it("redirects a verified result using GET to the stored order without settling it", async () => {
    const response = await handler(request({ RtnCode: "1", returnUrl: "https://attacker.example" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("https://shop.example/payment/order-1");
    expect(mocks.from).toHaveBeenCalledWith("payment_transactions");
  });
  it("returns failed payments to their actual order too", async () => {
    expect((await handler(request({ RtnCode: "0" }))).status).toBe(303);
  });
  it("rejects an invalid signature before querying orders", async () => {
    mocks.verify.mockResolvedValue(false);
    expect((await handler(request())).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([{ MerchantID: "OTHER" }, { TradeAmt: "1080oops" }, { TradeAmt: "1" }])("rejects mismatched fields %j", async (fields) => {
    expect((await handler(request(fields))).status).toBe(400);
  });
  it("rejects unknown transactions", async () => {
    mocks.lookup.mockResolvedValue({ data: null });
    expect((await handler(request())).status).toBe(400);
  });
});
