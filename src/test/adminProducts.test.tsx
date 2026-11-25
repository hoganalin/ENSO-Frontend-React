import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PostgrestError } from "@supabase/supabase-js";

const { getCurrentProfile, from, deleteEq } = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  from: vi.fn(),
  deleteEq: vi.fn(),
}));

vi.mock("@/components/AdminShell", () => ({
  default: ({ children }: { children: import("react").ReactNode }) => children,
}));
vi.mock("@/services/db/auth", () => ({ getCurrentProfile }));
vi.mock("@/lib/supabase", () => ({ supabase: { from } }));

import AdminProducts from "@/components/AdminProducts";

const product = {
  id: "product-1",
  title: "金流測試商品",
  category: null,
  price: 5,
  origin_price: null,
  unit: null,
  description: null,
  content: null,
  image_url: null,
  images_url: [],
  is_enabled: true,
  inventory: 99,
  top_smell: null,
  heart_smell: null,
  base_smell: null,
  scenes: [],
  features: null,
  specs: [],
  created_at: "2026-11-25T00:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentProfile.mockResolvedValue({ id: "admin-1", role: "admin" });
  from.mockImplementation(() => ({
    select: () => ({
      order: () => Promise.resolve({ data: [product], error: null }),
    }),
    delete: () => ({ eq: deleteEq }),
  }));
  deleteEq.mockResolvedValue({
    data: null,
    error: new PostgrestError({
      message: 'update or delete on table "products" violates foreign key constraint "order_items_product_id_fkey"',
      details: "Key (id)=(product-1) is still referenced from table order_items.",
      hint: null,
      code: "23503",
    }),
  });
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminProducts deletion", () => {
  it("explains that a product referenced by history cannot be deleted", async () => {
    render(<AdminProducts />);
    await screen.findByText("金流測試商品");

    fireEvent.click(screen.getByRole("button", { name: "刪除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "此商品已有關聯資料，為保留歷史紀錄無法直接刪除。請使用「編輯」將商品下架。",
    );
    expect(deleteEq).toHaveBeenCalledWith("id", product.id);
    expect(screen.getByText("金流測試商品")).toBeInTheDocument();
  });
});
