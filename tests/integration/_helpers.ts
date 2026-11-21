// 整合測試共用:只連「本機 Supabase」,硬擋正式專案;提供 seed / 清理工具。
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL = process.env.TEST_SUPABASE_URL || "http://127.0.0.1:54321";
// 本機 Supabase 的固定 demo 金鑰(非機密,CLI 預設值);可用環境變數覆蓋。
const ANON = process.env.TEST_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q";

// ── 安全紅線:絕不連正式 Supabase ──
const PROD_REF = "dznzipfuqtpkvklmlywt";
if (URL.includes(PROD_REF) || !/(127\.0\.0\.1|localhost|\[::1\])/.test(URL)) {
  throw new Error(`[integration] 拒絕連線非本機 Supabase:${URL}。整合測試只能打本機(supabase start),以免動到正式資料。`);
}

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
