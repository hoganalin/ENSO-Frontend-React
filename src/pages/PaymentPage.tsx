import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { requireAuth } from "@/lib/supabase-auth";
import { listMyOrders, listOrderItems } from "@/services/db/orders";
import type { OrderItemRow, OrderRow } from "@/services/db/types";
import TapPayCardForm from "@/components/TapPayCardForm";
import OrderGifts from "@/components/OrderGifts";
import RefundRequest from "@/components/RefundRequest";
import styles from "@/styles/Payment.module.css";

const labels: Record<string, string> = { pending: "待付款", paid: "已付款", shipped: "已出貨", completed: "已完成", cancelled: "已取消", refunded: "已退款" };

export default function PaymentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  const mounted = useRef(true);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const buyerId = await requireAuth();
      const rows = await listMyOrders(buyerId);
      const selected = rows.find((row) => row.id === orderId);
      const selectedItems = selected ? await listOrderItems(selected.id) : [];
      if (mounted.current && currentRequest === requestId.current) { setOrders(rows); setItems(selectedItems); }
    } catch (err) {
      if (mounted.current && currentRequest === requestId.current) { setOrders([]); setItems([]); setError(err instanceof Error ? err.message : "無法讀取訂單，請稍後再試"); }
    } finally { if (mounted.current && currentRequest === requestId.current) setLoading(false); }
  }, [orderId]);
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; requestId.current++; }; }, [refresh]);

  const order = orders.find((row) => row.id === orderId);
  const handlePaid = () => { setJustPaid(true); void refresh(); };

  return <main className={styles.paymentContainer}>
    <section className={styles.paymentCard} aria-busy={loading}>
      <h1>{orderId ? "訂單付款" : "我的訂單"}</h1>
      {loading ? <p role="status">正在讀取訂單…</p> : <>
        {orderId && !order && !error && <p role="alert">找不到可存取的訂單，請確認登入帳號及訂單網址。</p>}
        {order && <>
          <p>訂單編號：{order.order_no}</p>
          <p>訂單金額：NT${order.total.toLocaleString()}</p>
          <p role="status">訂單狀態：{labels[order.status] ?? order.status}</p>
          {items.length > 0 && <section aria-label="訂單商品" className={styles.orderItems}>
            <h2>本次購買商品</h2>
            <ul>{items.map((item) => <li key={item.id}>
              <span className={styles.itemInfo}>
                {item.image_url && <img className={styles.itemImage} src={item.image_url} alt="" />}
                <span>{item.title} × {item.qty}</span>
              </span>
              <span>NT${(item.unit_price * item.qty).toLocaleString()}</span>
            </li>)}</ul>
          </section>}
          {justPaid && order.status === "paid" && <p className={styles.tappayPaid} role="status">付款成功，感謝您的購買！</p>}
          {order.status === "pending" ? <>
            <p>請輸入信用卡資訊完成付款：</p>
            <TapPayCardForm orderId={order.id} amount={order.total} onPaid={handlePaid} />
          </> : <p>{["paid", "shipped", "completed"].includes(order.status) ? "此訂單已完成付款，無需再次支付。" : "此訂單無法付款。"}</p>}
          <OrderGifts key={`gifts-${order.id}`} orderId={order.id} />
          <RefundRequest key={order.id} orderId={order.id} total={order.total} eligible={["paid", "shipped", "completed"].includes(order.status)} />
        </>}
        {!orderId && !error && (orders.length ? <ul className={styles.orderList}>{orders.map((row) => <li key={row.id}>
          <Link to={`/payment/${row.id}`}>{row.order_no}</Link>
          <span>{labels[row.status] ?? row.status} · NT${row.total.toLocaleString()}</span>
        </li>)}</ul> : <p>目前沒有訂單。</p>)}
        {error && <p className={styles.errorDetails} role="alert">{error}</p>}
      </>}
      <div className={styles.actions}>
        <button className={styles.secondaryBtn} disabled={loading} onClick={() => void refresh()}>更新訂單狀態</button>
        {orderId && <Link className={styles.secondaryBtn} to="/orders">我的訂單</Link>}
        <Link className={styles.secondaryBtn} to="/product">繼續購物</Link>
      </div>
    </section>
  </main>;
}
