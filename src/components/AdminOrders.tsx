// src/components/AdminOrders.tsx — 後台：訂單管理
import { useEffect, useState, type JSX } from "react";

import AdminShell from "./AdminShell";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { OrderRow, OrderItemRow, ProfileRow, OrderStatus } from "@/services/db/types";
import styles from "@/styles/Admin.module.css";

const ALLOWED_ROLES = ["admin", "support", "warehouse"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "待付款", paid: "已付款", shipped: "已出貨",
  completed: "已完成", cancelled: "已取消", refunded: "已退款",
};
const STATUS_BG: Record<OrderStatus, string> = {
  pending: "#555", paid: "#2255a0", shipped: "#7a6000",
  completed: "#2e6b3c", cancelled: "#7a2020", refunded: "#005566",
};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("zh-TW");
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("zh-TW");

type Recipient = { name?: string; email?: string; tel?: string; address?: string };
function parseRecipient(raw: unknown): Recipient {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string,unknown>;
  return { name: typeof r.name==="string"?r.name:undefined, email: typeof r.email==="string"?r.email:undefined,
    tel: typeof r.tel==="string"?r.tel:undefined, address: typeof r.address==="string"?r.address:undefined };
}

// 盡量取出 Edge Function 回傳的錯誤訊息（{ error: { message } }）；取不到就回通用訊息。
async function edgeErrMsg(err: unknown): Promise<string> {
  const ctx = (err as { context?: { json?: () => Promise<unknown> } }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: { message?: string } };
      if (body?.error?.message) return body.error.message;
    } catch { /* ignore */ }
  }
  return err instanceof Error ? err.message : "操作失敗";
}

type ExpandedOrder = OrderRow & { items: OrderItemRow[]; itemsLoading: boolean; saving: boolean };

