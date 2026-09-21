// src/components/AdminRefunds.tsx — 退款管理
import { useEffect, useState, type JSX } from "react";
import AdminShell from "./AdminShell";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { ProfileRow } from "@/services/db/types";
import styles from "@/styles/Admin.module.css";

// ── 型別 ─────────────────────────────────────────────────────────────────────
interface RefundOrder {
  id: string;
  order_no: string;
  buyer_name: string;
  buyer_phone: string;
  total: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  processing: boolean;
}

// ── 常數 ─────────────────────────────────────────────────────────────────────
const ALLOWED_ROLES = ["admin", "finance", "support"];

// 可申請退款的狀態
const REFUNDABLE = ["paid", "shipped"];

const STATUS_LABEL: Record<string, string> = {
  paid: "已付款", shipped: "已出貨", refunded: "已退款",
  completed: "已完成", cancelled: "已取消", pending: "待付款",
};

const STATUS_BG: Record<string, string> = {
  paid: "#2e5566", shipped: "#4a5e2e",
  refunded: "#005566", cancelled: "#555", completed: "#2e6b3c",
};

function fmtNTD(n: number): string {
  return `NT$ ${n.toLocaleString("zh-TW")}`;
}

// ── 元件 ─────────────────────────────────────────────────────────────────────
export default function AdminRefunds(): JSX.Element {
  const [profile, setProfile]   = useState<ProfileRow | null>(null);
  const [orders, setOrders]     = useState<RefundOrder[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filterStatus, setFilter] = useState<"pending_refund" | "refunded">("pending_refund");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        if (!p || !ALLOWED_ROLES.includes(p.role)) {
          setError("此頁僅限財務、客服及管理員存取。");
          setLoading(false);
          return;
        }
        setProfile(p);

        // 取 paid + shipped + refunded 訂單，join profiles
        const { data, error: err } = await supabase
          .from("orders")
          .select(`
            id,
            order_no,
            total,
            status,
            created_at,
            paid_at,
            profiles:buyer_id (name, phone)
          `)
          .in("status", ["paid", "shipped", "refunded"])
          .order("created_at", { ascending: false })
          .limit(500);

        if (err) throw err;

        const mapped: RefundOrder[] = (data ?? []).map((d: any) => ({
          id:          d.id,
          order_no:    d.order_no ?? d.id.slice(0, 8),
          buyer_name:  d.profiles?.name  ?? "—",
          buyer_phone: d.profiles?.phone ?? "—",
          total:       d.total ?? 0,
          status:      d.status,
          created_at:  d.created_at,
          paid_at:     d.paid_at ?? null,
          processing:  false,
        }));

        if (active) setOrders(mapped);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // 執行退款（更新 status → refunded）
  async function handleRefund(orderId: string): Promise<void> {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, processing: true } : o));
    setConfirmId(null);
    const { error: err } = await supabase
      .from("orders")
      .update({ status: "refunded" })
      .eq("id", orderId);
    if (err) {
      setError(err.message);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, processing: false } : o));
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "refunded", processing: false } : o));
    }
  }

  const displayed = orders.filter(o =>
    filterStatus === "pending_refund" ? REFUNDABLE.includes(o.status) : o.status === "refunded"
  );

  const pendingCount  = orders.filter(o => REFUNDABLE.includes(o.status)).length;
  const refundedCount = orders.filter(o => o.status === "refunded").length;
  const refundedTotal = orders.filter(o => o.status === "refunded").reduce((s, o) => s + o.total, 0);

  return (
    <AdminShell title="退款管理">
      {loading && <p className={styles.muted}>載入中…</p>}
      {error   && <div className={styles.alert}>{error}</div>}

      {!loading && !error && profile && (
        <>
          {/* KPI */}
          <div className={styles.stats} style={{ marginBottom: "1.5rem" }}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>待處理退款</span>
              <span className={styles.statValue} style={{ color: pendingCount > 0 ? "#e07070" : undefined }}>
                {pendingCount}
              </span>
              <span className={styles.statSub}>已付款或已出貨</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>已退款筆數</span>
              <span className={styles.statValue}>{refundedCount}</span>
              <span className={styles.statSub}>筆</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>已退款金額</span>
              <span className={styles.statValue}>{fmtNTD(refundedTotal)}</span>
              <span className={styles.statSub}>歷史合計</span>
            </div>
          </div>

          {/* 分頁切換 */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "1rem" }}>
            <button
              className={`${styles.btn} ${filterStatus === "pending_refund" ? styles.btnPrimary : ""}`}
              onClick={() => setFilter("pending_refund")}
            >
              待退款 {pendingCount > 0 && `(${pendingCount})`}
            </button>
            <button
              className={`${styles.btn} ${filterStatus === "refunded" ? styles.btnPrimary : ""}`}
              onClick={() => setFilter("refunded")}
            >
              已退款 {refundedCount > 0 && `(${refundedCount})`}
            </button>
          </div>

          {/* 退款表格 */}
          <div className={styles.card}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>訂單編號</th>
                    <th>買家</th>
                    <th>電話</th>
                    <th style={{ textAlign: "right" }}>金額</th>
                    <th>狀態</th>
                    <th>下單時間</th>
                    {filterStatus === "pending_refund" && <th>操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontFamily: "monospace", fontSize: ".85rem" }}>{o.order_no}</td>
                      <td>{o.buyer_name}</td>
                      <td style={{ opacity: .7 }}>{o.buyer_phone}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtNTD(o.total)}</td>
                      <td>
                        <span className={styles.badge} style={{ background: STATUS_BG[o.status] ?? "#555" }}>
                          {STATUS_LABEL[o.status] ?? o.status}
                        </span>
                      </td>
                      <td style={{ fontSize: ".85rem", opacity: .7 }}>{o.created_at.slice(0, 10)}</td>
                      {filterStatus === "pending_refund" && (
                        <td>
                          {confirmId === o.id ? (
                            <span style={{ display: "flex", gap: "6px" }}>
                              <button
                                className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                                disabled={o.processing}
                                onClick={() => handleRefund(o.id)}
                              >
                                確認退款
                              </button>
                              <button
                                className={`${styles.btn} ${styles.btnSm}`}
                                onClick={() => setConfirmId(null)}
                              >
                                取消
                              </button>
                            </span>
                          ) : (
                            <button
                              className={`${styles.btn} ${styles.btnSm}`}
                              disabled={o.processing}
                              onClick={() => setConfirmId(o.id)}
                            >
                              {o.processing ? "處理中…" : "執行退款"}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {displayed.length === 0 && (
                    <tr>
                      <td colSpan={filterStatus === "pending_refund" ? 7 : 6} className={styles.muted}>
                        {filterStatus === "pending_refund" ? "目前無待退款訂單" : "尚無退款記錄"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className={styles.muted} style={{ marginTop: "1rem", fontSize: ".8rem" }}>
            ⚠️ 執行退款僅更新系統狀態，實際款項請透過 ECPay 後台或銀行端操作退款。
          </p>
        </>
      )}
    </AdminShell>
  );
}
