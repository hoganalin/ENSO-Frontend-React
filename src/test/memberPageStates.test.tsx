import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import MemberPage from "@/pages/MemberPage";
import DistributorPage from "@/pages/DistributorPage";

const { member, balance, products, orders, add } = vi.hoisted(() => ({ member: vi.fn(), balance: vi.fn(), products: vi.fn(), orders: vi.fn(), add: vi.fn() }));
vi.mock("@/hooks/useMember", () => ({ useMember: member }));
vi.mock("@/services/db/storeCredit", () => ({ getBalance: balance }));
vi.mock("@/services/db/products", () => ({ listProducts: products }));
vi.mock("@/services/db/orders", () => ({ listMyOrders: orders }));
vi.mock("@/services/cart", () => ({ addCartItemsApi: add }));
const profile = { id: "member", role: "distributor", member_tier: "gold", name: "測試會員" };
beforeEach(() => {
  vi.resetAllMocks();
  member.mockReturnValue({ profile, loading: false, error: "", retry: vi.fn() });
  balance.mockResolvedValue(0);
  products.mockResolvedValue([{ id: "incense", title: "測試線香", price: 500 }]);
  orders.mockResolvedValue([]);
  add.mockResolvedValue({});
});
afterEach(cleanup);

describe("member page recoverable states", () => {
  it("shows a credit error and recovers without reloading the whole page", async () => {
    balance.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(120);
    render(<MemoryRouter><MemberPage /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("購物金讀取失敗");
    fireEvent.click(screen.getByRole("button", { name: "重新讀取購物金" }));
    expect(await screen.findByText("NT$ 120")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("shows zero available credit for a negative ledger balance", async () => {
    balance.mockResolvedValue(-50);
    render(<MemoryRouter><MemberPage /></MemoryRouter>);
    expect(await screen.findByText("NT$ 0")).toBeInTheDocument();
    expect(screen.queryByText(/10%|20%/)).not.toBeInTheDocument();
  });
});

describe("distributor quantity and error states", () => {
  it.each(["-1", "1.5", "100"])("does not submit invalid quantity %s", async value => {
    render(<MemoryRouter><DistributorPage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("數量（0–99）"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "將選取商品加入購物車" }));
    expect(screen.getByText("商品數量請輸入 0 到 99 的整數。")).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();
  });
  it("does not label failed order loading as a zero balance or empty history", async () => {
    orders.mockRejectedValue(new Error("offline"));
    render(<MemoryRouter><DistributorPage /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("讀取失敗");
    expect(screen.queryByText(/已付款訂單原始金額合計/)).not.toBeInTheDocument();
    expect(screen.queryByText("尚無採購紀錄。")).not.toBeInTheDocument();
    orders.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "重新載入" }));
    expect(await screen.findByText("尚無採購紀錄。")).toBeInTheDocument();
  });
});
