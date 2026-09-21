// 指定推薦人（conditions.referrer_ids）白名單活動的判定測試。
//
// 這型活動的風險與首購優惠同型：資訊不足時不可誤判成立。
// 買家沒有推薦人、或推薦人根本沒抓到，referrerId 都是 undefined，
// 這時「指定推薦人」活動必須不成立 —— 否則散客也吃得到白名單折扣。
//
// 空名單的語意在這裡一併釘住：
//   conditions 沒有 referrer_ids  → 沒有這個條件（既有活動不受影響）
//   referrer_ids: []              → 有條件但名單空的 → 沒有人符合
import { describe, expect, it } from "vitest";

import { applyPromotions, type PromoContext } from "@/domain/promotions";
import { SHIPPING_BASE } from "@/domain/orderTotals";
import { dbPromoToDomain } from "@/services/db/promotions";
import type { PromotionRow } from "@/services/db/types";

const NOW = new Date("2026-06-15T00:00:00Z").getTime();

const REF_A = "ref-aaaa-1111";
const REF_B = "ref-bbbb-2222";
const REF_C = "ref-cccc-3333";

const row = (over: Partial<PromotionRow>): PromotionRow => ({
  id: "x",
  code: null,
  name: "指定推薦人專屬 9 折",
  kind: "會員活動·指定推薦人",
  promo_group: "coupon",
  priority: 55,
  is_auto: true,
  is_active: true,
  conditions: {},
  effect: { type: "percent", rate: 0.1 },
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

describe("指定推薦人白名單", () => {
  const promo = (ids: unknown) =>
    dbPromoToDomain(row({ conditions: { referrer_ids: ids } }), NOW);

  it("推薦人在名單內 → 成立", () => {
    const p = promo([REF_A, REF_B]);
    expect(p.when(ctx({ referrerId: REF_A }))).toBe(true);
    expect(p.when(ctx({ referrerId: REF_B }))).toBe(true);
  });

  it("推薦人不在名單內 → 不成立", () => {
    const p = promo([REF_A, REF_B]);
    expect(p.when(ctx({ referrerId: REF_C }))).toBe(false);
    expect(p.unmet).toBe("限指定推薦人名下的會員使用");
  });

  it("沒有推薦人（undefined）→ 不成立（不可當成通過，否則散客也有折）", () => {
    const p = promo([REF_A]);
    expect(p.when(ctx({ referrerId: undefined }))).toBe(false);
    expect(p.when(ctx())).toBe(false);
  });

  it("推薦人是空字串 → 不成立", () => {
    // getMemberContext 會把 null 轉 undefined，但別的呼叫端可能塞空字串進來
    const p = promo([REF_A]);
    expect(p.when(ctx({ referrerId: "" }))).toBe(false);
  });

  it("名單是空陣列 → 沒有人符合（連名單內的人都沒有）", () => {
    const p = promo([]);
    expect(p.when(ctx({ referrerId: REF_A }))).toBe(false);
    expect(p.when(ctx({ referrerId: undefined }))).toBe(false);
    expect(p.unmet).toBe("限指定推薦人名下的會員使用");
  });

  it("完全沒有 referrer_ids 這個條件 → 不受此條件限制（既有活動不受影響）", () => {
    const p = dbPromoToDomain(
      row({ conditions: { min_subtotal: 0 }, effect: { type: "fixed", amount: 100 } }),
      NOW,
    );
    expect(p.when(ctx({ referrerId: undefined }))).toBe(true);
    expect(p.when(ctx({ referrerId: REF_A }))).toBe(true);
  });

  it("referrer_ids 型別壞掉（不是陣列）→ 當成空名單，不成立", () => {
    // 資料不可信時選擇「不給折」，比誤放行安全
    expect(promo("ref-aaaa-1111").when(ctx({ referrerId: REF_A }))).toBe(false);
    expect(promo(123).when(ctx({ referrerId: REF_A }))).toBe(false);
  });

  it("名單內混入非字串 → 只採信字串項", () => {
    const p = promo([REF_A, null, 42, ""]);
    expect(p.when(ctx({ referrerId: REF_A }))).toBe(true);
    expect(p.when(ctx({ referrerId: REF_B }))).toBe(false);
  });
});

describe("指定推薦人與其他條件疊加", () => {
  it("推薦人在名單內但活動已過期 → 不成立", () => {
    const p = dbPromoToDomain(
      row({
        conditions: { referrer_ids: [REF_A] },
        ends_at: "2026-06-01T00:00:00Z",
      }),
      NOW,
    );
    expect(p.when(ctx({ referrerId: REF_A }))).toBe(false);
    expect(p.unmet).toBe("不在活動期間內");
  });

  it("推薦人在名單內但活動還沒開始 → 不成立", () => {
    const p = dbPromoToDomain(
      row({
        conditions: { referrer_ids: [REF_A] },
        starts_at: "2026-07-01T00:00:00Z",
      }),
      NOW,
    );
    expect(p.when(ctx({ referrerId: REF_A }))).toBe(false);
  });

  it("可與門檻金額併用：推薦人對但沒到門檻 → 不成立", () => {
    const p = dbPromoToDomain(
      row({ conditions: { referrer_ids: [REF_A], min_subtotal: 2000 } }),
      NOW,
    );
    expect(p.when(ctx({ referrerId: REF_A }))).toBe(false);
    const bigCart = ctx({
      referrerId: REF_A,
      lines: [{ id: "p1", price: 1000, qty: 3 }],
    });
    expect(p.when(bigCart)).toBe(true);
  });
});

describe("指定推薦人活動經過 applyPromotions", () => {
  const options = { shippingBase: SHIPPING_BASE, couponStacksOrder: true };

  it("成立時折抵 10%", () => {
    const p = dbPromoToDomain(row({ conditions: { referrer_ids: [REF_A] } }), NOW);
    const r = applyPromotions(ctx({ referrerId: REF_A }), [p], options);
    expect(r.applied).toHaveLength(1);
    expect(r.discount).toBe(100); // 1000 × 10%
  });

  it("沒有推薦人時完全不套用，金額不受影響", () => {
    const p = dbPromoToDomain(row({ conditions: { referrer_ids: [REF_A] } }), NOW);
    const r = applyPromotions(ctx({ referrerId: undefined }), [p], options);
    expect(r.applied).toHaveLength(0);
    expect(r.discount).toBe(0);
  });
});
