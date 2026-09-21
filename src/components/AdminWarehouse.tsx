// src/components/AdminWarehouse.tsx — 倉管出貨作業
import { useEffect, useState, type JSX } from "react";
import AdminShell from "./AdminShell";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { ProfileRow } from "@/services/db/types";
import styles from "@/styles/Admin.module.css";

// ── 型別 ─────────────────────────────────────────────────────────────────────
interface PickOrder {
  id: string;
  order_no: string;
  buyer_name: string;
  buyer_phone: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  total: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  items: PickItem[];
  expanded: boolean;
  processing: boolean;
}

interface PickItem {
  id: string;
  title: string;
  unit_price: number;
  qty: number;
  image_url: string | null;
}

const ALLOWED_ROLES = ["admin", "warehouse"];

function fmtNTD(n: number) {
  return `NT$ ${n.toLocaleString("zh-TW")}`;
}

// ── 元件 ─────────────────────────────────────────────────────────────────────
export default function AdminWarehouse(): JSX.Element {
  const [profile, setProfile]   = useState<ProfileRow | null>(null);
  const [orders, setOrders]     = useState<PickOrder[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [tab, setTab]           = useState<"paid" | "shipped">("paid");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        if (!p || !ALLOWED_ROLES.includes(p.role)) {
          setError("此頁僅限倉儲人員及管理員存取。");
          setLoading(false);
          return;
        }
        setProfile(p);
        await fetchOrders(active);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchOrders(active = true): Promise<void> {
    const { data, error: err } = await supabase
      .from("orders")
      .select(`
        id, order_no, total, status, paid_at, created_at, recipient,
        profiles:buyer_id (name, phone)
      `)
      .in("status", ["paid", "shipped"])
      .order("paid_at", { ascending: true })
      .limit(300);
    if (err) throw err;

    const mapped: PickOrder[] = (data ?? []).map((d: any) => {
      const rec = (d.recipient as Record<string, string>) ?? {};
      return {
        id:               d.id,
        order_no:         d.order_no ?? d.id.slice(0, 8),
        buyer_name:       d.profiles?.name  ?? "—",
        buyer_phone:      d.profiles?.phone ?? "—",
        recipient_name:   rec.name    ?? rec.recipientName ?? "—",
        recipient_phone:  rec.phone   ?? rec.recipientPhone ?? "—",
        recipient_address: [rec.city, rec.district, rec.address].filter(Boolean).join("") || "—",
        total:            d.total ?? 0,
        status:           d.status,
        paid_at:          d.paid_at,
        created_at:       d.created_at,
        items:            [],
        expanded:         false,
        processing:       false,
      };
    });
    if (active) setOrders(mapped);
  }

  async function expandOrder(orderId: string): Promise<void> {
    const already = orders.find(o => o.id === orderId);
    if (!already) return;
    if (already.items.length > 0) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, expanded: !o.expanded } : o));
      return;
    }
    const { data, error: err } = await supabase
      .from("order_items")
      .select("id,title,unit_price,qty,image_url")
      .eq("order_id", orderId);
    if (err) return;
    const items: PickItem[] = (data ?? []).map((i: any) => ({
      id: i.id, title: i.title, unit_price: i.unit_price, qty: i.qty, image_url: i.image_url ?? null,
    }));
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items, expanded: true } : o));
  }

  async function handleShip(orderId: string): Promise<void> {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, processing: true } : o));
    setConfirmId(null);
    const { error: err } = await supabase
      .from("orders")
      .update({ status: "shipped" })
      .eq("id", orderId);
    if (err) {
      setError(err.message);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, processing: false } : o));
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "shipped", processing: false } : o));
    }
  }

  const displayed = orders.filter(o => o.status === tab);
  const paidCount    = orders.filter(o => o.status === "paid").length;
  const shippedCount = orders.filter(o => o.status === "shipped").length;

  return (
    <AdminShell title="倉管出貨作業">
      {loading && <p className={styles.muted}>載入中…</p>}
      {error   && <div className={styles.alert}>{error}</div>}

      {!loading && !error && profile && (
        <>
          {/* KPI */}
          <div className={styles.stats} style={{ marginBottom: "1.5rem" }}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>待出貨（已付款）</span>
              <span className={styles.statValue} style={{ color: paidCount > 0 ? "var(--enso-gold,#c9a063)" : undefined }}>
                {paidCount}
              </span>
              <span className={styles.statSub}>需處理</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>已出貨（在途）</span>
              <span className={styles.statValue}>{shippedCount}</span>
              <span className={styles.statSub}>筆</span>
            </div>
          </div>

          {/* Tab */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "1rem" }}>
            <button
              className={`${styles.btn} ${tab === "paid" ? styles.btnPrimary : ""}`}
              onClick={() => setTab("paid")}
            >
              📦 待出貨 {paidCount > 0 && `(${paidCount})`}
            </button>
            <button
              className={`${styles.btn} ${tab === "shipped" ? styles.btnPrimary : ""}`}
              onClick={() => setTab("shipped")}
            >
              🚚 已出貨 {shippedCount > 0 && `(${shippedCount})`}
            </button>
          </div>

          {/* 訂單列表 */}
          {displayed.length === 0 ? (
            <div className={styles.card}>
              <p className={styles.muted}>{tab === "paid" ? "目前無待出貨訂單 ✅" : "暫無在途訂單"}</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {displayed.map(o => (
                <div key={o.id} className={styles.card} style={{ padding: "1rem 1.25rem" }}>
                  {/* 訂單 header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <span style={{ fontFamily: "monospace", fontSize: ".9rem", fontWeight: 600 }}>{o.order_no}</span>
                      <span className={styles.badge} style={{
                        background: o.status === "paid" ? "#c9a063" : "#2e5e3e",
                        color: o.status === "paid" ? "#1a1512" : undefined,
                        marginLeft: "10px",
                      }}>
                        {o.status === "paid" ? "待出貨" : "已出貨"}
                      </span>
                      <span className={styles.muted} style={{ fontSize: ".8rem", marginLeft: "10px" }}>
                        {o.paid_at ? o.paid_at.slice(0, 10) + " 付款" : o.created_at.slice(0, 10)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtNTD(o.total)}</span>
                      {tab === "paid" && (
                        confirmId === o.id ? (
                          <>
                            <button className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                              disabled={o.processing} onClick={() => handleShip(o.id)}>
                              ✓ 確認出貨
                            </button>
                            <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => setConfirmId(null)}>取消</button>
                          </>
                        ) : (
                          <button className={`${styles.btn} ${styles.btnSm}`}
                            disabled={o.processing} onClick={() => setConfirmId(o.id)}>
                            🚚 出貨
                          </button>
                        )
                      )}
                      <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => expandOrder(o.id)}>
                        {o.expanded ? "▲ 收合" : "▼ 揀貨清單"}
                      </button>
                    </div>
                  </div>

                  {/* 收件人 */}
                  <div style={{ marginTop: "8px", fontSize: ".85rem", color: "var(--enso-fg,#f5eee0)", opacity: .8 }}>
                    <span>收件人：<strong>{o.recipient_name}</strong>　{o.recipient_phone}</span>
                    <br />
                    <span>地址：{o.recipient_address}</span>
                  </div>

                  {/* 揀貨清單 */}
                  {o.expanded && (
                    <div className={styles.tableWrap} style={{ marginTop: "12px" }}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>商品</th>
                            <th style={{ textAlign: "right" }}>單價</th>
                            <th style={{ textAlign: "right" }}>數量</th>
                            <th style={{ textAlign: "right" }}>小計</th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.items.map(item => (
                            <tr key={item.id}>
                              <td style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                {item.image_url && (
                                  <img src={item.image_url} alt="" width={36} height={36}
                                    style={{ borderRadius: "4px", objectFit: "cover", flexShrink: 0 }} />
                                )}
                                {item.title}
                              </td>
                              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtNTD(item.unit_price)}</td>
                              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{item.qty}</td>
                              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtNTD(item.unit_price * item.qty)}</td>
                            </tr>
                          ))}
                          {o.items.length === 0 && <tr><td colSpan={4} className={styles.muted}>載入中…</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}
