// src/components/Checkout.tsx — Supabase 版本
// 金額一律由 db.checkout.buildOrderTotals()（= 活動引擎）計算，
// 與 placeOrder() 寫進 orders 的金額走同一條路徑，避免畫面與 DB 不一致。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import RecipientForm, { type Recipient } from "./RecipientForm";
import styles from "../styles/Payment.module.css";
import { RootState, AppDispatch } from "../store/store";
import { clearCart, createAsyncGetCart } from "../slice/cartSlice";
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
  const [cartReady, setCartReady] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const submitting = useRef(false);
  const created = useRef(false);
  const request = useRef({ signature: "", id: "" });
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [totals, setTotals] = useState<OrderTotals | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [creditBalance, setCreditBalance] = useState(0);
  const [useCreditChecked, setUseCreditChecked] = useState(false);

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

  // A direct visit must hydrate the persisted cart before testing for emptiness.
  useEffect(() => {
    let cancelled = false;
    setCartReady(false);
    setCartError(null);
    dispatch(createAsyncGetCart()).unwrap()
      .then(() => { if (!cancelled) setCartReady(true); })
      .catch(() => { if (!cancelled) setCartError("無法讀取購物車，請稍後重試。"); });
    return () => { cancelled = true; };
  }, [dispatch, previewAttempt]);

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

  // 取得購物金餘額
  useEffect(() => {
    const userId = auth.user?.id;
    if (!userId) return;
    let cancelled = false;
    db.storeCredit
      .getBalance(userId)
      .then((bal) => { if (!cancelled) setCreditBalance(bal); })
      .catch((err: unknown) => {
        console.warn("[storeCredit] 無法讀取購物金餘額:", err);
      });
    return () => { cancelled = true; };
  }, [auth.user?.id]);

  // 用活動引擎試算訂單金額（與 placeOrder 同一條計算路徑）
  useEffect(() => {
    if (created.current || !cartReady) return;
    setTotals(null);
    setPreviewError(null);
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
          setPreviewError("無法取得活動資訊，請稍後重試。");
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
  }, [items, memberContext, couponCode, cartItems.length, navigate, previewAttempt, cartReady]);

  // 購物金折抵金額（最多折抵至 $0，不能為負）
  const creditUsed = useMemo(
    () => (useCreditChecked && totals ? Math.min(creditBalance, totals.total) : 0),
    [useCreditChecked, creditBalance, totals],
  );

  const handleCheckout = useCallback(async (recipient: Recipient) => {
    if (!totals || submitting.current) return;
    submitting.current = true;
    setCheckoutError(null);

    setLoading(true);
    try {
      const userId = await requireAuth();

      const signature = JSON.stringify({ items: items.map(({ productId, qty }) => ({ productId, qty })), recipient, couponCode });
      if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
      const order = await db.checkout.placeOrder({
        requestId: request.current.id,
        buyerId: userId,
        items,
        memberTier,
        couponCode,
        recipient,
        // 此情境僅供預覽相容；伺服器會重新讀取真實會員資料。
        memberContext: memberContext ?? undefined,
        // TODO: 將 creditAmount 傳給 edge function（checkout-create）由伺服器端扣除，
        //       可避免競態條件，需改 placeOrder() 介面與 Supabase function 的參數接收。
      });

      if (!order?.id) {
        throw new Error("訂單建立失敗");
      }

      created.current = true;
      dispatch(clearCart());
      dispatch(clearCouponCode());

      // 購物金折抵（client-side）；若 spendCredit 失敗僅警告，不阻擋訂單流程
      if (useCreditChecked && creditUsed > 0) {
        try {
          await db.storeCredit.spendCredit(userId, creditUsed, Date.now());
        } catch (creditErr: unknown) {
          console.warn("[storeCredit] 扣除購物金失敗，訂單仍成立:", creditErr);
        }
      }

      await Swal.fire({
        icon: "success",
        title: "訂單已建立",
        text: `訂單編號: ${order.order_no}`,
        confirmButtonColor: "#c9a063",
      });

      // 導向付款頁（orderId 走網址參數，重新整理不會遺失）
      navigate(`/payment/${order.id}`);
    } catch (error: unknown) {
      console.error("結帳失敗:", error);
      const message = error instanceof Error ? error.message : "結帳失敗，請重試";
      setCheckoutError(message);
      Swal.fire({
        icon: "error",
        title: "結帳失敗",
        text: message,
        confirmButtonColor: "#c9a063",

      });
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }, [totals, items, memberTier, memberContext, couponCode, useCreditChecked, creditUsed, dispatch, navigate]);

  if (authError) {
    return (
      <div className="checkout-container error">
        <h1>認證錯誤</h1>
        <p>{authError}</p>
      </div>
    );
  }

  if (!cartReady || !totals) {
    return <div className={`container py-5 ${styles.checkout}`}>
      <h1>訂單確認</h1>
      {(cartError || previewError) ? <><p role="alert">{cartError || previewError}</p>
        <button className="btn-gold" onClick={() => setPreviewAttempt((n) => n + 1)}>重新試算</button></>
        : <p role="status">正在確認商品與活動…</p>}
    </div>;
  }

  return (
    <div className={`container py-5 ${styles.checkout}`}>
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

          {/* 購物金折抵區塊：有餘額才顯示 */}
          {creditBalance > 0 && (
            <div className="order-store-credit">
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={useCreditChecked}
                  onChange={(e) => setUseCreditChecked(e.target.checked)}
                />
                <span>使用購物金折抵（可用：NT${currency(creditBalance)}）</span>
              </label>
              {useCreditChecked && (
                <div className="order-discount" style={{ marginTop: "0.25rem" }}>
                  <span>購物金折抵：</span>
                  <span>−NT${currency(creditUsed)}</span>
                </div>
              )}
            </div>
          )}

          <div className="total">
            <strong>合計：</strong>
            <strong>NT${currency(totals.total - creditUsed)}</strong>
          </div>

          {useCreditChecked && creditUsed > 0 && (
            <p style={{ fontSize: "0.8rem", color: "#888", marginTop: "0.25rem" }}>
              ＊購物金折抵將於付款後確認
            </p>
          )}
        </div>
      </div>

      <RecipientForm onSubmit={handleCheckout} busy={loading} error={checkoutError} />
    </div>
  );
};

export default Checkout;
