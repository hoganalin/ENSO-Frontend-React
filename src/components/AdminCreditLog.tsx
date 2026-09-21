// src/components/AdminCreditLog.tsx — 購物金帳本
import { useEffect, useState, type JSX, type ChangeEvent } from "react";
import AdminShell from "./AdminShell";
import { supabase } from "@/services/supabaseClient";
import styles from "@/styles/Admin.module.css";

// ── 型別 ─────────────────────────────────────────────────────────────────────
interface LedgerRow {
  id: string;
  member_id: string;
  member_name: string;
  member_phone: string;
  type: string;
  amount: number;
  order_id: string | null;
  created_at: string;
  expires_at: string | null;
}

// ── 常數 ─────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 30;

const TYPE_LABEL: Record<string, string> = {
  earn:    "回饋入帳",
  spend:   "消費扣除",
  expire:  "到期失效",
  manual:  "人工調整",
  refund:  "退款回補",
};

const TYPE_COLOR: Record<string, string> = {
  earn:   "var(--enso-gold,#c9a063)",
  spend:  "#e07070",
  expire: "#888",
  manual: "#6fa8dc",
  refund: "#81b96f",
};

function fmtNTD(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}NT$ ${n.toLocaleString("zh-TW")}`;
}

function downloadCsv(rows: LedgerRow[]): void {
  const header = "日期,會員姓名,電話,類型,金額,訂單ID,到期日\n";
  const body = rows.map(r =>
    [
      r.created_at.slice(0, 10),
      r.member_name,
      r.member_phone,
      TYPE_LABEL[r.type] ?? r.type,
      r.amount,
      r.order_id ?? "",
      r.expires_at?.slice(0, 10) ?? "",
    ].join(",")
  ).join("\n");
  const blob = new Blob(["﻿" + header + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `enso_credit_log_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 元件 ─────────────────────────────────────────────────────────────────────
export default function AdminCreditLog(): JSX.Element {
  const [rows, setRows]         = useState<LedgerRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filterType, setFilterType]   = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterMember, setFilterMember] = useState("");
  const [page, setPage]         = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // 取最近 6 個月的帳本 + join profiles
        const since = new Date();
        since.setMonth(since.getMonth() - 5);
        since.setDate(1);
        since.setHours(0, 0, 0, 0);

        const { data, error: err } = await supabase
          .from("store_credit_ledger")
          .select(`
            id,
            member_id,
            type,
            amount,
            order_id,
            created_at,
            expires_at,
            profiles:member_id (name, phone)
          `)
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(2000);

        if (err) throw err;

        const mapped: LedgerRow[] = (data ?? []).map((d: any) => ({
          id:           d.id,
          member_id:    d.member_id,
          member_name:  d.profiles?.name  ?? "—",
          member_phone: d.profiles?.phone ?? "—",
          type:         d.type,
          amount:       d.amount ?? 0,
          order_id:     d.order_id,
          created_at:   d.created_at,
          expires_at:   d.expires_at,
        }));

        if (active) { setRows(mapped); setPage(0); }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // 篩選
  const filtered = rows.filter(r => {
    if (filterType   && r.type !== filterType) return false;
    if (filterMonth  && !r.created_at.startsWith(filterMonth)) return false;
    if (filterMember && !r.member_name.includes(filterMember) && !r.member_phone.includes(filterMember)) return false;
    return true;
  });

  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
  const paged       = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0);

  // 月份選單（從資料推導）
  const monthOptions = Array.from(new Set(rows.map(r => r.created_at.slice(0, 7)))).sort().reverse();

  const handleType   = (e: ChangeEvent<HTMLSelectElement>) => { setFilterType(e.target.value);   setPage(0); };
  const handleMonth  = (e: ChangeEvent<HTMLSelectElement>) => { setFilterMonth(e.target.value);  setPage(0); };
  const handleMember = (e: ChangeEvent<HTMLInputElement>)  => { setFilterMember(e.target.value); setPage(0); };

  return (
    <AdminShell title="購物金帳本">
      {loading && <p className={styles.muted}>載入中…</p>}
      {error   && <div className={styles.alert}>{error}</div>}

      {!loading && !error && (
        <>
          {/* 工具列 */}
          <div className={styles.toolbar} style={{ marginBottom: "1rem", flexWrap: "wrap", gap: "8px" }}>
            <select className={styles.formControl} value={filterType} onChange={handleType} style={{ width: "auto" }}>
              <option value="">所有類型</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select className={styles.formControl} value={filterMonth} onChange={handleMonth} style={{ width: "auto" }}>
              <option value="">所有月份</option>
              {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <input
              className={styles.formControl}
              placeholder="搜尋姓名 / 電話"
              value={filterMember}
              onChange={handleMember}
              style={{ width: "180px" }}
            />
            <div className={styles.toolbarRight}>
              <span className={styles.muted} style={{ fontSize: ".85rem" }}>
                {filtered.length} 筆｜合計 {fmtNTD(totalAmount)}
              </span>
              <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => downloadCsv(filtered)} style={{ marginLeft: "12px" }}>
                ⬇ 匯出 CSV
              </button>
            </div>
          </div>

          {/* 表格 */}
          <div className={styles.card}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>會員</th>
                    <th>電話</th>
                    <th>類型</th>
                    <th style={{ textAlign: "right" }}>金額</th>
                    <th>訂單編號</th>
                    <th>到期日</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {r.created_at.slice(0, 10)}
                      </td>
                      <td>{r.member_name}</td>
                      <td style={{ color: "var(--enso-fg,#f5eee0)", opacity: .7 }}>{r.member_phone}</td>
                      <td>
                        <span className={styles.badge} style={{ background: TYPE_COLOR[r.type] ?? "#555", color: r.type === "earn" ? "#1a1512" : undefined }}>
                          {TYPE_LABEL[r.type] ?? r.type}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.amount >= 0 ? "var(--enso-gold,#c9a063)" : "#e07070" }}>
                        {fmtNTD(r.amount)}
                      </td>
                      <td style={{ fontSize: ".8rem", opacity: .7 }}>
                        {r.order_id ? r.order_id.slice(0, 8) + "…" : "—"}
                      </td>
                      <td style={{ fontSize: ".85rem", opacity: .7 }}>
                        {r.expires_at ? r.expires_at.slice(0, 10) : "—"}
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr><td colSpan={7} className={styles.muted}>無符合條件的資料</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 分頁 */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: "8px", padding: "1rem 0 .5rem" }}>
                <button className={`${styles.btn} ${styles.btnSm}`} disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  ‹ 上一頁
                </button>
                <span className={styles.muted} style={{ lineHeight: "2rem", fontSize: ".85rem" }}>
                  {page + 1} / {totalPages}
                </span>
                <button className={`${styles.btn} ${styles.btnSm}`} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  下一頁 ›
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </AdminShell>
  );
}
