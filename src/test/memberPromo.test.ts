// 會員活動三型（生日禮／首購／回購）的判定測試。
//
// 這三型的共同風險是「資訊不足時誤判成立」——例如取不到訂單數就當成 0，
// 導致每個人都拿到首購優惠。這裡把那些情況都釘住。
import { describe, expect, it } from "vitest";

import type { PromoContext } from "@/domain/promotions";
import { birthdayMonthOf } from "@/services/db/memberContext";
import { dbPromoToDomain } from "@/services/db/promotions";
import type { PromotionRow } from "@/services/db/types";

// 2026-06-15 → 當下月份 = 6
const NOW = new Date("2026-06-15T00:00:00Z").getTime();

const row = (over: Partial<PromotionRow>): PromotionRow => ({
  id: "x",
  code: null,
  name: "測試活動",
  kind: "會員活動",
  promo_group: "coupon",
  priority: 50,
  is_auto: true,
  is_active: true,
  conditions: {},
  effect: { type: "fixed", amount: 100 },
  starts_at: null,
  ends_at: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const ctx = (over: Partial<PromoContext> = {}): PromoContext => ({
  lines: [{ id: "p1", price: 1000, qty: 1 }],
  member: "normal",
  ...over,
});

describe("生日禮", () => {
  const promo = () => dbPromoToDomain(row({ conditions: { birthday_month: true } }), NOW);

  it("生日在當月 → 成立", () => {
    expect(promo().when(ctx({ birthdayMonth: 6 }))).toBe(true);
  });

  it("生日不在當月 → 不成立", () => {
    expect(promo().when(ctx({ birthdayMonth: 7 }))).toBe(false);
  });

  it("沒填生日 → 不成立（不知道生日不該送禮）", () => {
    expect(promo().when(ctx({ birthdayMonth: undefined }))).toBe(false);
    expect(promo().unmet).toBe("限生日當月使用");
  });
});

describe("首購優惠", () => {
  const promo = () => dbPromoToDomain(row({ conditions: { first_purchase: true } }), NOW);

  it("0 筆已完成訂單 → 成立", () => {
    expect(promo().when(ctx({ completedOrderCount: 0 }))).toBe(true);
  });

  it("已有訂單 → 不成立", () => {
    expect(promo().when(ctx({ completedOrderCount: 1 }))).toBe(false);
  });

  it("取不到訂單數 → 不成立（不可當成 0，否則人人首購）", () => {
    expect(promo().when(ctx({ completedOrderCount: undefined }))).toBe(false);
  });
});

describe("回購優惠", () => {
  it("至少 1 筆 → 成立", () => {
    const p = dbPromoToDomain(row({ conditions: { repeat_purchase: true } }), NOW);
    expect(p.when(ctx({ completedOrderCount: 1 }))).toBe(true);
    expect(p.when(ctx({ completedOrderCount: 0 }))).toBe(false);
  });

  it("可設更高門檻（min_orders）", () => {
    const p = dbPromoToDomain(
      row({ conditions: { repeat_purchase: true, min_orders: 3 } }),
      NOW,
    );
    expect(p.when(ctx({ completedOrderCount: 2 }))).toBe(false);
    expect(p.when(ctx({ completedOrderCount: 3 }))).toBe(true);
  });

  it("取不到訂單數 → 不成立", () => {
    const p = dbPromoToDomain(row({ conditions: { repeat_purchase: true } }), NOW);
    expect(p.when(ctx({ completedOrderCount: undefined }))).toBe(false);
  });
});

describe("會員活動與期間可疊加判定", () => {
  it("生日當月但活動已過期 → 不成立", () => {
    const p = dbPromoToDomain(
      row({
        conditions: { birthday_month: true },
        ends_at: "2026-06-01T00:00:00Z",
      }),
      NOW,
    );
    expect(p.when(ctx({ birthdayMonth: 6 }))).toBe(false);
    expect(p.unmet).toBe("不在活動期間內");
  });
});

describe("birthdayMonthOf", () => {
  it("解析 YYYY-MM-DD", () => {
    expect(birthdayMonthOf("1990-03-15")).toBe(3);
    expect(birthdayMonthOf("1990-12-01")).toBe(12);
  });

  it("月初不會被時區推到前一個月", () => {
    // 用字串直接取月份段，不經過 Date 的時區轉換
    expect(birthdayMonthOf("1990-01-01")).toBe(1);
  });

  it("空值與格式錯誤回 undefined", () => {
    expect(birthdayMonthOf(null)).toBeUndefined();
    expect(birthdayMonthOf("")).toBeUndefined();
    expect(birthdayMonthOf("not-a-date")).toBeUndefined();
    expect(birthdayMonthOf("1990-13-01")).toBeUndefined();
  });
});
