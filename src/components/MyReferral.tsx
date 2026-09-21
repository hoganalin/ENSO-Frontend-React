// src/components/MyReferral.tsx
// 「我的推薦」頁：
//   • 推薦夥伴角色及金／銀卡 → 名下被推薦人名單、消費總額、可匯出 Excel
//   • 普通會員 → 我的推薦碼、可用購物金、購物金明細
import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router";

import type { CreditTx } from "@/domain/storeCredit";
import { usePageTitle } from "@/hooks/usePageTitle";
import { getCurrentProfile } from "@/services/db/auth";
import {
  getMyReferralCode,
  getReferralReport,
  type ReferralReport,
} from "@/services/db/referral";
import { getBalance, getLedger } from "@/services/db/storeCredit";
import type { ProfileRow } from "@/services/db/types";
import { exportExcel } from "@/utils/exportExcel";
import MemberShell from "@/components/MemberShell";
import styles from "@/styles/Member.module.css";

const GOLD = "#c9a063";
const currency = (n: number): string => "NT$" + n.toLocaleString();
const fmtDate = (value: string | number): string =>
  new Date(value).toLocaleDateString("zh-TW");

const TIER_LABEL: Record<string, string> = {
  normal: "普通會員",
  silver: "銀卡會員",
  gold: "金卡會員",
};
const CREDIT_LABEL: Record<CreditTx["type"], string> = {
  earn: "推薦回饋",
  spend: "結帳折抵",
  reverse: "退貨回沖",
  expire: "效期到期",
};
const creditSigned = (t: CreditTx): number =>
  t.type === "earn" || t.type === "reverse" ? t.amount : -t.amount;

