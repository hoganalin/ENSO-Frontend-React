// src/components/AdminPromotions.tsx — 後台：優惠活動管理
import { useEffect, useState, type JSX, type FormEvent } from "react";
import AdminShell from "./AdminShell";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { ProfileRow, PromotionRow, PromoGroupDb } from "@/services/db/types";
import styles from "@/styles/Admin.module.css";

const PAGE_SIZE = 15;
const GROUP_LABELS: Record<PromoGroupDb, string> = {
  coupon: "折扣碼", order: "滿額折", shipping: "免運", gift: "贈品", bundle: "組合優惠",
};

export default function AdminPromotions(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [promos, setPromos]   = useState<PromotionRow[]>([]);
  const [page, setPage]       = useState(0);
  const [editing, setEditing] = useState<PromotionRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName]       = useState("");
  const [formCode, setFormCode]       = useState("");
  const [formGroup, setFormGroup]     = useState<PromoGroupDb>("coupon");
  const [formActive, setFormActive]   = useState(true);
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt]   = useState("");
  const [formPriority, setFormPriority] = useState(0);
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (p?.role === "admin" || p?.role === "marketing") {
          const { data, error: dbErr } = await supabase.from("promotions").select("*").order("priority", { ascending: false });
          if (dbErr) throw dbErr;
          if (active) setPromos((data ?? []) as PromotionRow[]);
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "載入失敗"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const openCreate = () => {
    setEditing(null); setCreating(true);
    setFormName(""); setFormCode(""); setFormGroup("coupon");
    setFormActive(true); setFormStartsAt(""); setFormEndsAt(""); setFormPriority(0); setSaveError(null);
  };
  const openEdit = (p: PromotionRow) => {
    setCreating(false); setEditing(p);
    setFormName(p.name); setFormCode(p.code ?? ""); setFormGroup(p.promo_group);
    setFormActive(p.is_active); setFormStartsAt(p.starts_at?.slice(0,10) ?? "");
    setFormEndsAt(p.ends_at?.slice(0,10) ?? ""); setFormPriority(p.priority); setSaveError(null);
  };
  const closeModal = () => { setEditing(null); setCreating(false); };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setSaveError(null);
    const patch = { name: formName, code: formCode.trim().toUpperCase() || null, promo_group: formGroup,
      is_active: formActive, starts_at: formStartsAt || null, ends_at: formEndsAt || null, priority: formPriority };
    try {
      if (editing) {
        const { error: err } = await supabase.from("promotions").update(patch).eq("id", editing.id);
        if (err) throw err;
        setPromos(prev => prev.map(p => p.id === editing.id ? { ...p, ...patch } : p));
      } else {
        const { data, error: err } = await supabase.from("promotions")
          .insert({ ...patch, conditions: {}, effect: {}, is_auto: false }).select().single();
        if (err) throw err;
        setPromos(prev => [data as PromotionRow, ...prev]);
      }
      closeModal();
    } catch (e) { setSaveError(e instanceof Error ? e.message : "儲存失敗"); }
    finally { setSaving(false); }
  };

  const toggleActive = async (p: PromotionRow) => {
    const { error: err } = await supabase.from("promotions").update({ is_active: !p.is_active }).eq("id", p.id);
    if (!err) setPromos(prev => prev.map(r => r.id === p.id ? { ...r, is_active: !p.is_active } : r));
  };

  const totalPages = Math.ceil(promos.length / PAGE_SIZE);
  const paged = promos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) return <AdminShell title="促銷管理"><p className={styles.muted}>載入中…</p></AdminShell>;
  if (error)   return <AdminShell title="促銷管理"><div className={styles.alert}>{error}</div></AdminShell>;
  if (!profile || (profile.role !== "admin" && profile.role !== "marketing")) return (
    <AdminShell title="促銷管理"><div className={styles.alert}>此頁僅限管理者或行銷人員存取。</div></AdminShell>
  );

  const showModal = editing !== null || creating;

  return (
    <AdminShell title="促銷管理">
      <div className={styles.toolbar}>
        <span className={styles.muted}>{promos.length} 筆優惠</span>
        <div className={styles.toolbarRight}>
          {profile.role === "admin" && (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}>+ 新增優惠</button>
          )}
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr>
            <th>名稱</th><th>折扣碼</th><th>類型</th><th>期間</th>
            <th style={{ textAlign: "center" }}>狀態</th><th style={{ width: "5rem" }} />
          </tr></thead>
          <tbody>
            {paged.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td style={{ fontFamily: "monospace", color: "#c9a063" }}>{p.code ?? "—"}</td>
                <td className={styles.muted}>{GROUP_LABELS[p.promo_group]}</td>
                <td className={styles.muted} style={{ fontSize: ".8rem" }}>
                  {p.starts_at ? new Date(p.starts_at).toLocaleDateString("zh-TW") : "—"} → {p.ends_at ? new Date(p.ends_at).toLocaleDateString("zh-TW") : "長期"}
                </td>
                <td style={{ textAlign: "center" }}>
                  <button type="button" className={`${styles.btn} ${styles.btnSm}`}
                    style={{ background: p.is_active ? "#2e6b3c" : "transparent", borderColor: p.is_active ? "#2e6b3c" : undefined }}
                    onClick={() => toggleActive(p)} disabled={profile.role !== "admin"}>
                    {p.is_active ? "啟用" : "停用"}
                  </button>
                </td>
                <td style={{ textAlign: "right" }}>
                  {profile.role === "admin" && (
                    <button type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={() => openEdit(p)}>編輯</button>
                  )}
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem" }} className={styles.muted}>尚無優惠活動</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginTop: "1rem" }}>
          <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}>‹</button>
          <span className={styles.muted}>{page+1} / {totalPages}</span>
          <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1}>›</button>
        </div>
      )}

      {showModal && (
        <div className={styles.modalBackdrop} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editing ? "編輯優惠" : "新增優惠"}</h2>
              <button type="button" className={styles.modalClose} onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>活動名稱 *</label>
                  <input required className={styles.formControl} value={formName} onChange={e => setFormName(e.target.value)} />
                </div>
                <div className={styles.row2}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>折扣碼</label>
                    <input className={styles.formControl} style={{ textTransform: "uppercase" }}
                      value={formCode} onChange={e => setFormCode(e.target.value.toUpperCase())} placeholder="留空表示無碼" />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>類型</label>
                    <select className={styles.formControl} value={formGroup} onChange={e => setFormGroup(e.target.value as PromoGroupDb)}>
                      {(Object.entries(GROUP_LABELS) as [PromoGroupDb, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div className={styles.row2}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>開始日期</label>
                    <input type="date" className={styles.formControl} value={formStartsAt} onChange={e => setFormStartsAt(e.target.value)} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>結束日期</label>
                    <input type="date" className={styles.formControl} value={formEndsAt} onChange={e => setFormEndsAt(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: ".75rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: ".5rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} />
                    <span>立即啟用</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                    <span className={styles.muted}>優先度</span>
                    <input type="number" className={styles.formControl} style={{ width: "5rem" }}
                      value={formPriority} onChange={e => setFormPriority(+e.target.value)} />
                  </label>
                </div>
                {saveError && <div className={styles.alert}>{saveError}</div>}
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btn} onClick={closeModal}>取消</button>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
                  {saving ? "儲存中…" : "儲存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
