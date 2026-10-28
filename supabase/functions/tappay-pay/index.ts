// supabase/functions/tappay-pay/index.ts
// TapPay 信用卡付款入口：POST { orderId, prime } → 後端用 prime 向 TapPay 扣款。
//
// 安全模型與 payment-create 相同：
//   • 身分：必須是登入使用者，且訂單是本人的。
//   • 金額：一律從 DB 的 order_items × products.price 重算，不信任前端。
//   • prime 是一次性付款憑證（綁定 App ID），卡號不會進到我們的伺服器。
// 扣款成功後呼叫共用結算函式 settle_ecpay_payment（已放寬接受 provider='tappay'），
// 原子完成「訂單標記付款 + 推薦購物金 + 出貨任務」。

import { preflightResponse } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/response.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabaseAdmin.ts";
import { validateOrderAmounts } from "../_shared/orderAmounts.ts";
import { toMerchantTradeNo } from "../_shared/tradeNo.ts";
import { loadTappayConfig, payByPrime } from "../_shared/tappay.ts";
import { processDeliveryJobs } from "../_shared/delivery.ts";

interface OrderItemRow {
  product_id: string | null;
  title: string;
  unit_price: number;
  qty: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflightResponse(req);
  if (req.method !== "POST") {
    return errorResponse(req, 405, "method_not_allowed", "只接受 POST");
  }

  // ── 1. 身分 ─────────────────────────────────────────────
  const userId = await getCallerUserId(req);
  if (!userId) {
    return errorResponse(req, 401, "unauthorized", "請先登入再進行付款");
  }

