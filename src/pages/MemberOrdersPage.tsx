import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router";
import MemberShell from "@/components/MemberShell";
import { useMember } from "@/hooks/useMember";
import { listMemberOrders, type MemberOrder } from "@/services/db/memberOrders";
import { addCartItemsApi } from "@/services/cart";
import { updateCart } from "@/slice/cartSlice";
import type { AppDispatch } from "@/store/store";
import styles from "@/styles/Member.module.css";

const STATUS = { pending: "待付款", paid: "已付款", shipped: "已出貨", completed: "已完成", cancelled: "已取消", refunded: "已退款" };
export default function MemberOrdersPage() {
  const member = useMember();
  const [orders, setOrders] = useState<MemberOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const locked = useRef(false);
  const [attempt, retry] = useState(0);
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  useEffect(() => {
    if (!member.profile) { setLoading(false); return; }
    let active = true; setLoading(true); setError("");
    listMemberOrders(member.profile.id).then(data => { if (active) setOrders(data); })
      .catch(() => { if (active) setError("訂單讀取失敗，請重新整理。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [member.profile, attempt]);
  const buyAgain = async (order: MemberOrder) => {
    if (locked.current) return;
    locked.current = true; setBusy(order.id); setActionError("");
    try {
      if (order.order_items.some(item => !item.product_id)) throw new Error("訂單含已移除的商品，請重新選購。");
      const response = await addCartItemsApi(order.order_items.map(item => ({ product_id: item.product_id!, qty: item.qty })));
      dispatch(updateCart(response.data.data));
      navigate("/cart");
    } catch (e) { setActionError(e instanceof Error ? e.message : "加入購物車失敗，請重試。"); }
    finally { locked.current = false; setBusy(null); }
  };
  return <MemberShell title="我的訂單">
    {member.loading || loading ? <p role="status">正在讀取訂單…</p>
      : member.error ? <div role="alert"><p>{member.error}</p><button className={styles.button} onClick={member.retry}>重新讀取</button></div>
      : !member.profile ? <p>請先<Link to="/login">登入</Link>以查看你的訂單。</p>
      : error ? <div role="alert"><p>{error}</p><button className={styles.button} onClick={() => retry(n => n + 1)}>重新讀取</button></div>
      : <><p>再次購買會保留原有購物車並加入商品，採用目前售價；優惠與運費於結帳重新計算。</p>
        {actionError && <p className={styles.error} role="alert">{actionError}</p>}
        {!orders.length && <p>目前還沒有訂單。<Link to="/product">前往選購</Link></p>}
        <ul className={styles.list}>{orders.map(order => <li className={styles.card} key={order.id}>
          <h2>訂單 {order.order_no}</h2><p>{new Date(order.created_at).toLocaleDateString("zh-TW")} · {STATUS[order.status] ?? order.status} · NT${order.total.toLocaleString()}</p>
          <details className={styles.details}><summary>查看商品明細</summary><ul>{order.order_items.map(item => <li key={item.id}>{item.title} × {item.qty}（訂購時單價 NT${item.unit_price.toLocaleString()}）</li>)}</ul></details>
          <div className={styles.actions}><Link className={styles.button} to={`/payment/${order.id}`}>{order.status === "pending" ? "前往付款" : "訂單明細與退款"}</Link>
            <button className={styles.button} disabled={!!busy || !order.order_items.length} onClick={() => buyAgain(order)}>{busy === order.id ? "正在確認商品…" : "再次購買"}</button></div>
        </li>)}</ul></>}
  </MemberShell>;
}
