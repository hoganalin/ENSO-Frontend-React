// supabase/functions/payment-create/index.ts
// 前端唯一的「開始付款」入口：POST { orderId } → 回傳綠界表單欄位。
//
// 為什麼一定要有這一層：
//   簽章需要 HashKey/HashIV。只要那兩個字串出現在瀏覽器能拿到的地方，
//   任何人都能自己簽一張「TotalAmount=1」的表單送去綠界付 1 元買 3000 元的東西。
//   所以簽章只能在這裡做，而且**金額只能從資料庫算**，不接受前端傳金額。
//
// 前端不傳金額還不夠 —— 訂單是前端自己 insert 的（orders_insert RLS 只檢查
// buyer_id = auth.uid()，不檢查金額），所以這裡會拿 order_items 對 products.price
// 重新驗算一次，對不上就拒絕付款。

import { preflightResponse } from "../_shared/cors.ts";
import {
  buildAioCheckoutFields,
  loadEcpayConfig,
  toMerchantTradeNo,
} from "../_shared/ecpay.ts";
import { errorResponse, jsonResponse } from "../_shared/response.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabaseAdmin.ts";

/** 免運費活動會把運費壓成 0，其餘一律 SHIPPING_BASE（對齊 domain/orderTotals.ts）。 */
const SHIPPING_BASE = 80;

interface OrderItemRow {
  product_id: string | null;
  title: string;
  unit_price: number;
  qty: number;
}

/**
 * ReturnURL = 綠界的伺服器端背景回調（AIO 沒有 NotifyURL 這個參數）。
 * 預設用 SUPABASE_URL 推導出 payment-notify 的網址；
 * 自訂網域或本機用 ngrok 測試時，用 ECPAY_RETURN_URL 覆寫。
 */
