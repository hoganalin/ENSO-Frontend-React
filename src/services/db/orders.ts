// src/services/db/orders.ts — 建立訂單 / 查詢 / 狀態變更
import { supabase } from "@/lib/supabase";

import type { OrderItemRow, OrderRow } from "./types";

export interface NewOrderItem {
  productId: string;
  title: string;
  unitPrice: number;
  qty: number;
}

export interface NewOrderInput {
  buyerId: string;
  /** 下單當下買家的推薦人（推薦歸戶快照） */
  referrerId: string | null;
  items: NewOrderItem[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  /** 引擎套用的活動快照 */
  appliedPromos: unknown[];
  recipient: unknown;
  /** 🔧 漏洞 2 修復：記錄下單時推薦人的身分 */
  referrerTierSnapshot?: string | null;
}

/** 建立訂單 + 明細（status = pending）。 */
export async function createOrder(input: NewOrderInput): Promise<OrderRow> {
  const { data, error } = await supabase
    .from("orders")
    .insert({
      buyer_id: input.buyerId,
      referrer_id: input.referrerId,
      subtotal: input.subtotal,
      discount: input.discount,
      shipping_fee: input.shippingFee,
      total: input.total,
      status: "pending",
      applied_promos: input.appliedPromos,
      recipient: input.recipient,
      referrer_tier_snapshot: input.referrerTierSnapshot ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const order = data as OrderRow;

  const items = input.items.map((i) => ({
    order_id: order.id,
    product_id: i.productId,
    title: i.title,
    unit_price: i.unitPrice,
    qty: i.qty,
  }));
  const { error: itemsError } = await supabase.from("order_items").insert(items);
  if (itemsError) throw new Error(itemsError.message);

  return order;
}

export async function listMyOrders(buyerId: string): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderRow[];
}

export async function listOrderItems(orderId: string): Promise<OrderItemRow[]> {
  const { data, error } = await supabase
    .from("order_items")
    .select("*, products(image_url)")
    .eq("order_id", orderId)
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((item) => ({
    ...(item as OrderItemRow),
    image_url: (item as { products?: { image_url?: string | null } | null }).products?.image_url ?? null,
  })) as OrderItemRow[];
}

export async function requestFullRefund(orderId: string, amount: number, reason: string): Promise<void> {
  const { error } = await supabase.rpc("request_refund", { p_order: orderId, p_amount: amount, p_reason: reason.trim() });
  if (error) throw new Error("退款申請未成功，請確認訂單狀態後重試。");
}

/** 標記訂單完成（發放購物金的觸發點；發放邏輯見 db/storeCredit.ts）。 */
export async function markOrderCompleted(orderId: string, completedAtIso: string): Promise<OrderRow> {
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "completed", completed_at: completedAtIso })
    .eq("id", orderId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as OrderRow;
}

/** 標記訂單退款（回沖購物金的觸發點；回沖邏輯見 db/storeCredit.ts）。 */
export async function markOrderRefunded(orderId: string): Promise<OrderRow> {
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "refunded" })
    .eq("id", orderId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as OrderRow;
}
