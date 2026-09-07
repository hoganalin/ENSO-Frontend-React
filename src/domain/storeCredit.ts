// src/domain/storeCredit.ts
// ─────────────────────────────────────────────────────────────
// 購物金（Store Credit）— 依《ENSO 推薦制度規格》第 4~6 節。
// 規則：
//   • 回饋依「推薦人當下身分」：只有『普通會員』推薦人，才對被推薦人的
//     每筆完成訂單獲得購物金；金／銀卡只有可見度、不拿錢。
//   • 金額 = 商品小計（折扣後、不含運費）× 全站購物金比例(%)。
//   • 訂單完成時發放；退款時回沖；可為負餘額（之後賺回補平，不主動追討）。
//   • 效期 1 年（以先進先出計算過期）。
// 純邏輯、無框架相依、不呼叫 Date.now()（時間由參數傳入，方便測試）。
// ─────────────────────────────────────────────────────────────

export type MemberTier = "normal" | "silver" | "gold";

export interface Referrer {
  id: string;
  tier: MemberTier;
}

export interface CompletedOrder {
  id: string;
  buyerId: string;
  /** 商品小計（折扣後、不含運費） */
  subtotal: number;
}

export type CreditTxType = "earn" | "spend" | "reverse" | "expire";

export interface CreditTx {
  id?: string;
  memberId: string;
  type: CreditTxType;
  /** 一律正值；方向（加/減）由 type 決定 */
  amount: number;
  /** earn／reverse 對應的訂單 */
  orderId?: string;
  /** epoch 毫秒 */
  createdAt: number;
  /** 僅 earn：createdAt + 1 年 */
  expiresAt?: number;
}

export const CREDIT_ELIGIBLE_TIER: MemberTier = "normal";
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * 一筆完成訂單，其推薦人可獲得多少購物金。
 * 只有推薦人「當下身分」為普通會員時才有；金／銀卡回傳 0。
 */
export function creditForCompletedOrder(
  order: CompletedOrder,
  referrer: Referrer | null,
  ratePercent: number,
): number {
  if (!referrer) return 0;
  if (referrer.tier !== CREDIT_ELIGIBLE_TIER) return 0; // 金銀卡只有可見度
  if (ratePercent <= 0) return 0;
  return Math.round((order.subtotal * ratePercent) / 100);
}

/** 訂單完成 → 產生一筆 earn 交易（若不符資格回傳 null）。 */
export function earnTxForOrder(
  order: CompletedOrder,
  referrer: Referrer | null,
  ratePercent: number,
  completedAt: number,
): CreditTx | null {
  const amount = creditForCompletedOrder(order, referrer, ratePercent);
  if (amount <= 0 || !referrer) return null;
  return {
    memberId: referrer.id,
    type: "earn",
    amount,
    orderId: order.id,
    createdAt: completedAt,
    expiresAt: completedAt + ONE_YEAR_MS,
  };
}

/** 退款 → 針對某訂單回沖對應的 earn（找不到則回傳 null）。 */
export function reverseTxForOrder(
  orderId: string,
  ledger: CreditTx[],
  reversedAt: number,
): CreditTx | null {
  const earn = ledger.find((t) => t.type === "earn" && t.orderId === orderId);
  if (!earn) return null;
  return {
    memberId: earn.memberId,
    type: "reverse",
    amount: earn.amount,
    orderId,
    createdAt: reversedAt,
  };
}

/** 使用購物金 → 產生一筆 spend 交易。 */
export function spendTx(memberId: string, amount: number, spentAt: number): CreditTx {
  return { memberId, type: "spend", amount, createdAt: spentAt };
}

const sign = (t: CreditTx): number => (t.type === "earn" ? t.amount : -t.amount);

/** 現金流餘額：earn 加、spend/reverse/expire 減。允許為負。 */
export function balanceOf(memberId: string, ledger: CreditTx[]): number {
  return ledger
    .filter((t) => t.memberId === memberId)
    .reduce((sum, t) => sum + sign(t), 0);
}

/**
 * 計算「已過期、且尚未被使用」的購物金金額（先進先出）。
 * 用來由排程產生 expire 交易；此函式本身不改動 ledger。
 * spend/reverse/expire 皆視為從最舊的 earn 依序扣抵。
 */
export function pendingExpiryAmount(
  memberId: string,
  ledger: CreditTx[],
  now: number,
): number {
  const mine = ledger.filter((t) => t.memberId === memberId);
  const lots = mine
    .filter((t) => t.type === "earn")
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((t) => ({ remaining: t.amount, expiresAt: t.expiresAt ?? Infinity }));

  // 已扣抵總額（花費 + 回沖 + 已過期）依 FIFO 從最舊的 lot 扣起
  let consumed = mine
    .filter((t) => t.type !== "earn")
    .reduce((sum, t) => sum + t.amount, 0);

  for (const lot of lots) {
    if (consumed <= 0) break;
    const take = Math.min(lot.remaining, consumed);
    lot.remaining -= take;
    consumed -= take;
  }

  return lots
    .filter((lot) => lot.remaining > 0 && lot.expiresAt <= now)
    .reduce((sum, lot) => sum + lot.remaining, 0);
}

/** 產生一筆 expire 交易。 */
export function expireTx(memberId: string, amount: number, now: number): CreditTx {
  return { memberId, type: "expire", amount, createdAt: now };
}
