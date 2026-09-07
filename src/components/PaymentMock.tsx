// src/components/PaymentMock.tsx
// 🔧 漏洞 1, 3, 4 修復：使用重試機制、冪等性保護和認證驗證

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import Swal from "sweetalert2";
import * as db from "../services/db";
import { requireAuth, verifyResourceAccess } from "../lib/supabase-auth";

interface PaymentMockProps {
  orderId?: string;
}

const PaymentMock = ({ orderId: propOrderId }: PaymentMockProps): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const orderId = propOrderId || (location.state as any)?.orderId;

  // 🔧 漏洞 4 修復：驗證認證和訂單訪問權限
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userId = await requireAuth();
        const hasAccess = await verifyResourceAccess("order", orderId, userId);
        
        if (!hasAccess) {
          setAuthError("無權訪問此訂單");
          Swal.fire({
            icon: "error",
            title: "無權訪問",
            text: "你無權訪問此訂單",
            confirmButtonColor: "#c9a063",
          }).then(() => navigate("/"));
          return;
        }

        setAuthChecked(true);
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

    if (!orderId) {
      Swal.fire({
        icon: "error",
        title: "訂單不存在",
        confirmButtonColor: "#c9a063",
      }).then(() => navigate("/"));
      return;
    }

    checkAuth();
  }, [orderId, navigate]);

  // 🔧 漏洞 3 修復：使用帶重試機制的 completeOrderWithRetry
  const handlePaymentSuccess = async () => {
    if (!authChecked || !orderId) return;

    setLoading(true);
    try {
      // 使用新的帶重試機制的函數
      const result = await db.checkout.completeOrderWithRetry(orderId, 3);

      if (result.isIdempotent) {
        // 冪等重複調用，但仍然成功
        Swal.fire({
          icon: "info",
          title: "訂單已完成",
          text: "此訂單已完成支付，購物金已發放",
          confirmButtonColor: "#c9a063",
        }).then(() => {
          navigate("/product");
        });
      } else {
        // 首次成功完成
        const creditMessage = result.creditIssued > 0 
          ? `，推薦人獲得購物金 NT$${result.creditIssued.toLocaleString()}`
          : "";

        Swal.fire({
          icon: "success",
          title: "付款成功",
          text: `訂單已完成${creditMessage}`,
          confirmButtonColor: "#c9a063",
        }).then(() => {
          navigate("/product");
        });
      }
    } catch (error: unknown) {
      console.error("完成訂單失敗:", error);
      const message = error instanceof Error ? error.message : "完成訂單失敗";
      
      Swal.fire({
        icon: "error",
        title: "錯誤",
        text: message,
        confirmButtonColor: "#c9a063",
        footer: "請稍後重試或聯繫客服",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!authChecked) {
    return <div className="payment-mock loading">驗證中...</div>;
  }

  if (authError) {
    return <div className="payment-mock error">認證失敗：{authError}</div>;
  }

  return (
    <div className="payment-mock">
      <h1>模擬支付</h1>
      <p>訂單編號: {orderId}</p>
      <p className="payment-info">
        <small>點擊下方按鈕以完成支付並觸發購物金發放</small>
      </p>
      <button
        onClick={handlePaymentSuccess}
        disabled={loading}
        className="btn-gold"
      >
        {loading ? "處理中…" : "模擬支付成功"}
      </button>
    </div>
  );
};

export default PaymentMock;
