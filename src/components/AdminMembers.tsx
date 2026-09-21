// src/components/AdminMembers.tsx — 後台：會員管理
import { useEffect, useState, type JSX, type FormEvent } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
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
  { value: "standard", label: "一般" },
  { value: "silver", label: "銀卡" },
  { value: "gold", label: "金卡" },
];

type MemberRow = Pick<ProfileRow, "id" | "name" | "phone" | "role" | "member_tier" | "referral_code" | "created_at">;

export default function AdminMembers(): JSX.Element {
  usePageTitle("會員管理");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [editRole, setEditRole] = useState<UserRole>("customer");
  const [editTier, setEditTier] = useState("standard");
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

  const filtered = members.filter(m => {
    const matchSearch = !search ||
      (m.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (m.phone ?? "").includes(search) ||
      (m.referral_code ?? "").toLowerCase().includes(search.toLowerCase());
    const matchTier = !tierFilter || (m.member_tier as string) === tierFilter;
    return matchSearch && matchTier;
  });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
      setMembers(prev => prev.map(m =>
        m.id === editing.id
          ? { ...m, role: editRole, member_tier: editTier as ProfileRow["member_tier"] }
          : m
      ));
      closeEdit();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="container py-5 text-center text-muted">載入中…</div>;
  if (error) return <div className="container py-5 text-center text-danger">{error}</div>;
  if (!profile || profile.role !== "admin") {
    return <div className="container py-5 text-center text-muted">此頁僅限最高管理者存取。</div>;
  }

  return (
    <div className="container py-5" style={{ maxWidth: 1100 }}>
      <h1 className="h3 mb-4" style={{ letterSpacing: 2 }}>會員管理</h1>

      <div className="row g-2 mb-3">
        <div className="col-auto">
          <input
            type="search"
            className="form-control"
            placeholder="搜尋姓名、電話或推薦碼…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            style={{ maxWidth: 260 }}
          />
        </div>
        <div className="col-auto">
          <select
            className="form-select"
            value={tierFilter}
            onChange={e => { setTierFilter(e.target.value); setPage(0); }}
          >
            <option value="">所有等級</option>
            {TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="col-auto d-flex align-items-center text-muted small">
          共 {filtered.length} 筆
        </div>
      </div>

      <div className="table-responsive">
        <table className="table align-middle">
          <thead className="table-light">
            <tr>
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
            {paged.map(m => (
              <tr key={m.id}>
                <td>{m.name ?? "—"}</td>
                <td className="font-monospace small">{m.phone ?? "—"}</td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background: (m.member_tier as string) === "gold" ? GOLD : (m.member_tier as string) === "silver" ? "#aaa" : "#e9ecef",
                      color: (m.member_tier as string) === "gold" ? "#1a1512" : "#555",
                    }}
                  >
                    {TIER_OPTIONS.find(t => t.value === (m.member_tier as string))?.label ?? (m.member_tier as string)}
                  </span>
                </td>
                <td className="text-muted small">
                  {ROLE_OPTIONS.find(r => r.value === m.role)?.label ?? m.role}
                </td>
                <td className="font-monospace small" style={{ color: GOLD }}>{m.referral_code ?? "—"}</td>
                <td className="text-muted small">{new Date(m.created_at).toLocaleDateString("zh-TW")}</td>
                <td>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openEdit(m)}>
                    編輯
                  </button>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
                  {search || tierFilter ? "找不到符合的會員" : "尚無會員資料"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="d-flex align-items-center gap-2 mt-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>‹</button>
          <span className="text-muted small">{page + 1} / {totalPages}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>›</button>
        </div>
      )}

      {editing && (
        <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">編輯會員：{editing.name ?? editing.id.slice(0, 8)}</h5>
                <button type="button" className="btn-close" onClick={closeEdit} />
              </div>
              <form onSubmit={handleSave}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">會員等級</label>
                    <select className="form-select" value={editTier} onChange={e => setEditTier(e.target.value)}>
                      {TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">角色權限</label>
                    <select className="form-select" value={editRole} onChange={e => setEditRole(e.target.value as UserRole)}>
                      {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  {saveError && <div className="text-danger small">{saveError}</div>}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={closeEdit}>取消</button>
                  <button type="submit" className="btn btn-sm" style={{ background: GOLD, color: "#1a1512", fontWeight: 600 }} disabled={saving}>
                    {saving ? "儲存中…" : "儲存"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
