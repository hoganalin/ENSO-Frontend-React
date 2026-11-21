// 自動取得「本機 Supabase」的 URL 與金鑰(優先環境變數 → supabase status → 保底值)。
// 關鍵:新版 CLI 用 sb_publishable_/sb_secret_,舊版用 eyJ… JWT;admin 操作需要 secret。
import { execSync } from "node:child_process";

const FALLBACK = {
  url: "http://127.0.0.1:54321",
  anon: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
};

export function getLocalConfig() {
  let url = process.env.TEST_SUPABASE_URL;
  let anon = process.env.TEST_SUPABASE_ANON_KEY;
  let service = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon || !service) {
    const map = {};
    try {
      const out = execSync("supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
        if (m) map[m[1]] = m[2];
      }
    } catch { /* supabase 不在 PATH 或未啟動 → 用保底值 */ }
    const vals = Object.values(map);
    const secretNew = vals.find((v) => typeof v === "string" && v.startsWith("sb_secret_"));
    const pubNew = vals.find((v) => typeof v === "string" && v.startsWith("sb_publishable_"));
    url = url || map.API_URL || map.SUPABASE_URL || FALLBACK.url;
    anon = anon || pubNew || map.ANON_KEY || map.SUPABASE_ANON_KEY || FALLBACK.anon;
    service = service || secretNew || map.SERVICE_ROLE_KEY || map.SUPABASE_SERVICE_ROLE_KEY;
  }

  // 安全紅線:絕不連正式 Supabase
  if (!url || !anon || !service) {
    throw new Error("Local Supabase credentials are unavailable. Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, and TEST_SUPABASE_SERVICE_ROLE_KEY, or start Supabase CLI.");
  }

  if (url.includes("dznzipfuqtpkvklmlywt") || !/(127\.0\.0\.1|localhost|\[::1\])/.test(url)) {
    throw new Error(`[safety] 拒絕連線非本機 Supabase:${url}(測試只能打本機,避免動到正式)`);
  }
  return { url, anon, service };
}
