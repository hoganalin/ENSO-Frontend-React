// src/lib/supabase.ts — Supabase client（前端唯一資料存取入口）
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("[supabase] 缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，請確認 .env.local 並重啟 dev server。");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
