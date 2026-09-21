// supabase/functions/_shared/supabaseAdmin.ts
// Edge Function 用的 Supabase client。
//
// 兩種 client，用途不可混：
//   • createAdminClient() —— service_role key，**完全繞過 RLS**。
//     只能在伺服器端用，而且每次查詢都要自己檢查「這筆資料屬於這個人嗎」，
//     因為 RLS 這層保護在這裡是關掉的。
//   • createUserClient(authHeader) —— 帶呼叫者的 JWT，RLS 照常生效。
//     用來「確認呼叫者是誰」（auth.getUser()），而不是用來讀寫業務資料。
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 這三個變數
// 是 Edge Runtime 自動注入的保留名稱，**不要**也不能用
// `supabase secrets set` 設定（CLI 會拒絕 SUPABASE_ 前綴）。

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    // 這種錯誤只會發生在部署設定漏了，越早爆越好——不要 fallback 成空字串，
    // 否則會變成「連得上但每次查詢都 401」的難查問題。
    throw new Error(`[env] 缺少環境變數 ${name}`);
  }
  return v;
}

/** service_role client：繞過 RLS，只在伺服器端使用。 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/**
 * 以呼叫者身分建立 client（RLS 生效）。只用來驗證身分。
 * authHeader 直接傳原始的 `Authorization: Bearer <jwt>`。
 */
export function createUserClient(authHeader: string): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/**
 * 從 request 取出已登入使用者。
 * 回傳 null 代表未登入／JWT 無效——呼叫端一律回 401，不要「猜」使用者。
 */
export async function getCallerUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const { data, error } = await createUserClient(authHeader).auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
