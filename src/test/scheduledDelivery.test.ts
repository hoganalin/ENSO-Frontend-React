// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const modulePath = "../../supabase/functions/_shared/scheduledDelivery.ts";
const { createScheduledDeliveryHandler } = await import(/* @vite-ignore */ modulePath);
const token = "a".repeat(64);
function setup(env: Record<string,string> = {MITAKE_MODE:"mock"}) {
  const authorize = vi.fn().mockResolvedValue(true);
  const process = vi.fn().mockResolvedValue([{id:"job",status:"succeeded"}]);
  const handle = createScheduledDeliveryHandler({authorize,process,env:(name:string)=>env[name]});
  return {authorize,process,handle};
}
const request = (value=token,method="POST") => new Request("https://example.test/cron",{
  method,headers:{"x-delivery-cron-token":value},
});
describe("scheduled delivery authorization and simulation boundary",()=>{
  it("rejects GET before authorization or processing",async()=>{
    const s=setup();expect((await s.handle(request(token,"GET"))).status).toBe(405);
    expect(s.authorize).not.toHaveBeenCalled();expect(s.process).not.toHaveBeenCalled();
  });
  it.each(["","Bearer service-role-key","short"])("rejects malformed token %s",async(value)=>{
    const s=setup();expect((await s.handle(request(value))).status).toBe(401);
    expect(s.authorize).not.toHaveBeenCalled();expect(s.process).not.toHaveBeenCalled();
  });
  it("rejects a syntactically valid but incorrect token",async()=>{
    const s=setup();s.authorize.mockResolvedValue(false);
    expect((await s.handle(request())).status).toBe(401);expect(s.process).not.toHaveBeenCalled();
  });
  it.each([{}, {MITAKE_MODE:"live"}, {MITAKE_MODE:"mock",ECPAY_INVOICE_ENABLED:"true"}])(
    "refuses provider sends for configuration %j",async(env)=>{
      const s=setup(env);expect((await s.handle(request())).status).toBe(409);expect(s.process).not.toHaveBeenCalled();
    });
  it("runs the worker once after token validation and reports results",async()=>{
    const s=setup();const response=await s.handle(request());
    expect(response.status).toBe(200);expect(await response.json()).toEqual({processed:1,results:[{id:"job",status:"succeeded"}]});
    expect(s.authorize).toHaveBeenCalledWith(token);expect(s.process).toHaveBeenCalledTimes(1);
  });
  it("fails closed when Vault validation is unavailable without exposing errors",async()=>{
    const s=setup();s.authorize.mockRejectedValue(new Error("secret-token-customer-phone"));
    const response=await s.handle(request());expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-token");expect(s.process).not.toHaveBeenCalled();
  });
  it("returns retryable failure when worker claim fails",async()=>{
    const s=setup();s.process.mockRejectedValue(new Error("database offline"));
    expect((await s.handle(request())).status).toBe(503);
  });
});
