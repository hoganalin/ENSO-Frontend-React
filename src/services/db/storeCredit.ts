// src/services/db/storeCredit.ts — 購物金讀寫（接 domain/storeCredit 的純邏輯）
import {
  balanceOf,
  earnTxForOrder,
  type CompletedOrder,
  type CreditTx,
  type Referrer,
} from "@/domain/storeCredit";
import { supabase } from "@/lib/supabase";

import { getTierRates } from "./settings";
import type { CreditRow } from "./types";


/**
 * 🔧 中優先級問題 1 修復：UTC 時間轉換函數
 * 確保所有時間戳都使用 UTC，避免客戶端時區差異
 */
function getUTCTimestamp(date: Date = new Date()): string {
  return date.toISOString(); // Returns UTC in ISO 8601 format
}


function rowToTx(r: CreditRow): CreditTx {
  return {
    id: r.id,
    memberId: r.member_id,
    type: r.type,
    amount: r.amount,
    orderId: r.order_id ?? undefined,
    // 🔧 中優先級問題 1 修復：使用 UTC 時間，避免時區差異
    createdAt: new Date(r.created_at).getTime(),
    expiresAt: r.expires_at ? new Date(r.expires_at).getTime() : undefined,
  };
}

export async function getLedger(memberId: string): Promise<CreditTx[]> {
  const { data, error } = await supabase
    .from("store_credit_ledger")
    .select("*")
    .eq("member_id", memberId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CreditRow[]).map(rowToTx);
}

export async function getBalance(memberId: string): Promise<number> {
  return balanceOf(memberId, await getLedger(memberId));
}

export interface CompletedOrderWithReferrer extends CompletedOrder {
  referrer: Referrer | null;
}

/**
 * 訂單完成 → 依推薦人等級發放購物金（銀卡 silverPercent%、金卡 goldPercent%）；普通會員不發。
 * 回傳新增的 earn row，或 null（不符資格）。
 */
export async function issueCreditForCompletedOrder(
  order: CompletedOrderWithReferrer,
  completedAtMs: number,
): Promise<CreditRow | null> {
  const rates = await getTierRates();
  const tx = earnTxForOrder(order, order.referrer, rates, completedAtMs);
  if (!tx) return null;

  const { data, error } = await supabase
    .from("store_credit_ledger")
    .insert({
      member_id: tx.memberId,
      type: tx.type,
      amount: tx.amount,
      order_id: tx.orderId ?? null,
      created_at: getUTCTimestamp(new Date(tx.createdAt)),
      expires_at: tx.expiresAt ? new Date(tx.expiresAt).toISOString() : null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CreditRow;
}
