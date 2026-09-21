// src/components/AdminSettings.tsx — 後台系統設定（購物金比例）
import { useEffect, useState, type JSX } from "react";

import AdminShell from "./AdminShell";
import { getCurrentProfile } from "@/services/db/auth";
import { getTierRates, setTierRates } from "@/services/db/settings";
import type { ProfileRow } from "@/services/db/types";
import styles from "@/styles/Admin.module.css";

export default function AdminSettings(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [silverRate, setSilverRate] = useState<number>(10);
  const [goldRate, setGoldRate]     = useState<number>(20);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (p?.role === "admin") {
          const rates = await getTierRates();
          if (active) {
            setSilverRate(rates.silverPercent);
            setGoldRate(rates.goldPercent);
          }
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "載入失敗"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      await setTierRates({ silverPercent: silverRate, goldPercent: goldRate });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    catch (e) { setError(e instanceof Error ? e.message : "儲存失敗"); }
    finally { setSaving(false); }
  };

  if (loading) return <AdminShell title="系統設定"><p className={styles.muted}>載入中…</p></AdminShell>;
  if (error)   return <AdminShell title="系統設定"><div className={styles.alert}>{error}</div></AdminShell>;
  if (!profile || profile.role !== "admin") return (
    <AdminShell title="系統設定"><div className={styles.alert}>此頁僅限最高管理者存取。</div></AdminShell>
  );

  const RateInput = ({
    label, sub, value, onChange, presets,
  }: {
    label: string; sub: string; value: number;
    onChange: (v: number) => void; presets: number[];
  }) => (
    <div className={styles.formGroup}>
      <label className={styles.formLabel}>{label}</label>
      <p className={styles.muted} style={{ marginBottom: ".75rem" }}>{sub}</p>
      <div style={{ display: "flex", alignItems: "center", gap: ".75rem", maxWidth: "16rem" }}>
        <input
          type="number" className={styles.formControl}
          min={0} max={100} value={value}
          onChange={e => onChange(Number(e.target.value))}
        />
        <span style={{ fontSize: "1.1rem" }}>%</span>
      </div>
      <div style={{ display: "flex", gap: ".5rem", marginTop: ".75rem" }}>
        {presets.map(p => (
          <button key={p} type="button" className={`${styles.btn} ${styles.btnSm}`}
            onClick={() => onChange(p)}>{p}%</button>
        ))}
      </div>
    </div>
  );

  return (
    <AdminShell title="系統設定">
      <div className={styles.card} style={{ maxWidth: "40rem" }}>
        <p className={styles.muted} style={{ marginBottom: "1.5rem" }}>
          推薦購物金依推薦人等級分級發放。普通會員推薦下線消費不發購物金；
          銀卡與金卡各有獨立比例，可在此調整。
        </p>

        <RateInput
          label="銀卡推薦購物金比例（%）"
          sub="銀卡會員的下線完成訂單後，推薦人可獲得的購物金比例（預設 10%）。"
          value={silverRate}
          onChange={setSilverRate}
          presets={[5, 10, 15]}
        />

        <RateInput
          label="金卡推薦購物金比例（%）"
          sub="金卡會員的下線完成訂單後，推薦人可獲得的購物金比例（預設 20%）。"
          value={goldRate}
          onChange={setGoldRate}
          presets={[15, 20, 25]}
        />

        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={handleSave} disabled={saving}>
          {saving ? "儲存中…" : saved ? "已儲存 ✓" : "儲存設定"}
        </button>
      </div>
    </AdminShell>
  );
}
