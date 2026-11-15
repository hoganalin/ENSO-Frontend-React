import { createAdminClient, getCallerUserId } from "../_shared/supabaseAdmin.ts";
import { mockAfterSalesResult } from "../_shared/afterSales.ts";
import { errorResponse, jsonResponse } from "../_shared/response.ts";
import { loadTappayConfig, refundTransaction } from "../_shared/tappay.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return jsonResponse(req, {});
  if (req.method !== "POST") return errorResponse(req,405,"method","請使用 POST");
  try {
    const actor = await getCallerUserId(req);
    if (!actor) return errorResponse(req,401,"auth","請先登入");
    const body = await req.json();
    if (!/^[0-9a-f-]{36}$/i.test(body.orderId ?? "") || !["ship","complete","cancel","update_recipient","refund","full_refund","void_invoice","mock_invoice","receive_return","exchange_ship"].includes(body.action))
      return errorResponse(req,400,"input","訂單或操作無效");
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id",actor).single();
    if (profileError) throw profileError;
    const roles = ["ship","complete","receive_return","exchange_ship"].includes(body.action) ? ["warehouse","admin"] : ["finance","support","admin"];
    if (!roles.includes(profile.role)) return errorResponse(req,403,"forbidden","您的角色無法執行此操作");
    if (["refund","void_invoice","mock_invoice"].includes(body.action)) {
      if (!["finance","admin"].includes(profile.role)) return errorResponse(req,403,"forbidden","僅財務或管理員可處理退款與作廢");
      if (Deno.env.get("AFTER_SALES_MODE") !== "mock") return errorResponse(req,409,"disabled","售後測試模式未啟用");
    }
    if (body.action === "exchange_ship") {
      const { data,error } = await admin.rpc("ship_order_exchange", { p_actor:actor,p_order:body.orderId,p_receipt:body.receiptId,p_quantity:body.quantity,p_request_key:body.requestKey,p_tracking:body.trackingNumber });
      if(error) return errorResponse(req,409,"exchange_state","無法換貨重寄：請確認已驗收、庫存足夠、沒有退款申請且換貨數量未超額");
      return jsonResponse(req,{shipment:data});
    }
    if (body.action === "receive_return") {
      const { data,error } = await admin.rpc("receive_order_return", { p_actor:actor,p_order:body.orderId,p_item:body.itemId,p_quantity:body.quantity,p_request_key:body.requestKey,p_note:body.note });
      if(error) return errorResponse(req,409,"return_state","無法驗收入庫：請確認已出貨、退貨數量及驗收說明");
      return jsonResponse(req,{receipt:data});
    }
    if (body.action === "mock_invoice") {
      const { data, error } = await admin.rpc("create_mock_invoice", { p_actor: actor, p_order: body.orderId });
      if (error) return errorResponse(req,409,"invoice_state","僅已付款訂單可建立模擬發票");
      return jsonResponse(req,{invoice:data});
    }
    if (body.action === "refund") {
      if (!/^[0-9a-f-]{36}$/i.test(body.refundId ?? "")) return errorResponse(req,400,"input","退款申請無效");
      const simulated = body.result === "rejected" ? {status:"rejected",providerReference:null} : mockAfterSalesResult("refund", body.refundId, body.result ?? "succeeded");
      const providerReference = simulated.providerReference;
      const { data, error } = await admin.rpc("complete_refund", { p_actor: actor, p_order: body.orderId, p_refund: body.refundId, p_status: simulated.status, p_provider_reference: providerReference, p_error: body.error ?? null });
      if (error) return errorResponse(req,409,"refund_state","無法更新退款狀態");
      return jsonResponse(req,{refund:data});
    }
    if (body.action === "full_refund") {
      // 後台全額退款：以 service_role 在後端完成（改狀態 + 回沖推薦金 + 退還買家購物金 + 結掉退款申請）。
      if (!["finance","admin"].includes(profile.role)) return errorResponse(req,403,"forbidden","僅財務或管理員可退款");
      const { data: order, error: oErr } = await admin.from("orders")
        .select("id,order_no,status,total,credit_used,buyer_id,referrer_id,payment_method,payment_gateway_trade_no,refund_gateway_ref").eq("id", body.orderId).single();
      if (oErr || !order) return errorResponse(req,404,"not_found","找不到訂單");
      if (order.status === "refunded") return jsonResponse(req,{ ok:true, already:true });
      if (!["paid","shipped","completed"].includes(order.status)) return errorResponse(req,409,"state","此訂單狀態無法退款");

      // ── 先向 TapPay 申請退款；成功才動資料庫（沙盒/正式由 TAPPAY_ENV 決定）。──
      // 以付款時存下的 rec_trade_id（orders.payment_gateway_trade_no）退款；
      // 舊的種子/測試訂單沒有此值時跳過閘道、只做系統狀態與購物金處理（向下相容）。
      let gatewayRefund: Record<string, unknown> | null = null;
      const recTradeId = (order as { payment_gateway_trade_no?: string | null }).payment_gateway_trade_no ?? "";
      const priorRefundRef = (order as { refund_gateway_ref?: string | null }).refund_gateway_ref ?? "";
      if (recTradeId && !priorRefundRef) {
        // 尚未向閘道退款 → 打 TapPay，成功後「立刻」記下 refund 參照，
        // 之後若 DB 收尾失敗，重試時會因 refund_gateway_ref 已有值而跳過閘道，避免重複退款。
        try {
          const cfg = loadTappayConfig();
          const rf = await refundTransaction(cfg, recTradeId); // 全額退款（不帶 amount）
          if (rf.status !== 0) {
            console.error(`[full_refund] TapPay 退款被拒 order=${order.order_no} rec_trade_id=${recTradeId} msg=${rf.msg}`);
            return errorResponse(req,402,"gateway_refund_failed",`TapPay 退款失敗：${rf.msg}`);
          }
          const refMark = rf.refundId || "refunded";
          const { error: markErr } = await admin.from("orders").update({ refund_gateway_ref: refMark }).eq("id", order.id);
          if (markErr) {
            // 錢已退、但標記沒寫入：直接中止，請人工確認後再處理，避免重試造成重複退款。
            console.error(`[full_refund] 退款已送出但標記失敗 order=${order.order_no} refund_id=${rf.refundId}`, markErr);
            return errorResponse(req,500,"refund_mark_failed","退款已向 TapPay 送出，但系統標記失敗，請勿重試並聯繫工程師確認");
          }
          gatewayRefund = { refund_id: rf.refundId, amount: rf.refundAmount, is_captured: rf.isCaptured, env: cfg.isProduction ? "production" : "sandbox" };
          console.log(`[full_refund] TapPay 退款成功 order=${order.order_no} refund_id=${rf.refundId} amount=${rf.refundAmount}`);
        } catch (e) {
          console.error(`[full_refund] TapPay 退款請求錯誤 order=${order.order_no}`, e);
          return errorResponse(req,502,"gateway_refund_error","TapPay 退款請求失敗，請稍後再試");
        }
      } else if (recTradeId && priorRefundRef) {
        // 閘道先前已退款（上次 DB 收尾中斷）→ 不再打 TapPay，只補完下方 DB 處理（冪等重放）。
        gatewayRefund = { refund_id: priorRefundRef, replayed: true };
        console.log(`[full_refund] 偵測到閘道已退款，略過 TapPay、續補 DB order=${order.order_no} ref=${priorRefundRef}`);
      }

      const { data: ledger, error: lErr } = await admin.from("store_credit_ledger")
        .select("member_id,type,amount,note").eq("order_id", order.id);
      if (lErr) throw lErr;
      const rows = (ledger ?? []) as { member_id:string; type:string; amount:number; note:string|null }[];

      const earnByMember = new Map<string, number>();
      const reverseByMember = new Map<string, number>();
      for (const r of rows) {
        if (r.type === "earn" && r.note == null) earnByMember.set(r.member_id, (earnByMember.get(r.member_id) ?? 0) + r.amount);
        if (r.type === "reverse") reverseByMember.set(r.member_id, (reverseByMember.get(r.member_id) ?? 0) + r.amount);
      }
      const inserts: Record<string, unknown>[] = [];
      // 推薦人回饋金全額回沖
      for (const [member, earned] of earnByMember) {
        const need = earned - (reverseByMember.get(member) ?? 0);
        if (need > 0) inserts.push({ member_id: member, type: "reverse", amount: need, order_id: order.id });
      }
      // 買家已折抵購物金全額退還（若尚未退還）
      const creditUsed = order.credit_used ?? 0;
      const alreadyReturned = rows.filter(r => r.type === "earn" && r.note === "退款退還購物金" && r.member_id === order.buyer_id).reduce((a,r)=>a+r.amount,0);
      if (order.buyer_id && creditUsed > alreadyReturned) {
        inserts.push({ member_id: order.buyer_id, type: "earn", amount: creditUsed - alreadyReturned, order_id: order.id,
          expires_at: new Date(Date.now() + 365*24*3600*1000).toISOString(), note: "退款退還購物金" });
      }
      if (inserts.length) {
        const { error: insErr } = await admin.from("store_credit_ledger").insert(inserts);
        if (insErr) throw insErr;
      }
      // 結掉買家的退款申請（非 rejected/succeeded → succeeded）
      await admin.from("refund_requests").update({ status:"succeeded", reviewed_by: actor, reviewed_at: new Date().toISOString() })
        .eq("order_id", order.id).not("status","in","(rejected,succeeded)");
      // 訂單狀態 → refunded
      const { error: upErr } = await admin.from("orders").update({ status: "refunded" }).eq("id", order.id);
      if (upErr) throw upErr;
      await admin.from("operation_logs").insert({ actor_id: actor, action: "refund_full", order_id: order.id, details: { credit_returned: creditUsed, gateway_refund: gatewayRefund } });
      return jsonResponse(req,{ ok:true, credit_returned: creditUsed, gateway_refund: gatewayRefund });
    }
    if (body.action === "void_invoice") {
      if (!/^[0-9a-f-]{36}$/i.test(body.invoiceId ?? "")) return errorResponse(req,400,"input","發票無效");
      const providerReference = mockAfterSalesResult("void", body.invoiceId).providerReference;
      const { data, error } = await admin.rpc("void_invoice", { p_actor: actor, p_order: body.orderId, p_invoice: body.invoiceId, p_provider_reference: providerReference });
      if (error) return errorResponse(req,409,"invoice_state","無法作廢發票");
      return jsonResponse(req,{invoice:data});
    }
    const { data, error } = await admin.rpc("admin_order_action",{
      p_actor:actor,p_order:body.orderId,p_action:body.action,p_recipient:body.recipient ?? null,p_tracking:body.trackingNumber ?? null,
    });
    if (error) { console.error("[admin-order]",error); return errorResponse(req,409,"order_state","無法更新：請確認訂單狀態、收件資料、物流單號及庫存"); }
    return jsonResponse(req,{order:data});
  } catch (error) {
    console.error("[admin-order]",error);
    return errorResponse(req,500,"server","訂單更新失敗，請稍後重試");
  }
});


