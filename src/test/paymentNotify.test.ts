import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), verify: vi.fn(), production: false }));
vi.mock("../../supabase/functions/_shared/ecpay.ts", async (original) => ({
  ...await original<object>(),
  loadEcpayConfig: () => ({ merchantId: "TEST", isProduction: mock.production }),
  verifyCheckMacValue: mock.verify,
}));
vi.mock("../../supabase/functions/_shared/supabaseAdmin.ts", () => ({
  createAdminClient: () => ({ rpc: mock.rpc }),
}));
vi.mock("../../supabase/functions/_shared/invoice.ts", () => ({
  isInvoiceEnabled: () => false, issueB2CInvoice: vi.fn(), loadInvoiceConfig: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/mitake.ts", () => ({ loadMitakeConfig: vi.fn(), sendSms: vi.fn() }));
vi.mock("../../supabase/functions/_shared/delivery.ts", () => ({ processDeliveryJobs: vi.fn() }));
let handler: (request: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: typeof handler) => { handler = fn; } });
  // Edge module is intentionally outside the browser TypeScript project.
  const serverEntry = "../../supabase/functions/payment-notify/index.ts";
  await import(/* @vite-ignore */ serverEntry);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  mock.production = false;
  mock.verify.mockReset().mockResolvedValue(true);
  mock.rpc.mockReset().mockResolvedValue({ data: { outcome: "duplicate" }, error: null });
});
async function notify(changes: Record<string, string> = {}) {
  const body = new URLSearchParams({ MerchantID: "TEST", MerchantTradeNo: "ORDER1", TradeNo: "G1", TradeAmt: "1080", RtnCode: "1", ...changes });
  return (await handler(new Request("https://fixture.invalid/notify", { method: "POST", body }))).text();
}
describe("payment notification boundary", () => {
  it("rejects an invalid signature before accessing the database", async () => {
    mock.verify.mockResolvedValue(false);
    expect(await notify()).toMatch(/^0\|/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([{ MerchantID: "OTHER" }, { TradeAmt: "1080oops" }, { TradeAmt: "1080.5" }])("rejects inconsistent signed fields: %j", async (fields) => {
    expect(await notify(fields)).toMatch(/^0\|/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects simulated production payments", async () => {
    mock.production = true;
    expect(await notify({ SimulatePaid: "1" })).toMatch(/^0\|/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("requests a retry when atomic settlement fails", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "rollback" } });
    expect(await notify()).toMatch(/^0\|/);
    expect(mock.rpc).toHaveBeenCalledWith("settle_ecpay_payment", expect.objectContaining({ p_amount: 1080, p_paid: true }));
  });
  it("acknowledges already-settled notifications without repeating external effects", async () => {
    expect(await notify()).toBe("1|OK");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
});
