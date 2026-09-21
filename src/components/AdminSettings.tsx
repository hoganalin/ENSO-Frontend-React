// src/components/AdminSettings.tsx — 後台系統設定（購物金比例）
import { useEffect, useState, type JSX } from "react";

import AdminShell from "./AdminShell";
import { getCurrentProfile } from "@/services/db/auth";
import { getCashbackRate, setCashbackRate } from "@/services/db/settings";
import type { ProfileRow } from "@/services/db/types";
import styles from "@/styles/Admin.module.css";

export default function AdminSettings(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [rate, setRate]       = useState<number>(10);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (p?.role === "admin") { const r = await getCashbackRate(); if (active) setRate(r); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "載入失敗"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try { await setCashbackRate(rate); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (e) { setError(e instanceof Error ? e.message : "儲存失敗"); }
    finally { setSaving(false); }
  };

  if (loading) return <AdminShell title="系統設定"><p className={styles.muted}>載入中…</p></AdminShell>;
  if (error)   return <AdminShell title="系統設定"><div className={styles.alert}>{error}</div></AdminShell>;
  if (!profile || profile.role !== "admin") return (
    <AdminShell title="系統設定"><div className={styles.alert}>此頁僅限最高管理者存取。</div></AdminShell>
  );

  return (
    <AdminShell title="系統設定">
      <div className={styles.card} style={{ maxWidth: "36rem" }}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>推薦購物金比例（%）</label>
          <p className={styles.muted} style={{ marginBottom: ".75rem" }}>普通會員推薦他人消費時，可獲得的購物金比例（全站單一）。</p>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", maxWidth: "16rem" }}>
            <input
              type="number" className={styles.formControl}
              min={0} max={100} value={rate}
              onChange={e => setRate(Number(e.target.value))}
            />
            <span style={{ fontSize: "1.1rem" }}>%</span>
          </div>
          <div style={{ display: "flex", gap: ".5rem", marginTop: ".75rem" }}>
            {[10, 20].map(p => (
              <button key={p} type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={() => setRate(p)}>{p}%</button>
            ))}
          </div>
        </div>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSave} disabled={saving}>
          {saving ? "儲存中…" : saved ? "已儲存 ✓" : "儲存設定"}
        </button>
      </div>
    </AdminShell>
  );
}
