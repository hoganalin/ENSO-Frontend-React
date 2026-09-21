// src/components/AdminOrders.tsx — 後台：訂單管理
import { useEffect, useState, type JSX } from "react";

import { usePageTitle } from "@/hooks/usePageTitle";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { OrderRow, OrderItemRow, ProfileRow, OrderStatus } from "@/services/db/types";

const GOLD = "#c9a063";
const ALLOWED_ROLES = ["admin", "support", "warehouse"] as const;

type AllowedRole = (typeof ALLOWED_ROLES)[number];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "待付款",
  paid: "已付款",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
  refunded: "已退款",
};

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: "text-bg-secondary",
  paid: "text-bg-primary",
  shipped: "text-bg-warning text-dark",
  completed: "text-bg-success",
  cancelled: "text-bg-danger",
  refunded: "text-bg-info text-dark",
};

const ALL_STATUSES: OrderStatus[] = ["pending", "paid", "shipped", "completed", "cancelled", "refunded"];

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString("zh-TW");
const fmtDateTime = (iso: string): string => new Date(iso).toLocaleString("zh-TW");

type Recipient = {
  name?: string;
  email?: string;
  tel?: string;
  address?: string;
};

function parseRecipient(raw: unknown): Recipient {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    name: typeof r.name === "string" ? r.name : undefined,
    email: typeof r.email === "string" ? r.email : undefined,
    tel: typeof r.tel === "string" ? r.tel : undefined,
    address: typeof r.address === "string" ? r.address : undefined,
  };
}

type ExpandedOrder = OrderRow & {
  items: OrderItemRow[];
  itemsLoading: boolean;
  newStatus: OrderStatus;
  saving: boolean;
};

