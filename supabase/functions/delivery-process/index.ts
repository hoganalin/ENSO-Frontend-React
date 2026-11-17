import { createAdminClient, getCallerUserId } from "../_shared/supabaseAdmin.ts";
import { errorResponse, jsonResponse } from "../_shared/response.ts";
import { deliverJob, type DeliveryJob } from "../_shared/delivery.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return jsonResponse(req,{});
  if (req.method !== "POST") return errorResponse(req,405,"method","請使用 POST");
  try {
    const caller = await getCallerUserId(req);
    if (!caller) return errorResponse(req,401,"auth","請先登入");
    const admin = createAdminClient();
    const profile = await admin.from("profiles").select("role").eq("id",caller).single();
    if (profile.error || !["finance","admin"].includes(profile.data?.role)) return errorResponse(req,403,"role","僅財務與管理員可處理通知");
    const body = await req.json();
    if (body?.action === "reconcile") {
      if (typeof body.job_id !== "string" || !["confirmed_sent","confirmed_not_sent"].includes(body.outcome)
        || typeof body.note !== "string" || body.note.trim().length < 5) {
        return errorResponse(req,400,"reconcile","請提供工作編號、對帳結果與至少 5 字的核對紀錄");
      }
      const moved = await admin.rpc("reconcile_delivery_job", {
        p_id:body.job_id,p_actor:caller,p_outcome:body.outcome,p_note:body.note.trim(),
        p_reference:typeof body.reference === "string" ? body.reference.trim() : null,
      });
      if (moved.error || !moved.data) return errorResponse(req,409,"reconcile",moved.error?.message ?? "此工作無法對帳");
      return jsonResponse(req,{reconciled:true,job:moved.data});
    }
    if (body?.action && body.action !== "process") return errorResponse(req,400,"action","不支援的操作");
    const limit = Math.min(10,Math.max(1,Number(body.limit)||5));
    const claimed = await admin.rpc("claim_delivery_jobs",{p_limit:Math.trunc(limit)});
    if (claimed.error) throw claimed.error;
    const results = [];
    for (const job of (claimed.data ?? []) as DeliveryJob[]) results.push({id:job.id,status:await deliverJob(admin,job)});
    return jsonResponse(req,{processed:results.length,results});
  } catch (error) {
    console.error("[delivery-process]",error);
    return errorResponse(req,500,"server","通知處理失敗，請稍後重試");
  }
});
