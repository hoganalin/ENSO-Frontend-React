import { describe, it, expect } from "vitest";

import {
  refereesOf,
  referralVisibility,
  canSeeReferees,
  findByReferralCode,
  demoMembers,
  type OrderRecord,
} from "@/domain/referral";

// 推薦鏈：林雅琴(金卡,A) → 陳志明(普通,B) → 王小美(普通,C)
const orders: OrderRecord[] = [
  { id: "#1", buyerId: "B", subtotal: 1000, createdAt: 1 },
  { id: "#2", buyerId: "B", subtotal: 500, createdAt: 2 },
  { id: "#3", buyerId: "C", subtotal: 2000, createdAt: 3 },
];

describe("refereesOf — 單層直接推薦", () => {
  it("A 只看到直接推薦的 B（不含 B 的下線 C）", () => {
    const referees = refereesOf("A", demoMembers).map((m) => m.id);
    expect(referees).toEqual(["B"]);
  });
});

describe("canSeeReferees — 只有金／銀卡有可見度", () => {
  it("金卡可見、普通不可見", () => {
    expect(canSeeReferees(demoMembers[0])).toBe(true); // 金卡 A
    expect(canSeeReferees(demoMembers[1])).toBe(false); // 普通 B
  });
});

describe("referralVisibility — 金卡的我的推薦", () => {
  it("列出名下被推薦人、各自訂單與消費總額", () => {
    const view = referralVisibility("A", demoMembers, orders);
    expect(view.refereeCount).toBe(1);
    expect(view.referees[0].member.id).toBe("B");
    expect(view.referees[0].orders).toHaveLength(2);
    expect(view.referees[0].totalSpent).toBe(1500); // 1000 + 500
    expect(view.networkSpent).toBe(1500);
  });
});

describe("findByReferralCode", () => {
  it("用推薦碼找到推薦人", () => {
    expect(findByReferralCode("ENSO-A8F3G", demoMembers)?.id).toBe("A");
    expect(findByReferralCode("不存在", demoMembers)).toBeNull();
  });
});
