// src/components/Checkout.tsx — Supabase 版本
// 金額一律由 db.checkout.buildOrderTotals()（= 活動引擎）計算，
// 與 placeOrder() 寫進 orders 的金額走同一條路徑，避免畫面與 DB 不一致。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import { RootState, AppDispatch } from "../store/store";
import { clearCart } from "../slice/cartSlice";
import { clearCouponCode } from "../slice/promoSlice";
import * as db from "../services/db";
import useMemberContext from "../hooks/useMemberContext";
import { requireAuth } from "../lib/supabase-auth";
import { currency } from "../assets/utils/filter";
import type { CheckoutItem, OrderTotals } from "../domain/orderTotals";
import type { MemberTier } from "../domain/storeCredit";

const Checkout = (): JSX.Element => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const cartItems = useSelector((state: RootState) => state.cart.carts);
  const auth = useSelector((state: RootState) => state.auth);
  const couponCode = useSelector((state: RootState) => state.promo.couponCode);

  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState<OrderTotals | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const memberTier = (auth.user?.member_tier ?? "normal") as MemberTier;
  // 與購物車共用同一支 hook，確保兩頁算出的折扣一致
  const { context: memberContext } = useMemberContext();

  // 購物車 → 結帳品項。productId 必須是商品 id（product_id），
  // 不是購物車列 id，否則 order_items.product_id 會寫錯外鍵。
  const items = useMemo<CheckoutItem[]>(
    () =>
      cartItems.map((item) => ({
        productId: item.product_id,
        title: item.product.title,
        unitPrice: item.product.price,
        qty: item.qty,
      })),
    [cartItems],
  );

  // 驗證用戶認證
  useEffect(() => {
    const checkAuth = async () => {
      try {
        await requireAuth();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "認證失敗";
        setAuthError(message);
        Swal.fire({
          icon: "error",
          title: "認證失敗",
          text: message,
          confirmButtonColor: "#c9a063",
        }).then(() => navigate("/login"));
      }
    };

    checkAuth();
  }, [navigate]);

  // 用活動引擎試算訂單金額（與 placeOrder 同一條計算路徑）
  useEffect(() => {
    if (!cartItems.length) {
      Swal.fire({
        icon: "error",
        title: "購物車為空",
        text: "請先加入商品",
        confirmButtonColor: "#c9a063",
      }).then(() => navigate("/product"));
      return;
    }

    let cancelled = false;
    if (!memberContext) return;

    db.checkout
      .buildOrderTotals(items, memberContext, couponCode)
      .then((t) => {
        if (!cancelled) setTotals(t);
      })
      .catch((error: unknown) => {
        console.error("試算訂單金額失敗:", error);
        if (!cancelled) {
          Swal.fire({
            icon: "error",
            title: "試算失敗",
            text: "無法取得活動資訊，請重新整理後再試",
            confirmButtonColor: "#c9a063",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [items, memberContext, couponCode, cartItems.length, navigate]);

  const handleCheckout = useCallback(async () => {
    if (!totals) return;

    setLoading(true);
    try {
      const userId = await requireAuth();

      const order = await db.checkout.placeOrder({
        buyerId: userId,
        items,
        memberTier,
        couponCode,
        recipient: null,
        // 傳入試算時用的同一份情境，避免建單時重算出不同折扣
        memberContext: memberContext ?? undefined,
      });

      if (!order?.id) {
        throw new Error("訂單建立失敗");
      }

      dispatch(clearCart());
      dispatch(clearCouponCode());

      await Swal.fire({
        icon: "success",
        title: "訂單已建立",
        text: `訂單編號: ${order.order_no}`,
        confirmButtonColor: "#c9a063",
      });

      // 導向付款頁（orderId 走網址參數，重新整理不會遺失）
      navigate(`/payment/mock/${order.id}`);
    } catch (error: unknown) {
      console.error("結帳失敗:", error);
      const message = error instanceof Error ? error.message : "結帳失敗，請重試";
      Swal.fire({
        icon: "error",
        title: "結帳失敗",
        text: message,
        confirmButtonColor: "#c9a063",
        footer: "如多次失敗，請清除瀏覽器快取後重試",
      });
    } finally {
      setLoading(false);
    }
  }, [totals, items, memberTier, memberContext, couponCode, dispatch, navigate]);

  if (authError) {
    return (
      <div className="checkout-container error">
        <h1>認證錯誤</h1>
        <p>{authError}</p>
      </div>
    );
  }

  if (!totals) {
    return <div className="checkout-container loading">載入中...</div>;
  }

  return (
    <div className="checkout-container">
      <h1>訂單確認</h1>

      <div className="order-summary">
        <h2>訂單摘要</h2>
        <div className="order-items">
          {cartItems.map((item) => (
            <div key={item.id} className="order-item">
              <span>
                {item.product.title} × {item.qty}
              </span>
              <span>NT${currency(item.product.price * item.qty)}</span>
            </div>
          ))}
        </div>

        <div className="order-totals">
          <div>
            <span>小計：</span>
            <span>NT${currency(totals.subtotal)}</span>
          </div>

          {totals.appliedPromos
            .filter((p) => (p.amount ?? 0) > 0)
            .map((p) => (
              <div key={p.id} className="order-discount">
                <span>{p.name}：</span>
                <span>−NT${currency(p.amount ?? 0)}</span>
              </div>
            ))}

          <div>
            <span>運費：</span>
            <span>
              {totals.shippingFee === 0 ? "免運" : `NT$${currency(totals.shippingFee)}`}
            </span>
          </div>

          {totals.gift && (
            <div className="order-gift">
              <span>贈品：</span>
              <span>{totals.gift}</span>
            </div>
          )}

          <div className="total">
            <strong>合計：</strong>
            <strong>NT${currency(totals.total)}</strong>
          </div>
        </div>
      </div>

      <button onClick={handleCheckout} disabled={loading} className="btn-gold">
        {loading ? "處理中…" : "前往支付"}
      </button>
    </div>
  );
};

export default Checkout;
