import { describe, expect, it, vi } from "vitest";
import { placeOrder } from "@/services/db/checkout";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({supabase:{functions:{invoke}}}));
const recipient = {name:"測試",tel:"0912345678",email:"test@example.com",address:"台北市測試路1號"};
describe("checkout client trust boundary", () => {
  it("only sends IDs, quantities, coupon, recipient and idempotency key", async () => {
    invoke.mockResolvedValueOnce({data:{order:{id:"order"}},error:null});
    await placeOrder({buyerId:"forged-user",memberTier:"gold",memberContext:{tier:"gold"},
      requestId:"request",items:[{productId:"product",qty:1,title:"forged",unitPrice:1}],recipient,couponCode:"CODE"});
    expect(invoke).toHaveBeenLastCalledWith("checkout-create",{body:{requestId:"request",
      items:[{productId:"product",qty:1}],recipient,couponCode:"CODE"}});
  });
  it("shows the server validation error for a rejected order", async () => {
    invoke.mockResolvedValueOnce({data:null,error:{context:new Response(JSON.stringify({error:{message:"優惠碼已失效"}}))}});
    await expect(placeOrder({buyerId:"user",memberTier:"normal",items:[],recipient})).rejects.toThrow("優惠碼已失效");
  });
});
