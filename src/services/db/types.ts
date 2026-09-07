// src/services/db/types.ts
// Supabase 資料表的 row 型別（對齊 supabase/schema.sql v2）。
import type { MemberTier } from "@/domain/storeCredit";

export type UserRole =
  | "customer"
  | "referral_partner"
  | "distributor"
  | "support"
  | "warehouse"
  | "marketing"
  | "finance"
  | "admin";

export type OrderStatus =
  | "pending"
  | "paid"
  | "shipped"
  | "completed"
  | "cancelled"
  | "refunded";

export type CreditTxType = "earn" | "spend" | "reverse" | "expire";
export type PromoGroupDb = "coupon" | "order" | "shipping" | "gift" | "bundle";

export interface ProfileRow {
  id: string;
  name: string | null;
  phone: string | null;
  role: UserRole;
  member_tier: MemberTier;
  referrer_id: string | null;
  referral_code: string | null;
  created_at: string;
}

export interface ProductRow {
  id: string;
  title: string;
  category: string | null;
  price: number;
  origin_price: number | null;
  unit: string | null;
  description: string | null;
  content: string | null;
  image_url: string | null;
  images_url: string[];
  is_enabled: boolean;
  inventory: number;
  top_smell: string | null;
  heart_smell: string | null;
  base_smell: string | null;
  scenes: string[];
  created_at: string;
}

export interface OrderRow {
  id: string;
  order_no: string;
  buyer_id: string | null;
  referrer_id: string | null;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  status: OrderStatus;
  applied_promos: unknown[];
  recipient: unknown;
  created_at: string;
  completed_at: string | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  title: string;
  unit_price: number;
  qty: number;
}

export interface CreditRow {
  id: string;
  member_id: string;
  type: CreditTxType;
  amount: number;
  order_id: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface PromotionRow {
  id: string;
  code: string | null;
  name: string;
  kind: string | null;
  promo_group: PromoGroupDb;
  priority: number;
  is_auto: boolean;
  is_active: boolean;
  conditions: Record<string, unknown>;
  effect: Record<string, unknown>;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}
