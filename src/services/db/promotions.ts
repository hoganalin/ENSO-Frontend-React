import type { Promo } from "@/domain/promotions";
import { supabase } from "@/lib/supabase";
import type { PromotionRow } from "./types";
import { dbPromoToDomain } from "../../../supabase/functions/_shared/commerce/promotionRows.ts";
export { dbPromoToDomain };
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
