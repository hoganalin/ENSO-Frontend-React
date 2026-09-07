// src/components/Checkout.tsx — Supabase 版本
// 🔧 漏洞 1, 4 修復：添加認證驗證和錯誤恢復

import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import { RootState, AppDispatch } from "../store/store";
import { clearCart } from "../slice/cartSlice";
import * as db from "../services/db";
import { requireAuth } from "../lib/supabase-auth";

interface OrderData {
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
}

const Checkout = (): JSX.Element => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const cartItems = useSelector((state: RootState) => state.cart.carts);
  const auth = useSelector((state: RootState) => state.auth);

  const [loading, setLoading] = useState(false);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // 🔧 漏洞 4 修復：驗證用戶認證
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

  // 計算訂單金額
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

    // 計算小計
    const subtotal = cartItems.reduce((sum, item) => {
      return sum + (item.product.price * item.qty);
    }, 0);

    // 簡化版：無折扣、運費 100
    const discount = 0;
    const shipping_fee = 100;
    const total = subtotal + shipping_fee;

    setOrderData({
      subtotal,
      discount,
      shipping_fee,
      total,
    });
  }, [cartItems, navigate]);

  const handleCheckout = async () => {
    if (!orderData || !auth.user?.id) return;

    setLoading(true);
    try {
      // 🔧 漏洞 4 修復：重新驗證認證
      const userId = await requireAuth();

      // 建立訂單
      const order = await db.checkout.placeOrder({
        buyerId: userId,
        items: cartItems.map(item => ({
          productId: item.id,
          title: item.product.title,
          unitPrice: item.product.price,
          qty: item.qty,
        })),
        memberTier: auth.user.member_tier || "normal",
        couponCode: null,
        recipient: null,
      });

      if (!order?.id) {
        throw new Error("訂單建立失敗");
      }

      // 清空購物車
      dispatch(clearCart());

      Swal.fire({
        icon: "success",
        title: "訂單已建立",
        text: `訂單編號: ${order.order_no}`,
        confirmButtonColor: "#c9a063",
      }).then(() => {
        // 導向到支付頁面，並傳遞訂單 ID
        navigate("/payment", { state: { orderId: order.id } });
      });
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
  };

  if (authError) {
    return (
      <div className="checkout-container error">
        <h1>認證錯誤</h1>
        <p>{authError}</p>
      </div>
    );
  }

  if (!orderData) {
    return <div className="checkout-container loading">載入中...</div>;
  }

  return (
    <div className="checkout-container">
      <h1>訂單確認</h1>

      <div className="order-summary">
        <h2>訂單摘要</h2>
        <div className="order-items">
          {cartItems.map(item => (
            <div key={item.id} className="order-item">
              <span>{item.product.title} × {item.qty}</span>
              <span>¥{item.product.price * item.qty}</span>
            </div>
          ))}
        </div>

        <div className="order-totals">
          <div>
            <span>小計：</span>
            <span>¥{orderData.subtotal}</span>
          </div>
          <div>
            <span>運費：</span>
            <span>¥{orderData.shipping_fee}</span>
          </div>
          <div className="total">
            <strong>合計：</strong>
            <strong>¥{orderData.total}</strong>
          </div>
        </div>
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="btn-gold"
      >
        {loading ? "處理中…" : "前往支付"}
      </button>
    </div>
  );
};

export default Checkout;
