import { describe, expect, it } from "vitest";
import { canUseDistributorBenefits, distributorDiscount, hasActiveSubscription } from "@/domain/membershipRules";

const future = "2030-01-01T00:00:00.000Z";
const past = "2020-01-01T00:00:00.000Z";
const now = new Date("2026-09-18T00:00:00.000Z");

describe("subscription and distributor rules", () => {
  it("expires a subscription at its expiry timestamp", () => {
    expect(hasActiveSubscription({ role: "customer", subscriptionActive: true, subscriptionExpiresAt: future }, now)).toBe(true);
    expect(hasActiveSubscription({ role: "customer", subscriptionActive: true, subscriptionExpiresAt: past }, now)).toBe(false);
    expect(hasActiveSubscription({ role: "customer", subscriptionActive: true, subscriptionExpiresAt: null }, now)).toBe(true);
  });

  it("limits discounts to active distributors", () => {
    const member = { role: "distributor", subscriptionActive: true, subscriptionExpiresAt: future, distributorDiscountRate: 15 };
    expect(distributorDiscount(1000, member, now)).toBe(150);
    expect(canUseDistributorBenefits(member, now)).toBe(true);
    expect(distributorDiscount(1000, { ...member, role: "customer" }, now)).toBe(0);
    expect(distributorDiscount(1000, { ...member, subscriptionExpiresAt: past }, now)).toBe(0);
  });

  it("clamps malformed rates and discount to subtotal", () => {
    expect(distributorDiscount(999, { role: "distributor", subscriptionActive: true, distributorDiscountRate: 200 }, now)).toBe(999);
    expect(distributorDiscount(999, { role: "distributor", subscriptionActive: true, distributorDiscountRate: -1 }, now)).toBe(0);
  });
});
