// src/components/AdminSmsLog.tsx — 後台：簡訊發送紀錄
import { useEffect, useState, type JSX } from "react";

import AdminShell from "./AdminShell";
import { getCurrentProfile } from "@/services/db/auth";
import { listRecentSms, type SmsRow } from "@/services/db/sms";
import { supabase } from "@/lib/supabase";
import type { ProfileRow } from "@/services/db/types";
import styles from "@/styles/Admin.module.css";

const STAFF_ROLES = ["support", "warehouse", "marketing", "finance", "admin"];
const fmtTime = (iso: string) => new Date(iso).toLocaleString("zh-TW");

type DeliveryJob = { id: string; kind: string; status: string; attempts: number; last_error: string | null };

export default function AdminSmsLog(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [rows, setRows]       = useState<SmsRow[]>([]);
  const [jobs, setJobs]       = useState<DeliveryJob[]>([]);
  const [busy, setBusy]       = useState<string | null>(null);

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
          const { data } = await supabase.from("delivery_jobs")
            .select("id,kind,status,attempts,last_error")
            .in("status", ["uncertain", "failed"])
            .order("created_at", { ascending: false }).limit(50);
          if (active) setJobs((data ?? []) as DeliveryJob[]);
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "載入失敗"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const requeue = async (jobId: string) => {
    setBusy(jobId);
    try {
      const { data, error } = await supabase.functions.invoke("delivery-process", { body: { action: "requeue", job_id: jobId } });
      if (error || !data?.requeued) throw new Error(error?.message ?? "無法重新排隊");
      setJobs(cur => cur.filter(j => j.id !== jobId));
    } catch (e) { setError(e instanceof Error ? e.message : "重新排隊失敗"); }
    finally { setBusy(null); }
  };

  if (loading) return <AdminShell title="簡訊紀錄"><p className={styles.muted}>載入中…</p></AdminShell>;
  if (error)   return <AdminShell title="簡訊紀錄"><div className={styles.alert}>{error}</div></AdminShell>;
  if (!profile || !STAFF_ROLES.includes(profile.role)) return (
    <AdminShell title="簡訊紀錄"><div className={styles.alert}>此頁僅限內部人員存取。</div></AdminShell>
  );

  const statusBadge = (s: string) => {
    const bg = s === "sent" ? "#2e6b3c" : s === "failed" ? "#7a2020" : "#6b5a1a";
    const label = s === "sent" ? "已送出" : s === "failed" ? "失敗" : s;
    return <span className={styles.badge} style={{ background: bg }}>{label}</span>;
  };

  return (
    <AdminShell title="簡訊紀錄">
      <p className={styles.muted} style={{ marginBottom: "1.5rem" }}>Demo 為模擬發送，實戰改由後端呼叫簡訊商（三竹／EVERY8D）。</p>

      {jobs.length > 0 && (
        <div className={styles.card} style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: ".25rem" }}>待人工對帳的通知工作</h2>
          <p className={styles.muted} style={{ marginBottom: "1rem" }}>只有 uncertain 工作可以重新排隊；最多重試 5 次。</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>種類</th><th>狀態</th><th>嘗試次數</th><th>錯誤訊息</th><th></th></tr></thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id}>
                    <td>{job.kind}</td>
                    <td>{statusBadge(job.status)}</td>
                    <td>{job.attempts}/5</td>
                    <td style={{ color: "#e07070", fontSize: ".8rem" }}>{job.last_error ?? "—"}</td>
                    <td>
                      {job.status === "uncertain" && (
                        <button type="button" className={`${styles.btn} ${styles.btnSm}`}
                          disabled={busy === job.id} onClick={() => requeue(job.id)}>
                          {busy === job.id ? "處理中…" : "重新排隊"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: "12rem" }}>時間</th>
              <th style={{ width: "10rem" }}>收件人</th>
              <th>內容</th>
              <th style={{ width: "7rem" }}>狀態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id}>
                <td className={styles.muted}>{fmtTime(s.created_at)}</td>
                <td>{s.to_phone ?? "—"}</td>
                <td>{s.message}</td>
                <td>
                  {statusBadge(s.status)}
                  {s.mitake_msgid && <div className={styles.muted} style={{ marginTop: ".25rem" }}>{s.mitake_msgid}</div>}
                  {s.error_message && <div style={{ color: "#e07070", fontSize: ".8rem", marginTop: ".25rem" }}>{s.error_message}</div>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", padding: "2rem" }} className={styles.muted}>尚無簡訊紀錄。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
