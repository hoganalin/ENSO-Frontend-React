// src/domain/orderTotals.ts
// 訂單金額計算（純邏輯，不碰 DB）：把購物車 + 活動丟進引擎，算出結帳金額。
import {
  applyPromotions,
  normalizeMember,
  type CartLine,
  type MemberContext,
  type Promo,
  type PromoContext,
  type PromoOptions,
} from "./promotions.ts";
import type { MemberTier } from "./promotions.ts";

export const SHIPPING_BASE = 80;

export interface CheckoutItem {
  productId: string;
  title: string;
  unitPrice: number;
  qty: number;
}

export interface AppliedPromoSnapshot {
  id: string;
  name: string;
  amount?: number;
  freeShip?: boolean;
  gift?: string;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  gift: string | null;
  appliedPromos: AppliedPromoSnapshot[];
}

/**
 * 用活動引擎算出訂單金額（含優惠碼與互斥）。
 * promos 由呼叫端傳入，方便單元測試；不直接碰 DB。
 */
export function computeOrderTotals(
  items: CheckoutItem[],
  member: MemberTier | MemberContext,
  promos: Promo[],
  couponCode: string | null,
  couponStacksOrder = true,
): OrderTotals {
  const lines: CartLine[] = items.map((i) => ({
    id: i.productId,
    price: i.unitPrice,
    qty: i.qty,
  }));
  // 傳字串時等同只給 tier，生日／首購／回購類活動會因資訊不足而不成立。
  const m = normalizeMember(member);
  const ctx: PromoContext = {
    lines,
    member: m.tier,
    birthdayMonth: m.birthdayMonth,
    completedOrderCount: m.completedOrderCount,
    referrerId: m.referrerId,
  };

  const autos = promos.filter((p) => p.auto);
  const coupon = couponCode
    ? promos.find((p) => p.code === couponCode && p.when(ctx))
    : undefined;
  const candidates = coupon ? [coupon, ...autos] : autos;

  const options: PromoOptions = { shippingBase: SHIPPING_BASE, couponStacksOrder };
  const result = applyPromotions(ctx, candidates, options);

  return {
    subtotal: result.subtotal,
    discount: result.discount,
    shippingFee: result.shippingFee,
    total: result.total,
    gift: result.gift,
    appliedPromos: result.applied.map((a) => ({
      id: a.promo.id,
      name: a.promo.name,
      amount: a.amount,
      freeShip: a.freeShip,
      gift: a.gift,
    })),
  };
}

