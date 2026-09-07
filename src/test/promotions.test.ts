import { describe, it, expect } from "vitest";

import {
  applyPromotions,
  demoPromos,
  resolveActivePromos,
  type PromoContext,
  type Promo,
} from "@/domain/promotions";
import type { MemberTier } from "@/domain/storeCredit";

const shipping = { shippingBase: 80, couponStacksOrder: true };
const promo = (id: string): Promo => demoPromos.find((p) => p.id === id)!;

// 購物車小工具：p1=1280、p2=880、p3=2400
const cart = (
  items: Array<[string, number]>,
  member: MemberTier = "normal",
): PromoContext => {
  const price: Record<string, number> = { p1: 1280, p2: 880, p3: 2400 };
  return { member, lines: items.map(([id, qty]) => ({ id, price: price[id], qty })) };
};

describe("applyPromotions — 基本與自動活動", () => {
  it("小計未達門檻時，沒有自動活動，需加運費", () => {
    const r = applyPromotions(cart([["p1", 1]]), [], shipping);
    expect(r.subtotal).toBe(1280);
    expect(r.applied).toHaveLength(0);
    expect(r.shippingFee).toBe(80);
    expect(r.total).toBe(1360);
  });

  it("跨過門檻時，滿額折/免運/贈自動觸發", () => {
    const autos = demoPromos.filter((p) => p.auto);
    const r = applyPromotions(cart([["p1", 1], ["p3", 1]]), autos, shipping); // 3680
    const ids = r.applied.map((a) => a.promo.id);
    expect(ids).toContain("ORDER200");
    expect(ids).toContain("FREESHIP");
    expect(ids).toContain("GIFT3000");
    expect(r.freeShip).toBe(true);
    expect(r.shippingFee).toBe(0);
    expect(r.gift).toBe("黃銅香插 ×1");
    expect(r.total).toBe(3480); // 3680 - 200
  });
});

describe("applyPromotions — 互斥與優先序", () => {
  const autos = demoPromos.filter((p) => p.auto);

  it("可併用時：金卡券與滿額折同時套用", () => {
    const promos = [promo("GOLD20"), ...autos];
    const r = applyPromotions(cart([["p1", 1], ["p3", 1]], "gold"), promos, {
      ...shipping,
      couponStacksOrder: true,
    });
    const ids = r.applied.map((a) => a.promo.id);
    expect(ids).toContain("GOLD20");
    expect(ids).toContain("ORDER200");
    expect(r.discount).toBe(936); // 3680*0.2=736 + 200
    expect(r.total).toBe(2744);
  });

  it("互斥時：優先序高的金卡券勝出，滿額折被略過", () => {
    const promos = [promo("GOLD20"), ...autos];
    const r = applyPromotions(cart([["p1", 1], ["p3", 1]], "gold"), promos, {
      ...shipping,
      couponStacksOrder: false,
    });
    const appliedIds = r.applied.map((a) => a.promo.id);
    const skippedIds = r.skipped.map((s) => s.promo.id);
    expect(appliedIds).toContain("GOLD20");
    expect(skippedIds).toContain("ORDER200");
    expect(r.discount).toBe(736);
    expect(r.total).toBe(2944);
  });

  it("互斥時：滿額折優先序高於新客券，改成新客券被略過", () => {
    const promos = [promo("WELCOME100"), ...autos];
    const r = applyPromotions(cart([["p1", 1], ["p3", 1]], "normal"), promos, {
      ...shipping,
      couponStacksOrder: false,
    });
    const appliedIds = r.applied.map((a) => a.promo.id);
    const skippedIds = r.skipped.map((s) => s.promo.id);
    expect(appliedIds).toContain("ORDER200");
    expect(skippedIds).toContain("WELCOME100");
    expect(r.discount).toBe(200);
  });
});

describe("resolveActivePromos — 優惠碼條件與回饋", () => {
  it("查無優惠碼時回報錯誤，不影響自動活動", () => {
    const { candidates, couponStatus } = resolveActivePromos(cart([["p1", 1]]), "NOPE");
    expect(couponStatus).toEqual({ ok: false, message: "查無此優惠碼" });
    expect(candidates.every((p) => p.auto)).toBe(true);
  });

  it("普通會員套金卡券時，條件不符並給出原因", () => {
    const { couponStatus } = resolveActivePromos(cart([["p1", 1]], "normal"), "GOLD20");
    expect(couponStatus).toEqual({ ok: false, message: "此優惠券限金卡會員" });
  });

  it("指定商品券需該商品在購物車", () => {
    const miss = resolveActivePromos(cart([["p1", 1]]), "INCENSE15");
    expect(miss.couponStatus?.ok).toBe(false);
    const hit = resolveActivePromos(cart([["p2", 1]]), "INCENSE15");
    expect(hit.couponStatus?.ok).toBe(true);
    expect(hit.candidates.some((p) => p.id === "INCENSE15")).toBe(true);
  });
});
