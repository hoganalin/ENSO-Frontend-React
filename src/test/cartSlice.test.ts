import { describe, it, expect } from "vitest";

import reducer, { updateCart } from "@/slice/cartSlice";

const mockItem = {
  id: "cart-1",
  product_id: "prod-1",
  qty: 2,
  product: {
    id: "prod-1",
    title: "沉香線香",
    price: 500,
    imageUrl: "https://example.com/image.jpg",
  },
};

describe("cartSlice", () => {
  it("應回傳初始狀態", () => {
    const state = reducer(undefined, { type: "" });
    expect(state).toEqual({
      carts: [],
      total: 0,
      final_total: 0,
    });
  });

  it("新增商品後應更新 carts、total、final_total", () => {
    const payload = {
      carts: [mockItem],
      total: 1000,
      final_total: 1000,
    };
    const state = reducer(undefined, updateCart(payload));
    expect(state.carts).toHaveLength(1);
    expect(state.carts[0].product.title).toBe("沉香線香");
    expect(state.total).toBe(1000);
    expect(state.final_total).toBe(1000);
  });

  it("刪除商品後 carts 應為空，金額歸零", () => {
    const filledState = reducer(undefined, updateCart({
      carts: [mockItem],
      total: 1000,
      final_total: 1000,
    }));

    const clearedState = reducer(filledState, updateCart({
      carts: [],
      total: 0,
      final_total: 0,
    }));

    expect(clearedState.carts).toHaveLength(0);
    expect(clearedState.total).toBe(0);
    expect(clearedState.final_total).toBe(0);
  });
});
