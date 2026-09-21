// supabase/functions/_shared/cors.ts
// 瀏覽器會先發 OPTIONS preflight（因為我們帶 Authorization header），
// 沒有回 CORS 標頭的話，前端 supabase.functions.invoke() 只會看到一個很難查的網路錯誤。
//
// 注意：ECPay 的回調（payment-notify）是「伺服器對伺服器」的 POST，
// 不受 CORS 約束，也不該套用這裡的白名單 —— 那支函式只回 ECPay 要的純文字。

/**
 * 允許的前端來源。用 `ALLOWED_ORIGINS`（逗號分隔）設定，
 * 例如 `https://enso.example.com,http://localhost:5173`。
 *
 * 沒設定時退回 `*`：本機開發方便，但正式環境請務必設定，
 * 否則任何網站都能替使用者發起付款請求（帶著他的 JWT 除外，
 * 但仍是不必要的攻擊面）。
 */
function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS")?.trim();
  if (!raw) return ["*"];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function corsHeaders(requestOrigin: string | null): Record<string, string> {
  const allow = allowedOrigins();
  const origin = allow.includes("*")
    ? "*"
    : requestOrigin && allow.includes(requestOrigin)
      ? requestOrigin
      : allow[0];

  return {
    "Access-Control-Allow-Origin": origin,
    // apikey / x-client-info 是 supabase-js 自己會加的 header，漏了會 preflight 失敗。
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** preflight 專用回應（204 不帶 body）。 */
export function preflightResponse(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}