export default function MyReferral(): JSX.Element {
  usePageTitle("我的推薦");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [report, setReport] = useState<ReferralReport | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<CreditTx[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (!p) { setLoading(false); return; }
        if (
          p.role === "referral_partner" ||
          p.member_tier === "gold" ||
          p.member_tier === "silver"
        ) {
          const [r, c] = await Promise.all([
            getReferralReport(p.id),
            getMyReferralCode(p.id),
          ]);
          if (active) { setReport(r); setCode(c); }
        } else {
          const [c, b, l] = await Promise.all([
            getMyReferralCode(p.id),
            getBalance(p.id),
            getLedger(p.id),
          ]);
          if (active) { setCode(c); setBalance(b); setLedger(l); }
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const handleCopy = async (): Promise<void> => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* 剪貼簿不可用時不阻擋 */ }
  };

  const handleExport = (): void => {
    if (!report) return;
    const summary = report.referees.map((r) => ({
      被推薦人: r.name,
      註冊日: fmtDate(r.joinedAt),
      訂單數: r.orderCount,
      消費總額: r.totalSpent,
    }));
    const detail = report.referees.flatMap((r) =>
      r.orders.map((o) => ({
        被推薦人: r.name,
        訂單編號: o.orderNo,
        金額: o.subtotal,
        日期: fmtDate(o.createdAt),
      })),
    );
    const today = new Date().toISOString().slice(0, 10);
    exportExcel(`ENSO推薦名單_${today}.xlsx`, [
      { name: "名單彙總", rows: summary },
      { name: "訂單明細", rows: detail },
    ]);
  };

  if (loading) {
    return (
      <MemberShell title="我的推薦">
        <p role="status">正在讀取推薦資料…</p>
      </MemberShell>
    );
  }
  if (error) {
    return (
      <MemberShell title="我的推薦">
        <div className={styles.error} role="alert">{error}</div>
      </MemberShell>
    );
  }
  if (!profile) {
    return (
      <MemberShell title="我的推薦">
        <p>
          請先<Link to="/login">登入</Link>以查看你的推薦資訊。
        </p>
      </MemberShell>
    );
  }

  const isPartner =
    profile.role === "referral_partner" ||
    profile.member_tier === "gold" ||
    profile.member_tier === "silver";

  return (
    <MemberShell title="我的推薦">
      {/* 等級標示 */}
      <p style={{ margin: "0 0 1.5rem" }}>
        目前身份：
        <span
          style={{
            display: "inline-block",
            padding: "2px 10px",
            borderRadius: 4,
            background: GOLD,
            color: "#1a1512",
            fontWeight: 600,
            fontSize: ".85rem",
            marginLeft: 8,
          }}
        >
          {TIER_LABEL[profile.member_tier] ?? profile.member_tier}
        </span>
      </p>

      {isPartner && report ? (
        /* ── 推薦夥伴 / 金銀卡視圖 ── */
        <>
          <div className={styles.card}>
            <p style={{ margin: 0 }}>
              我的推薦碼：
              <strong style={{ color: GOLD, letterSpacing: 3, fontSize: "1.1rem", marginRight: 12 }}>
                {code ?? "尚未設定"}
              </strong>
              <button
                type="button"
                className={styles.button}
                disabled={!code}
                onClick={handleCopy}
              >
                {copied ? "已複製 ✓" : "複製推薦碼"}
              </button>
            </p>
          </div>

          {/* 統計卡片 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", margin: "1.5rem 0" }}>
            <div className={styles.card} style={{ margin: 0 }}>
              <p style={{ margin: "0 0 .25rem", fontSize: ".8rem", opacity: .7 }}>推薦人數</p>
              <p style={{ margin: 0, fontSize: "1.75rem", color: GOLD, fontVariantNumeric: "tabular-nums" }}>
                {report.refereeCount} 人
              </p>
            </div>
            <div className={styles.card} style={{ margin: 0 }}>
              <p style={{ margin: "0 0 .25rem", fontSize: ".8rem", opacity: .7 }}>名下總消費</p>
              <p style={{ margin: 0, fontSize: "1.75rem", color: GOLD, fontVariantNumeric: "tabular-nums" }}>
                {currency(report.networkSpent)}
              </p>
            </div>
          </div>

          <div className={styles.actions} style={{ marginBottom: "1.5rem" }}>
            <button
              type="button"
              className={styles.button}
              style={{ background: GOLD, color: "#1a1512", fontWeight: 600, borderColor: GOLD }}
              onClick={handleExport}
              disabled={report.refereeCount === 0}
            >
              匯出 Excel
            </button>
          </div>

          <h2>被推薦人名單</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line-strong, #a8864d)" }}>
                  <th style={{ textAlign: "left", padding: ".6rem .75rem", fontWeight: 600 }}>被推薦人</th>
                  <th style={{ textAlign: "left", padding: ".6rem .75rem", fontWeight: 600 }}>註冊日</th>
                  <th style={{ textAlign: "right", padding: ".6rem .75rem", fontWeight: 600 }}>訂單數</th>
                  <th style={{ textAlign: "right", padding: ".6rem .75rem", fontWeight: 600 }}>消費總額</th>
                </tr>
              </thead>
              <tbody>
                {report.referees.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid rgba(168,134,77,.3)" }}>
                    <td style={{ padding: ".6rem .75rem" }}>{r.name}</td>
                    <td style={{ padding: ".6rem .75rem" }}>{fmtDate(r.joinedAt)}</td>
                    <td style={{ padding: ".6rem .75rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.orderCount}</td>
                    <td style={{ padding: ".6rem .75rem", textAlign: "right", color: GOLD, fontVariantNumeric: "tabular-nums" }}>{currency(r.totalSpent)}</td>
                  </tr>
                ))}
                {report.refereeCount === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: "2rem .75rem", textAlign: "center", opacity: .6 }}>
                      目前還沒有人使用你的推薦碼。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: ".8rem", opacity: .65, marginTop: "1rem" }}>
            完整訂單明細可按「匯出 Excel」下載（含彙總與逐筆訂單兩個工作表）。
          </p>
        </>
      ) : (
        /* ── 普通會員視圖 ── */
        <>
          {/* 推薦碼卡片 */}
          <div className={styles.card}>
            <p style={{ margin: "0 0 .5rem", fontSize: ".8rem", opacity: .7 }}>我的推薦連結</p>
            <div className={styles.actions}>
              <span style={{ fontSize: "1.2rem", letterSpacing: 3, color: GOLD }}>
                {code ?? "—"}
              </span>
              <button
                type="button"
                className={styles.button}
                onClick={handleCopy}
                disabled={!code}
              >
                {copied ? "已複製 ✓" : "複製"}
              </button>
            </div>
            <p style={{ margin: ".75rem 0 0", fontSize: ".85rem", opacity: .75 }}>
              分享推薦碼給朋友，對方註冊並消費後，你可獲得購物金回饋。
            </p>
          </div>

          {/* 購物金卡片 */}
          <div className={styles.card}>
            <p style={{ margin: "0 0 .25rem", fontSize: ".8rem", opacity: .7 }}>我的購物金</p>
            <p style={{ margin: 0, fontSize: "2rem", color: GOLD, fontVariantNumeric: "tabular-nums" }}>
              {currency(balance)}
            </p>
          </div>

          {/* 購物金明細 */}
          <h2>購物金明細</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line-strong, #a8864d)" }}>
                  <th style={{ textAlign: "left", padding: ".6rem .75rem", fontWeight: 600 }}>日期</th>
                  <th style={{ textAlign: "left", padding: ".6rem .75rem", fontWeight: 600 }}>類型</th>
                  <th style={{ textAlign: "right", padding: ".6rem .75rem", fontWeight: 600 }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((t, i) => {
                  const signed = creditSigned(t);
                  return (
                    <tr key={t.id ?? i} style={{ borderBottom: "1px solid rgba(168,134,77,.3)" }}>
                      <td style={{ padding: ".6rem .75rem" }}>{fmtDate(t.createdAt)}</td>
                      <td style={{ padding: ".6rem .75rem" }}>{CREDIT_LABEL[t.type]}</td>
                      <td
                        style={{
                          padding: ".6rem .75rem",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: signed >= 0 ? "#6fcf97" : "#eb5757",
                        }}
                      >
                        {signed >= 0 ? "+" : "−"}
                        {currency(Math.abs(t.amount))}
                      </td>
                    </tr>
                  );
                })}
                {ledger.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: "2rem .75rem", textAlign: "center", opacity: .6 }}>
                      還沒有購物金紀錄。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </MemberShell>
  );
}
