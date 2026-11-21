// 在「本機 Supabase」建立 E2E/整合用的測試帳號(會員 + admin)。冪等:存在就略過。
// 金鑰自動取自 `supabase status`(新版 sb_secret_/sb_publishable_),含正式 ref 防呆。
import { createClient } from "@supabase/supabase-js";
import { getLocalConfig } from "./_local-supabase.mjs";

const { url: URL, service: SERVICE } = getLocalConfig();
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const accounts = [
  { email: process.env.E2E_EMAIL || "e2e-member@test.local", password: process.env.E2E_PASSWORD || "E2e-Password-123", role: "customer" },
  { email: process.env.E2E_ADMIN_EMAIL || "e2e-admin@test.local", password: process.env.E2E_ADMIN_PASSWORD || "E2e-Admin-123", role: "admin" },
];

for (const a of accounts) {
  // 查是否已存在
  const { data: list } = await admin.auth.admin.listUsers();
  let user = list?.users?.find((u) => u.email === a.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email: a.email, password: a.password, email_confirm: true, user_metadata: { name: "E2E " + a.role } });
    if (error) { console.error("建立失敗", a.email, error.message); continue; }
    user = data.user;
    console.log("建立", a.email);
  } else {
    console.log("已存在", a.email);
  }
  if (a.role !== "customer" && user) {
    await admin.from("profiles").update({ role: a.role }).eq("id", user.id);
    console.log("  設定角色", a.role);
  }
}
console.log("seed 完成。E2E_EMAIL=", accounts[0].email, " E2E_ADMIN_EMAIL=", accounts[1].email);
