// src/services/db/sms.ts — 簡訊紀錄（demo 為模擬發送）
import { supabase } from "@/lib/supabase";

export interface SmsRow {
  id: string;
  to_profile_id: string | null;
  to_phone: string | null;
  message: string;
  related_order_id: string | null;
  status: string;
  created_at: string;
}

/** 最近的簡訊紀錄（staff／管理者可看）。 */
export async function listRecentSms(limit = 100): Promise<SmsRow[]> {
  const { data, error } = await supabase
    .from("sms_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SmsRow[];
}
