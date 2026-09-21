// src/components/AdminMembers.tsx — 後台：會員管理
import React from "react";
import { useEffect, useState, type JSX, type FormEvent } from "react";
import AdminShell from "./AdminShell";
import styles from "@/styles/Admin.module.css";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { ProfileRow, UserRole } from "@/services/db/types";

const GOLD = "#c9a063";
const PAGE_SIZE = 20;

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "customer", label: "一般會員" },
  { value: "referral_partner", label: "推薦夥伴" },
  { value: "distributor", label: "經銷商" },
  { value: "support", label: "客服人員" },
  { value: "warehouse", label: "倉儲人員" },
  { value: "marketing", label: "行銷人員" },
  { value: "finance", label: "財務人員" },
];

const TIER_OPTIONS = [
  { value: "normal", label: "一般" },
  { value: "silver", label: "銀卡" },
  { value: "gold", label: "金卡" },
];

type MemberRow = Pick<ProfileRow, "id" | "name" | "phone" | "role" | "member_tier" | "referral_code" | "created_at">;

// ── CSV 匯出工具 ──────────────────────────────────────────────────
function downloadMembersCSV(rows: MemberRow[]): void {
  const headers = ["姓名", "電話", "等級", "角色", "推薦碼", "加入日期"];
  const lines = [
    headers.join(","),
    ...rows.map((m) => [
      m.name ?? "",
      m.phone ?? "",
      TIER_OPTIONS.find((t) => t.value === (m.member_tier as string))?.label ?? m.member_tier,
      ROLE_OPTIONS.find((r) => r.value === m.role)?.label ?? m.role,
      m.referral_code ?? "",
      new Date(m.created_at).toLocaleDateString("zh-TW"),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","))
  ];
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `ENSO_會員資料_${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 主元件 ────────────────────────────────────────────────────────
export default function AdminMembers(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [editRole, setEditRole] = useState<UserRole>("customer");
  const [editTier, setEditTier] = useState("normal");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (p?.role === "admin") {
          const { data, error: dbErr } = await supabase
            .from("profiles")
            .select("id, name, phone, role, member_tier, referral_code, created_at")
            .neq("role", "admin")
            .order("created_at", { ascending: false });
          if (dbErr) throw dbErr;
          if (active) setMembers((data ?? []) as MemberRow[]);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const filtered = members.filter((m) => {
    const matchSearch =
      !search ||
      (m.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (m.phone ?? "").includes(search) ||
      (m.referral_code ?? "").toLowerCase().includes(search.toLowerCase());
    const matchTier = !tierFilter || (m.member_tier as string) === tierFilter;
    return matchSearch && matchTier;
  });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // 統計摘要
  const goldCount = members.filter((m) => (m.member_tier as string) === "gold").length;
  const silverCount = members.filter((m) => (m.member_tier as string) === "silver").length;
  const normalCount = members.filter((m) => (m.member_tier as string) === "normal").length;

  function openEdit(m: MemberRow) {
    setEditing(m);
    setEditRole(m.role);
    setEditTier(m.member_tier as string);
    setSaveError(null);
  }
  function closeEdit() { setEditing(null); setSaveError(null); }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ role: editRole, member_tier: editTier })
        .eq("id", editing.id);
      if (dbErr) throw dbErr;
      setMembers((prev) =>
        prev.map((m) =>
          m.id === editing.id
            ? { ...m, role: editRole, member_tier: editTier as ProfileRow["member_tier"] }
            : m
        )
      );
      closeEdit();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <AdminShell title="會員管理"><p className={styles.muted}>載入中…</p></AdminShell>;
  if (error) return <AdminShell title="會員管理"><div className={styles.alert}>{error}</div></AdminShell>;
  if (!profile || profile.role !== "admin") return (
    <AdminShell title="會員管理"><div className={styles.alert}>此頁僅限最高管理者存取。</div></AdminShell>
  );

  const statCard = (label: string, count: number, accent?: string) => (
    <div
      style={{
        flex: "1 1 140px",
        padding: "1rem 1.25rem",
        background: "var(--enso-bg-elevated, #2a2e2b)",
        border: "1px solid var(--line-strong, #a8864d)",
        borderRadius: 6,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: ".78rem", opacity: .7, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "1.6rem", color: accent ?? "var(--enso-fg,#f5eee0)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
        {count}
      </div>
    </div>
  );

  return (
    <AdminShell title="會員管理">

      {/* 統計摘要 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {statCard("總會員數", members.length)}
        {statCard("金卡", goldCount, GOLD)}
        {statCard("銀卡", silverCount, "#b0b0b0")}
        {statCard("一般", normalCount)}
      </div>

      {/* 搜尋 + 篩選 + 匯出 */}
      <div className="row g-2 mb-3 align-items-center">
        <div className="col-auto">
          <input
            type="search"
            className="form-control"
            placeholder="搜尋姓名、電話或推薦碼…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            style={{ maxWidth: 260 }}
          />
        </div>
        <div className="col-auto">
          <select
            className="form-select"
            value={tierFilter}
            onChange={(e) => { setTierFilter(e.target.value); setPage(0); }}
          >
            <option value="">所有等級</option>
            {TIER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="col-auto" style={{ opacity: .65, fontSize: ".875rem" }}>
          共 {filtered.length} 筆
        </div>
        <div className="col-auto ms-auto">
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: GOLD, color: "#1a1512", fontWeight: 600, border: "none" }}
            onClick={() => downloadMembersCSV(filtered)}
            disabled={filtered.length === 0}
          >
            匯出會員資料 CSV
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table align-middle" style={{ "--bs-table-bg": "transparent", "--bs-table-color": "var(--enso-fg,#f5eee0)", "--bs-table-border-color": "rgba(168,134,77,.3)" } as React.CSSProperties}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line-strong,#a8864d)" }}>
              <th>姓名</th>
              <th>電話</th>
              <th>等級</th>
              <th>角色</th>
              <th>推薦碼</th>
              <th>加入日期</th>
              <th style={{ width: 70 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid rgba(168,134,77,.2)" }}>
                <td>{m.name ?? "—"}</td>
                <td className="font-monospace small">{m.phone ?? "—"}</td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background:
                        (m.member_tier as string) === "gold"
                          ? GOLD
                          : (m.member_tier as string) === "silver"
                          ? "#888"
                          : "#3a3e3b",
                      color: (m.member_tier as string) === "gold" ? "#1a1512" : "#e0e0e0",
                    }}
                  >
                    {TIER_OPTIONS.find((t) => t.value === (m.member_tier as string))?.label ?? m.member_tier}
                  </span>
                </td>
                <td className="small" style={{ opacity: .75 }}>
                  {ROLE_OPTIONS.find((r) => r.value === m.role)?.label ?? m.role}
                </td>
                <td className="font-monospace small" style={{ color: GOLD }}>{m.referral_code ?? "—"}</td>
                <td className="small" style={{ opacity: .75 }}>{new Date(m.created_at).toLocaleDateString("zh-TW")}</td>
                <td>
                  <button type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={() => openEdit(m)}>
                    編輯
                  </button>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-4" style={{ opacity: .5 }}>
                  {search || tierFilter ? "找不到符合的會員" : "尚無會員資料"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="d-flex align-items-center gap-2 mt-2">
          <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>‹</button>
          <span className="small" style={{ opacity: .65 }}>{page + 1} / {totalPages}</span>
          <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>›</button>
        </div>
      )}

      {/* 編輯 Modal */}
      {editing && (
        <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.65)" }} onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="modal-dialog">
            <div className="modal-content" style={{ background: "var(--enso-bg-elevated,#2a2e2b)", color: "var(--enso-fg,#f5eee0)", border: "1px solid var(--line-strong,#a8864d)" }}>
              <div className="modal-header" style={{ borderBottom: "1px solid var(--line-strong,#a8864d)" }}>
                <h5 className="modal-title">編輯會員：{editing.name ?? editing.id.slice(0, 8)}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={closeEdit} />
              </div>
              <form onSubmit={handleSave}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">會員等級</label>
                    <select className="form-select" value={editTier} onChange={(e) => setEditTier(e.target.value)} style={{ background: "#1a1d1b", color: "var(--enso-fg,#f5eee0)", border: "1px solid var(--line-strong,#a8864d)" }}>
                      {TIER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">角色權限</label>
                    <select className="form-select" value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)} style={{ background: "#1a1d1b", color: "var(--enso-fg,#f5eee0)", border: "1px solid var(--line-strong,#a8864d)" }}>
                      {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  {saveError && <div className="text-danger small">{saveError}</div>}
                </div>
                <div className="modal-footer" style={{ borderTop: "1px solid var(--line-strong,#a8864d)" }}>
                  <button type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={closeEdit}>取消</button>
                  <button type="submit" className="btn btn-sm" style={{ background: GOLD, color: "#1a1512", fontWeight: 600 }} disabled={saving}>
                    {saving ? "儲存中…" : "儲存"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
