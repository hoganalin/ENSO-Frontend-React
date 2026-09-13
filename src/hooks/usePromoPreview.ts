// src/hooks/usePromoPreview.ts
// 共用的活動試算 hook：把購物車丟進活動引擎，算出折扣/運費/贈品與被互斥擋掉的活動。
//
// 重點：本 hook 與結帳時的 db.checkout.buildOrderTotals() 走的是
// 同一支 listActivePromotions() + 同一支 applyPromotions()，
// 所以「購物車顯示的金額」與「寫進 orders 的金額」保證一致。
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  applyPromotions,
  normalizeMember,
  resolveActivePromos,
  type MemberContext,
  type Promo,
  type PromoContext,
  type PromoResult,
} from "@/domain/promotions";
import { SHIPPING_BASE, type CheckoutItem } from "@/domain/orderTotals";
import type { MemberTier } from "@/domain/storeCredit";
import { listActivePromotions } from "@/services/db/promotions";

export interface PromoPreview {
  /** 引擎試算結果；活動還在載入時為 null */
  result: PromoResult | null;
  /** 優惠碼套用狀態（成功/失敗訊息），未輸入時為 null */
  couponStatus: { ok: boolean; message: string } | null;
  loading: boolean;
  /** 手動重新載入活動清單（後台改了活動後可呼叫） */
  reload: () => void;
}

/**
 * @param items  購物車品項（productId 必須是真正的商品 id，不是購物車列 id）
 * @param member 會員情境。傳等級字串時，生日／首購／回購類活動不成立；
 *               傳 MemberContext 才能判定這三類。
 * @param couponCode 使用者輸入的優惠碼
 */
export function usePromoPreview(
  items: CheckoutItem[],
  member: MemberTier | MemberContext,
  couponCode: string | null,
): PromoPreview {
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    listActivePromotions()
      .then((list) => {
        if (!cancelled) setPromos(list);
      })
      .catch((error: unknown) => {
        // 活動讀取失敗不該擋住結帳：當成「目前沒有活動」繼續走。
        console.error("[promo] 活動讀取失敗，以無活動計算：", error);
        if (!cancelled) setPromos([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const m = normalizeMember(member);
  const ctx = useMemo<PromoContext>(
    () => ({
      lines: items.map((i) => ({ id: i.productId, price: i.unitPrice, qty: i.qty })),
      member: m.tier,
      birthdayMonth: m.birthdayMonth,
      completedOrderCount: m.completedOrderCount,
      referrerId: m.referrerId,
    }),
    [items, m.tier, m.birthdayMonth, m.completedOrderCount, m.referrerId],
  );

  const { result, couponStatus } = useMemo(() => {
    if (!promos) return { result: null, couponStatus: null };

    const { candidates, couponStatus } = resolveActivePromos(ctx, couponCode, promos);
    return {
      result: applyPromotions(ctx, candidates, {
        shippingBase: SHIPPING_BASE,
        couponStacksOrder: true,
      }),
      couponStatus,
    };
  }, [promos, ctx, couponCode]);

  return { result, couponStatus, loading, reload };
}

export default usePromoPreview;
