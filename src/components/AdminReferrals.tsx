// src/components/AdminReferrals.tsx — 後台：推薦人報表
import React from "react";
import { useEffect, useState, type JSX } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { CreditRow, ProfileRow } from "@/services/db/types";

const GOLD = "#c9a063";
const PAGE_SIZE = 20;

interface PartnerStats {
  id: string;
  name: string | null;
  phone: string | null;
  role: string;
  member_tier: string;
  referral_code: string | null;
  refereeCount: number;
  networkSpent: number;
}

interface RefereeSummary {
  id: string;
  name: string | null;
  phone: string | null;
  member_tier: string;
  joinedAt: string;
}

// ── CSV 匯出 ────────────────────────────────────────────────────
function downloadReferralCSV(rows: PartnerStats[]): void {
  const headers = ["姓名", "電話", "推薦碼", "等級", "被推薦人數", "名下消費總額"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.name ?? "",
        r.phone ?? "",
        r.referral_code ?? "",
        r.member_tier,
        r.refereeCount,
        r.networkSpent,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ENSO_推薦人報表_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const TIER_LABEL: Record<string, string> = {
  normal: "一般",
  silver: "銀卡",
  gold: "金卡",
};

// ── 主元件 ────────────────────────────────────────────────────────
export default function AdminReferrals(): JSX.Element {
  usePageTitle("推薦人報表");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [rows, setRows] = useState<PartnerStats[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // 被推薦人名單 Modal
  const [refModal, setRefModal] = useState<{ partnerId: string; partnerName: string } | null>(null);
  const [refList, setRefList] = useState<RefereeSummary[]>([]);
  const [refLoading, setRefLoading] = useState(false);

  // 購物金發放紀錄 Modal
  const [creditModal, setCreditModal] = useState<{ partnerId: string; partnerName: string } | null>(null);
  const [creditLog, setCreditLog] = useState<Array<CreditRow & { receiverName: string; orderNo: string | null }>>([]);
  const [creditLoading, setCreditLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (p?.role === "admin") {
          const { data: partners, error: pErr } = await supabase
            .from("profiles")
            .select("id, name, phone, role, member_tier, referral_code")
            .or("role.eq.referral_partner,member_tier.eq.gold,member_tier.eq.silver")
            .order("created_at", { ascending: false });
          if (pErr) throw pErr;
          if (!active || !partners) return;

          const enriched = await Promise.all(
            partners.map(async (partner) => {
              const { data: refs } = await supabase
                .from("profiles")
                .select("id")
                .eq("referrer_id", partner.id);

              if (!refs || refs.length === 0)
                return { ...partner, refereeCount: 0, networkSpent: 0 };

              const ids = refs.map((r: { id: string }) => r.id);
              const { data: orders } = await supabase
                .from("orders")
                .select("total")
                .in("buyer_id", ids)
                .in("status", ["paid", "shipped", "completed"]);

              const networkSpent = (orders ?? []).reduce(
                (s: number, o: { total: number }) => s + (o.total ?? 0),
                0
              );
              return { ...partner, refereeCount: refs.length, networkSpent };
            })
          );

          if (active) setRows(enriched as PartnerStats[]);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // 載入被推薦人名單
  async function openRefModal(partnerId: string, partnerName: string) {
    setRefModal({ partnerId, partnerName });
    setRefList([]);
    setRefLoading(true);
    try {
      const { data, error: e } = await supabase
        .from("profiles")
        .select("id, name, phone, member_tier, created_at")
        .eq("referrer_id", partnerId)
        .order("created_at", { ascending: false });
      if (e) throw e;
      setRefList(
        ((data ?? []) as ProfileRow[]).map((p) => ({
          id: p.id,
          name: p.name,
          phone: p.phone,
          member_tier: p.member_tier as string,
          joinedAt: p.created_at,
        }))
      );
    } catch (e) {
      console.error(e);
    } finally {
      setRefLoading(false);
    }
  }

  // 載入購物金發放紀錄
  async function openCreditModal(partnerId: string, partnerName: string) {
    setCreditModal({ partnerId, partnerName });
    setCreditLog([]);
    setCreditLoading(true);
    try {
      // 找到該推薦人名下所有被推薦人 id
      const { data: refs } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("referrer_id", partnerId);

      if (!refs || refs.length === 0) {
        setCreditLoading(false);
        return;
      }
      const refIds = refs.map((r: { id: string }) => r.id);
      const nameMap: Record<string, string> = Object.fromEntries(
        refs.map((r: { id: string; name: string | null }) => [r.id, r.name ?? "(未命名)"])
      );

      // 找這些被推薦人的 earn 類型購物金紀錄（透過 referral 觸發的）
      const { data: credits } = await supabase
        .from("credit_transactions")
        .select("id, member_id, type, amount, order_id, created_at, expires_at")
        .in("member_id", refIds)
        .eq("type", "earn")
        .order("created_at", { ascending: false });

      // 取得相關訂單編號
      const orderIds = [...new Set(
        (credits ?? [])
          .map((c: { order_id: string | null }) => c.order_id)
          .filter(Boolean)
      )] as string[];

      let orderNoMap: Record<string, string> = {};
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id, order_no")
          .in("id", orderIds);
        orderNoMap = Object.fromEntries(
          (orders ?? []).map((o: { id: string; order_no: string }) => [o.id, o.order_no])
        );
      }

      setCreditLog(
        (credits ?? []).map((c: CreditRow) => ({
          ...c,
          receiverName: nameMap[c.member_id] ?? "(未命名)",
          orderNo: c.order_id ? (orderNoMap[c.order_id] ?? c.order_id) : null,
        }))
      );
    } catch (e) {
      console.error(e);
    } finally {
      setCreditLoading(false);
    }
  }

  const filtered = rows.filter(
    (r) =>
      !search ||
      (r.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (r.phone ?? "").includes(search) ||
      (r.referral_code ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // 小計
  const totalReferees = rows.reduce((s, r) => s + r.refereeCount, 0);
  const totalNetworkSpent = rows.reduce((s, r) => s + r.networkSpent, 0);

  if (loading) return <div className="container py-5 text-center" style={{ color: "var(--enso-fg,#f5eee0)" }}>載入中…</div>;
  if (error) return <div className="container py-5 text-center text-danger">{error}</div>;
  if (!profile || profile.role !== "admin") {
    return <div className="container py-5 text-center" style={{ color: "var(--enso-fg,#f5eee0)" }}>此頁僅限最高管理者存取。</div>;
  }

  const statCard = (label: string, value: string | number, accent?: string) => (
    <div style={{ flex: "1 1 160px", padding: "1rem 1.25rem", background: "var(--enso-bg-elevated,#2a2e2b)", border: "1px solid var(--line-strong,#a8864d)", borderRadius: 6 }}>
      <div style={{ fontSize: ".78rem", opacity: .7, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "1.4rem", color: accent ?? "var(--enso-fg,#f5eee0)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{value}</div>
    </div>
  );

  return (
    <div className="container py-5" style={{ maxWidth: 1100, color: "var(--enso-fg,#f5eee0)" }}>
      <h1 className="h3 mb-4" style={{ letterSpacing: 2 }}>推薦人報表</h1>

      {/* 統計摘要 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {statCard("推薦夥伴數", rows.length)}
        {statCard("總被推薦人數", totalReferees, GOLD)}
        {statCard("名下消費總額", "NT$" + totalNetworkSpent.toLocaleString(), GOLD)}
      </div>

      {/* 搜尋 + 匯出 */}
      <div className="d-flex gap-2 align-items-center mb-3 flex-wrap">
        <input
          type="search"
          className="form-control"
          placeholder="搜尋姓名、電話或推薦碼…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          style={{ maxWidth: 280 }}
        />
        <span style={{ opacity: .6, fontSize: ".875rem" }}>{filtered.length} 筆</span>
        <div className="ms-auto d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: GOLD, color: "#1a1512", fontWeight: 600, border: "none" }}
            onClick={() => downloadReferralCSV(filtered)}
            disabled={filtered.length === 0}
          >
            報表匯出 CSV
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table align-middle" style={{ "--bs-table-bg": "transparent", "--bs-table-color": "var(--enso-fg,#f5eee0)", "--bs-table-border-color": "rgba(168,134,77,.3)" } as React.CSSProperties}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line-strong,#a8864d)" }}>
              <th>姓名</th>
              <th>推薦碼</th>
              <th>等級</th>
              <th className="text-end">被推薦人數</th>
              <th className="text-end">名下消費</th>
              <th style={{ width: 160 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid rgba(168,134,77,.2)" }}>
                <td>
                  <div>{r.name ?? "—"}</div>
                  <div className="font-monospace small" style={{ opacity: .6 }}>{r.phone ?? ""}</div>
                </td>
                <td className="font-monospace small" style={{ color: GOLD }}>{r.referral_code ?? "—"}</td>
                <td>
                  <span style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: ".8rem",
                    background: r.member_tier === "gold" ? GOLD : r.member_tier === "silver" ? "#888" : "#3a3e3b",
                    color: r.member_tier === "gold" ? "#1a1512" : "#e0e0e0",
                  }}>
                    {TIER_LABEL[r.member_tier] ?? r.member_tier}
                  </span>
                </td>
                <td className="text-end" style={{ fontVariantNumeric: "tabular-nums" }}>{r.refereeCount}</td>
                <td className="text-end fw-semibold" style={{ fontVariantNumeric: "tabular-nums", color: GOLD }}>
                  NT${r.networkSpent.toLocaleString()}
                </td>
                <td>
                  <div className="d-flex gap-1">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => openRefModal(r.id, r.name ?? "—")}
                      disabled={r.refereeCount === 0}
                    >
                      查看名單
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => openCreditModal(r.id, r.name ?? "—")}
                      disabled={r.refereeCount === 0}
                    >
                      購物金紀錄
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-4" style={{ opacity: .5 }}>
                  {search ? "找不到符合的推薦人" : "尚無推薦夥伴資料"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="d-flex align-items-center gap-2 mt-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>‹</button>
          <span className="small" style={{ opacity: .65 }}>{page + 1} / {totalPages}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>›</button>
        </div>
      )}

      {/* ── 被推薦人名單 Modal ── */}
      {refModal && (
        <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.65)" }} onClick={(e) => { if (e.target === e.currentTarget) setRefModal(null); }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content" style={{ background: "var(--enso-bg-elevated,#2a2e2b)", color: "var(--enso-fg,#f5eee0)", border: "1px solid var(--line-strong,#a8864d)" }}>
              <div className="modal-header" style={{ borderBottom: "1px solid var(--line-strong,#a8864d)" }}>
                <h5 className="modal-title">被推薦人名單 — {refModal.partnerName}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setRefModal(null)} />
              </div>
              <div className="modal-body">
                {refLoading ? (
                  <p style={{ opacity: .6 }}>載入中…</p>
                ) : refList.length === 0 ? (
                  <p style={{ opacity: .6 }}>尚無被推薦人</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table" style={{ "--bs-table-bg": "transparent", "--bs-table-color": "var(--enso-fg,#f5eee0)", "--bs-table-border-color": "rgba(168,134,77,.3)" } as React.CSSProperties}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--line-strong,#a8864d)" }}>
                          <th>姓名</th>
                          <th>電話</th>
                          <th>等級</th>
                          <th>加入日期</th>
                        </tr>
                      </thead>
                      <tbody>
                        {refList.map((ref) => (
                          <tr key={ref.id} style={{ borderBottom: "1px solid rgba(168,134,77,.2)" }}>
                            <td>{ref.name ?? "—"}</td>
                            <td className="font-monospace small" style={{ opacity: .75 }}>{ref.phone ?? "—"}</td>
                            <td>
                              <span style={{
                                display: "inline-block", padding: "1px 7px", borderRadius: 4, fontSize: ".8rem",
                                background: ref.member_tier === "gold" ? GOLD : ref.member_tier === "silver" ? "#888" : "#3a3e3b",
                                color: ref.member_tier === "gold" ? "#1a1512" : "#e0e0e0",
                              }}>
                                {TIER_LABEL[ref.member_tier] ?? ref.member_tier}
                              </span>
                            </td>
                            <td className="small" style={{ opacity: .75 }}>{new Date(ref.joinedAt).toLocaleDateString("zh-TW")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ borderTop: "1px solid var(--line-strong,#a8864d)" }}>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setRefModal(null)}>關閉</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 購物金發放紀錄 Modal ── */}
      {creditModal && (
        <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.65)" }} onClick={(e) => { if (e.target === e.currentTarget) setCreditModal(null); }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content" style={{ background: "var(--enso-bg-elevated,#2a2e2b)", color: "var(--enso-fg,#f5eee0)", border: "1px solid var(--line-strong,#a8864d)" }}>
              <div className="modal-header" style={{ borderBottom: "1px solid var(--line-strong,#a8864d)" }}>
                <h5 className="modal-title">購物金發放紀錄 — {creditModal.partnerName}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setCreditModal(null)} />
              </div>
              <div className="modal-body">
                {creditLoading ? (
                  <p style={{ opacity: .6 }}>載入中…</p>
                ) : creditLog.length === 0 ? (
                  <p style={{ opacity: .6 }}>尚無購物金發放紀錄</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table" style={{ "--bs-table-bg": "transparent", "--bs-table-color": "var(--enso-fg,#f5eee0)", "--bs-table-border-color": "rgba(168,134,77,.3)" } as React.CSSProperties}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--line-strong,#a8864d)" }}>
                          <th>日期</th>
                          <th>受益人</th>
                          <th>訂單</th>
                          <th className="text-end">金額</th>
                          <th>到期日</th>
                        </tr>
                      </thead>
                      <tbody>
                        {creditLog.map((c) => (
                          <tr key={c.id} style={{ borderBottom: "1px solid rgba(168,134,77,.2)" }}>
                            <td className="small">{new Date(c.created_at).toLocaleDateString("zh-TW")}</td>
                            <td>{c.receiverName}</td>
                            <td className="font-monospace small" style={{ color: GOLD }}>{c.orderNo ?? "—"}</td>
                            <td className="text-end fw-semibold" style={{ color: "#6fcf97", fontVariantNumeric: "tabular-nums" }}>
                              +NT${c.amount.toLocaleString()}
                            </td>
                            <td className="small" style={{ opacity: .65 }}>
                              {c.expires_at ? new Date(c.expires_at).toLocaleDateString("zh-TW") : "無期限"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "1px solid var(--line-strong,#a8864d)" }}>
                          <td colSpan={3} className="small fw-semibold">合計</td>
                          <td className="text-end fw-bold" style={{ color: "#6fcf97", fontVariantNumeric: "tabular-nums" }}>
                            +NT${creditLog.reduce((s, c) => s + c.amount, 0).toLocaleString()}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ borderTop: "1px solid var(--line-strong,#a8864d)" }}>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setCreditModal(null)}>關閉</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