export default function AdminOrders(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [orders, setOrders]   = useState<OrderRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, ExpandedOrder>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (p && (ALLOWED_ROLES as readonly string[]).includes(p.role)) {
          const { data, error: dbErr } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(200);
          if (dbErr) throw dbErr;
          if (active) setOrders((data ?? []) as OrderRow[]);
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "載入失敗"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const handleToggle = async (order: OrderRow) => {
    const id = order.id;
    if (expanded[id]) { setExpanded(prev => { const n = {...prev}; delete n[id]; return n; }); return; }
    const entry: ExpandedOrder = { ...order, items: [], itemsLoading: true, saving: false };
    setExpanded(prev => ({ ...prev, [id]: entry }));
    try {
      const { data, error: dbErr } = await supabase.from("order_items").select("*").eq("order_id", id);
      if (dbErr) throw dbErr;
      setExpanded(prev => ({ ...prev, [id]: { ...prev[id], items: (data ?? []) as OrderItemRow[], itemsLoading: false } }));
    } catch (e) {
      setExpanded(prev => ({ ...prev, [id]: { ...prev[id], itemsLoading: false } }));
      setError(e instanceof Error ? e.message : "載入訂單明細失敗");
    }
  };

  // 透過後端 service_role 動作改訂單狀態（前台直接寫 orders 會被 guard_checkout_order 擋）。
  // 親送流程：待付款→取消；已付款/已出貨→標記完成（完成時後端自動扣庫存）。
  const handleAction = async (orderId: string, action: "cancel" | "complete") => {
    setError(null);
    setExpanded(prev => ({ ...prev, [orderId]: { ...prev[orderId], saving: true } }));
    try {
      const { error: invErr } = await supabase.functions.invoke("admin-order-action", { body: { orderId, action } });
      if (invErr) throw new Error(await edgeErrMsg(invErr));
      const newStatus: OrderStatus = action === "cancel" ? "cancelled" : "completed";
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      setExpanded(prev => ({ ...prev, [orderId]: { ...prev[orderId], status: newStatus, saving: false } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗");
      setExpanded(prev => ({ ...prev, [orderId]: { ...prev[orderId], saving: false } }));
    }
  };

  if (loading) return <AdminShell title="訂單管理"><p className={styles.muted}>載入中…</p></AdminShell>;
  if (error)   return <AdminShell title="訂單管理"><div className={styles.alert}>{error}</div></AdminShell>;
  if (!profile || !(ALLOWED_ROLES as readonly string[]).includes(profile.role)) return (
    <AdminShell title="訂單管理"><div className={styles.alert}>此頁僅限內部人員存取。</div></AdminShell>
  );

  const canEdit = (profile.role as AllowedRole) === "admin" || (profile.role as AllowedRole) === "support";

  return (
    <AdminShell title="訂單管理">
      <div className={styles.toolbar}>
        <span className={styles.muted}>共 {orders.length} 筆</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr>
            <th>訂單編號</th><th style={{ width: "7rem" }}>狀態</th>
            <th style={{ width: "8rem" }}>總金額</th><th>收件人</th>
            <th style={{ width: "8rem" }}>建立日期</th><th style={{ width: "5rem" }} />
          </tr></thead>
          <tbody>
            {orders.map(order => {
              const recipient = parseRecipient(order.recipient);
              const isExpanded = !!expanded[order.id];
              const entry = expanded[order.id];
              return (
                <>
                  <tr key={order.id}>
                    <td><span style={{ fontFamily: "monospace" }}>{order.order_no}</span></td>
                    <td>
                      <span className={styles.badge} style={{ background: STATUS_BG[order.status] }}>
                        {STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    <td>NT$ {order.total.toLocaleString()}</td>
                    <td>{recipient.name ?? "—"}</td>
                    <td className={styles.muted}>{fmtDate(order.created_at)}</td>
                    <td>
                      <button type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={() => handleToggle(order)}>
                        {isExpanded ? "收起" : "查看"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && entry && (
                    <tr key={`${order.id}-detail`} className={styles.subRow}>
                      <td colSpan={6}>
                        <div style={{ padding: "1.5rem", background: "#121512" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "2rem", marginBottom: "1.5rem" }}>
                            <div>
                              <p style={{ color: "#c9a063", fontSize: ".7rem", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".5rem" }}>訂單資訊</p>
                              <table style={{ fontSize: ".83rem", borderCollapse: "collapse", width: "100%" }}>
                                <tbody>
                                  {[["訂單編號", <span style={{ fontFamily:"monospace" }}>{order.order_no}</span>],
                                    ["建立時間", fmtDateTime(order.created_at)],
                                    ["小計", `NT$ ${order.subtotal.toLocaleString()}`],
                                    ["折扣", `- NT$ ${order.discount.toLocaleString()}`],
                                    ["運費", `NT$ ${order.shipping_fee.toLocaleString()}`],
                                    ["總計", <strong>NT$ {order.total.toLocaleString()}</strong>],
                                  ].map(([k, v], i) => (
                                    <tr key={i}><td style={{ color: "rgba(245,238,224,.55)", paddingRight: "1rem", paddingBottom: ".3rem" }}>{k}</td><td>{v}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div>
                              <p style={{ color: "#c9a063", fontSize: ".7rem", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".5rem" }}>收件人</p>
                              <table style={{ fontSize: ".83rem", borderCollapse: "collapse" }}>
                                <tbody>
                                  {[["姓名", recipient.name],["Email", recipient.email],["電話", recipient.tel],["地址", recipient.address]].map(([k,v],i)=>(
                                    <tr key={i}><td style={{ color:"rgba(245,238,224,.55)", paddingRight:"1rem", paddingBottom:".3rem" }}>{k}</td><td>{v ?? "—"}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div style={{ minWidth: "10rem" }}>
                              <p style={{ color: "#c9a063", fontSize: ".7rem", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".5rem" }}>更新狀態</p>
                              {canEdit ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                                  {order.status === "pending" && (
                                    <button type="button" className={styles.btn}
                                      onClick={() => handleAction(order.id, "cancel")} disabled={entry.saving}>
                                      {entry.saving ? "處理中…" : "取消訂單"}
                                    </button>
                                  )}
                                  {(order.status === "paid" || order.status === "shipped") && (
                                    <button type="button" className={`${styles.btn} ${styles.btnPrimary}`}
                                      onClick={() => handleAction(order.id, "complete")} disabled={entry.saving}>
                                      {entry.saving ? "處理中…" : "標記已完成（已交貨）"}
                                    </button>
                                  )}
                                  {order.status === "paid" && (
                                    <span className={styles.muted} style={{ fontSize: ".72rem", lineHeight: 1.4 }}>
                                      完成時會自動扣庫存。退款請至「退款管理」。
                                    </span>
                                  )}
                                  {["completed","cancelled","refunded"].includes(order.status) && (
                                    <span className={styles.muted} style={{ fontSize: ".8rem" }}>此訂單已結案，無需操作。</span>
                                  )}
                                </div>
                              ) : (
                                <span className={styles.badge} style={{ background: STATUS_BG[order.status] }}>{STATUS_LABELS[order.status]}</span>
                              )}
                            </div>
                          </div>
                          <p style={{ color: "#c9a063", fontSize: ".7rem", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".5rem" }}>商品明細</p>
                          {entry.itemsLoading ? <p className={styles.muted}>載入中…</p> : (
                            <table className={styles.subTable}>
                              <thead><tr><th>商品名稱</th><th style={{ width:"7rem" }}>單價</th><th style={{ width:"5rem" }}>數量</th><th style={{ width:"8rem" }}>小計</th></tr></thead>
                              <tbody>
                                {entry.items.map(item => (
                                  <tr key={item.id}>
                                    <td>{item.title}</td>
                                    <td>NT$ {item.unit_price.toLocaleString()}</td>
                                    <td>{item.qty}</td>
                                    <td>NT$ {(item.unit_price * item.qty).toLocaleString()}</td>
                                  </tr>
                                ))}
                                {entry.items.length === 0 && <tr><td colSpan={4} className={styles.muted}>無明細資料</td></tr>}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {orders.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign:"center", padding:"2rem" }} className={styles.muted}>尚無訂單資料。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
