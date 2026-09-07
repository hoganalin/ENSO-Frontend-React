// 讓 import.meta.env 的 Supabase 變數有型別（與 vite/client 介面合併，不衝突）
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
