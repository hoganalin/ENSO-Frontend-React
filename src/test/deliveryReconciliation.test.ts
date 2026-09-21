// @vitest-environment node
import {beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({caller:vi.fn(),rpc:vi.fn(),role:"admin"}));
vi.mock("../../supabase/functions/_shared/supabaseAdmin.ts",()=>({getCallerUserId:state.caller,createAdminClient:()=>({rpc:state.rpc,from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:state.role},error:null})})})})})}));
vi.mock("../../supabase/functions/_shared/delivery.ts",()=>({deliverJob:vi.fn()}));
let handler:(req:Request)=>Promise<Response>;
beforeAll(async()=>{
 vi.stubGlobal("Deno",{env:{get:()=>undefined},serve:(fn:typeof handler)=>{handler=fn;}});
 const entry="../../supabase/functions/delivery-process/index.ts";
 await import(/* @vite-ignore */entry);
});
beforeEach(()=>{state.caller.mockResolvedValue("actor-from-token");state.role="admin";state.rpc.mockReset().mockResolvedValue({data:{id:"job"},error:null});});
const request=(body:object)=>new Request("https://example.com/delivery-process",{method:"POST",body:JSON.stringify(body)});
const valid={action:"reconcile",job_id:"job",outcome:"confirmed_not_sent",note:"已核對模擬工作未送出"};
describe("delivery reconciliation API",()=>{
 it("requires login",async()=>{state.caller.mockResolvedValue(null);expect((await handler(request(valid))).status).toBe(401);expect(state.rpc).not.toHaveBeenCalled();});
 it("rejects support role",async()=>{state.role="support";expect((await handler(request(valid))).status).toBe(403);expect(state.rpc).not.toHaveBeenCalled();});
 it("requires evidence",async()=>{expect((await handler(request({...valid,note:""}))).status).toBe(400);expect(state.rpc).not.toHaveBeenCalled();});
 it("uses authenticated actor, never client actor",async()=>{expect((await handler(request({...valid,actor:"spoof"}))).status).toBe(200);expect(state.rpc).toHaveBeenCalledWith("reconcile_delivery_job",expect.objectContaining({p_actor:"actor-from-token",p_note:valid.note}));});
 it("returns conflict for stale or exhausted work",async()=>{state.rpc.mockResolvedValue({data:null,error:{message:"stale"}});expect((await handler(request(valid))).status).toBe(409);});
 it("rejects unaudited legacy requeue",async()=>{expect((await handler(request({action:"requeue",job_id:"job"}))).status).toBe(400);expect(state.rpc).not.toHaveBeenCalled();});
});
