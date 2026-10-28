import { useEffect, useRef, useState } from "react";
import { setupCardFields, getPrime, payWithTappay } from "@/services/payment/tappay";
import styles from "@/styles/Payment.module.css";

interface Props {
  orderId: string;
  amount: number;
  onPaid: () => void;
}

export default function TapPayCardForm({ orderId, amount, onPaid }: Props): JSX.Element {
  const numberRef = useRef<HTMLDivElement>(null);
  const expiryRef = useRef<HTMLDivElement>(null);
  const ccvRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (numberRef.current && expiryRef.current && ccvRef.current) {
          await setupCardFields(numberRef.current, expiryRef.current, ccvRef.current);
          if (active) setReady(true);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "付款欄位初始化失敗");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handlePay = async () => {
    if (paying) return;
    setPaying(true);
    setError(null);
    try {
      const prime = await getPrime();
      await payWithTappay(orderId, prime);
      onPaid();
    } catch (e) {
      setError(e instanceof Error ? e.message : "付款失敗，請稍後再試");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className={styles.tappayBox}>
      <div className={styles.tappayField}>
        <label>卡號</label>
        <div ref={numberRef} className={styles.tappayInput} />
      </div>
      <div className={styles.tappayRow}>
        <div className={styles.tappayField}>
          <label>到期日</label>
          <div ref={expiryRef} className={styles.tappayInput} />
        </div>
        <div className={styles.tappayField}>
          <label>安全碼</label>
          <div ref={ccvRef} className={styles.tappayInput} />
        </div>
      </div>
      {error && <p className={styles.errorDetails} role="alert">{error}</p>}
      <button
        type="button"
        className={styles.primaryBtn}
        disabled={!ready || paying}
        onClick={handlePay}
      >
        {paying ? "付款處理中…" : `確認付款 NT$${amount.toLocaleString()}`}
      </button>
      <p className={styles.tappayNote}>
        交易由 TapPay 加密處理，本網站不會儲存您的完整卡號。
      </p>
    </div>
  );
}
