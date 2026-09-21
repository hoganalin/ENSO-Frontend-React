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

  return (
    <AdminShell title="系統設定">
      <div style={{ maxWidth: "48rem" }}>
        <p className={styles.muted} style={{ marginBottom: "1.5rem" }}>
          推薦購物金依推薦人等級分級發放。普通會員推薦下線消費不發購物金；
          銀卡與金卡各有獨立比例，可在此調整。
        </p>

        {/* ── 銀卡 ── */}
        <div className={styles.card} style={{ marginBottom: "1.25rem", borderLeft: "4px solid #9ca3af" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <span style={{
              background: "linear-gradient(135deg, #7b8fa0, #b0bec5)",
              borderRadius: "50%",
              width: "2.2rem", height: "2.2rem",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.85rem", fontWeight: 700, color: "#1a1d1b", flexShrink: 0,
            }}>銀</span>
            <div>
              <h2 style={{ fontSize: "1rem", color: "#b0bec5", margin: 0, letterSpacing: ".05em" }}>
                銀卡會員推薦購物金
              </h2>
              <p className={styles.muted} style={{ fontSize: "0.8rem", margin: 0 }}>
                Silver Card Member Referral Credit
              </p>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <span style={{
                fontSize: "3rem", fontWeight: 700,
                color: "#b0bec5",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}>{silverRate}</span>
              <span style={{ fontSize: "1.3rem", color: "#b0bec5", marginLeft: "2px" }}>%</span>
            </div>
          </div>
          <p className={styles.muted} style={{ marginBottom: "1rem", fontSize: "0.85rem", borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: ".75rem" }}>
            銀卡會員的下線完成訂單後，推薦人可獲得的購物金回饋比例。
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="number"
                className={styles.formControl}
                min={0} max={100} value={silverRate}
                onChange={e => setSilverRate(Math.max(0, Math.min(100, Number(e.target.value))))}
                style={{ width: "6rem", textAlign: "center", fontSize: "1.1rem" }}
              />
              <span style={{ color: "var(--fg-muted)", fontSize: "1rem" }}>%</span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[5, 10, 15].map(p => (
                <button
                  key={p} type="button"
                  className={`${styles.btn} ${styles.btnSm}`}
                  style={silverRate === p ? {
                    border: "1px solid #9ca3af", color: "#d1d5db", background: "rgba(156,163,175,.12)"
                  } : {}}
                  onClick={() => setSilverRate(p)}
                >{p}%</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 金卡 ── */}
        <div className={styles.card} style={{ marginBottom: "1.75rem", borderLeft: "4px solid #c9a063" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <span style={{
              background: "linear-gradient(135deg, #c9a063, #e8c97a)",
              borderRadius: "50%",
              width: "2.2rem", height: "2.2rem",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.85rem", fontWeight: 700, color: "#1a1d1b", flexShrink: 0,
            }}>金</span>
            <div>
              <h2 style={{ fontSize: "1rem", color: "#c9a063", margin: 0, letterSpacing: ".05em" }}>
                金卡會員推薦購物金
              </h2>
              <p className={styles.muted} style={{ fontSize: "0.8rem", margin: 0 }}>
                Gold Card Member Referral Credit
              </p>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <span style={{
                fontSize: "3rem", fontWeight: 700,
                color: "#c9a063",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}>{goldRate}</span>
              <span style={{ fontSize: "1.3rem", color: "#c9a063", marginLeft: "2px" }}>%</span>
            </div>
          </div>
          <p className={styles.muted} style={{ marginBottom: "1rem", fontSize: "0.85rem", borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: ".75rem" }}>
            金卡會員的下線完成訂單後，推薦人可獲得的購物金回饋比例。
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="number"
                className={styles.formControl}
                min={0} max={100} value={goldRate}
                onChange={e => setGoldRate(Math.max(0, Math.min(100, Number(e.target.value))))}
                style={{ width: "6rem", textAlign: "center", fontSize: "1.1rem" }}
              />
              <span style={{ color: "var(--fg-muted)", fontSize: "1rem" }}>%</span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[15, 20, 25].map(p => (
                <button
                  key={p} type="button"
                  className={`${styles.btn} ${styles.btnSm}`}
                  style={goldRate === p ? {
                    border: "1px solid #c9a063", color: "#c9a063", background: "rgba(201,160,99,.12)"
                  } : {}}
                  onClick={() => setGoldRate(p)}
                >{p}%</button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={handleSave}
          disabled={saving}
          style={{ minWidth: "9rem" }}
        >
          {saving ? "儲存中…" : saved ? "✓ 已儲存" : "儲存設定"}
        </button>
      </div>
    </AdminShell>
  );
}
