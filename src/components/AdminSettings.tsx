// src/components/AdminSettings.tsx — 後台系統設定（購物金比例）
import { useEffect, useState, type JSX } from "react";

import { usePageTitle } from "@/hooks/usePageTitle";
import { getCurrentProfile } from "@/services/db/auth";
import { getCashbackRate, setCashbackRate } from "@/services/db/settings";
import type { ProfileRow } from "@/services/db/types";

const GOLD = "#c9a063";

export default function AdminSettings(): JSX.Element {
  usePageTitle("系統設定");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [rate, setRate] = useState<number>(10);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (p?.role === "admin") {
          const r = await getCashbackRate();
          if (active) setRate(r);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setSaved(false);
    try {
      await setCashbackRate(rate);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="container py-5 text-center text-muted">載入中…</div>;
  if (error) return <div className="container py-5 text-center text-danger">{error}</div>;
  if (!profile || profile.role !== "admin") {
    return (
      <div className="container py-5 text-center text-muted">
        此頁僅限最高管理者存取。
      </div>
    );
  }

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4" style={{ letterSpacing: 2 }}>
        系統設定
      </h1>

      <div className="card">
        <div className="card-body">
          <label className="form-label">推薦購物金比例（%）</label>
          <div className="text-muted small mb-3">
            普通會員推薦他人消費時，可獲得的購物金比例（全站單一）。
          </div>
          <div className="d-flex align-items-center gap-3" style={{ maxWidth: 320 }}>
            <input
              type="number"
              className="form-control"
              min={0}
              max={100}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            />
            <span className="fs-5">%</span>
          </div>
          <div className="d-flex gap-2 mt-3">
            {[10, 20].map((preset) => (
              <button
                key={preset}
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setRate(preset)}
              >
                {preset}%
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn mt-4"
            style={{ background: GOLD, color: "#1a1512", fontWeight: 600 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "儲存中…" : saved ? "已儲存 ✓" : "儲存設定"}
          </button>
        </div>
      </div>
    </div>
  );
}