  // ── 2. 參數：orderId + prime（金額一律不信前端）───────────
  let orderId = "";
  let prime = "";
  try {
    const body = await req.json();
    orderId = String(body?.orderId ?? "");
    prime = String(body?.prime ?? "");
  } catch {
    return errorResponse(req, 400, "invalid_body", "請求格式錯誤");
  }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return errorResponse(req, 400, "invalid_order_id", "訂單編號格式錯誤");
  }
  if (!prime || prime.length < 10 || prime.length > 512) {
    return errorResponse(req, 400, "invalid_prime", "付款憑證無效，請重新輸入卡號");
  }

  const admin = createAdminClient();

  try {
    // ── 3. 讀訂單並檢查歸屬（service_role 繞過 RLS）──────────
    const { data: orderData, error: orderError } = await admin
      .from("orders")
      .select("id, order_no, buyer_id, status, subtotal, discount, shipping_fee, total, checkout_source, recipient")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!orderData) return errorResponse(req, 404, "order_not_found", "找不到這筆訂單");
    const order = orderData as {
      id: string;
      order_no: string;
      buyer_id: string | null;
      status: string;
      subtotal: number;
      discount: number;
      shipping_fee: number;
      total: number;
      checkout_source: string | null;
      recipient: Record<string, string> | null;
    };
    if (order.buyer_id !== userId) {
      return errorResponse(req, 404, "order_not_found", "找不到這筆訂單");
    }
    if (order.checkout_source !== "server-v1") {
      return errorResponse(req, 409, "legacy_order", "此訂單尚未經伺服器驗價，請重新下單");
    }
    if (order.status !== "pending") {
      return errorResponse(req, 409, "order_not_payable", `訂單狀態為 ${order.status}，無法付款`);
    }

    // ── 4. 金額驗算（與 payment-create 相同邏輯）──────────────
    const { data: itemsData, error: itemsError } = await admin
      .from("order_items")
      .select("product_id, title, unit_price, qty")
      .eq("order_id", order.id);
    if (itemsError) throw new Error(itemsError.message);
    const items = (itemsData ?? []) as OrderItemRow[];
    if (items.length === 0) return errorResponse(req, 409, "order_empty", "訂單沒有任何商品");

    const productIds = items
      .map((i) => i.product_id)
      .filter((id): id is string => Boolean(id));
    const { data: productsData, error: productsError } = await admin
      .from("products")
      .select("id, price")
      .in("id", productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"]);
    if (productsError) throw new Error(productsError.message);
    const priceById = new Map(
      ((productsData ?? []) as { id: string; price: number }[]).map((p) => [p.id, p.price]),
    );
    for (const item of items) {
      if (!item.product_id) return errorResponse(req, 409, "order_item_invalid", "訂單明細缺少商品");
      const official = priceById.get(item.product_id);
      if (official === undefined) return errorResponse(req, 409, "product_missing", "訂單內含已下架商品");
      if (official !== item.unit_price || !Number.isInteger(item.qty) || item.qty < 1) {
        return errorResponse(req, 409, "amount_mismatch", "訂單金額與商品定價不符，請重新下單");
      }
    }
    if (!validateOrderAmounts(order, items)) {
      return errorResponse(req, 409, "amount_mismatch", "訂單金額驗算不符，請重新下單");
    }
    const amount = order.total;
    if (!Number.isInteger(amount) || amount < 1) {
      return errorResponse(req, 409, "amount_invalid", "訂單金額不正確，無法付款");
    }

    // ── 5. 取得／建立 TapPay 付款交易列（冪等）────────────────
    const { data: existingTx, error: txErr } = await admin
      .from("payment_transactions")
      .select("id, merchant_trade_no, amount, status, attempt")
      .eq("order_id", order.id)
      .order("attempt", { ascending: false })
      .limit(1);
    if (txErr) throw new Error(txErr.message);
    const latest = (existingTx ?? [])[0] as
      | { id: string; merchant_trade_no: string; amount: number; status: string; attempt: number }
      | undefined;
    if (latest?.status === "paid") {
      return errorResponse(req, 409, "already_paid", "這筆訂單已完成付款");
    }

    let merchantTradeNo: string;
    if (
      latest &&
      latest.status === "pending" &&
      latest.amount === amount &&
      /^[A-Za-z0-9]{4,20}$/.test(latest.merchant_trade_no)
    ) {
      merchantTradeNo = latest.merchant_trade_no;
    } else {
      const attempt = (latest?.attempt ?? 0) + 1;
      merchantTradeNo = toMerchantTradeNo(order.order_no, attempt);
      const { error: insErr } = await admin.from("payment_transactions").insert({
        order_id: order.id,
        merchant_trade_no: merchantTradeNo,
        provider: "tappay",
        amount,
        attempt,
        status: "pending",
      });
      if (insErr) throw new Error(insErr.message);
    }

    // ── 6. 向 TapPay 扣款 ───────────────────────────────────
    const cfg = loadTappayConfig();
    const rcpt = order.recipient ?? {};
    const result = await payByPrime(cfg, {
      prime,
      amount,
      orderNumber: merchantTradeNo,
      details: `ENSO 訂單 ${order.order_no}`.slice(0, 100),
      cardholder: {
        phone_number: rcpt["tel"] || rcpt["phone"] || "0900000000",
        name: rcpt["name"] || "顧客",
        email: rcpt["email"] || "noreply@example.com",
      },
    });

    const paid = result.status === 0;
    const gatewayTradeNo = result.recTradeId;
    if (paid && !gatewayTradeNo) {
      console.error(`[tappay-pay] 成功卻無 rec_trade_id order=${order.order_no}`);
      return errorResponse(req, 502, "gateway_error", "付款閘道回應異常，請聯繫客服確認");
    }

    // ── 7. 結算（共用函式；冪等、含購物金與出貨任務）─────────
    const { data: settleData, error: settleErr } = await admin.rpc("settle_ecpay_payment", {
      p_merchant_trade_no: merchantTradeNo,
      p_gateway_trade_no: paid ? gatewayTradeNo : "",
      p_amount: amount,
      p_payment_type: "TapPay-CreditCard",
      p_paid: paid,
      p_payload: result.raw,
    });
    if (settleErr) {
      console.error(
        `[tappay-pay] 結算失敗 order=${order.order_no} rec_trade_id=${gatewayTradeNo}`,
        settleErr,
      );
      if (paid) {
        // 已扣款但訂單更新失敗：交易留存，需人工對帳，絕不回成功。
        return errorResponse(req, 500, "settlement_error", "付款已完成但訂單更新失敗，請截圖並聯繫客服");
      }
      return errorResponse(req, 402, "payment_declined", `付款失敗：${result.msg}`);
    }

    if (!paid) {
      return errorResponse(req, 402, "payment_declined", `付款失敗：${result.msg}`);
    }

    const settlement = (settleData ?? {}) as { outcome?: string };
    if (settlement.outcome === "settled") {
      const runtime = (globalThis as unknown as {
        EdgeRuntime?: { waitUntil: (work: Promise<unknown>) => void };
      }).EdgeRuntime;
      if (runtime) {
        runtime.waitUntil(
          processDeliveryJobs(admin, 3).catch((e) => console.error("[delivery]", e)),
        );
      }
    }

    console.log(
      `[tappay-pay] 完成 order=${order.order_no} amount=${amount} rec_trade_id=${gatewayTradeNo} outcome=${settlement.outcome}`,
    );
    return jsonResponse(req, {
      success: true,
      orderNo: order.order_no,
      recTradeId: gatewayTradeNo,
      amount,
    });
  } catch (err) {
    console.error("[tappay-pay] 失敗", err);
    return errorResponse(req, 500, "internal_error", "付款處理失敗，請稍後再試");
  }
});
