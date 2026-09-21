import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DistributorPage from "@/pages/DistributorPage";
const mocks = vi.hoisted(() => ({ member: vi.fn(), products: vi.fn(), orders: vi.fn(), add: vi.fn() }));
vi.mock("@/hooks/useMember", () => ({ useMember: mocks.member }));
vi.mock("@/services/db/products", () => ({ listProducts: mocks.products }));
vi.mock("@/services/db/orders", () => ({ listMyOrders: mocks.orders }));
vi.mock("@/services/cart", () => ({ addCartItemsApi: mocks.add }));
const member = { id: "buyer", role: "distributor", subscription_active: true, subscription_expires_at: "2099-01-01", distributor_discount_rate: 10 };
beforeEach(() => {
 vi.clearAllMocks();
 mocks.member.mockReturnValue({ profile: member, loading: false, error: "", retry: vi.fn() });
 mocks.products.mockResolvedValue([{ id: "p1", title: "線香", price: 100 }]);
 mocks.orders.mockResolvedValue([{ id: "o1", buyer_id: "buyer", order_no: "MINE", total: 300, created_at: "2026-01-01", status: "paid" }, { id: "o2", buyer_id: "other", order_no: "PRIVATE", total: 999, created_at: "2026-01-01", status: "paid" }]);
 mocks.add.mockResolvedValue({});
});
const view = () => render(<MemoryRouter><DistributorPage /></MemoryRouter>);
describe("distributor acceptance", () => {
 it("denies customers before reading account data", () => {
  mocks.member.mockReturnValue({ profile: { ...member, role: "customer" }, loading: false });
  view(); expect(screen.getByText(/此頁提供經銷會員/)).toBeTruthy(); expect(mocks.orders).not.toHaveBeenCalled();
 });
 it("shows only own orders and submits bulk quantities without browser prices", async () => {
  view(); await screen.findByText("MINE"); expect(screen.queryByText("PRIVATE")).toBeNull();
  expect(mocks.orders).toHaveBeenCalledWith("buyer");
  fireEvent.change(screen.getByLabelText("數量（0–99）"), { target: { value: "3" } });
  fireEvent.click(screen.getByText("將選取商品加入購物車"));
  await waitFor(() => expect(mocks.add).toHaveBeenCalledWith([{ product_id: "p1", qty: 3 }]));
 });
 it("expired subscription removes displayed discount", async () => {
  mocks.member.mockReturnValue({ profile: { ...member, subscription_expires_at: "2020-01-01" }, loading: false });
  view(); await screen.findByText(/牌價 NT\$100 · 經銷預估 NT\$100/);
 });
});
