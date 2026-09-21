/** Subscription and distributor rules shared by checkout previews and tests. */
export interface MembershipSnapshot {
  role: string;
  subscriptionActive: boolean;
  subscriptionExpiresAt?: string | null;
  distributorDiscountRate?: number | null;
}

export function hasActiveSubscription(snapshot: MembershipSnapshot, now = new Date()): boolean {
  if (!snapshot.subscriptionActive) return false;
  if (!snapshot.subscriptionExpiresAt) return true;
  const expiry = Date.parse(snapshot.subscriptionExpiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

/** Only distributors with an active subscription receive the configured rate. */
export function distributorDiscount(
  subtotal: number,
  snapshot: MembershipSnapshot,
  now = new Date(),
): number {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || snapshot.role !== "distributor") return 0;
  if (!hasActiveSubscription(snapshot, now)) return 0;
  const rate = Number(snapshot.distributorDiscountRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.min(subtotal, Math.floor(subtotal * Math.min(rate, 100) / 100));
}

export function canUseDistributorBenefits(snapshot: MembershipSnapshot, now = new Date()): boolean {
  return snapshot.role === "distributor" && hasActiveSubscription(snapshot, now);
}

