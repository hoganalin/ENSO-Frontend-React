// src/components/AdminSmsLog.tsx — 後台：簡訊發送紀錄（demo 為模擬）
import { useEffect, useState, type JSX } from "react";

import { usePageTitle } from "@/hooks/usePageTitle";
import { getCurrentProfile } from "@/services/db/auth";
import { listRecentSms, type SmsRow } from "@/services/db/sms";
import { supabase } from "@/lib/supabase";
import type { ProfileRow } from "@/services/db/types";

const STAFF_ROLES = ["support", "warehouse", "marketing", "finance", "admin"];
const fmtTime = (iso: string): string => new Date(iso).toLocaleString("zh-TW");

export default function AdminSmsLog(): JSX.Element {
  usePageTitle("簡訊發送紀錄");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [rows, setRows] = useState<SmsRow[]>([]);
  const [jobs, setJobs] = useState<Array<{ id: string; kind: string; status: string; attempts: number; last_error: string | null }>>([]);
  const [busy, setBusy] = useState<string | null>(null);

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
          const { data: jobsData } = await supabase.from("delivery_jobs").select("id,kind,status,attempts,last_error").in("status", ["uncertain", "failed"]).order("created_at", { ascending: false }).limit(50);
          if (active) setJobs((jobsData ?? []) as typeof jobs);
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

  const requeue = async (jobId: string) => {
    setBusy(jobId);
    try {
      const { data, error } = await supabase.functions.invoke("delivery-process", { body: { action: "requeue", job_id: jobId } });
      if (error || !data?.requeued) throw new Error(error?.message ?? "無法重新排隊");
      setJobs((current) => current.filter((j) => j.id !== jobId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "重新排隊失敗");
    } finally { setBusy(null); }
  };

  return (
    <div className="container py-5" style={{ maxWidth: 960 }}>
      <h1 className="h3 mb-2" style={{ letterSpacing: 2 }}>
        簡訊發送紀錄
      </h1>
      <p className="text-muted small mb-4">Demo 為模擬發送，實戰改由後端呼叫簡訊商（三竹／EVERY8D）。</p>

      {jobs.length > 0 && <section className="mb-4">
        <h2 className="h5">待人工對帳的通知工作</h2>
        <p className="text-muted small">只有 uncertain 工作可以重新排隊；最多重試 5 次。</p>
        <div className="table-responsive"><table className="table table-sm"><tbody>{jobs.map((job) => <tr key={job.id}>
          <td>{job.kind}</td><td>{job.status}</td><td>{job.attempts}/5</td><td className="text-danger small">{job.last_error ?? "—"}</td>
          <td>{job.status === "uncertain" && <button type="button" className="btn btn-sm btn-outline-warning" disabled={busy === job.id} onClick={() => requeue(job.id)}>{busy === job.id ? "處理中…" : "重新排隊"}</button>}</td>
        </tr>)}</tbody></table></div>
      </section>}

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
                  <span className={`badge ${s.status === "sent" ? "text-bg-success" : s.status === "failed" ? "text-bg-danger" : "text-bg-warning"}`}>
                    {s.status === "sent" ? "已送出" : s.status === "failed" ? "失敗" : s.status}
                  </span>
                  {s.mitake_msgid && <div className="text-muted small mt-1">{s.mitake_msgid}</div>}
                  {s.error_message && <div className="text-danger small mt-1">{s.error_message}</div>}
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
