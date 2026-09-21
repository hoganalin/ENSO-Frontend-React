// src/components/AdminFinance.tsx — 財務對帳頁
import { useEffect, useState, type JSX } from "react";
import AdminShell from "./AdminShell";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { ProfileRow } from "@/services/db/types";
import styles from "@/styles/Admin.module.css";

// ── 型別 ─────────────────────────────────────────────────────────────────────
interface ReferrerStat {
  referrer_id: string;
  name: string;
  tier: string;
  referee_count: number;
  completed_orders: number;
  credit_issued: number;
}

interface MonthCredit {
  month: string;   // "YYYY/MM"
  earn: number;
  spend: number;
  expire: number;
}

const ALLOWED_ROLES = ["admin", "finance"];

function fmtNTD(n: number) { return `NT$ ${n.toLocaleString("zh-TW")}`; }
function monthKey(d: string) { return d.slice(0, 7); }

function downloadCsv(rows: ReferrerStat[]): void {
  const header = "推薦人姓名,會員等級,下線人數,已完成訂單,累計回饋購物金\n";
  const body = rows.map(r =>
    `${r.name},${r.tier},${r.referee_count},${r.completed_orders},${r.credit_issued}`
  ).join("\n");
  const blob = new Blob(["﻿" + header + body], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `enso_finance_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── 元件 ─────────────────────────────────────────────────────────────────────
export default function AdminFinance(): JSX.Element {
  const [profile, setProfile]     = useState<ProfileRow | null>(null);
  const [stats, setStats]         = useState<ReferrerStat[]>([]);
  const [monthlyCredit, setMonthlyCredit] = useState<MonthCredit[]>([]);
  const [totalCredit, setTotalCredit]     = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        if (!p || !ALLOWED_ROLES.includes(p.role)) {
          setError("此頁僅限財務人員及管理員存取。");
          setLoading(false);
          return;
        }
        setProfile(p);

        // 並行取資料
        const since = new Date();
        since.setMonth(since.getMonth() - 11);
        since.setDate(1);
        since.setHours(0, 0, 0, 0);

        const [creditRes, ordersRes, profilesRes] = await Promise.all([
          supabase
            .from("store_credit_ledger")
            .select("member_id,type,amount,created_at")
            .gte("created_at", since.toISOString()),
          supabase
            .from("orders")
            .select("id,referrer_id,subtotal,status,completed_at")
            .in("status", ["completed"]),
          supabase
            .from("profiles")
            .select("id,name,member_tier")
            .not("referral_code", "is", null),
        ]);

        if (creditRes.error)   throw creditRes.error;
        if (ordersRes.error)   throw ordersRes.error;
        if (profilesRes.error) throw profilesRes.error;

        const credits  = creditRes.data  ?? [];
        const orders   = ordersRes.data  ?? [];
        const profiles = profilesRes.data ?? [];

        // ── 購物金月曆 ──────────────────────────────────────────────
        const now = new Date();
        const monthMap: Record<string, MonthCredit> = {};
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
          monthMap[k] = { month: k.replace("-","/"), earn: 0, spend: 0, expire: 0 };
        }
        let totalEarn = 0;
        for (const c of credits) {
          const k = monthKey(c.created_at);
          if (c.type === "earn") { totalEarn += c.amount ?? 0; if (monthMap[k]) monthMap[k].earn += c.amount ?? 0; }
          if (c.type === "spend")  { if (monthMap[k]) monthMap[k].spend += Math.abs(c.amount ?? 0); }
          if (c.type === "expire") { if (monthMap[k]) monthMap[k].expire += Math.abs(c.amount ?? 0); }
        }
        setTotalCredit(totalEarn);
        setMonthlyCredit(Object.values(monthMap));

        // ── 全部購物金餘額估算（earn - spend - expire）──────────────
        const allCredits: { type: string; amount: number }[] = (creditRes.data ?? []);
        const balance = allCredits.reduce((s, c) => {
          if (c.type === "earn")   return s + (c.amount ?? 0);
          if (c.type === "spend")  return s - Math.abs(c.amount ?? 0);
          if (c.type === "expire") return s - Math.abs(c.amount ?? 0);
          return s;
        }, 0);
        setPendingBalance(Math.max(0, balance));

        // ── 推薦人回饋彙總 ─────────────────────────────────────────
        // 只計算有推薦人的已完成訂單
        const referrerMap: Record<string, { orders: number; subtotal: number }> = {};
        for (const o of orders) {
          if (!o.referrer_id) continue;
          if (!referrerMap[o.referrer_id]) referrerMap[o.referrer_id] = { orders: 0, subtotal: 0 };
          referrerMap[o.referrer_id].orders   += 1;
          referrerMap[o.referrer_id].subtotal += o.subtotal ?? 0;
        }

        // 統計每位推薦人的下線人數（orders 中去重 buyer_id 按 referrer_id 分組）
        const { data: refereesData } = await supabase
          .from("orders")
          .select("referrer_id,buyer_id")
          .not("referrer_id", "is", null);
        const refereeCountMap: Record<string, Set<string>> = {};
        for (const r of (refereesData ?? [])) {
          if (!r.referrer_id || !r.buyer_id) continue;
          if (!refereeCountMap[r.referrer_id]) refereeCountMap[r.referrer_id] = new Set();
          refereeCountMap[r.referrer_id].add(r.buyer_id);
        }

        // 推薦購物金（從 store_credit_ledger earn 估算：creditRes 已取所有 earn）
        // 這裡取全期 earn 統計
        const { data: allEarnData } = await supabase
          .from("store_credit_ledger")
          .select("member_id,amount")
          .eq("type","earn");
        const earnByMember: Record<string, number> = {};
        for (const e of (allEarnData ?? [])) {
          earnByMember[e.member_id] = (earnByMember[e.member_id] ?? 0) + (e.amount ?? 0);
        }

        const statList: ReferrerStat[] = profiles
          .filter(p2 => referrerMap[p2.id] || refereeCountMap[p2.id])
          .map(p2 => ({
            referrer_id:      p2.id,
            name:             p2.name ?? p2.id.slice(0,8),
            tier:             p2.member_tier,
            referee_count:    refereeCountMap[p2.id]?.size ?? 0,
            completed_orders: referrerMap[p2.id]?.orders ?? 0,
            credit_issued:    earnByMember[p2.id] ?? 0,
          }))
          .sort((a, b) => b.credit_issued - a.credit_issued);

        if (active) setStats(statList);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const TIER_LABEL: Record<string,string> = { normal:"一般", silver:"銀卡", gold:"金卡" };
  const TIER_COLOR: Record<string,string> = { normal:"#555", silver:"#8899aa", gold:"var(--enso-gold,#c9a063)" };

  return (
    <AdminShell title="財務對帳">
      {loading && <p className={styles.muted}>載入中…</p>}
      {error   && <div className={styles.alert}>{error}</div>}

      {!loading && !error && profile && (
        <>
          {/* KPI */}
          <div className={styles.stats} style={{ marginBottom: "1.5rem" }}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>近 12 個月發放購物金</span>
              <span className={styles.statValue}>{fmtNTD(totalCredit)}</span>
              <span className={styles.statSub}>earn 類型合計</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>全站購物金餘額估算</span>
              <span className={styles.statValue}>{fmtNTD(pendingBalance)}</span>
              <span className={styles.statSub}>earn − spend − expire</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>推薦夥伴人數</span>
              <span className={styles.statValue}>{stats.length}</span>
              <span className={styles.statSub}>有推薦下線記錄</span>
            </div>
          </div>

          {/* 月購物金走勢 */}
          <div className={styles.card} style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 600 }}>月購物金流量（近 12 個月）</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>月份</th>
                    <th style={{ textAlign: "right" }}>發放</th>
                    <th style={{ textAlign: "right" }}>消費扣除</th>
                    <th style={{ textAlign: "right" }}>到期失效</th>
                    <th style={{ textAlign: "right" }}>淨流入</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyCredit.map(m => (
                    <tr key={m.month}>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{m.month}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--enso-gold,#c9a063)" }}>
                        +{m.earn.toLocaleString("zh-TW")}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#e07070" }}>
                        {m.spend > 0 ? `-${m.spend.toLocaleString("zh-TW")}` : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: .6 }}>
                        {m.expire > 0 ? `-${m.expire.toLocaleString("zh-TW")}` : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums",
                        color: m.earn - m.spend - m.expire >= 0 ? "var(--enso-gold,#c9a063)" : "#e07070" }}>
                        {(m.earn - m.spend - m.expire).toLocaleString("zh-TW")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 推薦人回饋彙總 */}
          <div className={styles.card}>
            <div className={styles.toolbar} style={{ marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>推薦夥伴獎金彙總</h3>
              <div className={styles.toolbarRight}>
                <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => downloadCsv(stats)}>
                  ⬇ 匯出 CSV
                </button>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>推薦人</th>
                    <th>等級</th>
                    <th style={{ textAlign: "right" }}>下線人數</th>
                    <th style={{ textAlign: "right" }}>已完成訂單</th>
                    <th style={{ textAlign: "right" }}>累計回饋購物金</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map(s => (
                    <tr key={s.referrer_id}>
                      <td>{s.name}</td>
                      <td>
                        <span className={styles.badge} style={{ background: TIER_COLOR[s.tier] ?? "#555", color: s.tier === "gold" ? "#1a1512" : undefined }}>
                          {TIER_LABEL[s.tier] ?? s.tier}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.referee_count}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.completed_orders}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--enso-gold,#c9a063)" }}>
                        {fmtNTD(s.credit_issued)}
                      </td>
                    </tr>
                  ))}
                  {stats.length === 0 && (
                    <tr><td colSpan={5} className={styles.muted}>尚無推薦紀錄</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