function resolveReturnUrl(): string {
  const explicit = Deno.env.get("ECPAY_RETURN_URL");
  if (explicit) return explicit;
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) throw new Error("[payment-create] 無法推導 ReturnURL：缺少 SUPABASE_URL");
  return `${base}/functions/v1/payment-notify`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflightResponse(req);
  if (req.method !== "POST") {
    return errorResponse(req, 405, "method_not_allowed", "只接受 POST");
  }

  // ── 1. 身分：必須是登入使用者 ───────────────────────────
  const userId = await getCallerUserId(req);
  if (!userId) {
    return errorResponse(req, 401, "unauthorized", "請先登入再進行付款");
  }

  // ── 2. 參數：只收 orderId，金額一律不信前端 ─────────────
  let orderId: string;
  try {
    const body = await req.json();
    orderId = String(body?.orderId ?? "");
  } catch {
    return errorResponse(req, 400, "invalid_body", "請求格式錯誤");
  }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return errorResponse(req, 400, "invalid_order_id", "訂單編號格式錯誤");
  }

  const admin = createAdminClient();

  try {
    // ── 3. 讀訂單（service_role 繞過 RLS，所以下面必須自己檢查歸屬）──
    const { data: orderData, error: orderError } = await admin
      .from("orders")
      .select("id, order_no, buyer_id, status, subtotal, discount, shipping_fee, total, checkout_source, recipient")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!orderData) {
      return errorResponse(req, 404, "order_not_found", "找不到這筆訂單");
    }
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

    // ⚠️ RLS 在 service_role 下是關掉的，這行就是唯一的授權檢查。
    if (order.buyer_id !== userId) {
      // 回 404 而不是 403：不要讓人拿這支 API 去枚舉別人的訂單是否存在。
      return errorResponse(req, 404, "order_not_found", "找不到這筆訂單");
    }
    // Migration 007 makes the quote immutable to browser clients. Legacy
    // browser-created orders must never be signed, even if arithmetic matches.
    if (order.checkout_source !== "server-v1") {
      return errorResponse(req, 409, "legacy_order", "此訂單尚未經伺服器驗價，請重新下單");
    }
    if (order.status !== "pending") {
      return errorResponse(
        req,
        409,
        "order_not_payable",
        `訂單狀態為 ${order.status}，無法付款`,
      );
    }

    // ── 4. 金額驗算：訂單列是前端寫的，不能直接拿來簽章 ──────
    const { data: itemsData, error: itemsError } = await admin
      .from("order_items")
      .select("product_id, title, unit_price, qty")
      .eq("order_id", order.id);
    if (itemsError) throw new Error(itemsError.message);
    const items = (itemsData ?? []) as OrderItemRow[];
    if (items.length === 0) {
      return errorResponse(req, 409, "order_empty", "訂單沒有任何商品");
    }

    // 4a. 每個品項的單價必須等於 products.price（唯一可信的價格來源）。
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
      if (!item.product_id) {
        return errorResponse(req, 409, "order_item_invalid", "訂單明細缺少商品");
      }
      const officialPrice = priceById.get(item.product_id);
      if (officialPrice === undefined) {
        return errorResponse(req, 409, "product_missing", "訂單內含已下架商品");
      }
      if (officialPrice !== item.unit_price || !Number.isInteger(item.qty) || item.qty < 1) {
        console.error(
          `[payment-create] 金額不符 order=${order.order_no} product=${item.product_id} ` +
            `db=${officialPrice} order_item=${item.unit_price} qty=${item.qty}`,
        );
        return errorResponse(
          req,
          409,
          "amount_mismatch",
          "訂單金額與商品定價不符，請重新下單",
        );
      }
    }

    // 4b. 算術恆等式：total = max(0, subtotal - discount) + shipping_fee
    //     （對齊 domain/promotions.ts:185；subtotal 是「未扣折扣」的商品合計）
    const grossSubtotal = items.reduce((sum, i) => sum + i.unit_price * i.qty, 0);
    // orders.subtotal は「折扣後商品總額」：grossSubtotal - discount
    const expectedSubtotal = grossSubtotal - order.discount;
    const expectedTotal = expectedSubtotal + order.shipping_fee;
    const shippingOk = order.shipping_fee === 0 || order.shipping_fee === SHIPPING_BASE;
    const consistent =
      expectedSubtotal === order.subtotal &&
      expectedTotal === order.total &&
      order.discount >= 0 &&
      order.discount <= grossSubtotal &&
      shippingOk;

    if (!consistent) {
      console.error(
        `[payment-create] 訂單金額不一致 order=${order.order_no} ` +
          `items=${grossSubtotal} subtotal=${order.subtotal}(折後) discount=${order.discount} ` +
          `expectedSubtotal=${expectedSubtotal} shipping=${order.shipping_fee} total=${order.total} expected=${expectedTotal}`,
      );
      return errorResponse(
        req,
        409,
        "amount_mismatch",
        "訂單金額驗算不符，請重新下單",
      );
    }

    // checkout-create calculated this discount with the shared engine using
    // server data. Migration 007 rejects client changes to quote/items/status.

    const amount = order.total;
    if (!Number.isInteger(amount) || amount < 1) {
      return errorResponse(req, 409, "amount_invalid", "訂單金額不正確，無法付款");
    }

    // ── 5. 取得／建立這次付款的 MerchantTradeNo ───────────────
    // 綠界要求 MerchantTradeNo 在同一商店唯一，所以每次「重新發起付款」
    // 都要有自己的編號；但同一次付款重複點按鈕（或重新整理）應該沿用，
    // 否則綠界後台會塞滿一堆棄置交易。
    const { data: existingTx, error: txQueryError } = await admin
      .from("payment_transactions")
      .select("id, merchant_trade_no, amount, status, attempt")
      .eq("order_id", order.id)
      .order("attempt", { ascending: false })
      .limit(1);
    if (txQueryError) throw new Error(txQueryError.message);

    const latest = (existingTx ?? [])[0] as
      | { id: string; merchant_trade_no: string; amount: number; status: string; attempt: number }
      | undefined;

    let merchantTradeNo: string;
    if (latest?.status === "paid") {
      // 已經付過了（回調可能還沒跑完）。不要再開新的付款。
      return errorResponse(req, 409, "already_paid", "這筆訂單已完成付款");
    } else if (
      latest &&
      latest.status === "pending" &&
      latest.amount === amount &&
      /^[A-Za-z0-9]{4,20}$/.test(latest.merchant_trade_no)
    ) {
      merchantTradeNo = latest.merchant_trade_no;
    } else {
      const attempt = (latest?.attempt ?? 0) + 1;
      merchantTradeNo = toMerchantTradeNo(order.order_no, attempt);
      const { error: insertError } = await admin.from("payment_transactions").insert({
        order_id: order.id,
        merchant_trade_no: merchantTradeNo,
        provider: "ecpay",
        amount,
        attempt,
        status: "pending",
      });
      if (insertError) throw new Error(insertError.message);
    }

    // ── 6. 簽章 ─────────────────────────────────────────────
    const config = loadEcpayConfig();
    const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "");
    const { action, fields } = await buildAioCheckoutFields(
      {
        merchantTradeNo,
        totalAmount: amount,
        items: items.map((i) => ({
          title: i.title,
          qty: i.qty,
          unitPrice: i.unit_price,
        })),
        tradeDesc: "ENSO 線上購物",
        returnUrl: resolveReturnUrl(),
        // 這兩個都是選填：沒設定就讓綠界顯示它自己的結果頁，
        // 免得把使用者導到一個還不存在的前端路由。
        orderResultUrl: siteUrl ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-result` : undefined,
        clientBackUrl: siteUrl ? `${siteUrl}/orders` : undefined,
        choosePayment: "ALL",
        customField1: order.order_no,
        invoice: order.recipient
          ? {
              customerName: order.recipient["name"] ?? "",
              customerEmail: order.recipient["email"] ?? "",
              customerAddr: order.recipient["address"] ?? "",
              customerPhone: order.recipient["tel"] ?? "",
            }
          : undefined,
      },
      config,
    );

    return jsonResponse(req, {
      action,
      fields,
      merchantTradeNo,
      amount,
      orderNo: order.order_no,
    });
  } catch (err) {
    // 技術細節留在 log，不回給瀏覽器（可能含 secrets 名稱、SQL 訊息）。
    console.error("[payment-create] 失敗", err);
    return errorResponse(req, 500, "internal_error", "建立付款失敗，請稍後再試");
  }
});
