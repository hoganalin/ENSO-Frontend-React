// src/services/db/promotions.ts — 讀取後台活動並轉成引擎可用的 Promo
import {
  hasAllProducts,
  lineTotalOf,
  qtyOf,
  setPriceBaseOf,
  subtotalOf,
  type Promo,
  type PromoContext,
  type PromoGroup,
} from "@/domain/promotions";
import { supabase } from "@/lib/supabase";

import type { PromotionRow } from "./types";

const toGroup = (g: PromotionRow["promo_group"]): PromoGroup => g;

/** 活動是否在有效期間內。沒設日期 = 不限期。 */
function withinWindow(row: PromotionRow, now: number): boolean {
  if (row.starts_at && now < new Date(row.starts_at).getTime()) return false;
  if (row.ends_at && now > new Date(row.ends_at).getTime()) return false;
  return true;
}

const asNumber = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const asString = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const asStringArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every((x) => typeof x === "string") && v.length > 0
    ? (v as string[])
    : undefined;

/**
 * 讀「指定推薦人」白名單（conditions.referrer_ids）。
 *
 * 這裡刻意不共用 asStringArray：它把「空陣列」也收斂成 undefined，
 * 而這兩件事在本條件上的意思剛好相反，混在一起就是漏洞：
 *   - undefined（沒有這個 key）＝ 這個活動沒有推薦人條件。
 *     既有的所有活動都是這種，必須維持不受影響。
 *   - []（key 有但名單是空的）＝ 行銷設了白名單卻沒挑人 → 沒有任何人符合。
 * 若把空名單也當成「沒有條件」，一個存錯成空白名單的白名單活動
 * 會瞬間變成全站人人有獎 —— 所以空名單一律不成立。
 *
 * key 存在但型別壞掉（不是陣列）同樣回 []：資料不可信時選擇「不給折」。
 */
const asReferrerWhitelist = (v: unknown): string[] | undefined => {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
};

/**
 * 把後台的活動設定（conditions/effect jsonb）轉成引擎用的 Promo。
 * 活動是資料 → 新增活動只在後台加一筆，引擎與此轉換皆不動。
 *
 * @param now 判定有效期間用的時間戳，預設為呼叫當下（測試可注入）
 */
export function dbPromoToDomain(row: PromotionRow, now: number = Date.now()): Promo {
  const c = row.conditions ?? {};
  const e = row.effect ?? {};

  const minSubtotal = asNumber(c.min_subtotal);
  const minQty = asNumber(c.min_qty);
  const memberTier = asString(c.member_tier);
  const productId = asString(c.product_id);
  const productIds = asStringArray(c.product_ids);

  // 會員活動三型
  const birthdayOnly = c.birthday_month === true;
  const firstPurchaseOnly = c.first_purchase === true;
  const repeatPurchaseOnly = c.repeat_purchase === true;
  const minOrders = asNumber(c.min_orders) ?? 1;

  // 指定推薦人白名單：只有「直接推薦人」在名單內的買家才吃得到
  const referrerIds = asReferrerWhitelist(c.referrer_ids);

  // 期間與「當下月份」都是活動本身的屬性，與購物車無關：
  // 一次算好，when() 直接用（也讓測試可以注入 now）。
  const inWindow = withinWindow(row, now);
  const currentMonth = new Date(now).getMonth() + 1;

  const unmetReason = !inWindow
    ? "不在活動期間內"
    : birthdayOnly
      ? "限生日當月使用"
      : firstPurchaseOnly
        ? "限首次購買使用"
        : repeatPurchaseOnly
          ? "限回購會員使用"
          : referrerIds
            ? "限指定推薦人名下的會員使用"
            : memberTier
              ? "此優惠券限指定會員"
              : productIds
                ? "需買齊指定系列商品"
                : productId
                  ? "需購買指定商品"
                  : minQty !== undefined
                    ? `需購買滿 ${minQty} 件`
                    : undefined;

  return {
    id: row.id,
    name: row.name,
    kind: row.kind ?? "",
    code: row.code ?? undefined,
    auto: row.is_auto,
    group: toGroup(row.promo_group),
    priority: row.priority,
    unmet: unmetReason,
    when: (ctx) => {
      if (!inWindow) return false;
      if (minSubtotal !== undefined && subtotalOf(ctx) < minSubtotal) return false;
      if (minQty !== undefined && qtyOf(ctx) < minQty) return false;
      if (memberTier !== undefined && ctx.member !== memberTier) return false;
      if (productId !== undefined && lineTotalOf(ctx, productId) <= 0) return false;
      if (productIds !== undefined && !hasAllProducts(ctx, productIds)) return false;

      // 生日禮：取不到生日就不成立（不知道生日不該送禮）
      if (birthdayOnly && ctx.birthdayMonth !== currentMonth) return false;

      // 首購／回購：completedOrderCount 為 undefined 代表取不到，一律不成立
      if (firstPurchaseOnly && ctx.completedOrderCount !== 0) return false;
      if (
        repeatPurchaseOnly &&
        (typeof ctx.completedOrderCount !== "number" ||
          ctx.completedOrderCount < minOrders)
      ) {
        return false;
      }

      // 指定推薦人：referrerId 為 undefined 代表沒有推薦人或沒抓到，一律不成立。
      // 空名單（referrerIds 長度 0）也走同一條路 —— includes() 必然為 false。
      if (referrerIds !== undefined) {
        if (!ctx.referrerId) return false;
        if (!referrerIds.includes(ctx.referrerId)) return false;
      }

      return true;
    },
    effect: (ctx: PromoContext) => {
      const type = asString(e.type);
      const rate = asNumber(e.rate) ?? 0;
      const amount = asNumber(e.amount) ?? 0;

      if (e.free_ship === true) return { freeShip: true, label: row.name };
      if (typeof e.gift === "string") return { gift: e.gift, label: row.name };

      if (type === "fixed") {
        return { amount: Math.min(amount, subtotalOf(ctx)), label: row.name };
      }
      if (type === "percent") {
        return { amount: Math.round(subtotalOf(ctx) * rate), label: row.name };
      }
      if (type === "percent_on_product" && productId) {
        return { amount: Math.round(lineTotalOf(ctx, productId) * rate), label: row.name };
      }

      // 組合優惠一：任選 N 件 X 折（門檻由 conditions.min_qty 把關）
      if (type === "bundle_qty_pct") {
        return { amount: Math.round(subtotalOf(ctx) * rate), label: row.name };
      }

      // 組合優惠二：系列組合價 —— 指定商品各一件的原價合計折到 effect.amount
      if (type === "bundle_set_price" && productIds) {
        const base = setPriceBaseOf(ctx, productIds);
        return { amount: Math.max(0, base - amount), label: row.name };
      }

      return { amount: 0, label: row.name };
    },
  };
}

/** 取回所有進行中的活動（自動活動 + 優惠券），已轉成引擎可用的 Promo。 */
export async function listActivePromotions(): Promise<Promo[]> {
  const { data, error } = await supabase
    .from("promotions")
    .select("*")
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const now = Date.now();
  return ((data ?? []) as PromotionRow[]).map((row) => dbPromoToDomain(row, now));
}
