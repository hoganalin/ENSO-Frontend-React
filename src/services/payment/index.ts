// ⛔ 已停用（Phase 3）—— 請勿 import
// handlePaymentSuccess() 這條「瀏覽器驗簽後自己完成訂單」的路線已廢棄：
// 訂單完成的唯一真實來源是 supabase/functions/payment-notify。
// 前端請改用 src/services/payment/client.ts。
// src/services/payment/index.ts — 支付 + 簡訊整合

import { completeOrder } from "@/services/db/checkout";
import { supabase } from "@/lib/supabase";
import { getECPayClient } from "./ecpay";
import { getMitakeSmsClient } from "../sms/mitake";
import type { ECPayPaymentParams } from "./ecpay";

/**
 * 初始化支付流程
 * 1. 訂單已建立 (pending)
 * 2. 引導使用者到 ECPay 支付頁面
 */
export async function initializePayment(
  orderId: string,
  amount: number,
  itemName: string,
  options?: {
    returnUrl?: string;
    notifyUrl?: string;
  }
) {
  const client = getECPayClient();

  // 確保金額是整數
  const roundedAmount = Math.round(amount);

  const paymentParams: ECPayPaymentParams = {
    orderId,
    amount: roundedAmount,
    itemName: itemName || "ENSO 線香購物",
    itemDescription: "感謝您的購買",
    returnUrl: options?.returnUrl || `${window.location.origin}/payment/success`,
    notifyUrl: options?.notifyUrl || `${window.location.origin}/api/payment/notify`,
    clientBackUrl: `${window.location.origin}/order/${orderId}`,
    paymentMethod: "ALL", // 提供所有支付方式
  };

  return client.buildCheckoutForm(paymentParams);
}

/**
 * 處理支付成功回調
 * 1. 驗證 ECPay 簽章
 * 2. 完成訂單 → 發購物金
 * 3. 發送簡訊給分享者
 */
export async function handlePaymentSuccess(data: Record<string, string>) {
  const client = getECPayClient();
  const smsClient = getMitakeSmsClient();

  // 驗證簽章
  const verification = client.verifyPaymentResult(data);
  if (!verification.isValid) {
    console.error("❌ 支付驗證失敗:", verification.message);
    return {
      success: false,
      error: verification.message || "支付驗證失敗",
      orderNo: verification.orderNo,
    };
  }

  const orderId = verification.orderNo!;

  try {
    // 完成訂單 → 發購物金
    const result = await completeOrder(orderId);

    // 如果是冪等調用（已發過），直接返回
    if (result.isIdempotent) {
      return {
        success: true,
        message: "訂單已完成（冪等調用）",
        orderId,
        creditIssued: 0,
      };
    }

    // 發送簡訊給分享者（推薦人）
    if (result.order.referrer_id) {
      const referrerData = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", result.order.referrer_id)
        .single();

      if (referrerData.data?.phone) {
        const message = `您推薦的訂單 ${result.order.order_no} 已完成，訂單金額 NT$${result.order.subtotal.toLocaleString()}，您獲得推薦購物金 NT$${result.creditIssued.toLocaleString()}。`;

        const smsResult = await smsClient.sendSms({
          phone: referrerData.data.phone as string,
          message,
        });

        if (smsResult.success) {
          // 記錄簡訊日誌
          await supabase.from("sms_log").insert({
            to_profile_id: result.order.referrer_id,
            to_phone: referrerData.data.phone,
            message,
            related_order_id: orderId,
            status: "sent",
            mitake_msgid: smsResult.msgid, // 三竹訊息 ID
          });

          console.log("✅ 簡訊已發送:", smsResult.msgid);
        } else {
          console.error("❌ 簡訊發送失敗:", smsResult.error);
          // 記錄失敗日誌，但不中斷流程
          await supabase.from("sms_log").insert({
            to_profile_id: result.order.referrer_id,
            to_phone: referrerData.data.phone,
            message,
            related_order_id: orderId,
            status: "failed",
            error_message: smsResult.error,
          });
        }
      }
    }

    return {
      success: true,
      message: "訂單已完成並發送通知",
      orderId,
      creditIssued: result.creditIssued,
      transactionId: verification.transactionId,
      paymentMethod: verification.paymentMethod,
    };
  } catch (error) {
    console.error("❌ 訂單完成失敗:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "訂單完成失敗",
      orderId,
    };
  }
}

/**
 * 測試簡訊發送（管理用）
 */
export async function sendTestSms(phone: string, message: string) {
  const smsClient = getMitakeSmsClient();
  return smsClient.sendSms({ phone, message });
}

export { getECPayClient, type ECPayPaymentParams } from "./ecpay";
export { getMitakeSmsClient } from "../sms/mitake";
