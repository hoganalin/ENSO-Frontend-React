// src/services/db/settings.ts — 系統設定（購物金比例等）
import { supabase } from "@/lib/supabase";
import type { TierRates } from "@/domain/storeCredit";

const SILVER_RATE_KEY = "silver_cashback_rate";
const GOLD_RATE_KEY = "gold_cashback_rate";

/**
 * 取得各等級購物金比例（銀卡、金卡）。
 * 若 DB 找不到對應 key，回傳預設值（銀 10%、金 20%）。
 */
export async function getTierRates(): Promise<TierRates> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [SILVER_RATE_KEY, GOLD_RATE_KEY]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { key: string; value: unknown }[];
  const find = (key: string, def: number) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return def;
    const v = row.value;
    return typeof v === "number" ? v : Number(v) || def;
  };
  return {
    silverPercent: find(SILVER_RATE_KEY, 10),
    goldPercent: find(GOLD_RATE_KEY, 20),
  };
}

/**
 * 更新等級購物金比例（僅最高管理者，由 RLS 控管）。
 * 可只傳其中一個欄位。
 */
export async function setTierRates(rates: Partial<TierRates>): Promise<void> {
  const updates: { key: string; value: number }[] = [];
  if (rates.silverPercent !== undefined)
    updates.push({ key: SILVER_RATE_KEY, value: rates.silverPercent });
  if (rates.goldPercent !== undefined)
    updates.push({ key: GOLD_RATE_KEY, value: rates.goldPercent });

  for (const u of updates) {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: u.key, value: u.value, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }
}
