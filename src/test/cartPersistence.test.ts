import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import reducer, { clearCart, createAsyncGetCart } from "@/slice/cartSlice";
import { addCartApi, getCartApi, CART_STORAGE_KEY, clearStoredCart } from "@/services/cart";

const { fetchProducts } = vi.hoisted(() => ({ fetchProducts: vi.fn() }));
vi.mock("@/services/db/products", () => ({
  getProductsByIds: fetchProducts,
  isProductId: (id: unknown) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id),
}));
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const product = { id, title: "線香", price: 500, is_enabled: true, image_url: "/incense.png" };
beforeEach(() => { clearStoredCart(); fetchProducts.mockReset(); fetchProducts.mockResolvedValue([product]); });
describe("Supabase-backed guest cart", () => {
  it("stores only IDs/quantities and replaces tampered prices", async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{product_id:id,qty:2,price:1,product:{price:1}}]));
    const result = await getCartApi();
    expect(result.data.data.total).toBe(1000);
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY)!)).toEqual([{product_id:id,qty:2}]);
  });
  it("serializes simultaneous additions without losing quantities", async () => {
    await Promise.all([addCartApi({product_id:id,qty:1}), addCartApi({product_id:id,qty:2})]);
    expect((await getCartApi()).data.data.carts[0].qty).toBe(3);
  });
  it("preserves the stored cart when product refresh fails", async () => {
    const saved = JSON.stringify([{product_id:id,qty:1}]);
    localStorage.setItem(CART_STORAGE_KEY,saved);
    fetchProducts.mockRejectedValueOnce(new Error("offline"));
    await expect(getCartApi()).rejects.toThrow("offline");
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(saved);
  });
  it("discards obsolete IDs and disabled products", async () => {
    localStorage.setItem(CART_STORAGE_KEY,JSON.stringify([{product_id:"hex-id",qty:1},{product_id:id,qty:1}]));
    fetchProducts.mockResolvedValue([{...product,is_enabled:false}]);
    expect((await getCartApi()).data.data.carts).toEqual([]);
  });
  it("does not resurrect a cleared cart after an in-flight read resolves", async () => {
    localStorage.setItem(CART_STORAGE_KEY,JSON.stringify([{product_id:id,qty:1}]));
    let resolve!: (value: unknown) => void;
    fetchProducts.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const store = configureStore({reducer:{cart:reducer}});
    const pending = store.dispatch(createAsyncGetCart());
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    store.dispatch(clearCart());
    resolve([product]);
    await pending;
    expect(store.getState().cart.carts).toEqual([]);
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });
});
