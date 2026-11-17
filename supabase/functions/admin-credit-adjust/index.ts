import { preflightResponse } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/response.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabaseAdmin.ts";

// 後台人工調整購物金：POST { memberId, amount, note }
// 權限：登入者須為 admin / finance（伺服器端再驗一次；RPC 也會驗）。
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflightResponse(req);
  if (req.method !== "POST") return errorResponse(req, 405, "method_not_allowed", "只接受 POST");
  try {
    const actor = await getCallerUserId(req);
    if (!actor) return errorResponse(req, 401, "unauthorized", "請先登入");

    let body: { memberId?: unknown; amount?: unknown; note?: unknown };
    try { body = await req.json(); } catch { return errorResponse(req, 400, "bad_request", "格式不正確"); }
    const memberId = String(body?.memberId ?? "");
    const amount = Number(body?.amount);
    const note = String(body?.note ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(memberId)) return errorResponse(req, 400, "invalid_member", "會員不正確");
    if (!Number.isSafeInteger(amount) || amount === 0) return errorResponse(req, 400, "invalid_amount", "調整金額不正確");
    if (Math.abs(amount) > 1_000_000) return errorResponse(req, 400, "invalid_amount", "單次調整金額過大");
    if (note.trim().length < 2 || note.trim().length > 500) return errorResponse(req, 400, "invalid_note", "請填寫 2~500 字的調整原因");

    const admin = createAdminClient();
    const { data: profile, error: pErr } = await admin.from("profiles").select("role").eq("id", actor).single();
    if (pErr) throw pErr;
    const role = (profile as { role: string }).role;
    if (role !== "admin" && role !== "finance") {
      return errorResponse(req, 403, "forbidden", "只有管理員或財務可調整購物金");
    }

    const { data, error } = await admin.rpc("admin_adjust_store_credit", {
      p_actor: actor, p_member: memberId, p_amount: amount, p_note: note,
    });
    if (error) return errorResponse(req, 400, "adjust_failed", error.message);
    return jsonResponse(req, data);
  } catch (e) {
    console.error("[admin-credit-adjust]", e);
    return errorResponse(req, 500, "server_error", "調整失敗，請稍後重試");
  }
});
