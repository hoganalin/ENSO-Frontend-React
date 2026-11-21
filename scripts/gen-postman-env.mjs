// 依當前本機 Supabase 金鑰,重新產生 Postman 環境檔(避免金鑰格式/版本不一致)。
import { writeFileSync } from "node:fs";
import { getLocalConfig } from "./_local-supabase.mjs";

const { url, anon } = getLocalConfig();
const env = {
  id: "qm-local-env",
  name: "Queen Maeve \u2014 Local",
  values: [
    { key: "baseUrl", value: url, enabled: true },
    { key: "anonKey", value: anon, enabled: true },
    { key: "testEmail", value: process.env.E2E_EMAIL || "e2e-member@test.local", enabled: true },
    { key: "testPassword", value: process.env.E2E_PASSWORD || "E2e-Password-123", enabled: true },
    { key: "token", value: "", enabled: true },
    { key: "sessionId", value: "", enabled: true },
  ],
  _postman_variable_scope: "environment",
};
writeFileSync("postman/local.postman_environment.json", JSON.stringify(env, null, 2));
console.log("\u5df2\u66f4\u65b0 postman/local.postman_environment.json(baseUrl=" + url + ")");
