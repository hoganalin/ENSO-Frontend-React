// src/components/AdminReports.tsx — 月營業報表
import { useEffect, useState, type JSX } from "react";
import AdminShell from "./AdminShell";
import { supabase } from "@/services/supabaseClient";
import styles from "@/styles/Admin.module.css";

// ── 型別 ─────────────────────────────────────────────────────────────────────
interface MonthData {
  key: string;        // "YYYY-MM"
  label: string;      // "YYYY/MM"
  revenue: number;    // 已付款訂單金額合計
  orders: number;     // 訂單筆數
  creditIssued: number; // 購物金發放合計
}

interface StatusBreakdown {
  status: string;
  count: number;
  total: number;
}

// ── 輔助 ─────────────────────────────────────────────────────────────────────
function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function monthLabel(key: string): string {
  return key.replace("-", "/"); // "YYYY/MM"
}

function fmtNTD(n: number): string {
  return `NT$ ${n.toLocaleString("zh-TW")}`;
}

function downloadCsv(rows: MonthData[]): void {
  const header = "月份,訂單筆數,營業額(NT$),購物金發放(NT$)\n";
  const body = rows
    .map(r => `${r.label},${r.orders},${r.revenue},${r.creditIssued}`)
    .join("\n");
  const blob = new Blob(["﻿" + header + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `enso_monthly_report_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 元件 ─────────────────────────────────────────────────────────────────────
export default function AdminReports(): JSX.Element {
  const [months, setMonths]     = useState<MonthData[]>([]);
  const [breakdown, setBreakdown] = useState<StatusBreakdown[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // 最近 12 個月的起始日
        const since = new Date();
        since.setMonth(since.getMonth() - 11);
        since.setDate(1);
        since.setHours(0, 0, 0, 0);
        const sinceIso = since.toISOString();

        // 並行取得訂單 + 購物金
        const [ordersRes, creditRes] = await Promise.all([
          supabase
            .from("orders")
            .select("id,total,status,paid_at,created_at")
            .gte("created_at", sinceIso),
          supabase
            .from("store_credit_ledger")
            .select("amount,created_at")
            .eq("type", "earn")
            .gte("created_at", sinceIso),
        ]);

        if (ordersRes.error) throw ordersRes.error;
        if (creditRes.error) throw creditRes.error;

        const orders = ordersRes.data ?? [];
        const credits = creditRes.data ?? [];

        // 建立最近 12 個月的月份骨架（由舊到新）
        const now = new Date();
        const monthMap: Record<string, MonthData> = {};
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          monthMap[k] = { key: k, label: monthLabel(k), revenue: 0, orders: 0, creditIssued: 0 };
        }

        // 訂單彙總（以 paid_at 或 created_at 歸月）
        const statusTotals: Record<string, { count: number; total: number }> = {};
        for (const o of orders) {
          const dateRef = o.paid_at ?? o.created_at;
          const k = monthKey(dateRef);
          if (monthMap[k] && ["paid", "shipped", "completed"].includes(o.status)) {
            monthMap[k].revenue += o.total ?? 0;
            monthMap[k].orders  += 1;
          }
          // 狀態彙總
          if (!statusTotals[o.status]) statusTotals[o.status] = { count: 0, total: 0 };
          statusTotals[o.status].count += 1;
          statusTotals[o.status].total += o.total ?? 0;
        }

        // 購物金彙總
        for (const c of credits) {
          const k = monthKey(c.created_at);
          if (monthMap[k]) monthMap[k].creditIssued += c.amount ?? 0;
        }

        const monthList = Object.values(monthMap);
        const bdList = Object.entries(statusTotals)
          .map(([status, v]) => ({ status, ...v }))
          .sort((a, b) => b.count - a.count);

        if (active) {
          setMonths(monthList);
          setBreakdown(bdList);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // 計算 KPI
  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const totalOrders  = months.reduce((s, m) => s + m.orders, 0);
  const totalCredit  = months.reduce((s, m) => s + m.creditIssued, 0);
  const maxRevenue   = Math.max(...months.map(m => m.revenue), 1);

  const STATUS_LABEL: Record<string, string> = {
    pending: "待付款", paid: "已付款", shipped: "已出貨",
    completed: "已完成", cancelled: "已取消", refunded: "已退款",
  };

  return (
    <AdminShell title="營業報表">
      {loading && <p className={styles.muted}>載入中…</p>}
      {error   && <div className={styles.alert}>{error}</div>}

      {!loading && !error && (
        <>
          {/* KPI 卡片 */}
          <div className={styles.stats}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>近 12 個月營業額</span>
              <span className={styles.statValue}>{fmtNTD(totalRevenue)}</span>
              <span className={styles.statSub}>付款 / 出貨 / 完成</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>近 12 個月訂單數</span>
              <span className={styles.statValue}>{totalOrders.toLocaleString("zh-TW")}</span>
              <span className={styles.statSub}>筆</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>近 12 個月購物金發放</span>
              <span className={styles.statValue}>{fmtNTD(totalCredit)}</span>
              <span className={styles.statSub}>earn 類型</span>
            </div>
          </div>

          {/* 長條圖 */}
          <div className={styles.card} style={{ marginBottom: "1.5rem" }}>
            <div className={styles.toolbar} style={{ marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>月營業額（近 12 個月）</h3>
              <div className={styles.toolbarRight}>
                <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => downloadCsv(months)}>
                  ⬇ 匯出 CSV
                </button>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "180px", padding: "0 4px" }}>
              {months.map(m => {
                const pct = maxRevenue > 0 ? (m.revenue / maxRevenue) * 100 : 0;
                return (
                  <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", height: "100%" }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                      <div
                        title={`${m.label}：${fmtNTD(m.revenue)}`}
                        style={{
                          width: "100%",
                          height: `${Math.max(pct, m.revenue > 0 ? 2 : 0)}%`,
                          background: "var(--enso-gold, #c9a063)",
                          borderRadius: "3px 3px 0 0",
                          transition: "height .3s ease",
                          minHeight: m.revenue > 0 ? "4px" : "0",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: "10px", color: "var(--enso-fg, #f5eee0)", opacity: .6, writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1 }}>
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 訂單狀態彙總表 */}
          <div className={styles.card}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 600 }}>訂單狀態彙總</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>狀態</th>
                    <th style={{ textAlign: "right" }}>筆數</th>
                    <th style={{ textAlign: "right" }}>金額合計</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map(b => (
                    <tr key={b.status}>
                      <td>
                        <span className={styles.badge} style={{
                          background: b.status === "completed" ? "var(--enso-gold,#c9a063)" :
                                      b.status === "refunded"  ? "#e07070" :
                                      b.status === "cancelled" ? "#888" : "#3a4a3a",
                          color: b.status === "completed" ? "#1a1512" : undefined,
                        }}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{b.count.toLocaleString("zh-TW")}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtNTD(b.total)}</td>
                    </tr>
                  ))}
                  {breakdown.length === 0 && (
                    <tr><td colSpan={3} className={styles.muted}>無訂單資料</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
