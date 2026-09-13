// supabase/functions/_shared/response.ts
// 統一的回應格式，讓前端只需要判斷一種 shape。
//
// 原則：錯誤訊息回給瀏覽器時只給「使用者能看懂、且不洩漏內部細節」的字串；
// 真正的技術細節用 console.error 留在函式 log 裡（Supabase Dashboard 可查）。

import { corsHeaders } from "./cors.ts";

export interface ApiError {
  /** 給程式判斷用的穩定代碼，例如 order_not_found */
  code: string;
  /** 給人看的訊息（繁中，會直接顯示在前端） */
  message: string;
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req.headers.get("origin")),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function errorResponse(
  req: Request,
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse(req, { error: { code, message } satisfies ApiError }, status);
}

/**
 * ECPay 回調要求 body 必須是純文字 `1|OK`，否則綠界會判定「商店未收到」
 * 並持續重送（最多重送數次）。所以：
 *   • 我們處理成功 → 回 1|OK
 *   • 我們處理失敗（例如簽章不符）→ 回 0|<原因>，讓綠界記錄失敗
 *   • 我們自己壞掉（DB 掛了）→ 也回 0|...，讓綠界重送（這正是我們要冪等的原因）
 */
export function ecpayAck(ok: boolean, reason = "OK"): Response {
  return new Response(ok ? "1|OK" : `0|${reason}`, {
    status: 200, // 綠界看 body，不看 HTTP status；回 500 只會讓人誤判
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
