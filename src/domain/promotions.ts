// src/domain/promotions.ts
// ─────────────────────────────────────────────────────────────
// 活動引擎（Promotion Engine）
// 設計原則：活動是「資料」（PROMOS），引擎是唯一一支 applyPromotions()。
// 純邏輯、無 UI／框架相依，可獨立單元測試。
// 互斥與優先順序都由引擎統一處理；新增活動＝加一筆設定，引擎不動。
// 未來接後端：把 demoPromos 換成從後台/API 讀進來的活動設定即可。
// ─────────────────────────────────────────────────────────────
import type { MemberTier } from "./storeCredit";

export type PromoGroup = "coupon" | "order" | "shipping" | "gift" | "bundle";

export interface CartLine {
  id: string;
  price: number;
  qty: number;
}

export interface PromoContext {
  lines: CartLine[];
  member: MemberTier; // 'normal' | 'silver' | 'gold'
  /**
   * 買家生日月份（1-12）。沒填生日時為 undefined，
   * 此時「生日禮」類活動一律不成立 —— 不知道生日就不該送禮。
   */
  birthdayMonth?: number;
  /**
   * 買家「本次結帳之前」已完成的訂單數。
   * undefined 代表取不到（例如未登入），首購／回購類活動一律不成立。
   */
  completedOrderCount?: number;
  /**
   * 買家的「直接推薦人」profile id（profiles.referrer_id，單層、註冊時綁定）。
   * undefined 代表「沒有推薦人」或「根本沒抓到」—— 兩種都讓
   * 「指定推薦人」類活動不成立。絕對不能把 undefined 當成通過，
   * 否則沒有推薦人的散客也會吃到白名單專屬折扣（這是首購優惠那個坑的同型）。
   */
  referrerId?: string;
}

/** 會員情境。傳字串時等同只給 tier，其餘欄位視為未知。 */
export interface MemberContext {
  tier: MemberTier;
  birthdayMonth?: number;
  completedOrderCount?: number;
  /** 直接推薦人 profile id；取不到就留 undefined（見 PromoContext.referrerId）。 */
  referrerId?: string;
}

export const normalizeMember = (
  member: MemberTier | MemberContext,
): MemberContext => (typeof member === "string" ? { tier: member } : member);

export interface PromoEffect {
  /** 折抵金額（正數，會從小計扣除） */
  amount?: number;
  /** 是否免運 */
  freeShip?: boolean;
  /** 贈品名稱 */
  gift?: string;
  /** 顯示用標籤 */
  label: string;
}

export interface Promo {
  id: string;
  name: string;
  /** 顯示用分類，例如「固定金額」「百分比·指定會員」 */
  kind: string;
  /** 有 code = 需手動輸入的優惠券；無 code = 自動活動 */
  code?: string;
  /** 是否為自動觸發活動 */
  auto?: boolean;
  /** 互斥群組：同屬互斥集合（coupon / order）者在不可併用時只留一個 */
  group: PromoGroup;
  /** 優先序，越大越先套用；互斥時勝出 */
  priority: number;
  /** 是否符合套用條件 */
  when: (ctx: PromoContext) => boolean;
  /** 條件不符時要顯示給使用者的原因（優惠券用） */
  unmet?: string;
  /** 符合時的折抵效果 */
  effect: (ctx: PromoContext) => PromoEffect;
}

export interface AppliedPromo extends PromoEffect {
  promo: Promo;
}

export interface SkippedPromo {
  promo: Promo;
  reason: string;
}

export interface PromoResult {
  subtotal: number;
  applied: AppliedPromo[];
  skipped: SkippedPromo[];
  discount: number;
  shippingFee: number;
  freeShip: boolean;
  gift: string | null;
  total: number;
}

export interface PromoOptions {
  /** 基本運費 */
  shippingBase: number;
  /** 優惠券是否可與「滿額折」(group: order) 併用 */
  couponStacksOrder: boolean;
}

/** 購物車小計 */
export const subtotalOf = (ctx: PromoContext): number =>
  ctx.lines.reduce((sum, line) => sum + line.price * line.qty, 0);

/** 指定商品的行小計（給「指定商品」優惠券判斷/計算用） */
export const lineTotalOf = (ctx: PromoContext, productId: string): number => {
  const line = ctx.lines.find((l) => l.id === productId);
  return line ? line.price * line.qty : 0;
};

/** 購物車總件數（給「任選 N 件」組合優惠判斷用） */
export const qtyOf = (ctx: PromoContext): number =>
  ctx.lines.reduce((sum, line) => sum + line.qty, 0);

/** 指定的一組商品是否都在購物車裡（給「系列組合價」判斷用） */
export const hasAllProducts = (ctx: PromoContext, productIds: string[]): boolean =>
  productIds.length > 0 &&
  productIds.every((id) => ctx.lines.some((l) => l.id === id && l.qty > 0));

/** 指定的一組商品「各取一件」的原價合計（系列組合價的折抵基準） */
export const setPriceBaseOf = (ctx: PromoContext, productIds: string[]): number =>
  productIds.reduce((sum, id) => {
    const line = ctx.lines.find((l) => l.id === id);
    return sum + (line ? line.price : 0);
  }, 0);

/** 會彼此互斥的群組（可併用開關關閉時，這些群組只會套用一個） */
const EXCLUSIVE_GROUPS: PromoGroup[] = ["coupon", "order", "bundle"];

