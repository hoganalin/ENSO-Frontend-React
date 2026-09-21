import { describe, expect, it } from "vitest";
import { parseCheckoutRequest, priceCheckout } from "../../supabase/functions/_shared/commerce/checkout.ts";
import type { PromotionRow } from "../../supabase/functions/_shared/commerce/promotionRows.ts";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const body = () => ({ requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  items: [{ productId: id, qty: 2, unitPrice: 1 }], memberTier: "gold", total: 1,
  recipient: { name: "收件人", tel: "0912345678", email: "buyer@example.com", address: "台北市中正區測試路1號" } });
const product = { id, title: "線香", price: 1000, is_enabled: true };
const profile = { member_tier: "normal" as const, birthday: null, referrer_id: null };
const promo = (override: Partial<PromotionRow> = {}): PromotionRow => ({ id: "promo", code: "GOLD", name: "金卡", kind: "coupon",
  promo_group: "coupon", priority: 1, is_auto: false, is_active: true, conditions: { member_tier: "gold" },
  effect: { type: "percent", rate: 0.5 }, starts_at: null, ends_at: null, created_at: "", ...override });

describe("trusted checkout", () => {
  it("uses server prices and member tier, ignoring client amounts", () => {
    const request = parseCheckoutRequest(body());
    expect(request.items).toEqual([{ productId: id, qty: 2 }]);
    const { totals } = priceCheckout(request, [product], profile, 0, [promo({ is_auto: true })]);
    expect(totals.total).toBe(2080);
  });
  it("rejects a coupon that the client falsely claimed to qualify for", () => {
    expect(() => priceCheckout(parseCheckoutRequest({ ...body(), couponCode: "GOLD" }), [product], profile, 0, [promo()])).toThrow("優惠碼");
  });
  it("calculates eligible server discounts using the same engine", () => {
    const request = parseCheckoutRequest({ ...body(), couponCode: "GOLD" });
    expect(priceCheckout(request, [product], { ...profile, member_tier: "gold" }, 0, [promo()]).totals.total).toBe(1080);
  });
  it.each([0, -1, 1.5, 1000, "2", null])("rejects invalid quantity %s", (qty) => {
    expect(() => parseCheckoutRequest({ ...body(), items: [{ productId: id, qty }] })).toThrow();
  });
  it("normalizes duplicate IDs regardless of UUID letter case", () => {
    expect(parseCheckoutRequest({ ...body(), items: [{ productId: id, qty: 1 }, { productId: id.toUpperCase(), qty: 2 }] }).items)
      .toEqual([{ productId: id, qty: 3 }]);
  });
  it("rejects missing recipient and obsolete product IDs", () => {
    expect(() => parseCheckoutRequest({ ...body(), recipient: null })).toThrow();
    expect(() => parseCheckoutRequest({ ...body(), items: [{ productId: "hex-id", qty: 1 }] })).toThrow();
  });
  it("rejects disabled and missing products", () => {
    const request = parseCheckoutRequest(body());
    expect(() => priceCheckout(request, [], profile, 0, [])).toThrow("下架");
    expect(() => priceCheckout(request, [{ ...product, is_enabled: false }], profile, 0, [])).toThrow("下架");
  });
  it("does not redeem expired codes", () => {
    expect(() => priceCheckout(parseCheckoutRequest({ ...body(), couponCode: "GOLD" }), [product],
      { ...profile, member_tier: "gold" }, 0, [promo({ ends_at: "2000-01-01" })])).toThrow("優惠碼");
  });
});

const membershipNow = Date.parse("2026-09-18T00:00:00Z");
const distributor = { ...profile, role: "distributor", subscription_active: true,
  subscription_expires_at: "2026-10-01T00:00:00Z", distributor_discount_rate: 15 };
describe("trusted distributor pricing", () => {
  it("uses database membership and records the discount without changing line prices", () => {
    const quote = priceCheckout(parseCheckoutRequest(body()), [product], distributor, 0, [], membershipNow);
    expect(quote.items[0].unitPrice).toBe(1000);
    expect(quote.totals.discount).toBe(300);
    expect(quote.totals.total).toBe(1780);
    expect(quote.totals.appliedPromos).toContainEqual({ id: "distributor-membership", name: "經銷商訂閱優惠", amount: 300 });
  });
  it.each([
    { subscription_active: false }, { role: "customer" },
    { subscription_expires_at: "2026-09-18T00:00:00Z" },
    { subscription_expires_at: "2020-01-01T00:00:00Z" },
  ])("does not grant ineligible membership discount %j", (override) => {
    expect(priceCheckout(parseCheckoutRequest(body()), [product], { ...distributor, ...override }, 0, [], membershipNow).totals.discount).toBe(0);
  });
  it("applies distributor rate to the balance after promotions", () => {
    const quote = priceCheckout(parseCheckoutRequest({ ...body(), couponCode: "GOLD" }), [product],
      { ...distributor, member_tier: "gold" }, 0, [promo()], membershipNow);
    expect(quote.totals.discount).toBe(1150);
    expect(quote.totals.total).toBe(930);
  });
  it("ignores client-submitted subscription and discount claims", () => {
    const request = parseCheckoutRequest({ ...body(), role: "distributor", subscription_active: true, distributor_discount_rate: 100 });
    expect(priceCheckout(request, [product], profile, 0, [], membershipNow).totals.discount).toBe(0);
  });
});
