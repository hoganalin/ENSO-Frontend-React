import { describe, expect, it } from 'vitest';
import { parseCheckoutRequest, priceCheckout } from '../../supabase/functions/_shared/commerce/checkout.ts';
import { dbPromoToDomain, type PromotionRow } from '../../supabase/functions/_shared/commerce/promotionRows.ts';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const request=parseCheckoutRequest({requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',items:[{productId:id,qty:1}],
 recipient:{name:'Buyer',email:'test@example.com',tel:'0912345678',address:'台北市中正區測試路1號'}});
const normal={member_tier:'normal' as const,birthday:null,referrer_id:null};
const gold={...normal,member_tier:'gold' as const};
const product={id,title:'VIP incense',price:1000,is_enabled:true};
const now=Date.parse('2026-09-20T00:00:00Z');
const promo:PromotionRow={id:'p',name:'VIP early',code:null,kind:null,promo_group:'coupon',priority:1,is_auto:true,is_active:true,
 conditions:{},effect:{type:'fixed',amount:100},starts_at:'2026-09-21T00:00:00Z',vip_starts_at:'2026-09-19T00:00:00Z',ends_at:'2026-09-22T00:00:00Z',created_at:''};
describe('VIP product and campaign access',()=>{
 it('refuses a normal member even if request claims gold',()=>{
  expect(()=>priceCheckout(request,[{...product,vip_only:true}],normal,0,[],now)).toThrow('VIP');
 });
 it('allows gold on VIP-only products',()=>{
  expect(priceCheckout(request,[{...product,vip_only:true}],gold,0,[],now).totals.subtotal).toBe(1000);
 });
 it('only allows gold inside an early product window',()=>{
  const p={...product,available_at:'2026-09-21T00:00:00Z',vip_available_at:'2026-09-19T00:00:00Z'};
  expect(()=>priceCheckout(request,[p],normal,0,[],now)).toThrow('尚未');
  expect(priceCheckout(request,[p],gold,0,[],now).items).toHaveLength(1);
 });
 it('allows normal at the general opening boundary',()=>{
  expect(priceCheckout(request,[{...product,available_at:new Date(now).toISOString()}],normal,0,[],now).items).toHaveLength(1);
 });
 it('rejects gold before early opening',()=>{
  expect(()=>priceCheckout(request,[{...product,available_at:'2026-09-22',vip_available_at:'2026-09-21'}],gold,0,[],now)).toThrow('尚未');
 });
 it('awards early campaign discount only to gold',()=>{
  expect(priceCheckout(request,[product],normal,0,[promo],now).totals.discount).toBe(0);
  expect(priceCheckout(request,[product],gold,0,[promo],now).totals.discount).toBe(100);
 });
 it('early access cannot bypass other coupon qualifications',()=>{
  const restricted={...promo,conditions:{first_purchase:true}};
  expect(priceCheckout(request,[product],gold,2,[restricted],now).totals.discount).toBe(0);
 });
 it('does not extend an expired campaign',()=>{
  expect(dbPromoToDomain(promo,Date.parse('2026-09-23')).when({member:'gold',lines:[]})).toBe(false);
 });
 it('makes the promotion available to normal members at the general opening',()=>{
  expect(dbPromoToDomain(promo,Date.parse(promo.starts_at!)).when({member:'normal',lines:[]})).toBe(true);
 });
});
