import { beforeEach, describe, expect, it, vi } from "vitest";
import { addCartItemsApi, CART_STORAGE_KEY, clearStoredCart } from "@/services/cart";
import { readFavorites, setFavorite } from "@/services/favorites";
import { isCurrentOffer, offerBenefit, offerConditions } from "@/services/db/memberOffers";
import type { PromotionRow } from "@/services/db/types";

const { products } = vi.hoisted(() => ({ products: vi.fn() }));
vi.mock("@/services/db/products", () => ({ getProductsByIds: products,
  isProductId: (id: unknown) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const row = { id: a, title: "沉香", price: 650, is_enabled: true };
beforeEach(() => { localStorage.clear(); clearStoredCart(); products.mockReset(); products.mockResolvedValue([row]); });

describe("member purchases and device-local favorites", () => {
  it("merges order quantities with existing cart and uses current price", async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ product_id: a, qty: 1, price: 1 }]));
    const result = await addCartItemsApi([{ product_id: a, qty: 2 }]);
    expect(result.data.data.total).toBe(1950);
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY)!)).toEqual([{ product_id: a, qty: 3 }]);
  });
  it("rejects the whole reorder if one product was removed", async () => {
    const saved = JSON.stringify([{ product_id: a, qty: 1 }]);
    localStorage.setItem(CART_STORAGE_KEY, saved);
    await expect(addCartItemsApi([{ product_id: a, qty: 2 }, { product_id: b, qty: 1 }])).rejects.toThrow("下架");
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(saved);
  });
  it("does not partially add when a later item exceeds the quantity limit", async () => {
    await expect(addCartItemsApi([{ product_id: a, qty: 2 }, { product_id: a, qty: 99 }])).rejects.toThrow("99");
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });
  it("rejects orders without items", async () => {
    await expect(addCartItemsApi([])).rejects.toThrow("沒有可再次購買");
  });
  it("keeps favorites separate for each account and stores IDs only", () => {
    setFavorite(a, b.toUpperCase(), true); setFavorite(a, b, true);
    expect(readFavorites(a)).toEqual([b]); expect(readFavorites(b)).toEqual([]);
    setFavorite(a, b, false); expect(readFavorites(a)).toEqual([]);
  });
  it("rejects invalid IDs without writing", () => {
    expect(() => setFavorite("guest", a, true)).toThrow(); expect(localStorage.length).toBe(0);
  });
});

describe("offer display describes current configured restrictions", () => {
  const offer = { is_active: true, starts_at: "2026-09-01T00:00:00Z", ends_at: "2026-09-30T23:59:59Z", conditions: {}, effect: {} } as PromotionRow;
  const now = Date.parse("2026-09-17T12:00:00Z");
  it("does not expose expired, future, inactive or invalid-date offers", () => {
    expect(isCurrentOffer(offer, now)).toBe(true);
    for (const change of [{ ends_at: "2026-09-01" }, { starts_at: "2026-10-01" }, { is_active: false }, { starts_at: "invalid" }]) expect(isCurrentOffer({ ...offer, ...change }, now)).toBe(false);
  });
  it("shows birthday, tier and product conditions without granting eligibility", () => {
    expect(offerConditions({ ...offer, conditions: { birthday_month: true, member_tier: "gold", min_subtotal: 1000, product_ids: [a] } })).toEqual(["商品金額滿 NT$1,000", "限 金卡會員", "限生日當月", "限指定商品或商品組合"]);
  });
  it("describes a 15% discount as a reduction rather than 15% of the original price", () => {
    expect(offerBenefit({ ...offer, effect: { type: "percent", rate: .15 } })).toContain("折抵 15%");
  });
});
