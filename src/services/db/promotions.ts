// src/services/db/promotions.ts — 讀取後台活動並轉成引擎可用的 Promo
import {
  lineTotalOf,
  subtotalOf,
  type Promo,
  type PromoGroup,
} from "@/domain/promotions";
import { supabase } from "@/lib/supabase";

import type { PromotionRow } from "./types";

const toGroup = (g: PromotionRow["promo_group"]): PromoGroup =>
  g === "bundle" ? "order" : g;

/**
 * 把後台的活動設定（conditions/effect jsonb）轉成引擎用的 Promo。
 * 活動是資料 → 新增活動只在後台加一筆，引擎與此轉換皆不動。
 */
export function dbPromoToDomain(row: PromotionRow): Promo {
  const c = row.conditions ?? {};
  const e = row.effect ?? {};
  const minSubtotal = typeof c.min_subtotal === "number" ? c.min_subtotal : undefined;
  const memberTier = typeof c.member_tier === "string" ? c.member_tier : undefined;
  const productId = typeof c.product_id === "string" ? c.product_id : undefined;

  return {
    id: row.id,
    name: row.name,
    kind: row.kind ?? "",
    code: row.code ?? undefined,
    auto: row.is_auto,
    group: toGroup(row.promo_group),
    priority: row.priority,
    unmet: memberTier
      ? "此優惠券限指定會員"
      : productId
        ? "需購買指定商品"
        : undefined,
    when: (ctx) => {
      if (minSubtotal !== undefined && subtotalOf(ctx) < minSubtotal) return false;
      if (memberTier !== undefined && ctx.member !== memberTier) return false;
      if (productId !== undefined && lineTotalOf(ctx, productId) <= 0) return false;
      return true;
    },
    effect: (ctx) => {
      const type = typeof e.type === "string" ? e.type : undefined;
      const rate = typeof e.rate === "number" ? e.rate : 0;
      const amount = typeof e.amount === "number" ? e.amount : 0;
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
  return ((data ?? []) as PromotionRow[]).map(dbPromoToDomain);
}
