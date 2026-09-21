// src/components/AdminReferrals.tsx — 後台：推薦人報表
import { useEffect, useState, type JSX } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { ProfileRow } from "@/services/db/types";

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

export default function AdminReferrals(): JSX.Element {
  usePageTitle("推薦人報表");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [rows, setRows] = useState<PartnerStats[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

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

              if (!refs || refs.length === 0) {
                return { ...partner, refereeCount: 0, networkSpent: 0 };
              }

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

  const filtered = rows.filter(r =>
    !search ||
    (r.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (r.phone ?? "").includes(search) ||
    (r.referral_code ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) return <div className="container py-5 text-center text-muted">載入中…</div>;
  if (error) return <div className="container py-5 text-center text-danger">{error}</div>;
  if (!profile || profile.role !== "admin") {
    return <div className="container py-5 text-center text-muted">此頁僅限最高管理者存取。</div>;
  }

  return (
    <div className="container py-5" style={{ maxWidth: 1000 }}>
      <h1 className="h3 mb-4" style={{ letterSpacing: 2 }}>推薦人報表</h1>

      <div className="mb-3">
        <input
          type="search"
          className="form-control"
          placeholder="搜尋姓名、電話或推薦碼…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          style={{ maxWidth: 280 }}
        />
      </div>

      <div className="table-responsive">
        <table className="table align-middle">
          <thead className="table-light">
            <tr>
              <th>姓名</th>
              <th>推薦碼</th>
              <th>等級</th>
              <th className="text-end">被推薦人數</th>
              <th className="text-end">名下消費總額</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(r => (
              <tr key={r.id}>
                <td>
                  <div>{r.name ?? "—"}</div>
                  <div className="text-muted small font-monospace">{r.phone ?? ""}</div>
                </td>
                <td className="font-monospace small" style={{ color: GOLD }}>{r.referral_code ?? "—"}</td>
                <td className="text-muted small">{r.member_tier}</td>
                <td className="text-end" style={{ fontVariantNumeric: "tabular-nums" }}>{r.refereeCount}</td>
                <td className="text-end fw-semibold" style={{ fontVariantNumeric: "tabular-nums", color: GOLD }}>
                  NT${r.networkSpent.toLocaleString()}
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted py-4">
                  {search ? "找不到符合的推薦人" : "尚無推薦夥伴資料"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="d-flex align-items-center gap-2 mt-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>‹</button>
          <span className="text-muted small">{page + 1} / {totalPages}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>›</button>
        </div>
      )}
    </div>
  );
}
