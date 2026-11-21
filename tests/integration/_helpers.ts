// 整合測試共用:只連「本機 Supabase」,硬擋正式專案;提供 seed / 清理工具。
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { getLocalConfig } from "../../scripts/_local-supabase.mjs";

// 金鑰自動取自 `supabase status`(新版 sb_secret_/sb_publishable_),含正式 ref 防呆。
const { url: URL, anon: ANON, service: SERVICE } = getLocalConfig();

export const admin: SupabaseClient = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
export function freshAnon(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface TestUser { id: string; email: string; password: string; client: SupabaseClient; }

const createdUserIds: string[] = [];
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];

export async function createTestUser(opts: { role?: "customer" | "admin" | "warehouse" } = {}): Promise<TestUser> {
  const email = `it-${randomUUID()}@test.local`;
  const password = "Test-" + randomUUID().slice(0, 12);
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name: "IT Tester" },
  });
  if (error || !data.user) throw new Error("建立測試用戶失敗:" + error?.message);
  const id = data.user.id;
  createdUserIds.push(id);
  if (opts.role && opts.role !== "customer") {
    const { error: upErr } = await admin.from("profiles").update({ role: opts.role }).eq("id", id);
    if (upErr) throw new Error("設定角色失敗:" + upErr.message);
  }
  const client = freshAnon();
  const { error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (signErr) throw new Error("測試用戶登入失敗:" + signErr.message);
  return { id, email, password, client };
}

export async function createTestProduct(inventory: number, price = 100): Promise<{ id: string; price: number }> {
  const { data, error } = await admin.from("products")
    .insert({ title: `IT 測試商品 ${randomUUID().slice(0, 6)}`, price, inventory, is_enabled: true })
    .select("id,price").single();
  if (error || !data) throw new Error("建立測試商品失敗:" + error?.message);
  createdProductIds.push((data as { id: string }).id);
  return { id: (data as { id: string }).id, price: (data as { price: number }).price };
}

export function trackOrder(id: string): void { createdOrderIds.push(id); }

export async function availability(productId: string): Promise<number> {
  const { data, error } = await admin.rpc("product_availability", { p_ids: [productId] });
  if (error) throw new Error("查可售量失敗:" + error.message);
  const row = (data as { product_id: string; available: number }[]).find(r => r.product_id === productId);
  return row ? Number(row.available) : NaN;
}

export async function onHand(productId: string): Promise<number> {
  const { data, error } = await admin.from("products").select("inventory").eq("id", productId).single();
  if (error || !data) throw new Error("查在庫失敗:" + error?.message);
  return (data as { inventory: number }).inventory;
}

// best-effort 清理:本機 DB 之後還會 db reset,這裡盡量把自建資料刪乾淨。
export async function cleanup(): Promise<void> {
  for (const oid of createdOrderIds) {
    await admin.from("order_items").delete().eq("order_id", oid).then(() => {}, () => {});
    await admin.from("store_credit_ledger").delete().eq("order_id", oid).then(() => {}, () => {});
    await admin.from("orders").delete().eq("id", oid).then(() => {}, () => {});
  }
  for (const pid of createdProductIds) {
    await admin.from("inventory_logs").delete().eq("product_id", pid).then(() => {}, () => {});
    await admin.from("order_items").delete().eq("product_id", pid).then(() => {}, () => {});
    await admin.from("products").delete().eq("id", pid).then(() => {}, () => {});
  }
  for (const uid of createdUserIds) {
    await admin.auth.admin.deleteUser(uid).then(() => {}, () => {});
  }
  createdOrderIds.length = 0; createdProductIds.length = 0; createdUserIds.length = 0;
}
