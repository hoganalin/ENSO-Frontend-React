import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import PaymentPage from "@/pages/PaymentPage";
const { auth, list, pay, items, refund } = vi.hoisted(() => ({auth:vi.fn(),list:vi.fn(),pay:vi.fn(),items:vi.fn(),refund:vi.fn()}));
vi.mock("@/components/OrderGifts",()=>({default:()=>null}));
vi.mock("@/lib/supabase-auth",()=>({requireAuth:auth}));
vi.mock("@/services/db/orders",()=>({listMyOrders:list,listOrderItems:items,requestFullRefund:refund}));
vi.mock("@/lib/supabase",()=>({supabase:{from:()=>({select:()=>({eq:()=>({order:()=>Promise.resolve({data:[],error:null})})})}),rpc:refund}}));
vi.mock("@/services/payment/client",()=>({startEcpayPayment:pay}));
const order = {id:"order-1",order_no:"ENSO-1",total:1080,status:"pending"};
const show = () => render(<MemoryRouter initialEntries={["/payment/order-1"]}><Routes><Route path="/payment/:orderId" element={<PaymentPage/>}/></Routes></MemoryRouter>);
beforeEach(()=>{vi.clearAllMocks();auth.mockResolvedValue("buyer");list.mockResolvedValue([order]);items.mockResolvedValue([]);pay.mockRejectedValue(new Error("付款暫時無法連線"));});
afterEach(cleanup);
describe("payment page",()=>{
  it("submits the paid order's full amount and reason for review",async()=>{
    list.mockResolvedValue([{...order,status:"paid"}]); refund.mockResolvedValue({data:{id:"refund-1",amount:1080,status:"requested",reason:"希望取消這筆訂單"},error:null});
    show();
    fireEvent.click(await screen.findByText("申請全額或部分退款"));
    const reason=await screen.findByLabelText("退款原因");
    fireEvent.change(screen.getByLabelText("退款金額"),{target:{value:"1080"}});
    fireEvent.change(reason,{target:{value:"希望取消這筆訂單"}});
    fireEvent.click(screen.getByRole("button",{name:"送出退款申請"}));
    await screen.findByText(/退款申請已送出/);
    expect(refund).toHaveBeenCalledWith("request_partial_refund",expect.objectContaining({p_order:"order-1",p_amount:1080,p_reason:"希望取消這筆訂單"}));
  });
  it("loads the new order's items after navigating without unmounting",async()=>{
    list.mockResolvedValue([order,{...order,id:"order-2",order_no:"ENSO-2"}]);
    items.mockImplementation(async(id:string)=>[{id,title:id === "order-1" ? "檀香" : "沉香",qty:1,unit_price:100}]);
    render(<MemoryRouter initialEntries={["/payment/order-1"]}><Link to="/payment/order-2">下一筆</Link><Routes><Route path="/payment/:orderId" element={<PaymentPage/>}/></Routes></MemoryRouter>);
    await screen.findByText("檀香 × 1");
    fireEvent.click(screen.getByText("下一筆"));
    expect(await screen.findByText("沉香 × 1")).toBeInTheDocument();
    expect(screen.queryByText("檀香 × 1")).not.toBeInTheDocument();
  });
  it("shows purchased items with their image, quantity and subtotal",async()=>{
    items.mockResolvedValue([{id:"item-1",title:"檀香",qty:2,unit_price:540,image_url:"/images/incense.png"}]);
    show();
    expect(await screen.findByText("檀香 × 2")).toBeInTheDocument();
    const section=screen.getByRole("region",{name:"訂單商品"});
    expect(section.querySelector("img")).toHaveAttribute("src","/images/incense.png");
    expect(section).toHaveTextContent("NT$1,080");
    expect(items).toHaveBeenCalledWith("order-1");
  });
  it("reads the authenticated buyer and can retry a failed payment request",async()=>{
    show();fireEvent.click(await screen.findByRole("button",{name:"前往綠界付款"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("付款暫時無法連線");
    expect(list).toHaveBeenCalledWith("buyer");expect(pay).toHaveBeenCalledWith("order-1");
    fireEvent.click(screen.getByRole("button",{name:"前往綠界付款"}));
    await waitFor(()=>expect(pay).toHaveBeenCalledTimes(2));
  });
  it.each(["paid","shipped","completed","cancelled","refunded"])("cannot pay a %s order",async(status)=>{
    list.mockResolvedValue([{...order,status}]);show();await screen.findByText("訂單編號：ENSO-1");
    expect(screen.queryByRole("button",{name:"前往綠界付款"})).not.toBeInTheDocument();
  });
  it("does not fetch orders before authentication succeeds",async()=>{
    auth.mockRejectedValue(new Error("請先登入"));show();expect(await screen.findByRole("alert")).toHaveTextContent("請先登入");expect(list).not.toHaveBeenCalled();
  });
  it("does not offer payment for an inaccessible order",async()=>{
    list.mockResolvedValue([]);show();expect(await screen.findByRole("alert")).toHaveTextContent("找不到可存取的訂單");expect(pay).not.toHaveBeenCalled();
  });
});