export default function AdminOrders(): JSX.Element {
  usePageTitle("訂單管理");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, ExpandedOrder>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (p && (ALLOWED_ROLES as readonly string[]).includes(p.role)) {
          const { data, error: dbErr } = await supabase
            .from("orders")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200);
          if (dbErr) throw dbErr;
          if (active) setOrders((data ?? []) as OrderRow[]);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const handleToggle = async (order: OrderRow): Promise<void> => {
    const id = order.id;
    if (expanded[id]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    const entry: ExpandedOrder = { ...order, items: [], itemsLoading: true, newStatus: order.status, saving: false };
    setExpanded((prev) => ({ ...prev, [id]: entry }));

    try {
      const { data, error: dbErr } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", id);
      if (dbErr) throw dbErr;
      setExpanded((prev) => ({
        ...prev,
        [id]: { ...prev[id], items: (data ?? []) as OrderItemRow[], itemsLoading: false },
      }));
    } catch (e) {
      setExpanded((prev) => ({
        ...prev,
        [id]: { ...prev[id], itemsLoading: false },
      }));
      setError(e instanceof Error ? e.message : "載入訂單明細失敗");
    }
  };

  const handleStatusChange = (orderId: string, status: OrderStatus): void => {
    setExpanded((prev) => ({ ...prev, [orderId]: { ...prev[orderId], newStatus: status } }));
  };

  const handleSaveStatus = async (orderId: string): Promise<void> => {
    const entry = expanded[orderId];
    if (!entry) return;
    setExpanded((prev) => ({ ...prev, [orderId]: { ...prev[orderId], saving: true } }));
    try {
      const { error: dbErr } = await supabase
        .from("orders")
        .update({ status: entry.newStatus })
        .eq("id", orderId);
      if (dbErr) throw dbErr;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: entry.newStatus } : o))
      );
      setExpanded((prev) => ({
        ...prev,
        [orderId]: { ...prev[orderId], status: entry.newStatus, saving: false },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新狀態失敗");
      setExpanded((prev) => ({ ...prev, [orderId]: { ...prev[orderId], saving: false } }));
    }
  };

  if (loading) return <div className="container py-5 text-center text-muted">載入中…</div>;
  if (error) return <div className="container py-5 text-center text-danger">{error}</div>;
  if (!profile || !(ALLOWED_ROLES as readonly string[]).includes(profile.role)) {
    return <div className="container py-5 text-center text-muted">此頁僅限內部人員存取。</div>;
  }

  const canEdit = (profile.role as AllowedRole) === "admin" || (profile.role as AllowedRole) === "support";

  return (
    <div className="container py-5" style={{ maxWidth: 1100 }}>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h1 className="h3 mb-0" style={{ letterSpacing: 2 }}>訂單管理</h1>
        <span className="text-muted small">共 {orders.length} 筆</span>
      </div>

      <div className="table-responsive">
        <table className="table align-middle">
          <thead className="table-light">
            <tr>
              <th>訂單編號</th>
              <th style={{ width: 90 }}>狀態</th>
              <th style={{ width: 110 }}>總金額</th>
              <th>收件人</th>
              <th style={{ width: 110 }}>建立日期</th>
              <th style={{ width: 70 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const recipient = parseRecipient(order.recipient);
              const isExpanded = !!expanded[order.id];
              const entry = expanded[order.id];
              return (
                <>
                  <tr key={order.id}>
                    <td>
                      <div className="font-monospace small fw-semibold">{order.order_no}</div>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[order.status]}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    <td>NT$ {order.total.toLocaleString()}</td>
                    <td>{recipient.name ?? "—"}</td>
                    <td className="text-muted small">{fmtDate(order.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => handleToggle(order)}
                      >
                        {isExpanded ? "收起" : "查看"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && entry && (
                    <tr key={`${order.id}-detail`}>
                      <td colSpan={6} className="p-0">
                        <div className="p-4 bg-light border-top">
                          <div className="row g-4">
                            <div className="col-md-5">
                              <h6 style={{ color: GOLD }}>訂單資訊</h6>
                              <dl className="row small mb-0">
                                <dt className="col-5 text-muted">訂單編號</dt>
                                <dd className="col-7 font-monospace">{order.order_no}</dd>
                                <dt className="col-5 text-muted">建立時間</dt>
                                <dd className="col-7">{fmtDateTime(order.created_at)}</dd>
                                <dt className="col-5 text-muted">小計</dt>
                                <dd className="col-7">NT$ {order.subtotal.toLocaleString()}</dd>
                                <dt className="col-5 text-muted">折扣</dt>
                                <dd className="col-7">- NT$ {order.discount.toLocaleString()}</dd>
                                <dt className="col-5 text-muted">運費</dt>
                                <dd className="col-7">NT$ {order.shipping_fee.toLocaleString()}</dd>
                                <dt className="col-5 text-muted fw-bold">總計</dt>
                                <dd className="col-7 fw-bold">NT$ {order.total.toLocaleString()}</dd>
                              </dl>
                            </div>

                            <div className="col-md-4">
                              <h6 style={{ color: GOLD }}>收件人</h6>
                              <dl className="row small mb-0">
                                <dt className="col-5 text-muted">姓名</dt>
                                <dd className="col-7">{recipient.name ?? "—"}</dd>
                                <dt className="col-5 text-muted">Email</dt>
                                <dd className="col-7">{recipient.email ?? "—"}</dd>
                                <dt className="col-5 text-muted">電話</dt>
                                <dd className="col-7">{recipient.tel ?? "—"}</dd>
                                <dt className="col-5 text-muted">地址</dt>
                                <dd className="col-7">{recipient.address ?? "—"}</dd>
                              </dl>
                            </div>

                            <div className="col-md-3">
                              <h6 style={{ color: GOLD }}>更新狀態</h6>
                              {canEdit ? (
                                <div className="d-flex flex-column gap-2">
                                  <select
                                    className="form-select form-select-sm"
                                    value={entry.newStatus}
                                    onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                                  >
                                    {ALL_STATUSES.map((s) => (
                                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    style={{ background: GOLD, color: "#1a1512", fontWeight: 600 }}
                                    onClick={() => handleSaveStatus(order.id)}
                                    disabled={entry.saving || entry.newStatus === order.status}
                                  >
                                    {entry.saving ? "儲存中…" : "儲存狀態"}
                                  </button>
                                </div>
                              ) : (
                                <span className={`badge ${STATUS_BADGE[order.status]}`}>
                                  {STATUS_LABELS[order.status]}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-4">
                            <h6 style={{ color: GOLD }}>商品明細</h6>
                            {entry.itemsLoading ? (
                              <div className="text-muted small">載入中…</div>
                            ) : (
                              <table className="table table-sm bg-white">
                                <thead>
                                  <tr>
                                    <th>商品名稱</th>
                                    <th style={{ width: 80 }}>單價</th>
                                    <th style={{ width: 60 }}>數量</th>
                                    <th style={{ width: 100 }}>小計</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entry.items.map((item) => (
                                    <tr key={item.id}>
                                      <td>{item.title}</td>
                                      <td>NT$ {item.unit_price.toLocaleString()}</td>
                                      <td>{item.qty}</td>
                                      <td>NT$ {(item.unit_price * item.qty).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                  {entry.items.length === 0 && (
                                    <tr>
                                      <td colSpan={4} className="text-muted text-center">無明細資料</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">
                  尚無訂單資料。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
