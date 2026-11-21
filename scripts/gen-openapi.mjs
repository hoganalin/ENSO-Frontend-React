// 產生 openapi.json:抓本機 PostgREST 的自動 OpenAPI(資料表端點),再手動補上 Edge Functions。
// 本專案沒有「現成 OpenAPI 產生器」,這支就是它的替代。需本機 supabase start。
import { writeFileSync } from "node:fs";

const URL = process.env.TEST_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON = process.env.TEST_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

async function main() {
  const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!res.ok) throw new Error(`抓 PostgREST OpenAPI 失敗:${res.status}(本機 supabase 有啟動嗎?)`);
  const spec = await res.json();

  // 手動補上 Edge Functions(PostgREST 的 OpenAPI 不含這些)
  spec.paths = spec.paths || {};
  const bearer = [{ bearer: [] }];
  spec.paths["/functions/v1/checkout-create"] = { post: { tags: ["edge-functions"], summary: "建立訂單(伺服器算價+預留庫存)", security: bearer, responses: { 200: { description: "order" }, 409: { description: "衝突/庫存不足" } } } };
  spec.paths["/functions/v1/tappay-pay"] = { post: { tags: ["edge-functions"], summary: "TapPay 付款(信用卡 3DS / LINE Pay)", security: bearer, responses: { 200: { description: "requires3ds / success" } } } };
  spec.paths["/functions/v1/admin-order-action"] = { post: { tags: ["edge-functions"], summary: "後台訂單動作(complete/cancel/full_refund…)", security: bearer, responses: { 200: { description: "order" }, 403: { description: "角色不足" } } } };
  spec.info = { title: "Queen Maeve API", version: new Date().toISOString().slice(0, 10) };

  writeFileSync("openapi.json", JSON.stringify(spec, null, 2));
  console.log("已輸出 openapi.json(PostgREST 資料表端點 + 手補 Edge Functions)");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
