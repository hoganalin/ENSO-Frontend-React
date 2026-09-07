import { describe, it, expect } from "vitest";

import { demoPromos } from "@/domain/promotions";
import { computeOrderTotals, type CheckoutItem } from "@/domain/orderTotals";

// p1=1280、p3=2400
const items: CheckoutItem[] = [
  { productId: "p1", title: "芽莊沈香", unitPrice: 1280, qty: 1 },
  { productId: "p3", title: "和敬禮盒", unitPrice: 2400, qty: 1 },
];

describe("computeOrderTotals — 訂單金額（活動引擎）", () => {
  it("普通會員、無優惠碼：自動觸發滿額折/免運/贈", () => {
    const t = computeOrderTotals(items, "normal", demoPromos, null);
    expect(t.subtotal).toBe(3680);
    expect(t.discount).toBe(200); // 滿額折
    expect(t.shippingFee).toBe(0); // 免運
    expect(t.gift).toBe("黃銅香插 ×1");
    expect(t.total).toBe(3480);
    expect(t.appliedPromos.map((p) => p.id)).toContain("ORDER200");
  });

  it("金卡會員 + GOLD20 併用：金卡券與滿額折同時套用", () => {
    const t = computeOrderTotals(items, "gold", demoPromos, "GOLD20", true);
    expect(t.discount).toBe(936); // 3680*0.2 + 200
    expect(t.total).toBe(2744);
    expect(t.appliedPromos.map((p) => p.id)).toContain("GOLD20");
  });

  it("小額訂單（未達門檻）：無折扣、需運費", () => {
    const t = computeOrderTotals(
      [{ productId: "p1", title: "芽莊沈香", unitPrice: 1280, qty: 1 }],
      "normal",
      demoPromos,
      null,
    );
    expect(t.subtotal).toBe(1280);
    expect(t.discount).toBe(0);
    expect(t.shippingFee).toBe(80);
    expect(t.total).toBe(1360);
  });
});
