// 後台活動設定（promotions 列）→ 引擎 Promo 的轉換測試。
// 重點在兩件事：有效期間真的會擋，組合優惠真的會算。
import { describe, expect, it } from "vitest";

import { applyPromotions, type PromoContext } from "@/domain/promotions";
import { SHIPPING_BASE } from "@/domain/orderTotals";
import { dbPromoToDomain } from "@/services/db/promotions";
import type { PromotionRow } from "@/services/db/types";

const NOW = new Date("2026-06-15T00:00:00Z").getTime();

const row = (over: Partial<PromotionRow>): PromotionRow => ({
  id: "x",
  code: null,
  name: "測試活動",
  kind: "",
  promo_group: "order",
  priority: 10,
  is_auto: true,
  is_active: true,
  conditions: {},
  effect: {},
  starts_at: null,
  ends_at: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const ctx = (lines: Array<[string, number, number]>): PromoContext => ({
  lines: lines.map(([id, price, qty]) => ({ id, price, qty })),
  member: "normal",
});

describe("活動期間（starts_at / ends_at）", () => {
  const base = { conditions: { min_subtotal: 0 }, effect: { type: "fixed", amount: 100 } };

  it("期間內 → 成立", () => {
    const p = dbPromoToDomain(
      row({ ...base, starts_at: "2026-06-01T00:00:00Z", ends_at: "2026-06-30T00:00:00Z" }),
      NOW,
    );
    expect(p.when(ctx([["p1", 500, 1]]))).toBe(true);
  });

  it("還沒開始 → 不成立", () => {
    const p = dbPromoToDomain(row({ ...base, starts_at: "2026-07-01T00:00:00Z" }), NOW);
    expect(p.when(ctx([["p1", 500, 1]]))).toBe(false);
    expect(p.unmet).toBe("不在活動期間內");
  });

  it("已經結束 → 不成立", () => {
    const p = dbPromoToDomain(row({ ...base, ends_at: "2026-06-01T00:00:00Z" }), NOW);
    expect(p.when(ctx([["p1", 500, 1]]))).toBe(false);
  });

  it("沒設日期 → 不限期", () => {
    const p = dbPromoToDomain(row(base), NOW);
    expect(p.when(ctx([["p1", 500, 1]]))).toBe(true);
  });

  it("過期的活動不會被 applyPromotions 套用", () => {
    const expired = dbPromoToDomain(row({ ...base, ends_at: "2026-06-01T00:00:00Z" }), NOW);
    const r = applyPromotions(ctx([["p1", 500, 1]]), [expired], {
      shippingBase: SHIPPING_BASE,
      couponStacksOrder: true,
    });
    expect(r.discount).toBe(0);
    expect(r.applied).toHaveLength(0);
  });
});

describe("組合優惠", () => {
  it("任選 3 件 85 折：滿 3 件才成立", () => {
    const p = dbPromoToDomain(
      row({
        promo_group: "bundle",
        kind: "組合優惠",
        conditions: { min_qty: 3 },
        effect: { type: "bundle_qty_pct", rate: 0.15 },
      }),
      NOW,
    );

    const twoItems = ctx([["p1", 1000, 2]]);
    expect(p.when(twoItems)).toBe(false);
    expect(p.unmet).toBe("需購買滿 3 件");

    const threeItems = ctx([["p1", 1000, 3]]);
    expect(p.when(threeItems)).toBe(true);
    expect(p.effect(threeItems).amount).toBe(450); // 3000 × 15%
  });

  it("系列組合價：買齊才成立，折到指定價", () => {
    const p = dbPromoToDomain(
      row({
        promo_group: "bundle",
        kind: "組合優惠",
        conditions: { product_ids: ["p1", "p2"] },
        effect: { type: "bundle_set_price", amount: 1500 },
      }),
      NOW,
    );

    const onlyOne = ctx([["p1", 1000, 1]]);
    expect(p.when(onlyOne)).toBe(false);
    expect(p.unmet).toBe("需買齊指定系列商品");

    const both = ctx([["p1", 1000, 1], ["p2", 900, 1]]);
    expect(p.when(both)).toBe(true);
    // 原價 1900 → 組合價 1500，折抵 400
    expect(p.effect(both).amount).toBe(400);
  });

  it("組合優惠與滿額折互斥（不可併用時只留優先序高的）", () => {
    const bundle = dbPromoToDomain(
      row({
        id: "bundle",
        name: "任選 3 件 85 折",
        promo_group: "bundle",
        priority: 50,
        conditions: { min_qty: 3 },
        effect: { type: "bundle_qty_pct", rate: 0.15 },
      }),
      NOW,
    );
    const orderPromo = dbPromoToDomain(
      row({
        id: "order",
        name: "滿 2000 折 200",
        promo_group: "order",
        priority: 10,
        conditions: { min_subtotal: 2000 },
        effect: { type: "fixed", amount: 200 },
      }),
      NOW,
    );

    const cart = ctx([["p1", 1000, 3]]);
    const r = applyPromotions(cart, [bundle, orderPromo], {
      shippingBase: SHIPPING_BASE,
      couponStacksOrder: false,
    });

    expect(r.applied).toHaveLength(1);
    expect(r.applied[0].promo.id).toBe("bundle");
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toContain("互斥");
  });
});
