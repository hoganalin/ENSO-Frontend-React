// 上線安全守門:檢查 vite build 產物(dist/)有沒有把「前端不該帶的機密」烤進 bundle。
// 用法:npm run build 之後 → node scripts/check-bundle-secrets.mjs(或接進 CI)。
// 原理:任何被程式引用到的 VITE_ 變數,其「值」會在 build 時被 Vite 內聯進 bundle。
//       Anthropic 金鑰、三竹簡訊帳密絕不該出現在前端。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const FORBIDDEN_ENV = ["VITE_ANTHROPIC_API_KEY", "VITE_MITAKE_USERNAME", "VITE_MITAKE_PASSWORD"];
const SECRET_PATTERNS = [/sk-ant-[A-Za-z0-9_\-]{10,}/]; // Anthropic 金鑰樣式(即使變數名被改也抓得到)

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(js|mjs|cjs|css|html|map)$/.test(e)) out.push(p);
  }
  return out;
}

let files;
try { files = walk(DIST); }
catch { console.error(`找不到 ${DIST}/,請先 npm run build`); process.exit(2); }

const hits = [];
for (const f of files) {
  const t = readFileSync(f, "utf8");
  for (const re of SECRET_PATTERNS) {
    const m = t.match(re);
    if (m) hits.push(`${f}: 疑似機密值 ${m[0].slice(0, 14)}…`);
  }
  for (const k of FORBIDDEN_ENV) {
    const v = process.env[k];
    if (v && v.length >= 8 && t.includes(v)) hits.push(`${f}: 含 ${k} 的值`);
  }
}

if (hits.length) {
  console.error("❌ 偵測到前端 bundle 可能外洩機密:\n" + hits.join("\n"));
  process.exit(1);
}
console.log("✅ dist/ 未發現 Anthropic/Mitake 機密外洩樣式。");
console.log("⚠️ 仍請到 Vercel → Project → Settings → Environment Variables 確認 Production 未設定");
console.log("   VITE_ANTHROPIC_API_KEY / VITE_MITAKE_USERNAME / VITE_MITAKE_PASSWORD。");
