// 驗證：購物車顯示的金額（usePromoPreview 的計算路徑）
// 與結帳寫進 DB 的金額（computeOrderTotals，placeOrder 用的）必須完全一致。
import { describe, expect, it } from "vitest";

import { applyPromotions, resolveActivePromos, demoPromos } from "@/domain/promotions";
import { computeOrderTotals, SHIPPING_BASE, type CheckoutItem } from "@/domain/orderTotals";
import type { MemberTier } from "@/domain/storeCredit";

const items: CheckoutItem[] = [
  { productId: "p1", title: "沈香", unitPrice: 1200, qty: 2 },
  { productId: "p2", title: "老山檀香 · 線香", unitPrice: 900, qty: 1 },
];

// usePromoPreview 內部的計算（抽出來比對）
function previewTotals(items: CheckoutItem[], member: MemberTier, code: string | null) {
  const ctx = {
    lines: items.map((i) => ({ id: i.productId, price: i.unitPrice, qty: i.qty })),
    member,
  };
  const { candidates } = resolveActivePromos(ctx, code, demoPromos);
  return applyPromotions(ctx, candidates, {
    shippingBase: SHIPPING_BASE,
    couponStacksOrder: true,
  });
}

describe("購物車試算 vs 結帳金額 一致性", () => {
  const cases: Array<[string, MemberTier, string | null]> = [
    ["無優惠碼 · 一般會員", "normal", null],
    ["固定金額券", "normal", "WELCOME100"],
    ["指定商品券", "normal", "INCENSE15"],
    ["指定會員券 · 金卡", "gold", "GOLD20"],
    ["指定會員券 · 一般會員（應不成立）", "normal", "GOLD20"],
    ["查無此碼", "normal", "NOPE"],
  ];

  it.each(cases)("%s", (_name, member, code) => {
    const preview = previewTotals(items, member, code);
    const stored = computeOrderTotals(items, member, demoPromos, code, true);

    expect(preview.subtotal).toBe(stored.subtotal);
    expect(preview.discount).toBe(stored.discount);
    expect(preview.shippingFee).toBe(stored.shippingFee);
    expect(preview.total).toBe(stored.total);
    expect(preview.gift).toBe(stored.gift);
  });

  it("互斥規則會擋掉較低優先序的活動並附上原因", () => {
    // 小計 3300 → 觸發滿額折(order, prio 45) + 免運(shipping) + 滿額贈(gift)
    // 再帶入 WELCOME100(coupon, prio 30)，coupon 與 order 互斥
    const ctx = {
      lines: items.map((i) => ({ id: i.productId, price: i.unitPrice, qty: i.qty })),
      member: "normal" as MemberTier,
    };
    const { candidates } = resolveActivePromos(ctx, "WELCOME100", demoPromos);
    const r = applyPromotions(ctx, candidates, {
      shippingBase: SHIPPING_BASE,
      couponStacksOrder: false,
    });
    expect(r.skipped.length).toBeGreaterThan(0);
    expect(r.skipped[0].reason).toContain("互斥");
  });
});
