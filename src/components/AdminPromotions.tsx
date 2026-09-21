// src/components/AdminPromotions.tsx — 後台：優惠活動管理
import { useEffect, useState, type JSX, type FormEvent } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { ProfileRow, PromotionRow, PromoGroupDb } from "@/services/db/types";

const GOLD = "#c9a063";
const PAGE_SIZE = 15;

const GROUP_LABELS: Record<PromoGroupDb, string> = {
  coupon: "折扣碼",
  order: "滿額折",
  shipping: "免運",
  gift: "贈品",
  bundle: "組合優惠",
};

export default function AdminPromotions(): JSX.Element {
  usePageTitle("優惠活動");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [promos, setPromos] = useState<PromotionRow[]>([]);
  const [page, setPage] = useState(0);

  // Modal state
  const [editing, setEditing] = useState<PromotionRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formGroup, setFormGroup] = useState<PromoGroupDb>("coupon");
  const [formActive, setFormActive] = useState(true);
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formPriority, setFormPriority] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (p?.role === "admin" || p?.role === "marketing") {
          const { data, error: dbErr } = await supabase
            .from("promotions")
            .select("*")
            .order("priority", { ascending: false });
          if (dbErr) throw dbErr;
          if (active) setPromos((data ?? []) as PromotionRow[]);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setFormName(""); setFormCode(""); setFormGroup("coupon");
    setFormActive(true); setFormStartsAt(""); setFormEndsAt("");
    setFormPriority(0); setSaveError(null);
  }

  function openEdit(p: PromotionRow) {
    setCreating(false);
    setEditing(p);
    setFormName(p.name);
    setFormCode(p.code ?? "");
    setFormGroup(p.promo_group);
    setFormActive(p.is_active);
    setFormStartsAt(p.starts_at?.slice(0, 10) ?? "");
    setFormEndsAt(p.ends_at?.slice(0, 10) ?? "");
    setFormPriority(p.priority);
    setSaveError(null);
  }

  function closeModal() { setEditing(null); setCreating(false); }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const patch = {
      name: formName,
      code: formCode.trim().toUpperCase() || null,
      promo_group: formGroup,
      is_active: formActive,
      starts_at: formStartsAt || null,
      ends_at: formEndsAt || null,
      priority: formPriority,
    };
    try {
      if (editing) {
        const { error: err } = await supabase.from("promotions").update(patch).eq("id", editing.id);
        if (err) throw err;
        setPromos(prev => prev.map(p => p.id === editing.id ? { ...p, ...patch } : p));
      } else {
        const { data, error: err } = await supabase
          .from("promotions")
          .insert({ ...patch, conditions: {}, effect: {}, is_auto: false })
          .select()
          .single();
        if (err) throw err;
        setPromos(prev => [data as PromotionRow, ...prev]);
      }
      closeModal();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: PromotionRow) {
    const { error: err } = await supabase.from("promotions").update({ is_active: !p.is_active }).eq("id", p.id);
    if (!err) setPromos(prev => prev.map(r => r.id === p.id ? { ...r, is_active: !p.is_active } : r));
  }

  const totalPages = Math.ceil(promos.length / PAGE_SIZE);
  const paged = promos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) return <div className="container py-5 text-center text-muted">載入中…</div>;
  if (error) return <div className="container py-5 text-center text-danger">{error}</div>;
  if (!profile || (profile.role !== "admin" && profile.role !== "marketing")) {
    return <div className="container py-5 text-center text-muted">此頁僅限管理者或行銷人員存取。</div>;
  }

  const showModal = editing !== null || creating;

  return (
    <div className="container py-5" style={{ maxWidth: 1000 }}>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h1 className="h3 mb-0" style={{ letterSpacing: 2 }}>優惠活動</h1>
        {profile.role === "admin" && (
          <button type="button" className="btn btn-sm" style={{ background: GOLD, color: "#1a1512", fontWeight: 600 }} onClick={openCreate}>
            + 新增優惠
          </button>
        )}
      </div>

      <div className="table-responsive">
        <table className="table align-middle">
          <thead className="table-light">
            <tr>
              <th>名稱</th>
              <th>折扣碼</th>
              <th>類型</th>
              <th>期間</th>
              <th className="text-center">狀態</th>
              <th style={{ width: 70 }} />
            </tr>
          </thead>
          <tbody>
            {paged.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="font-monospace small" style={{ color: GOLD }}>{p.code ?? "—"}</td>
                <td className="text-muted small">{GROUP_LABELS[p.promo_group]}</td>
                <td className="text-muted small">
                  {p.starts_at ? new Date(p.starts_at).toLocaleDateString("zh-TW") : "—"}
                  {" → "}
                  {p.ends_at ? new Date(p.ends_at).toLocaleDateString("zh-TW") : "長期"}
                </td>
                <td className="text-center">
                  <button
                    type="button"
                    className={`btn btn-sm ${p.is_active ? "btn-success" : "btn-outline-secondary"}`}
                    style={{ fontSize: "0.75rem", minWidth: 52 }}
                    onClick={() => toggleActive(p)}
                    disabled={profile.role !== "admin"}
                  >
                    {p.is_active ? "啟用" : "停用"}
                  </button>
                </td>
                <td className="text-end">
                  {profile.role === "admin" && (
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openEdit(p)}>
                      編輯
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">尚無優惠活動</td>
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

      {showModal && (
        <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editing ? "編輯優惠" : "新增優惠"}</h5>
                <button type="button" className="btn-close" onClick={closeModal} />
              </div>
              <form onSubmit={handleSave}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">活動名稱 *</label>
                    <input required className="form-control" value={formName} onChange={e => setFormName(e.target.value)} />
                  </div>
                  <div className="row g-3 mb-3">
                    <div className="col-6">
                      <label className="form-label">折扣碼</label>
                      <input className="form-control" style={{ textTransform: "uppercase" }}
                        value={formCode} onChange={e => setFormCode(e.target.value.toUpperCase())} placeholder="留空表示無碼" />
                    </div>
                    <div className="col-6">
                      <label className="form-label">類型</label>
                      <select className="form-select" value={formGroup} onChange={e => setFormGroup(e.target.value as PromoGroupDb)}>
                        {(Object.entries(GROUP_LABELS) as [PromoGroupDb, string][]).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="row g-3 mb-3">
                    <div className="col-6">
                      <label className="form-label">開始日期</label>
                      <input type="date" className="form-control" value={formStartsAt} onChange={e => setFormStartsAt(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label">結束日期</label>
                      <input type="date" className="form-control" value={formEndsAt} onChange={e => setFormEndsAt(e.target.value)} />
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-4 mb-3">
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" id="promo_active_chk"
                        checked={formActive} onChange={e => setFormActive(e.target.checked)} />
                      <label className="form-check-label" htmlFor="promo_active_chk">立即啟用</label>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <label className="small text-muted">優先度</label>
                      <input type="number" className="form-control form-control-sm" style={{ width: 72 }}
                        value={formPriority} onChange={e => setFormPriority(+e.target.value)} />
                    </div>
                  </div>
                  {saveError && <div className="text-danger small">{saveError}</div>}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={closeModal}>取消</button>
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
