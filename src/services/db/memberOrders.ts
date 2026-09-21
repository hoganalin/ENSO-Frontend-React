import { supabase } from "@/lib/supabase";
import type { OrderItemRow, OrderRow } from "./types";

export type MemberOrder = OrderRow & { order_items: OrderItemRow[] };
/** Buyer filter is explicit; database RLS remains authoritative. */
export async function listMemberOrders(buyerId: string): Promise<MemberOrder[]> {
  const { data, error } = await supabase.from("orders").select("*, order_items(*)")
    .eq("buyer_id", buyerId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MemberOrder[];
}
