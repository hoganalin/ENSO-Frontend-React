// src/services/db/checkout.ts
// 結帳流程 orchestration：算金額 → 建訂單 → 完成發購物金。
// 純金額計算在 domain/orderTotals.ts（可測、不碰 DB）。
import {
  computeOrderTotals,
  type CheckoutItem,
  type OrderTotals,
} from "@/domain/orderTotals";
import type { MemberContext } from "@/domain/promotions";
import type { MemberTier, Referrer } from "@/domain/storeCredit";
import { supabase } from "@/lib/supabase";

import { getMemberContext } from "./memberContext";
import { createOrder, markOrderCompleted, type NewOrderItem } from "./orders";
import { listActivePromotions } from "./promotions";
import { issueCreditForCompletedOrder } from "./storeCredit";
import type { OrderRow, ProfileRow } from "./types";

export type { CheckoutItem, OrderTotals } from "@/domain/orderTotals";

/**
 * 讀取後台活動後算金額（實際結帳用）。
 *
 * member 可以只傳等級字串（生日／首購／回購類活動會因資訊不足而不成立），
 * 或傳完整的 MemberContext。購物車試算與結帳務必傳同一份情境，
 * 否則畫面金額會與寫進 DB 的金額不一致。
 */
export async function buildOrderTotals(
  items: CheckoutItem[],
  member: MemberTier | MemberContext,
  couponCode: string | null,
  couponStacksOrder = true,
): Promise<OrderTotals> {
  const promos = await listActivePromotions();
  return computeOrderTotals(items, member, promos, couponCode, couponStacksOrder);
}

export interface PlaceOrderParams {
  buyerId: string;
  items: CheckoutItem[];
  memberTier: MemberTier;
  couponCode?: string | null;
  recipient: unknown;
  /**
   * 購物車試算時用的會員情境。傳進來可省一次查詢，
   * 也保證「畫面看到的折扣」與「寫進 DB 的折扣」出自同一份情境。
   */
  memberContext?: MemberContext;
}

/**
 * 取得「推薦人」下單當下的會員等級，寫進 orders.referrer_tier_snapshot。
 *
 * 只收 referrerId —— 刻意不收整個 profile 或 buyerId，避免再次把買家的
 * 身分存成推薦人的快照（見 placeOrder 內的說明）。
 * 沒有推薦人回 null；查不到也回 null，讓 completeOrder 退回查當下身分。
 */
