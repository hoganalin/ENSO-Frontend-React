import { preflightResponse } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/response.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabaseAdmin.ts";
import { CheckoutError, parseCheckoutRequest, priceCheckout, type CheckoutProfile, type CheckoutProduct } from "../_shared/commerce/checkout.ts";
import type { PromotionRow } from "../_shared/commerce/promotionRows.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflightResponse(req);
  if (req.method !== "POST") return errorResponse(req, 405, "method_not_allowed", "只接受 POST");
  try {
    const buyerId = await getCallerUserId(req);
    if (!buyerId) return errorResponse(req, 401, "unauthorized", "請先登入再結帳");
    let input: unknown;
    try { input = await req.json(); } catch { throw new CheckoutError("訂單格式不正確"); }
    const request = parseCheckoutRequest(input);
    const admin = createAdminClient();
    // Retry a lost response without re-evaluating expired promotions or changed
    // prices. The RPC below also handles two requests that arrive concurrently.
    const existing = await admin.from("orders").select("*")
      .eq("buyer_id", buyerId).eq("checkout_request_id", request.requestId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      const stored = parseCheckoutRequest(existing.data.checkout_request);
      if (JSON.stringify(stored) !== JSON.stringify(request)) {
        return errorResponse(req, 409, "request_conflict", "此訂單請求已使用，請返回購物車確認後再試");
      }
      return jsonResponse(req, { order: existing.data });
    }
    const [products, profile, orders, promos] = await Promise.all([
      admin.from("products").select("id,title,price,is_enabled,vip_only,available_at,vip_available_at").in("id", request.items.map((i) => i.productId)),
      admin.from("profiles").select("member_tier,birthday,referrer_id,role,subscription_active,subscription_expires_at,distributor_discount_rate").eq("id", buyerId).single(),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", buyerId).in("status", ["paid", "shipped", "completed"]),
      admin.from("promotions").select("*").eq("is_active", true),
    ]);
    for (const result of [products, profile, orders, promos]) if (result.error) throw result.error;
    if (orders.count === null) throw new Error("Unable to load purchase history");
    const quote = priceCheckout(request, products.data as CheckoutProduct[], profile.data as CheckoutProfile,
      orders.count, promos.data as PromotionRow[]);
    const rawCredit = (input as { creditUsed?: unknown }).creditUsed;
    const creditRequested = typeof rawCredit === "number" && Number.isSafeInteger(rawCredit) && rawCredit > 0
      ? Math.min(rawCredit, 2_000_000_000) : 0;
    const { data, error } = await admin.rpc("create_checkout_order", {
      p_buyer_id: buyerId, p_request: request, p_items: quote.items, p_totals: quote.totals,
      p_credit_requested: creditRequested,
    });
    if (error) {
      if (error.code === "P0001") return errorResponse(req, 409, "checkout_conflict", "商品或訂單內容已變更，請返回購物車確認後再試");
      throw error;
    }
    return jsonResponse(req, { order: data });
  } catch (error) {
    if (error instanceof CheckoutError) return errorResponse(req, 400, "invalid_checkout", error.message);
    console.error("[checkout-create]", error);
    return errorResponse(req, 500, "checkout_failed", "建立訂單失敗，請稍後重試");
  }
});