/**
 * 套用活動：找出符合條件的活動 → 依優先序排序 → 逐一套用，同時處理互斥。
 * @param ctx     購物情境（品項、會員身分）
 * @param promos  候選活動（自動活動 + 使用者輸入的優惠券）
 * @param options 運費與互斥設定
 */
export function applyPromotions(
  ctx: PromoContext,
  promos: Promo[],
  options: PromoOptions,
): PromoResult {
  const subtotal = subtotalOf(ctx);

  const applicable = promos
    .filter((promo) => promo.when(ctx))
    .sort((a, b) => b.priority - a.priority);

  const applied: AppliedPromo[] = [];
  const skipped: SkippedPromo[] = [];
  let exclusiveTaken: Promo | null = null;

  for (const promo of applicable) {
    const isExclusive = EXCLUSIVE_GROUPS.includes(promo.group);

    if (isExclusive && exclusiveTaken && !options.couponStacksOrder) {
      skipped.push({
        promo,
        reason: `與「${exclusiveTaken.name}」互斥（優先序較低）`,
      });
      continue;
    }

    if (isExclusive && !exclusiveTaken) {
      exclusiveTaken = promo;
    }

    applied.push({ promo, ...promo.effect(ctx) });
  }

  const discount = applied.reduce((sum, a) => sum + (a.amount ?? 0), 0);
  const freeShip = applied.some((a) => a.freeShip);
  const gift = applied.find((a) => a.gift)?.gift ?? null;
  const shippingFee = subtotal > 0 ? (freeShip ? 0 : options.shippingBase) : 0;
  const total = Math.max(0, subtotal - discount) + shippingFee;

  return {
    subtotal,
    applied,
    skipped,
    discount,
    shippingFee,
    freeShip,
    gift,
    total,
  };
}

// ─────────────────────────────────────────────────────────────
// 示範用種子活動（實戰時改由後台/後端管理，型別不變）
// 涵蓋優惠券四型（固定額/百分比/指定商品/指定會員）＋ 滿額折/免運/贈
// ─────────────────────────────────────────────────────────────
export const demoPromos: Promo[] = [
  {
    id: "WELCOME100",
    code: "WELCOME100",
    name: "新客折 NT$100",
    kind: "固定金額",
    group: "coupon",
    priority: 30,
    when: (c) => subtotalOf(c) > 0,
    effect: (c) => ({ amount: Math.min(100, subtotalOf(c)), label: "新客折 NT$100" }),
  },
  {
    id: "INCENSE15",
    code: "INCENSE15",
    name: "指定商品 85 折",
    kind: "百分比·指定商品",
    group: "coupon",
    priority: 40,
    when: (c) => lineTotalOf(c, "p2") > 0,
    unmet: "需購買指定商品：老山檀香 · 線香",
    effect: (c) => ({
      amount: Math.round(lineTotalOf(c, "p2") * 0.15),
      label: "老山檀香 85 折",
    }),
  },
  {
    id: "GOLD20",
    code: "GOLD20",
    name: "金卡專屬 8 折",
    kind: "百分比·指定會員",
    group: "coupon",
    priority: 50,
    when: (c) => c.member === "gold",
    unmet: "此優惠券限金卡會員",
    effect: (c) => ({ amount: Math.round(subtotalOf(c) * 0.2), label: "金卡專屬 8 折" }),
  },
  {
    id: "ORDER200",
    name: "滿 NT$2,000 折 NT$200",
    kind: "滿額折",
    auto: true,
    group: "order",
    priority: 45,
    when: (c) => subtotalOf(c) >= 2000,
    effect: () => ({ amount: 200, label: "滿 2,000 折 200" }),
  },
  {
    id: "FREESHIP",
    name: "滿 NT$1,500 免運",
    kind: "滿額免運",
    auto: true,
    group: "shipping",
    priority: 10,
    when: (c) => subtotalOf(c) >= 1500,
    effect: () => ({ freeShip: true, label: "滿 1,500 免運" }),
  },
  {
    id: "GIFT3000",
    name: "滿 NT$3,000 送黃銅香插",
    kind: "滿額贈",
    auto: true,
    group: "gift",
    priority: 5,
    when: (c) => subtotalOf(c) >= 3000,
    effect: () => ({ gift: "黃銅香插 ×1", label: "滿 3,000 送香插" }),
  },
];

/** 依輸入的優惠碼，回傳「自動活動 + 該優惠券（若有效）」的候選清單。 */
export function resolveActivePromos(
  ctx: PromoContext,
  couponCode: string | null,
  promos: Promo[] = demoPromos,
): { candidates: Promo[]; couponStatus: { ok: boolean; message: string } | null } {
  const autos = promos.filter((p) => p.auto);
  if (!couponCode) return { candidates: autos, couponStatus: null };

  const coupon = promos.find((p) => p.code === couponCode);
  if (!coupon) {
    return { candidates: autos, couponStatus: { ok: false, message: "查無此優惠碼" } };
  }
  if (!coupon.when(ctx)) {
    return {
      candidates: autos,
      couponStatus: { ok: false, message: coupon.unmet ?? "不符使用條件" },
    };
  }
  return {
    candidates: [coupon, ...autos],
    couponStatus: { ok: true, message: `已套用：${coupon.name}` },
  };
}
