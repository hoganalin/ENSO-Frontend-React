// supabase/functions/tappay-notify/index.ts
// TapPay 電子支付（LINE Pay）的伺服器端通知。公開端點（部署需 --no-verify-jwt）。
//
// 安全原則：通知內容可被偽造，所以「是否付款成功」不信任通知本身，
// 一律用 rec_trade_id 向 TapPay 的 Record API 查證（record_status === 1 才算付款完成），
// 再比對本地 payment_transactions（gateway_trade_no = rec_trade_id）後結算。
// 回 HTTP 200 讓 TapPay 停止重送；本地處理失敗才回 500 讓它重試。

import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { loadTappayConfig, queryTransaction } from "../_shared/tappay.ts";
import { processDeliveryJobs } from "../_shared/delivery.ts";

function ok(msg = "OK"): Response {
  return new Response(msg, { status: 200 });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return ok("ignored");

  let recTradeId = "";
  try {
    const body = await req.json();
    recTradeId = String(body?.rec_trade_id ?? "");
  } catch {
    // 解析不了就當雜訊，回 200 不重送。
    return ok("bad body");
  }
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(recTradeId)) return ok("no rec_trade_id");

  try {
    const cfg = loadTappayConfig();
    const admin = createAdminClient();

    // 1) 找到本地交易（我方在發起 LINE Pay 時已把 rec_trade_id 存進 gateway_trade_no）
    const { data: txData, error: txErr } = await admin
      .from("payment_transactions")
      .select("merchant_trade_no, amount, status, provider")
      .eq("gateway_trade_no", recTradeId)
      .eq("provider", "tappay")
      .maybeSingle();
    if (txErr) throw new Error(txErr.message);
    if (!txData) {
      // 不是我們的交易（或尚未建立）→ 回 200，不必重送。
      console.warn(`[tappay-notify] 查無交易 rec_trade_id=${recTradeId}`);
      return ok("unknown tx");
    }
    const tx = txData as { merchant_trade_no: string; amount: number; status: string; provider: string };
    if (tx.status === "paid") return ok("already settled"); // 冪等

    // 2) 向 TapPay 查證權威狀態（不信任通知本身）
    const record = await queryTransaction(cfg, recTradeId);
    if (!record.found) {
      console.error(`[tappay-notify] 查詢不到交易 rec_trade_id=${recTradeId}`);
      return ok("not found at gateway");
    }

    const paid = record.recordStatus === 1; // 1 = 交易完成
    const pending = record.recordStatus === 0 || record.recordStatus === 4; // 授權未請款 / 待付款

    if (pending) {
      // 尚未真正完成 → 不結算，回 200（TapPay 之後會再通知或由 Record 對帳補）。
      console.log(`[tappay-notify] 尚未完成 rec_trade_id=${recTradeId} record_status=${record.recordStatus}`);
      return ok("pending");
    }

    const { data: settleData, error: settleErr } = await admin.rpc("settle_ecpay_payment", {
      p_merchant_trade_no: tx.merchant_trade_no,
      p_gateway_trade_no: paid ? recTradeId : "",
      p_amount: tx.amount,
      p_payment_type: "TapPay-LinePay",
      p_paid: paid,
      p_payload: record.raw,
    });
    if (settleErr) throw new Error(settleErr.message); // 回 500 讓 TapPay 重送

    if (paid) {
      const settlement = (settleData ?? {}) as { outcome?: string };
      if (settlement.outcome === "settled") {
        const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (w: Promise<unknown>) => void } }).EdgeRuntime;
        if (runtime) runtime.waitUntil(processDeliveryJobs(admin, 3).catch((e) => console.error("[delivery]", e)));
      }
      console.log(`[tappay-notify] 完成 merchant_trade_no=${tx.merchant_trade_no} rec_trade_id=${recTradeId}`);
    } else {
      console.log(`[tappay-notify] 交易未成功 rec_trade_id=${recTradeId} record_status=${record.recordStatus}（標記失敗）`);
    }
    return ok("settled");
  } catch (err) {
    console.error("[tappay-notify] 處理失敗（回 500 讓 TapPay 重送）", err);
    return new Response("error", { status: 500 });
  }
});
