// src/services/db/settings.ts — 系統設定（購物金比例等）
import { supabase } from "@/lib/supabase";

const CASHBACK_KEY = "referral_cashback_rate";

/** 全站購物金比例(%)。 */
export async function getCashbackRate(): Promise<number> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", CASHBACK_KEY)
    .single();
  if (error) throw new Error(error.message);
  const value = (data as { value: unknown }).value;
  return typeof value === "number" ? value : Number(value) || 0;
}

/** 設定全站購物金比例（僅最高管理者，由 RLS 控管）。 */
export async function setCashbackRate(ratePercent: number): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .update({ value: ratePercent, updated_at: new Date().toISOString() })
    .eq("key", CASHBACK_KEY);
  if (error) throw new Error(error.message);
}
