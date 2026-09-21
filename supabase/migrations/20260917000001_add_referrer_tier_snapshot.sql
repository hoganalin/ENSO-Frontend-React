-- Migration: Add referrer_tier_snapshot to orders table
-- Purpose: Store the referrer's tier at the time of purchase for accurate audit trail
-- Date: 2026-09-06

-- 補 IF NOT EXISTS：其餘 migration 都可重複執行，只有這支不行，
-- 導致整包重跑（例如重建環境、或把 schema + 001~006 串成一次性建置腳本時）
-- 會在這裡中斷。欄位說明由 006 修正為正確的語意。
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS referrer_tier_snapshot member_tier DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_referrer_tier_snapshot 
  ON public.orders(referrer_tier_snapshot);

COMMENT ON COLUMN public.orders.referrer_tier_snapshot IS 
  'Snapshot of referrer member tier at time of order completion (normal/silver/gold). Used for accurate purchase credit calculation without drift when referrer tier changes.';
