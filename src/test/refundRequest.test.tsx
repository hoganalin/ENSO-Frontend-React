import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RefundRequest from "@/components/RefundRequest";
const { rpc, load, exchangeLoad }=vi.hoisted(()=>({rpc:vi.fn(),load:vi.fn(),exchangeLoad:vi.fn()}));
vi.mock("@/lib/supabase",()=>({supabase:{from:(table:string)=>({select:()=>({eq:()=>({order:table === "refund_requests" ? load : exchangeLoad})})}),rpc}}));
beforeEach(()=>{vi.clearAllMocks();load.mockResolvedValue({data:[],error:null});exchangeLoad.mockResolvedValue({data:[],error:null});});
afterEach(cleanup);
it("reserves failed and uncertain amounts and excludes rejected requests",async()=>{
 load.mockResolvedValue({data:[{id:"a",amount:100,status:"failed",reason:"a"},{id:"b",amount:200,status:"uncertain",reason:"b"},{id:"c",amount:400,status:"rejected",reason:"c"}],error:null});
 render(<RefundRequest orderId="o" total={1000} eligible />);
 await screen.findByText(/可申請金額 NT\$700/);
 expect(screen.getByLabelText("退款金額")).toHaveAttribute("max","700");
});
it("reuses its key after response failure and records only successful requests",async()=>{
 rpc.mockResolvedValueOnce({data:null,error:{message:"timeout"}}).mockResolvedValueOnce({data:{id:"r",amount:300,status:"requested",reason:"partial"},error:null});
 render(<RefundRequest orderId="o" total={1000} eligible />);
 await screen.findByText("申請全額或部分退款");
 fireEvent.change(screen.getByLabelText("退款金額"),{target:{value:"300"}});
 fireEvent.change(screen.getByLabelText("退款原因"),{target:{value:"partial"}});
 fireEvent.click(screen.getByRole("button",{name:"送出退款申請"}));
 await screen.findByText(/申請未完成/);
 fireEvent.click(screen.getByRole("button",{name:"送出退款申請"}));
 await screen.findByText(/退款申請已送出/);
 expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1]);
 expect(screen.getByText(/可申請金額 NT\$700/)).toBeInTheDocument();
});
it("blocks submission when refund records cannot be loaded",async()=>{
 load.mockResolvedValue({data:null,error:{message:"offline"}});
 render(<RefundRequest orderId="o" total={1000} eligible />);
 await screen.findByText(/退款紀錄讀取失敗/);
 expect(screen.queryByRole("button",{name:"送出退款申請"})).not.toBeInTheDocument();
});


it("shows the replacement tracking number and prevents a second refund benefit",async()=>{
 exchangeLoad.mockResolvedValue({data:[{id:"x",quantity:1,tracking_number:"REPLACE123"}],error:null});
 render(<RefundRequest orderId="o" total={1000} eligible />);
 await screen.findByText(/REPLACE123/);
 expect(screen.queryByRole("button",{name:"送出退款申請"})).not.toBeInTheDocument();
});