async function fetchReferrerTier(referrerId: string | null): Promise<MemberTier | null> {
  if (!referrerId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("member_tier")
    .eq("id", referrerId)
    .maybeSingle();

  if (error) {
    // 快照取不到不該擋住下單：留 null，完成訂單時會查推薦人當下身分。
    console.error("[checkout] 推薦人身分快照讀取失敗：", error.message);
    return null;
  }
  return (data as { member_tier: MemberTier } | null)?.member_tier ?? null;
}

/** 建立訂單（pending）：算金額 + 推薦歸戶 + 寫入 orders/order_items。 */
export async function placeOrder(params: PlaceOrderParams): Promise<OrderRow> {
  const memberContext =
    params.memberContext ??
    (await getMemberContext(params.buyerId, params.memberTier));

  const totals = await buildOrderTotals(
    params.items,
    memberContext,
    params.couponCode ?? null,
  );

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("referrer_id")
    .eq("id", params.buyerId)
    .single();
  if (error) throw new Error(error.message);
  const referrerId = (profile as { referrer_id: string | null }).referrer_id;

  // 推薦人下單當下的身分快照。
  //
  // ⚠️ 這裡曾經有一個會算錯錢的 bug：原本查的是「買家」的 member_tier
  // （`profiles.eq("id", buyerId).member_tier`），卻存進 referrer_tier_snapshot。
  // 購物金資格就是看這個欄位（只有 normal 身分的推薦人能拿），所以錯得兩邊都會痛：
  //   • 買家 normal、推薦人金卡 → 快照存 normal → 金卡被錯發購物金
  //   • 買家金卡、推薦人 normal → 快照存 gold → 有資格的人被錯扣
  // 現在改成用 referrerId 去查，而且獨立成一支只收 referrerId 的函式，
  // 讓「傳錯人」在型別與命名上就說不通。
  const referrerTierSnapshot = await fetchReferrerTier(referrerId);

  const orderItems: NewOrderItem[] = params.items.map((i) => ({
    productId: i.productId,
    title: i.title,
    unitPrice: i.unitPrice,
    qty: i.qty,
  }));

  return createOrder({
    buyerId: params.buyerId,
    referrerId,
    items: orderItems,
    subtotal: totals.subtotal,
    discount: totals.discount,
    shippingFee: totals.shippingFee,
    total: totals.total,
    appliedPromos: totals.appliedPromos,
    recipient: params.recipient,
    referrerTierSnapshot,
  });
}

export interface CompleteOrderResult {
  order: OrderRow;
  /** 發出的購物金（0 = 未發，例如推薦人是金銀卡或無推薦人） */
  creditIssued: number;
  /** 是否是冪等重複調用（已發過購物金） */
  isIdempotent: boolean;
}

/**
 * 付款成功後呼叫：標記完成 → 依「推薦人當下身分」發購物金 → 有發則記通知簡訊（模擬）。
 * 🔧 漏洞 1 修復：添加冪等性檢查，防止重複發放購物金
 */
export async function completeOrder(orderId: string): Promise<CompleteOrderResult> {
  // 🔧 修復 1.1：先查詢訂單，檢查是否已完成
  const { data: existingOrder, error: getError } = await supabase
    .from("orders")
    .select("id, status, referrer_id, buyer_id, subtotal, referrer_tier_snapshot")
    .eq("id", orderId)
    .single();
  
  if (getError) throw new Error(getError.message);
  const order = existingOrder as OrderRow & { referrer_tier_snapshot: string | null };
  
  // 🔧 修復 1.2：如果訂單已完成，檢查購物金是否已發放
  if (order.status === "completed") {
    const { data: existingCredit, error: creditCheckError } = await supabase
      .from("store_credit_ledger")
      .select("id")
      .eq("order_id", orderId)
      .eq("type", "earn")
      .limit(1);
    
    if (creditCheckError) throw new Error(creditCheckError.message);
    
    // 購物金已發放過，返回冪等結果
    if (existingCredit && existingCredit.length > 0) {
      return {
        order: order as OrderRow,
        creditIssued: 0,
        isIdempotent: true, // 標記為冪等重複調用
      };
    }
  }

  const completedAtMs = Date.now();
  const completedOrder = await markOrderCompleted(orderId, new Date(completedAtMs).toISOString());

  if (!completedOrder.referrer_id) return { order: completedOrder, creditIssued: 0, isIdempotent: false };

  // 🔧 修復 2：使用快照身分而非當下身分（如果快照存在）
  const referrerTierSnapshot = (completedOrder as any).referrer_tier_snapshot;
  
  // 推薦人身分：優先使用快照，否則查詢當下身分
  let referrer: Referrer;
  if (referrerTierSnapshot) {
    // 使用快照
    referrer = { id: completedOrder.referrer_id, tier: referrerTierSnapshot };
  } else {
    // 查詢當下身分（舊版本相容性）
    const { data: refData, error } = await supabase
      .from("profiles")
      .select("id, member_tier, phone")
      .eq("id", completedOrder.referrer_id)
      .single();
    if (error) throw new Error(error.message);
    const ref = refData as Pick<ProfileRow, "id" | "member_tier" | "phone">;
    referrer = { id: ref.id, tier: ref.member_tier };
  }

  const creditRow = await issueCreditForCompletedOrder(
    { id: completedOrder.id, buyerId: completedOrder.buyer_id ?? "", subtotal: completedOrder.subtotal, referrer },
    completedAtMs,
  );
  if (!creditRow) return { order: completedOrder, creditIssued: 0, isIdempotent: false };

  // 通知推薦人（demo 模擬簡訊；實戰改由後端呼叫簡訊商）
  const { data: refProfile, error: refError } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", completedOrder.referrer_id)
    .single();
  
  if (!refError && refProfile) {
    await supabase.from("sms_log").insert({
      to_profile_id: completedOrder.referrer_id,
      to_phone: (refProfile as any).phone,
      message: `您推薦的訂單 ${completedOrder.order_no} 已完成，訂單金額 NT$${completedOrder.subtotal.toLocaleString()}，您獲得推薦購物金 NT$${creditRow.amount.toLocaleString()}。`,
      related_order_id: completedOrder.id,
      status: "sent",
    });
  }

  return { order: completedOrder, creditIssued: creditRow.amount, isIdempotent: false };
}

/**
 * 🔧 漏洞 3 修復：帶重試機制的訂單完成
 * 確保訂單狀態和購物金發放保持一致
 */
export async function completeOrderWithRetry(
  orderId: string,
  maxRetries = 3,
): Promise<CompleteOrderResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await completeOrder(orderId);
    } catch (error) {
      lastError = error as Error;
      
      // 檢查是否是冪等錯誤（已發放過），則直接返回
      if (lastError.message.includes("UNIQUE violation") || lastError.message.includes("Idempotent")) {
        return {
          order: { id: orderId } as unknown as OrderRow,
          creditIssued: 0,
          isIdempotent: true,
        };
      }

      // 如果還有重試次數，等待後重試
      if (attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt - 1) * 100; // 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
    }
  }

  throw lastError || new Error("Failed to complete order after retries");
}

/**
 * 🔧 漏洞 3 修復：補償機制
 * 如果購物金發放失敗，標記訂單需要補償
 */
export async function compensateFailedCreditIssuance(orderId: string): Promise<void> {
  // 查詢訂單
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("status", "completed")
    .single();

  if (orderError || !order) return;

  // 檢查是否已發放購物金
  const { data: credit, error: creditError } = await supabase
    .from("store_credit_ledger")
    .select("id")
    .eq("order_id", orderId)
    .eq("type", "earn");

  if (creditError || (credit && credit.length > 0)) return;

  // 重新發放購物金
  const { data: refData } = await supabase
    .from("profiles")
    .select("id, member_tier")
    .eq("id", (order as any).referrer_id)
    .single();

  if (refData) {
    const referrer: Referrer = {
      id: (refData as any).id,
      tier: (refData as any).member_tier,
    };

    await issueCreditForCompletedOrder(
      {
        id: orderId,
        buyerId: (order as any).buyer_id,
        subtotal: (order as any).subtotal,
        referrer,
      },
      Date.now(),
    );
  }
}
