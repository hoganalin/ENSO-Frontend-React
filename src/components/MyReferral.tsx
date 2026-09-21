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
const creditSigned = (t: CreditTx): number => (t.type === "earn" ? t.amount : -t.amount);

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
        if (!p) {
          setLoading(false);
          return;
        }
        if (p.role === "referral_partner" || p.member_tier === "gold" || p.member_tier === "silver") {
          const [r, c] = await Promise.all([getReferralReport(p.id), getMyReferralCode(p.id)]);
          if (active) { setReport(r); setCode(c); }
        } else {
          const [c, b, l] = await Promise.all([
            getMyReferralCode(p.id),
            getBalance(p.id),
            getLedger(p.id),
          ]);
          if (active) {
            setCode(c);
            setBalance(b);
            setLedger(l);
          }
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

  const handleCopy = async (): Promise<void> => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 忽略：剪貼簿不可用時不阻擋 */
    }
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
    return <div className="container py-5 text-center text-muted">載入中…</div>;
  }
  if (error) {
    return <div className="container py-5 text-center text-danger">讀取失敗：{error}</div>;
  }
  if (!profile) {
    return (
      <div className="container py-5 text-center">
        <p className="text-muted mb-3">請先登入以查看你的推薦資訊。</p>
        <a className="btn" style={{ borderColor: GOLD, color: GOLD }} href="/login">
          前往登入
        </a>
      </div>
    );
  }

  const isPartner = profile.role === "referral_partner" || profile.member_tier === "gold" || profile.member_tier === "silver";

  return (
    <div className="container py-5" style={{ maxWidth: 960 }}>
      <Link to="/member">回會員中心</Link>
      <div className="d-flex align-items-center gap-3 mb-4">
        <h1 className="h3 m-0" style={{ letterSpacing: 2 }}>
          我的推薦
        </h1>
        <span
          className="badge"
          style={{ background: GOLD, color: "#1a1512", fontWeight: 600 }}
        >
          {TIER_LABEL[profile.member_tier] ?? profile.member_tier}
        </span>
      </div>

      {isPartner && report ? (
        <>
          <p>我的推薦碼：<strong>{code ?? "尚未設定"}</strong> <button type="button" className="btn btn-outline-secondary" disabled={!code} onClick={handleCopy}>{copied ? "已複製" : "複製推薦碼"}</button></p>
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-4">
              <div className="card h-100">
                <div className="card-body">
                  <div className="text-muted small">推薦人數</div>
                  <div className="fs-3" style={{ color: GOLD }}>
                    {report.refereeCount} 人
                  </div>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-4">
              <div className="card h-100">
                <div className="card-body">
                  <div className="text-muted small">名下總消費</div>
                  <div className="fs-3" style={{ color: GOLD }}>
                    {currency(report.networkSpent)}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4 d-flex align-items-center">
              <button
                type="button"
                className="btn w-100"
                style={{ background: GOLD, color: "#1a1512", fontWeight: 600 }}
                onClick={handleExport}
                disabled={report.refereeCount === 0}
              >
                匯出 Excel
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>被推薦人</th>
                  <th>註冊日</th>
                  <th className="text-end">訂單數</th>
                  <th className="text-end">消費總額</th>
                </tr>
              </thead>
              <tbody>
                {report.referees.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{fmtDate(r.joinedAt)}</td>
                    <td className="text-end">{r.orderCount}</td>
                    <td className="text-end">{currency(r.totalSpent)}</td>
                  </tr>
                ))}
                {report.refereeCount === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted py-4">
                      目前還沒有人使用你的推薦碼。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-muted small">
            完整訂單明細可按「匯出 Excel」下載（含彙總與逐筆訂單兩個工作表）。
          </p>
        </>
      ) : (
        <>
          <div className="card mb-4">
            <div className="card-body">
              <div className="text-muted small mb-1">我的推薦碼</div>
              <div className="d-flex align-items-center gap-3">
                <span className="fs-4" style={{ letterSpacing: 3, color: GOLD }}>
                  {code ?? "—"}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ borderColor: GOLD, color: GOLD }}
                  onClick={handleCopy}
                  disabled={!code}
                >
                  {copied ? "已複製 ✓" : "複製"}
                </button>
              </div>
              <div className="text-muted small mt-2">
                分享推薦碼給朋友，對方註冊並消費後，你可獲得購物金回饋。
              </div>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-body">
              <div className="text-muted small">可用購物金</div>
              <div className="fs-2" style={{ color: GOLD }}>
                {currency(balance)}
              </div>
            </div>
          </div>

          <h2 className="h6 text-muted">購物金明細</h2>
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>類型</th>
                  <th className="text-end">金額</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((t, i) => (
                  <tr key={t.id ?? i}>
                    <td>{fmtDate(t.createdAt)}</td>
                    <td>{CREDIT_LABEL[t.type]}</td>
                    <td
                      className="text-end"
                      style={{ color: creditSigned(t) >= 0 ? "#2f855a" : "#c53030" }}
                    >
                      {creditSigned(t) >= 0 ? "+" : "−"}
                      {currency(Math.abs(t.amount)).replace("NT$", "NT$")}
                    </td>
                  </tr>
                ))}
                {ledger.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-muted py-4">
                      還沒有購物金紀錄。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
