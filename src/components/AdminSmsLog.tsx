// src/components/AdminSmsLog.tsx — 後台：簡訊發送紀錄（demo 為模擬）
import { useEffect, useState, type JSX } from "react";

import { usePageTitle } from "@/hooks/usePageTitle";
import { getCurrentProfile } from "@/services/db/auth";
import { listRecentSms, type SmsRow } from "@/services/db/sms";
import type { ProfileRow } from "@/services/db/types";

const STAFF_ROLES = ["support", "warehouse", "marketing", "finance", "admin"];
const fmtTime = (iso: string): string => new Date(iso).toLocaleString("zh-TW");

export default function AdminSmsLog(): JSX.Element {
  usePageTitle("簡訊發送紀錄");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [rows, setRows] = useState<SmsRow[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (p && STAFF_ROLES.includes(p.role)) {
          const list = await listRecentSms();
          if (active) setRows(list);
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

  if (loading) return <div className="container py-5 text-center text-muted">載入中…</div>;
  if (error) return <div className="container py-5 text-center text-danger">{error}</div>;
  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    return <div className="container py-5 text-center text-muted">此頁僅限內部人員存取。</div>;
  }

  return (
    <div className="container py-5" style={{ maxWidth: 960 }}>
      <h1 className="h3 mb-2" style={{ letterSpacing: 2 }}>
        簡訊發送紀錄
      </h1>
      <p className="text-muted small mb-4">Demo 為模擬發送，實戰改由後端呼叫簡訊商（三竹／EVERY8D）。</p>

      <div className="table-responsive">
        <table className="table align-middle">
          <thead>
            <tr>
              <th style={{ width: 170 }}>時間</th>
              <th style={{ width: 140 }}>收件人</th>
              <th>內容</th>
              <th style={{ width: 90 }}>狀態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="text-muted small">{fmtTime(s.created_at)}</td>
                <td>{s.to_phone ?? "—"}</td>
                <td>{s.message}</td>
                <td>
                  <span className="badge text-bg-success">已送達</span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-4">
                  尚無簡訊紀錄。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
