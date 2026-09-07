// src/services/db/referral.ts — 推薦碼與「我的推薦」報表
import { supabase } from "@/lib/supabase";

import type { OrderRow, ProfileRow } from "./types";

export async function getMyReferralCode(memberId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("referral_code")
    .eq("id", memberId)
    .single();
  if (error) throw new Error(error.message);
  return (data as { referral_code: string | null }).referral_code;
}

export interface RefereeOrder {
  orderNo: string;
  subtotal: number;
  createdAt: string;
}

export interface RefereeReport {
  id: string;
  name: string;
  joinedAt: string;
  orderCount: number;
  totalSpent: number;
  orders: RefereeOrder[];
}

export interface ReferralReport {
  refereeCount: number;
  networkSpent: number;
  referees: RefereeReport[];
}

/**
 * 金／銀卡的「我的推薦」報表：名下被推薦人 + 註冊日 + 完成訂單明細 + 消費總額。
 * （RLS 已限制只有金銀卡本人／staff 讀得到這些訂單。）
 */
export async function getReferralReport(referrerId: string): Promise<ReferralReport> {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("referrer_id", referrerId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const referees = (profiles ?? []) as ProfileRow[];
  const ids = referees.map((p) => p.id);

  let orders: OrderRow[] = [];
  if (ids.length > 0) {
    const { data: ord, error: ordError } = await supabase
      .from("orders")
      .select("*")
      .in("buyer_id", ids)
      .eq("status", "completed");
    if (ordError) throw new Error(ordError.message);
    orders = (ord ?? []) as OrderRow[];
  }

  const report: RefereeReport[] = referees.map((p) => {
    const own = orders.filter((o) => o.buyer_id === p.id);
    return {
      id: p.id,
      name: p.name ?? "(未命名)",
      joinedAt: p.created_at,
      orderCount: own.length,
      totalSpent: own.reduce((sum, o) => sum + o.subtotal, 0),
      orders: own.map((o) => ({
        orderNo: o.order_no,
        subtotal: o.subtotal,
        createdAt: o.created_at,
      })),
    };
  });

  return {
    refereeCount: report.length,
    networkSpent: report.reduce((sum, r) => sum + r.totalSpent, 0),
    referees: report,
  };
}
