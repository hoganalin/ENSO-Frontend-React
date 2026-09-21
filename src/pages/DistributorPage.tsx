import { useEffect, useState } from "react";
import { Link } from "react-router";
import MemberShell from "@/components/MemberShell";
import { useMember } from "@/hooks/useMember";
import { listProducts } from "@/services/db/products";
import { listMyOrders } from "@/services/db/orders";
import { addCartItemsApi } from "@/services/cart";
import type { ProductRow, OrderRow } from "@/services/db/types";
import styles from "@/styles/Member.module.css";

const money = (n: number) => `NT$${n.toLocaleString("zh-TW")}`;
export default function DistributorPage() {
  const { profile, loading, error, retry } = useMember();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [dataError, setDataError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const allowed = profile?.role === "distributor";
  useEffect(() => {
    if (!allowed || !profile) return;
    let current = true;
    setPending(true); setDataError("");
    Promise.all([listProducts(), listMyOrders(profile.id)]).then(([p, o]) => {
      if (current) { setProducts(p); setOrders(o.filter(row => row.buyer_id === profile.id)); }
    }).catch(() => { if (current) setDataError("商品與對帳資料讀取失敗，請重新載入。"); })
      .finally(() => { if (current) setPending(false); });
    return () => { current = false; };
  }, [allowed, profile, attempt]);
  const active = !!profile?.subscription_active && (!profile.subscription_expires_at || Date.parse(profile.subscription_expires_at) > Date.now());
  const rate = active ? Math.max(0, Math.min(100, profile?.distributor_discount_rate || 0)) : 0;
  async function addBulk() {
    const additions = products.filter(p => quantities[p.id] > 0).map(p => ({ product_id: p.id, qty: quantities[p.id] }));
    if (!additions.length) { setMessage("請至少選擇一項商品數量。"); return; }
    setPending(true); setMessage("");
    try { await addCartItemsApi(additions); setQuantities({}); setMessage("已加入購物車，請前往購物車確認並結帳。"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "加入失敗，請重試。"); }
    finally { setPending(false); }
  }
  return <MemberShell title="經銷會員中心">
    {loading ? <p role="status">讀取會員資料…</p> : error ? <div role="alert">{error}<button onClick={retry}>重試</button></div> : !allowed ? <p>此頁提供經銷會員使用。<Link to="/member">返回會員中心</Link></p> : <>
      <section className={styles.card}><h2>訂閱與經銷優惠</h2><p>訂閱狀態：{active ? "有效" : "未啟用或已到期"}；到期日：{profile.subscription_expires_at ? new Date(profile.subscription_expires_at).toLocaleDateString("zh-TW") : active ? "無期限" : "未設定"}</p><p>目前經銷折減：{rate}%。續期請聯絡管理員。下方價格為單件預估，結帳依有效訂閱、活動與整筆金額重新計算。</p><Link to="/partner-resources">教育資料與推薦素材</Link></section>
      {dataError && <p role="alert">{dataError}<button onClick={() => setAttempt(n => n + 1)}>重新載入</button></p>}
      <section className={styles.card}><h2>批量選購</h2>{pending && <p role="status">處理中…</p>}
        {!pending && !dataError && !products.length && <p>目前沒有上架商品。</p>}
        {products.map(p => <div className={styles.card} key={p.id}><div className={styles.product}>{p.image_url && <img src={p.image_url} alt={p.title} />}<div><h3>{p.title}</h3><p>牌價 {money(p.price)} · 經銷預估 {money(p.price - Math.floor(p.price * rate / 100))}</p><label htmlFor={`bulk-${p.id}`}>數量（0–99）</label> <input id={`bulk-${p.id}`} type="number" min="0" max="99" step="1" value={quantities[p.id] || 0} onChange={e => setQuantities(q => ({ ...q, [p.id]: Number(e.target.value) }))} /></div></div></div>)}
        <div className={styles.actions}><button className={styles.button} disabled={pending || !!dataError} onClick={addBulk}>將選取商品加入購物車</button><Link className={styles.button} to="/cart">前往購物車</Link></div><p role="status">{message}</p>
      </section>
      <section className={styles.card}><h2>我的採購對帳</h2><p>以下為本帳號訂單；已退款金額另列，待付款不計入已付款合計。</p><p>已付款訂單合計：{money(orders.filter(o => ["paid", "shipped", "completed"].includes(o.status)).reduce((sum, o) => sum + o.total, 0))}</p>
        {!pending && !dataError && !orders.length && <p>尚無採購紀錄。</p>}
        {orders.map(o => <p key={o.id}><Link to={`/payment/${o.id}`}>{o.order_no}</Link> · {new Date(o.created_at).toLocaleDateString("zh-TW")} · {money(o.total)} · {({ pending: "待付款", paid: "已付款", shipped: "已出貨", completed: "已完成", cancelled: "已取消", refunded: "已退款" })[o.status]}</p>)}
      </section>
    </>}
  </MemberShell>;
}
