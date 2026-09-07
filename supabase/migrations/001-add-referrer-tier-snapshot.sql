-- Migration: Add referrer_tier_snapshot to orders table
-- Purpose: Store the referrer's tier at the time of purchase for accurate audit trail
-- Date: 2026-09-06

ALTER TABLE public.orders
ADD COLUMN referrer_tier_snapshot member_tier DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_referrer_tier_snapshot 
  ON public.orders(referrer_tier_snapshot);

COMMENT ON COLUMN public.orders.referrer_tier_snapshot IS 
  'Snapshot of referrer member tier at time of order completion (normal/silver/gold). Used for accurate purchase credit calculation without drift when referrer tier changes.';
