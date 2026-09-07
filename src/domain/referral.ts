// src/domain/referral.ts
// ─────────────────────────────────────────────────────────────
// 推薦關係與可見度 — 依《ENSO 推薦制度規格》。
//   • 單層：每個會員存 referrerId（直接推薦人），註冊時綁定、永久固定。
//   • 金／銀卡推薦人享「可見度」：看得到名下被推薦人買了什麼、消費總額。
//   • 金錢回饋（購物金）不在這裡 —— 見 storeCredit.ts。
// 純邏輯、無框架相依。
// ─────────────────────────────────────────────────────────────

import type { MemberTier } from "./storeCredit";

export interface Member {
  id: string;
  name: string;
  phone: string;
  tier: MemberTier; // 'normal' | 'silver' | 'gold'
  /** 直接推薦人；null 表示無。註冊時綁定、永久固定（單層） */
  referrerId: string | null;
  referralCode: string;
}

export interface OrderRecord {
  id: string;
  buyerId: string;
  subtotal: number;
  createdAt: number;
}

/** 金／銀卡才享有可見度；普通會員只看得到自己的購物金（不在此函式）。 */
export function canSeeReferees(member: Member): boolean {
  return member.tier === "silver" || member.tier === "gold";
}

/** 某人直接推薦的會員（單層）。 */
export function refereesOf(referrerId: string, members: Member[]): Member[] {
  return members.filter((m) => m.referrerId === referrerId);
}

export interface RefereeVisibility {
  member: Member;
  orders: OrderRecord[];
  totalSpent: number;
}

export interface ReferralView {
  referrerId: string;
  referees: RefereeVisibility[];
  refereeCount: number;
  networkSpent: number;
}

/**
 * 金／銀卡的「我的推薦」可見度：名下每位被推薦人 + 各自訂單 + 消費總額。
 * 就算被推薦人已升等，仍保留在名單中（關係永久）。
 */
export function referralVisibility(
  referrerId: string,
  members: Member[],
  orders: OrderRecord[],
): ReferralView {
  const referees = refereesOf(referrerId, members).map((member) => {
    const memberOrders = orders.filter((o) => o.buyerId === member.id);
    return {
      member,
      orders: memberOrders,
      totalSpent: memberOrders.reduce((sum, o) => sum + o.subtotal, 0),
    };
  });

  return {
    referrerId,
    referees,
    refereeCount: referees.length,
    networkSpent: referees.reduce((sum, r) => sum + r.totalSpent, 0),
  };
}

/** 依 email/推薦碼找出推薦人（前端註冊帶碼時用）。 */
export function findByReferralCode(code: string, members: Member[]): Member | null {
  return members.find((m) => m.referralCode === code) ?? null;
}

// 示範用種子：推薦鏈 林雅琴(金卡) → 陳志明(普通) → 王小美(普通)
export const demoMembers: Member[] = [
  { id: "A", name: "林雅琴", phone: "0912-xxx-321", tier: "gold",   referrerId: null, referralCode: "ENSO-A8F3G" },
  { id: "B", name: "陳志明", phone: "0933-xxx-654", tier: "normal", referrerId: "A",  referralCode: "ENSO-B2K9M" },
  { id: "C", name: "王小美", phone: "0955-xxx-987", tier: "normal", referrerId: "B",  referralCode: "ENSO-C7P4X" },
];
