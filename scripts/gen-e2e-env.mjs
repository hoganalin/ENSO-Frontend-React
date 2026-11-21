// 產生 .env.e2e:E2E 專用,把 Supabase 覆蓋成「本機」(TapPay sandbox 沿用 .env.local)。
// URL 來自 getLocalConfig(),本身硬擋正式 ref → .env.e2e 不可能寫入正式位址。
import { writeFileSync } from "node:fs";
import { getLocalConfig } from "./_local-supabase.mjs";

const { url, anon } = getLocalConfig();
const body = [
  "# 自動產生(scripts/gen-e2e-env.mjs)— E2E 專用,請勿手改、勿提交。",
  "# vite --mode e2e 會用這份覆蓋 .env.local 的 Supabase 設定(TapPay sandbox 沿用 .env.local)。",
  `VITE_SUPABASE_URL=${url}`,
  `VITE_SUPABASE_ANON_KEY=${anon}`,
  "",
].join("\n");
writeFileSync(".env.e2e", body);
console.log("\u5df2\u5beb .env.e2e(VITE_SUPABASE_URL=" + url + ")");
