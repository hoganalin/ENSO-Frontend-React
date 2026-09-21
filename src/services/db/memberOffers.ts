import { supabase } from "@/lib/supabase";
import type { PromotionRow } from "./types";

export function isCurrentOffer(row: PromotionRow, now = Date.now()): boolean {
  const start = row.vip_starts_at ? Date.parse(row.vip_starts_at) : row.starts_at ? Date.parse(row.starts_at) : -Infinity;
  const end = row.ends_at ? Date.parse(row.ends_at) : Infinity;
  return row.is_active && start <= now && now <= end;
}

export async function listMemberOffers(): Promise<PromotionRow[]> {
  const { data, error } = await supabase.from("promotions").select("*").eq("is_active", true)
    .order("priority", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as PromotionRow[]).filter(row => isCurrentOffer(row));
}

/** Describes configured restrictions, without promising eligibility or issuing a coupon. */
export function offerConditions(row: PromotionRow): string[] {
  const c = row.conditions || {};
  const conditions: string[] = [];
  if (row.vip_starts_at) conditions.push(`VIP 金卡會員 ${new Date(row.vip_starts_at).toLocaleString("zh-TW")} 起搶先使用；全體 ${row.starts_at ? new Date(row.starts_at).toLocaleString("zh-TW") : "依活動設定"} 開放`);
  if (typeof c.min_subtotal === "number") conditions.push(`商品金額滿 NT$${c.min_subtotal.toLocaleString()}`);
  if (typeof c.min_qty === "number") conditions.push(`購買至少 ${c.min_qty} 件`);
  if (typeof c.member_tier === "string") conditions.push(`限 ${({ normal: "一般", silver: "銀卡", gold: "金卡" } as Record<string, string>)[c.member_tier] || c.member_tier}會員`);
  if (c.birthday_month) conditions.push("限生日當月");
  if (c.first_purchase) conditions.push("限首次購買");
  if (c.repeat_purchase) conditions.push(`限已購買至少 ${typeof c.min_orders === "number" ? c.min_orders : 1} 次的會員`);
  if (c.referrer_ids) conditions.push("限指定推薦人名下會員");
  if (c.product_id || c.product_ids) conditions.push("限指定商品或商品組合");
  if (c.member_ids) conditions.push("限指定會員");
  if (c.subscription_active) conditions.push("限有效訂閱會員");
  return conditions;
}

export function offerBenefit(row: PromotionRow): string {
  const e = row.effect || {};
  if (e.free_ship === true) return "符合條件享免運";
  if (typeof e.gift === "string") return `贈品：${e.gift}`;
  if (e.type === "fixed" && typeof e.amount === "number") return `折抵 NT$${e.amount.toLocaleString()}`;
  if (e.type === "bundle_set_price" && typeof e.amount === "number") return `指定商品組合價 NT$${e.amount.toLocaleString()}`;
  if (["percent", "percent_on_product", "bundle_qty_pct"].includes(String(e.type)) && typeof e.rate === "number") return `符合條件的商品金額折抵 ${Math.round(e.rate * 100)}%`;
  return "優惠內容依活動設定於結帳計算";
}
