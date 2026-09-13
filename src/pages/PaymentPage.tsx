// src/pages/PaymentPage.tsx — ECPay 支付頁面

import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { handlePaymentSuccess } from "@/services/payment";
import styles from "@/styles/Payment.module.css";

interface PaymentResult {
  success: boolean;
  message: string;
  orderId?: string;
  creditIssued?: number;
  error?: string;
}

export default function PaymentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 處理支付回調
    const handleCallback = async () => {
      if (!orderId) {
        setResult({
          success: false,
          message: "訂單 ID 遺失",
          error: "無效的訂單",
        });
        setLoading(false);
        return;
      }

      // 從 URL 查詢參數中提取 ECPay 回調數據
      const params = new URLSearchParams(location.search);
      const data: Record<string, string> = {};

      params.forEach((value, key) => {
        data[key] = value;
      });

      // 若有 ECPay 回調數據，驗證並完成訂單
      if (Object.keys(data).length > 0 && data.TradeNo) {
        try {
          const paymentResult = await handlePaymentSuccess(data);
          setResult(paymentResult);

          // 延遲 2 秒後導向成功頁面
          if (paymentResult.success) {
            setTimeout(() => {
              navigate(`/checkout-success/${orderId}`, {
                state: {
                  creditIssued: paymentResult.creditIssued,
                  transactionId: paymentResult.transactionId,
                },
              });
            }, 2000);
          }
        } catch (error) {
          setResult({
            success: false,
            message: "支付處理失敗",
            error: error instanceof Error ? error.message : "未知錯誤",
            orderId,
          });
        }
      } else {
        // 尚未返回支付結果，顯示等待畫面
        setResult({
          success: false,
          message: "等待支付結果...",
        });
      }

      setLoading(false);
    };

    handleCallback();
  }, [orderId, location.search, navigate]);

  return (
    <div className={styles.paymentContainer}>
      <div className={styles.paymentCard}>
        {loading ? (
          <>
            <div className={styles.spinner}></div>
            <h2>處理支付中...</h2>
            <p>請稍候，我們正在驗證您的支付資訊</p>
          </>
        ) : result?.success ? (
          <>
            <div className={styles.successIcon}>✓</div>
            <h2>支付成功！</h2>
            <p>{result.message}</p>
            {result.creditIssued && result.creditIssued > 0 && (
              <div className={styles.creditNotice}>
                <p>
                  🎁 您獲得推薦購物金:{" "}
                  <strong>NT${result.creditIssued.toLocaleString()}</strong>
                </p>
              </div>
            )}
            <p className={styles.redirectText}>3 秒後導向確認頁面...</p>
          </>
        ) : (
          <>
            <div className={styles.errorIcon}>✕</div>
            <h2>支付失敗</h2>
            <p>{result?.message || "支付處理出錯"}</p>
            {result?.error && <p className={styles.errorDetails}>{result.error}</p>}
            <div className={styles.actions}>
              <button onClick={() => navigate(`/order/${orderId}`)} className={styles.primaryBtn}>
                檢查訂單
              </button>
              <button onClick={() => navigate("/cart")} className={styles.secondaryBtn}>
                返回購物車
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
