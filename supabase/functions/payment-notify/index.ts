// supabase/functions/payment-notify/index.ts
// 綠界 AIO 的伺服器端背景回調（設定在表單的 **ReturnURL**，AIO 沒有 NotifyURL）。
//
// 這支函式是「訂單完成」的唯一真實來源。瀏覽器回來的那一條路（OrderResultURL）
// 只能用來顯示畫面，絕對不能用來發購物金 —— 使用者可以關掉分頁、可以改請求。
//
// 冪等性是硬需求：綠界在沒收到 `1|OK` 時會重送，而且使用者按重新整理、
// 網路重試都可能讓同一筆回調進來兩次。重複處理的後果是「購物金發兩次」。
// 這裡用三道閘：
//   1. payment_transactions 的狀態條件更新（pending → paid，更新到 0 筆就代表已處理過）
//   2. store_credit_ledger 先查有無同 order 的 earn
//   3. DB 端的唯一索引 uq_credit_earn_per_order（005 migration），
//      連併發也擋得住 —— 前兩道是樂觀檢查，第三道才是保證。
//
// 部署注意：這支函式必須 `--no-verify-jwt`，綠界不會帶 Supabase 的 JWT。
// 也就是說端點是公開的 —— 所以「驗簽 + 驗金額」是唯一的防線，不能省。

import {
  formDataToRecord,
  loadEcpayConfig,
  orderNoFromMerchantTradeNo,
  parseNotifyPayload,
  verifyCheckMacValue,
} from "../_shared/ecpay.ts";
import {
  isInvoiceEnabled,
  issueB2CInvoice,
  loadInvoiceConfig,
} from "../_shared/invoice.ts";
import { loadMitakeConfig, sendSms } from "../_shared/mitake.ts";
import { ecpayAck } from "../_shared/response.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** 購物金效期 1 年（對齊 src/domain/storeCredit.ts 的 ONE_YEAR_MS）。 */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** 只有「普通會員」推薦人才有購物金（金／銀卡只有可見度）。 */
const CREDIT_ELIGIBLE_TIER = "normal";

const PG_UNIQUE_VIOLATION = "23505";

interface OrderRecord {
  id: string;
  order_no: string;
  status: string;
  buyer_id: string | null;
  referrer_id: string | null;
  subtotal: number;
  total: number;
  referrer_tier_snapshot: string | null;
  recipient: unknown;
}

