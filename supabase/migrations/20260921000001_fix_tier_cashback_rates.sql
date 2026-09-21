-- Migration: 20260921000001_fix_tier_cashback_rates.sql
-- 修正購物金規則：普通會員不發，銀卡 10%、金卡 20%（管理者可調整）
-- 取代舊的單一 referral_cashback_rate 規格。

-- 1. 新增銀卡 / 金卡比例設定鍵（若已存在則更新）
insert into public.app_settings(key, value)
  values
    ('silver_cashback_rate', '10'::jsonb),   -- 銀卡推薦購物金比例(%)
    ('gold_cashback_rate',   '20'::jsonb)    -- 金卡推薦購物金比例(%)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

-- 2. 替換 settle_ecpay_payment — 修正 tier 判斷與分級比例
--    舊邏輯：tier='normal' → 拿 referral_cashback_rate
--    新邏輯：tier='silver' → 拿 silver_cashback_rate；tier='gold' → 拿 gold_cashback_rate；normal → 不發
create or replace function public.settle_ecpay_payment(
  p_merchant_trade_no text,
  p_payment_type       text,
  p_trade_amt          integer,
  p_rtn_code           text,
  p_simulate           boolean  default false,
  p_raw                jsonb    default '{}'
) returns jsonb
language plpgsql security definer
as $$
declare
  ord       public.orders%rowtype;
  stamp     timestamptz := now();
  tier      text;
  rate      numeric := 0;
  credit    integer := 0;
  existing_credit integer;
begin
  -- 取訂單
  select * into ord from public.orders
  where merchant_trade_no = p_merchant_trade_no
  limit 1;

  if not found then
    return jsonb_build_object('outcome','not_found');
  end if;

  -- 已失敗的訂單直接拒絕
  if ord.payment_status = 'failed' then
    return jsonb_build_object('outcome','failed','order',to_jsonb(ord),'credit',0);
  end if;

  -- 冪等：已結帳過則直接回傳
  if ord.payment_status = 'paid' then
    return jsonb_build_object('outcome','duplicate','order',to_jsonb(ord),'credit',0);
  end if;

  -- 金額不符（非模擬模式）
  if not p_simulate and ord.total <> p_trade_amt then
    return jsonb_build_object('outcome','review_required','order',to_jsonb(ord),'credit',0);
  end if;

  -- 更新訂單為 paid
  update public.orders
  set payment_status = 'paid',
      payment_type   = p_payment_type,
      paid_at        = stamp,
      ecpay_raw      = p_raw
  where id = ord.id;

  -- 發放推薦購物金（銀卡/金卡推薦人才發；普通會員不發）
  select amount into existing_credit
  from public.store_credit_ledger
  where order_id = ord.id and type = 'earn'
  limit 1;

  if existing_credit is null and ord.referrer_id is not null then
    tier := ord.referrer_tier_snapshot;
    if tier is null then
      select member_tier::text into tier
      from public.profiles
      where id = ord.referrer_id;
    end if;

    if tier = 'silver' then
      select (value #>> '{}')::numeric into rate
      from public.app_settings
      where key = 'silver_cashback_rate';
    elsif tier = 'gold' then
      select (value #>> '{}')::numeric into rate
      from public.app_settings
      where key = 'gold_cashback_rate';
    end if;
    -- tier = 'normal' → rate 保持 0，不發

    credit := round(ord.subtotal * rate / 100);
    if credit > 0 then
      insert into public.store_credit_ledger
        (member_id, type, amount, order_id, created_at, expires_at)
      values
        (ord.referrer_id, 'earn', credit, ord.id,
         stamp, stamp + interval '365 days');
    end if;
  end if;

  return jsonb_build_object('outcome','settled','order',to_jsonb(ord),'credit',credit);
end;
$$;

revoke all on function public.settle_ecpay_payment(text,text,integer,text,boolean,jsonb)
  from public, anon, authenticated;
grant execute on function public.settle_ecpay_payment(text,text,integer,text,boolean,jsonb)
  to service_role;
