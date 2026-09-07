// src/services/db/storeCredit.ts — 購物金讀寫（接 domain/storeCredit 的純邏輯）
import {
  balanceOf,
  earnTxForOrder,
  reverseTxForOrder,
  spendTx,
  type CompletedOrder,
  type CreditTx,
  type Referrer,
} from "@/domain/storeCredit";
import { supabase } from "@/lib/supabase";

import { getCashbackRate } from "./settings";
import type { CreditRow } from "./types";


/**
 * 🔧 中優先級問題 1 修復：UTC 時間轉換函數
 * 確保所有時間戳都使用 UTC，避免客戶端時區差異
 */
function getUTCTimestamp(date: Date = new Date()): string {
  return date.toISOString(); // Returns UTC in ISO 8601 format
}

function getUTCDateString(date: Date = new Date()): string {
  // 返回 YYYY-MM-DD 格式，基於 UTC 時間
  return date.toISOString().split('T')[0];
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
 * 訂單完成 → 若推薦人「當下身分」為普通會員，發放購物金；否則不發（金銀卡只有可見度）。
 * 回傳新增的 earn row，或 null（不符資格）。
 */
export async function issueCreditForCompletedOrder(
  order: CompletedOrderWithReferrer,
  completedAtMs: number,
): Promise<CreditRow | null> {
  const rate = await getCashbackRate();
  const tx = earnTxForOrder(order, order.referrer, rate, completedAtMs);
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

/** 退款 → 回沖該訂單發出的購物金（可造成負餘額）。 */
export async function reverseCreditForOrder(
  orderId: string,
  reversedAtMs: number,
): Promise<CreditRow | null> {
  const { data, error } = await supabase
    .from("store_credit_ledger")
    .select("*")
    .eq("order_id", orderId);
  if (error) throw new Error(error.message);

  const ledger = ((data ?? []) as CreditRow[]).map(rowToTx);
  const tx = reverseTxForOrder(orderId, ledger, reversedAtMs);
  if (!tx) return null;

  const { data: inserted, error: insertError } = await supabase
    .from("store_credit_ledger")
    .insert({
      member_id: tx.memberId,
      type: tx.type,
      amount: tx.amount,
      order_id: tx.orderId ?? null,
      created_at: getUTCTimestamp(new Date(tx.createdAt)),
    })
    .select()
    .single();
  if (insertError) throw new Error(insertError.message);
  return inserted as CreditRow;
}

/** 結帳折抵購物金。 */
export async function spendCredit(
  memberId: string,
  amount: number,
  spentAtMs: number,
): Promise<CreditRow> {
  const tx = spendTx(memberId, amount, spentAtMs);
  const { data, error } = await supabase
    .from("store_credit_ledger")
    .insert({
      member_id: tx.memberId,
      type: tx.type,
      amount: tx.amount,
      created_at: getUTCTimestamp(new Date(tx.createdAt)),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CreditRow;
}
