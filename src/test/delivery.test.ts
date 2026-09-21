// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({send:vi.fn(), config:vi.fn()}));
vi.mock("../../supabase/functions/_shared/mitake.ts",async(importOriginal)=>({...await importOriginal<object>(),loadMitakeConfig:mocks.config,sendSms:mocks.send}));
vi.mock("../../supabase/functions/_shared/invoice.ts",()=>({isInvoiceEnabled:()=>false,issueB2CInvoice:vi.fn(),loadInvoiceConfig:vi.fn(),makeInvoiceItems:vi.fn()}));
let deliver: (admin:any,job:any)=>Promise<string>;
beforeAll(async()=>{const entry="../../supabase/functions/_shared/delivery.ts";deliver=(await import(/* @vite-ignore */ entry)).deliverJob;});
beforeEach(()=>{vi.unstubAllGlobals();mocks.config.mockReset().mockReturnValue({});mocks.send.mockReset().mockResolvedValue({success:true,msgid:"MSG"});});
const job={id:"job",order_id:"order",kind:"buyer_sms",lease_token:"lease"};
function database(failLock=false,phone="0912345678"){
 const order={id:"order",order_no:"ENSO1",status:"paid",total:1080,buyer_id:"buyer",recipient:{tel:phone}};
 const saved=vi.fn().mockResolvedValue({error:null});
 const rpc=vi.fn().mockImplementation(async(_name,args)=>({data:!(failLock && args.p_status==="sending"),error:null}));
 return {rpc,saved,from:()=>({select:()=>({eq:()=>({single:async()=>({data:order,error:null})})}),insert:saved})};
}
describe("durable delivery worker",()=>{
 it("records accepted delivery and provider reference",async()=>{const db=database();expect(await deliver(db,job)).toBe("succeeded");expect(db.rpc).toHaveBeenLastCalledWith("transition_delivery_job",expect.objectContaining({p_status:"succeeded",p_reference:"MSG"}));});
 it("does not send without owning a valid lease",async()=>{expect(await deliver(database(true),job)).toBe("failed");expect(mocks.send).not.toHaveBeenCalled();});
 it("holds an ambiguous network result for reconciliation",async()=>{mocks.send.mockResolvedValue({success:false,error:"timeout"});expect(await deliver(database(),job)).toBe("uncertain");});
 it("keeps missing configuration retryable without sending",async()=>{mocks.config.mockImplementation(()=>{throw new Error("missing config");});expect(await deliver(database(),job)).toBe("failed");expect(mocks.send).not.toHaveBeenCalled();});
 it("does not blindly resend when provider succeeded but log storage failed",async()=>{const db=database();db.saved.mockResolvedValue({error:{message:"offline"}});expect(await deliver(db,job)).toBe("uncertain");expect(mocks.send).toHaveBeenCalledTimes(1);});
});

function mockMode(result:string) {
 vi.stubGlobal("Deno",{env:{get:(key:string)=>key === "MITAKE_MODE" ? "mock" : key === "MITAKE_MOCK_RESULT" ? result : undefined}});
}
describe("mock SMS (no provider requests)",()=>{
 it.each([ ["success","succeeded"],["failed","failed"],["uncertain","uncertain"] ])("simulates %s with recipient and content audit",async(result,status)=>{
  mockMode(result); const db=database();
  expect(await deliver(db,job)).toBe(status);
  expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  expect(db.saved).toHaveBeenCalledWith(expect.objectContaining({to_phone:"0912345678",message:"您的訂單 ENSO1 已付款，總額 NT$1,080。",is_simulated:true,delivery_job_id:"job"}));
  expect(db.rpc).toHaveBeenLastCalledWith("transition_delivery_job",expect.objectContaining({p_status:status}));
 });
 it("refuses simulated delivery when lease is lost",async()=>{
  mockMode("success");const db=database(true);expect(await deliver(db,job)).toBe("failed");expect(db.saved).not.toHaveBeenCalled();
 });
 it("holds mock success for reconciliation if audit cannot be stored",async()=>{
  mockMode("success");const db=database();db.saved.mockResolvedValue({error:{message:"offline"}});expect(await deliver(db,job)).toBe("uncertain");
 });
});

it("rejects malformed recipient before mock sending",async()=>{
 mockMode("success");const db=database(false,"bad-number");expect(await deliver(db,job)).toBe("failed");expect(db.saved).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
});
it("normalizes international Taiwan number before recording",async()=>{
 mockMode("success");const db=database(false,"+886912345678");expect(await deliver(db,job)).toBe("succeeded");expect(db.saved).toHaveBeenCalledWith(expect.objectContaining({to_phone:"0912345678"}));
});