const nt = (n: number) => n.toLocaleString("en-US");

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return ecpayAck(false, "Method Not Allowed");
  }

  // ── 1. 取出綠界 POST 的表單 ─────────────────────────────
  let payload: Record<string, string>;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      payload = formDataToRecord(new URLSearchParams(await req.text()));
    } else {
      // 綠界正式送的是 form-urlencoded；multipart 只是保險。
      payload = formDataToRecord(await req.formData());
    }
  } catch (err) {
    console.error("[payment-notify] 無法解析 body", err);
    return ecpayAck(false, "Bad Request");
  }

  // ── 2. 驗簽（公開端點的唯一防線）───────────────────────
  let config;
  try {
    config = loadEcpayConfig();
  } catch (err) {
    console.error("[payment-notify] 設定不完整", err);
    // 回 0|... 讓綠界重送：設定補上之後這筆就會被補做。
    return ecpayAck(false, "Server Misconfigured");
  }

  const signatureOk = await verifyCheckMacValue(payload, config);
  if (!signatureOk) {
    console.error(
      `[payment-notify] CheckMacValue 驗證失敗 MerchantTradeNo=${payload.MerchantTradeNo ?? "?"}`,
    );
    // 簽章不符代表來源不可信 —— 回 0 但**不要**重試處理，也不要動任何資料。
    return ecpayAck(false, "CheckMacValue Error");
  }

  const result = parseNotifyPayload(payload);
  if (!result.merchantTradeNo) {
    return ecpayAck(false, "Missing MerchantTradeNo");
  }

  const admin = createAdminClient();

  try {
    // ── 3. 找出這筆交易 ───────────────────────────────────
    const { data: txData, error: txError } = await admin
      .from("payment_transactions")
      .select("id, order_id, merchant_trade_no, amount, status")
      .eq("merchant_trade_no", result.merchantTradeNo)
      .maybeSingle();
    if (txError) throw new Error(txError.message);

    const tx = txData as
      | { id: string; order_id: string; merchant_trade_no: string; amount: number; status: string }
      | null;

    // 救援路徑：payment_transactions 沒有紀錄（例如 005 migration 之前送出的付款），
    // 用 MerchantTradeNo 反解回 order_no 找訂單。
    let orderId: string | null = tx?.order_id ?? null;
    if (!orderId) {
      const orderNo = orderNoFromMerchantTradeNo(result.merchantTradeNo);
      const { data: byNo, error: byNoError } = await admin
        .from("orders")
        .select("id")
        .eq("order_no", orderNo)
        .maybeSingle();
      if (byNoError) throw new Error(byNoError.message);
      orderId = (byNo as { id: string } | null)?.id ?? null;
      if (orderId) {
        console.warn(
          `[payment-notify] 查無 payment_transactions，改用 order_no=${orderNo} 對應`,
        );
      }
    }

    if (!orderId) {
      console.error(
        `[payment-notify] 找不到對應訂單 MerchantTradeNo=${result.merchantTradeNo}`,
      );
      // 回 0 會讓綠界重送，但這種情況重送也不會有結果；
      // 仍然回 0 是為了讓綠界後台留下「商店未接收」的紀錄，方便人工對帳。
      return ecpayAck(false, "Order Not Found");
    }

    // ── 4. 讀訂單並驗金額 ─────────────────────────────────
    const { data: orderData, error: orderError } = await admin
      .from("orders")
      .select(
        "id, order_no, status, buyer_id, referrer_id, subtotal, total, referrer_tier_snapshot, recipient",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!orderData) return ecpayAck(false, "Order Not Found");
    const order = orderData as OrderRecord;

    // 付款失敗（RtnCode ≠ 1）：記錄下來就好，不要碰訂單狀態。
    if (!result.paid) {
      console.warn(
        `[payment-notify] 付款未成功 order=${order.order_no} RtnCode=${result.rtnCode} ${result.rtnMsg}`,
      );
      if (tx) {
        await admin
          .from("payment_transactions")
          .update({
            status: "failed",
            gateway_trade_no: result.gatewayTradeNo || null,
            payment_type: result.paymentType || null,
            raw_notify: payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.id)
          .neq("status", "paid"); // 已成功的交易不要被後續失敗通知覆蓋
      }
      // 已確實收到並處理，回 1|OK 避免綠界一直重送。
      return ecpayAck(true);
    }

    // ⚠️ 金額比對：綠界回調的金額欄位是 TradeAmt（不是送出時的 TotalAmount）。
    // 對不上就絕對不能完成訂單 —— 這是「付 1 元收 3000 元商品」的唯一守門。
    const expectedAmount = tx?.amount ?? order.total;
    if (result.amount !== expectedAmount) {
      console.error(
        `[payment-notify] 金額不符 order=${order.order_no} ` +
          `ecpay=${result.amount} expected=${expectedAmount}`,
      );
      return ecpayAck(false, "Amount Mismatch");
    }

    // 已取消／已退款的訂單又收到付款：留紀錄、不要自動完成，交人工處理。
    if (order.status === "cancelled" || order.status === "refunded") {
      console.error(
        `[payment-notify] 訂單狀態為 ${order.status} 但收到付款成功回調 order=${order.order_no}，需人工處理`,
      );
      if (tx) {
        await admin
          .from("payment_transactions")
          .update({
            status: "paid",
            gateway_trade_no: result.gatewayTradeNo || null,
            payment_type: result.paymentType || null,
            raw_notify: payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.id);
      }
      return ecpayAck(true);
    }

    // ── 5. 冪等閘門①：payment_transactions pending → paid ──
    if (tx) {
      const { data: claimed, error: claimError } = await admin
        .from("payment_transactions")
        .update({
          status: "paid",
          gateway_trade_no: result.gatewayTradeNo || null,
          payment_type: result.paymentType || null,
          paid_at: new Date().toISOString(),
          raw_notify: payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tx.id)
        .neq("status", "paid")
        .select("id");
      if (claimError) throw new Error(claimError.message);
      if ((claimed ?? []).length === 0) {
        // 已經有人處理過這筆回調了。直接 ack，不要再發第二次購物金。
        console.log(
          `[payment-notify] 重複回調，已略過 order=${order.order_no} tradeNo=${result.gatewayTradeNo}`,
        );
        return ecpayAck(true);
      }
    }

    // ── 6. 標記訂單完成 ───────────────────────────────────
    const completedAt = new Date();
    const completedAtIso = completedAt.toISOString();
    if (order.status !== "completed") {
      const { error: markError } = await admin
        .from("orders")
        .update({
          status: "completed",
          completed_at: completedAtIso,
          paid_at: completedAtIso,
          payment_method: result.paymentType || null,
          payment_gateway_trade_no: result.gatewayTradeNo || null,
        })
        .eq("id", order.id);
      if (markError) throw new Error(markError.message);
    }

    // ── 7. 發推薦購物金（規則見 src/domain/storeCredit.ts）─────
    const credit = await issueReferralCredit(admin, order, completedAt);

    // ── 8. 通知推薦人（只在「這一輪真的發了」時才發簡訊）──────
    if (credit.issued && credit.amount > 0 && order.referrer_id) {
      await notifyReferrer(admin, order, credit.amount, result.gatewayTradeNo);
    }

    // ── 9. 開電子發票（失敗不影響付款結果）────────────────
    await issueInvoiceForOrder(admin, order);

    console.log(
      `[payment-notify] 完成 order=${order.order_no} amount=${result.amount} ` +
        `credit=${credit.amount} tradeNo=${result.gatewayTradeNo}` +
        (result.simulatePaid ? " (SimulatePaid)" : ""),
    );
    return ecpayAck(true);
  } catch (err) {
    console.error("[payment-notify] 處理失敗", err);
    // 回 0|... 讓綠界重送；靠上面的冪等閘門保證重送不會重複發錢。
    return ecpayAck(false, "Internal Error");
  }
});

// ─────────────────────────────────────────────────────────────
// 購物金
// ─────────────────────────────────────────────────────────────

/**
 * 依《ENSO 推薦制度規格》發放推薦購物金。
 * 規則（與 src/domain/storeCredit.ts 的 creditForCompletedOrder 完全一致）：
 *   • 沒有推薦人 → 不發
 *   • 推薦人身分不是 normal → 不發（金／銀卡只有可見度，不拿錢）
 *   • 金額 = order.subtotal × app_settings.referral_cashback_rate ÷ 100，四捨五入
 *   • 效期 1 年
 *
 * 快照來源：orders.referrer_tier_snapshot，由 placeOrder() 在下單時寫入。
 *
 * 歷史註記：該欄位曾被寫入「買家」而非推薦人的 member_tier，會讓購物金資格
 * 判斷錯人。已在 src/services/db/checkout.ts 的 fetchReferrerTier() 修正，
 * 並由 migration 006 清理既有資料（未完成訂單的錯誤快照設為 NULL，
 * 已完成的訂單只列出待人工核對的清單，不自動改動已發出的金額）。
 * 快照為 NULL 時本函式會退回查推薦人當下身分，所以清理後的舊訂單仍算得正確。
 */
async function issueReferralCredit(
  admin: SupabaseClient,
  order: OrderRecord,
  completedAt: Date,
): Promise<{ issued: boolean; amount: number }> {
  if (!order.referrer_id) return { issued: false, amount: 0 };

  // 冪等閘門②：這筆訂單是否已經發過 earn。
  const { data: existing, error: existingError } = await admin
    .from("store_credit_ledger")
    .select("id, amount")
    .eq("order_id", order.id)
    .eq("type", "earn")
    .limit(1);
  if (existingError) throw new Error(existingError.message);
  if ((existing ?? []).length > 0) {
    console.log(`[payment-notify] 購物金已發放過，略過 order=${order.order_no}`);
    return { issued: false, amount: 0 };
  }

  // 推薦人身分：優先用下單時的快照，沒有才查當下（舊訂單相容）。
  let tier = order.referrer_tier_snapshot;
  if (!tier) {
    const { data: refData, error: refError } = await admin
      .from("profiles")
      .select("member_tier")
      .eq("id", order.referrer_id)
      .maybeSingle();
    if (refError) throw new Error(refError.message);
    tier = (refData as { member_tier: string } | null)?.member_tier ?? null;
  }
  if (tier !== CREDIT_ELIGIBLE_TIER) return { issued: false, amount: 0 };

  const { data: settingData, error: settingError } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "referral_cashback_rate")
    .maybeSingle();
  if (settingError) throw new Error(settingError.message);
  const rawRate = (settingData as { value: unknown } | null)?.value;
  const ratePercent = typeof rawRate === "number" ? rawRate : Number(rawRate) || 0;
  if (ratePercent <= 0) return { issued: false, amount: 0 };

  const amount = Math.round((order.subtotal * ratePercent) / 100);
  if (amount <= 0) return { issued: false, amount: 0 };

  const { error: insertError } = await admin.from("store_credit_ledger").insert({
    member_id: order.referrer_id,
    type: "earn",
    amount,
    order_id: order.id,
    created_at: completedAt.toISOString(),
    expires_at: new Date(completedAt.getTime() + ONE_YEAR_MS).toISOString(),
  });

  if (insertError) {
    // 冪等閘門③：唯一索引擋下併發的第二次發放。這不是錯誤，是預期行為。
    if ((insertError as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      console.log(`[payment-notify] 併發重複發放被唯一索引擋下 order=${order.order_no}`);
      return { issued: false, amount: 0 };
    }
    throw new Error(insertError.message);
  }
  return { issued: true, amount };
}

// ─────────────────────────────────────────────────────────────
// 簡訊
// ─────────────────────────────────────────────────────────────

/**
 * 通知推薦人拿到購物金。
 * 簡訊失敗絕對不能讓整個回調失敗（否則綠界會一直重送），
 * 所以一律寫進 sms_log，由人工或後台補發。
 */
async function notifyReferrer(
  admin: SupabaseClient,
  order: OrderRecord,
  creditAmount: number,
  paymentReferenceId: string,
): Promise<void> {
  const { data: refProfile, error: refError } = await admin
    .from("profiles")
    .select("phone")
    .eq("id", order.referrer_id!)
    .maybeSingle();
  if (refError) {
    console.error("[payment-notify] 查推薦人電話失敗", refError.message);
    return;
  }
  const phone = (refProfile as { phone: string | null } | null)?.phone ?? null;

  // 訊息文字與 src/services/db/checkout.ts 的模擬版本保持一致，
  // 否則同一件事會出現兩種措辭。
  const message =
    `您推薦的訂單 ${order.order_no} 已完成，訂單金額 NT$${nt(order.subtotal)}，` +
    `您獲得推薦購物金 NT$${nt(creditAmount)}。`;

  if (!phone) {
    await admin.from("sms_log").insert({
      to_profile_id: order.referrer_id,
      to_phone: null,
      message,
      related_order_id: order.id,
      status: "failed",
      error_message: "推薦人沒有留手機號碼",
      payment_reference_id: paymentReferenceId || null,
    });
    return;
  }

  let sent;
  try {
    sent = await sendSms(
      { phone, message, clientId: order.order_no.replace(/-/g, "_") },
      loadMitakeConfig(),
    );
  } catch (err) {
    // loadMitakeConfig() 會在 secrets 沒設時丟錯 —— 記錄下來，不要吞掉。
    sent = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const { error: logError } = await admin.from("sms_log").insert({
    to_profile_id: order.referrer_id,
    to_phone: phone,
    message,
    related_order_id: order.id,
    status: sent.success ? "sent" : "failed",
    mitake_msgid: "msgid" in sent ? (sent.msgid ?? null) : null,
    error_message: sent.success ? null : (sent.error ?? "未知錯誤"),
    payment_reference_id: paymentReferenceId || null,
  });
  if (logError) console.error("[payment-notify] 寫 sms_log 失敗", logError.message);
  if (!sent.success) console.error("[payment-notify] 簡訊發送失敗", sent.error);
}

// ─────────────────────────────────────────────────────────────
// 電子發票
// ─────────────────────────────────────────────────────────────

/**
 * 開立電子發票。
 *
 * 目前 invoice.ts 是骨架：未設 ECPAY_INVOICE_ENABLED=true 時 issueB2CInvoice()
 * 會直接 throw。這裡把錯誤寫成 invoices.status='failed' + error_message，
 * **但不讓回調失敗** —— 付款是真的成功了，讓綠界一直重送只會更糟。
 * 後台可以用 invoices 這張表把「該開但沒開」的訂單撈出來重試。
 */
async function issueInvoiceForOrder(
  admin: SupabaseClient,
  order: OrderRecord,
): Promise<void> {
  // 冪等：已經開出號碼的就不要再開（重複開票要作廢，很麻煩）。
  const { data: existing, error: existingError } = await admin
    .from("invoices")
    .select("id, status")
    .eq("order_id", order.id)
    .maybeSingle();
  if (existingError) {
    console.error("[payment-notify] 查 invoices 失敗", existingError.message);
    return;
  }
  if ((existing as { status: string } | null)?.status === "issued") return;

  const { data: itemsData, error: itemsError } = await admin
    .from("order_items")
    .select("title, unit_price, qty")
    .eq("order_id", order.id);
  if (itemsError) {
    console.error("[payment-notify] 查 order_items 失敗", itemsError.message);
    return;
  }
  const items = (itemsData ?? []) as { title: string; unit_price: number; qty: number }[];

  const recipient = (order.recipient ?? {}) as Record<string, unknown>;
  const buyerName = String(recipient.name ?? "消費者");
  const buyerEmail = typeof recipient.email === "string" ? recipient.email : undefined;
  const buyerPhone = typeof recipient.phone === "string"
    ? recipient.phone.replace(/\D/g, "")
    : undefined;

  const invoiceRow: Record<string, unknown> = {
    order_id: order.id,
    provider: "ecpay",
    relate_number: order.order_no,
    amount: order.total,
    buyer_name: buyerName,
    buyer_email: buyerEmail ?? null,
    buyer_phone: buyerPhone ?? null,
  };

  if (!isInvoiceEnabled()) {
    // 沒啟用就明確記成 pending + 原因，不要假裝開過票。
    invoiceRow.status = "pending";
    invoiceRow.error_message = "電子發票尚未啟用（ECPAY_INVOICE_ENABLED ≠ true）";
    await upsertInvoice(admin, invoiceRow);
    return;
  }

  try {
    // ⚠️ 發票金額必須等於品項小計合計。運費要不要開進發票、
    //    要用哪個品項名稱，是會計政策問題 —— 這裡先把運費當一個品項列進去，
    //    正式上線前請與會計確認。詳見 README「發票」一節。
    const invoiceItems = items.map((i) => ({
      name: i.title,
      count: i.qty,
      word: "個",
      price: i.unit_price,
      amount: i.unit_price * i.qty,
    }));
    const itemsSum = invoiceItems.reduce((s, i) => s + i.amount, 0);
    if (itemsSum !== order.total) {
      const diff = order.total - itemsSum;
      invoiceItems.push({
        name: diff >= 0 ? "運費" : "折扣",
        count: 1,
        word: "式",
        price: diff,
        amount: diff,
      });
    }

    const issued = await issueB2CInvoice(
      {
        relateNumber: order.order_no,
        buyerName,
        buyerEmail,
        buyerPhone,
        salesAmount: order.total,
        items: invoiceItems,
      },
      loadInvoiceConfig(),
    );
    invoiceRow.status = "issued";
    invoiceRow.invoice_number = issued.invoiceNumber;
    invoiceRow.invoice_date = issued.invoiceDate;
    invoiceRow.random_number = issued.randomNumber;
    invoiceRow.response_payload = issued.raw;
    invoiceRow.issued_at = new Date().toISOString();
    invoiceRow.error_message = null;
    await upsertInvoice(admin, invoiceRow);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[payment-notify] 開票失敗 order=${order.order_no}：${message}`);
    invoiceRow.status = "failed";
    invoiceRow.error_message = message;
    await upsertInvoice(admin, invoiceRow);
  }
}

async function upsertInvoice(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from("invoices")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "order_id" });
  if (error) console.error("[payment-notify] 寫 invoices 失敗", error.message);
}
