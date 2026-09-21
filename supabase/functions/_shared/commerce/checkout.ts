import { distributorDiscount } from "./membershipRules.ts";
import { computeOrderTotals, type CheckoutItem } from "./orderTotals.ts";
import { dbPromoToDomain, type PromotionRow } from "./promotionRows.ts";
import type { MemberContext, MemberTier } from "./promotions.ts";

export interface Recipient { name: string; email: string; tel: string; address: string }
export interface CheckoutRequest {
  requestId: string;
  items: { productId: string; qty: number }[];
  couponCode: string | null;
  recipient: Recipient;
}
export class CheckoutError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deliberately pick only IDs, quantities and recipient fields; client prices/tier are untrusted. */
export function parseCheckoutRequest(value: unknown): CheckoutRequest {
  if (!value || typeof value !== "object") throw new CheckoutError("訂單格式不正確");
  const body = value as Record<string, unknown>;
  if (typeof body.requestId !== "string" || !uuid.test(body.requestId)) {
    throw new CheckoutError("缺少有效的訂單請求編號，請重新整理後再試");
  }
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) {
    throw new CheckoutError("購物車需包含 1 至 100 種商品");
  }
  const quantities = new Map<string, number>();
  for (const value of body.items) {
    const item = value as { productId?: unknown; qty?: unknown } | null;
    if (!item || typeof item.productId !== "string" || !uuid.test(item.productId) ||
      typeof item.qty !== "number" || !Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 999) {
      throw new CheckoutError("商品或數量不正確，請重新加入購物車");
    }
    const productId = item.productId.toLowerCase();
    const quantity = (quantities.get(productId) ?? 0) + item.qty;
    if (quantity > 999) throw new CheckoutError("單項商品最多可購買 999 件");
    quantities.set(productId, quantity);
  }
  const rawRecipient = body.recipient as Record<string, unknown> | null;
  const field = (key: string, max: number): string => {
    const raw = rawRecipient?.[key];
    if (typeof raw !== "string" || !raw.trim() || raw.trim().length > max) {
      throw new CheckoutError("請完整填寫收件人姓名、電話、電子郵件與地址");
    }
    return raw.trim();
  };
  const recipient = { name: field("name", 80), email: field("email", 254),
    tel: field("tel", 30).replace(/[\s()-]/g, ""), address: field("address", 300) };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)) throw new CheckoutError("電子郵件格式不正確");
  if (!/^(09\d{8}|\+8869\d{8})$/.test(recipient.tel)) throw new CheckoutError("請填寫有效的台灣手機號碼");
  if (recipient.address.length < 6) throw new CheckoutError("請填寫完整收件地址");
  if (body.couponCode !== undefined && body.couponCode !== null && typeof body.couponCode !== "string") {
    throw new CheckoutError("優惠碼格式不正確");
  }
  const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim() || null : null;
  if (couponCode && couponCode.length > 100) throw new CheckoutError("優惠碼過長");
  return { requestId: body.requestId.toLowerCase(), items: [...quantities].sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, qty]) => ({ productId, qty })), recipient, couponCode };
}

export interface CheckoutProfile {
  member_tier: MemberTier; birthday: string | null; referrer_id: string | null;
  role?: string; subscription_active?: boolean; subscription_expires_at?: string | null; distributor_discount_rate?: number;
}
export interface CheckoutProduct { id: string; title: string; price: number; is_enabled: boolean;
  vip_only?: boolean; available_at?: string | null; vip_available_at?: string | null }

export function priceCheckout(request: CheckoutRequest, products: CheckoutProduct[],
  profile: CheckoutProfile, completedOrderCount: number, rows: PromotionRow[], now = Date.now()) {
  const productMap = new Map(products.map((p) => [p.id, p]));
  const items: CheckoutItem[] = request.items.map(({ productId, qty }) => {
    const product = productMap.get(productId);
    if (!product || !product.is_enabled) throw new CheckoutError("商品已下架，請更新購物車");
    if (product.vip_only && profile.member_tier !== "gold") throw new CheckoutError("此商品限 VIP 金卡會員購買");
    const opensAt = profile.member_tier === "gold" ? product.vip_available_at ?? product.available_at : product.available_at;
    if (opensAt && (!Number.isFinite(Date.parse(opensAt)) || Date.parse(opensAt) > now)) {
      throw new CheckoutError("商品尚未開放此會員購買");
    }
    if (!Number.isSafeInteger(product.price) || product.price < 0) throw new CheckoutError("商品價格異常，請聯絡客服");
    return { productId, qty, title: product.title, unitPrice: product.price };
  });
  const birthday = profile.birthday?.match(/^\d{4}-(\d{2})-\d{2}$/);
  const member: MemberContext = { tier: profile.member_tier, birthdayMonth: birthday ? Number(birthday[1]) : undefined,
    referrerId: profile.referrer_id ?? undefined, completedOrderCount };
  const promos = rows.filter((r) => r.is_active).map((r) => dbPromoToDomain(r, now));
  const totals = computeOrderTotals(items, member, promos, request.couponCode);
  if (request.couponCode && !totals.appliedPromos.some((p) =>
    promos.some((candidate) => candidate.id === p.id && candidate.code === request.couponCode))) {
    throw new CheckoutError("優惠碼已失效或不符合使用條件，請返回購物車確認");
  }
  // Multiple legitimate promotions may exceed subtotal; only store the actual reduction.
  totals.discount = Math.min(totals.discount, totals.subtotal);
  // Test policy: configured distributor rate applies after campaign discounts.
  const membershipDiscount = distributorDiscount(totals.subtotal - totals.discount, {
    role: profile.role ?? "customer", subscriptionActive: profile.subscription_active ?? false,
    subscriptionExpiresAt: profile.subscription_expires_at,
    distributorDiscountRate: profile.distributor_discount_rate,
  }, new Date(now));
  if (membershipDiscount > 0) {
    totals.discount += membershipDiscount;
    totals.appliedPromos.push({ id: "distributor-membership", name: "經銷商訂閱優惠", amount: membershipDiscount });
  }
  totals.total = totals.subtotal - totals.discount + totals.shippingFee;
  if (![totals.total, totals.subtotal, totals.discount, totals.shippingFee].every(Number.isSafeInteger) ||
    totals.total < 1 || totals.total > 2_000_000_000) throw new CheckoutError("訂單金額不適用線上付款，請聯絡客服");
  return { items, totals };
}

