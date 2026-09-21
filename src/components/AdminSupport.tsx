// src/components/AdminSupport.tsx — 客服中心（訂單備註）
import { useEffect, useRef, useState, type JSX } from "react";
import AdminShell from "./AdminShell";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { ProfileRow } from "@/services/db/types";
import styles from "@/styles/Admin.module.css";

// ── 型別 ─────────────────────────────────────────────────────────────────────
interface SupportOrder {
  id: string;
  order_no: string;
  buyer_name: string;
  buyer_phone: string;
  total: number;
  status: string;
  created_at: string;
  notes: OrderNote[];
  expanded: boolean;
  notesLoaded: boolean;
}

interface OrderNote {
  id: string;
  body: string;
  actor_name: string;
  created_at: string;
}

const ALLOWED_ROLES = ["admin", "support"];

const STATUS_LABEL: Record<string, string> = {
  pending: "待付款", paid: "已付款", shipped: "已出貨",
  completed: "已完成", cancelled: "已取消", refunded: "已退款",
};
const STATUS_BG: Record<string, string> = {
  pending: "#5a4a1e", paid: "#2e5566", shipped: "#2e5e3e",
  completed: "#1f4a2e", cancelled: "#555", refunded: "#004a55",
};

function fmtNTD(n: number) { return `NT$ ${n.toLocaleString("zh-TW")}`; }

// ── 元件 ─────────────────────────────────────────────────────────────────────
export default function AdminSupport(): JSX.Element {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [orders, setOrders]   = useState<SupportOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [noteTexts, setNoteTexts]   = useState<Record<string, string>>({});
  const [noteSaving, setNoteSaving] = useState<Record<string, boolean>>({});
  const noteRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        if (!p || !ALLOWED_ROLES.includes(p.role)) {
          setError("此頁僅限客服人員及管理員存取。");
          setLoading(false);
          return;
        }
        setProfile(p);

        // 取近期 300 筆訂單（所有狀態，客服全看）
        const { data, error: err } = await supabase
          .from("orders")
          .select(`id, order_no, total, status, created_at, profiles:buyer_id (name, phone)`)
          .order("created_at", { ascending: false })
          .limit(300);
        if (err) throw err;

        const mapped: SupportOrder[] = (data ?? []).map((d: any) => ({
          id:          d.id,
          order_no:    d.order_no ?? d.id.slice(0, 8),
          buyer_name:  d.profiles?.name  ?? "—",
          buyer_phone: d.profiles?.phone ?? "—",
          total:       d.total ?? 0,
          status:      d.status,
          created_at:  d.created_at,
          notes:       [],
          expanded:    false,
          notesLoaded: false,
        }));
        if (active) setOrders(mapped);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function toggleExpand(orderId: string): Promise<void> {
    const o = orders.find(x => x.id === orderId);
    if (!o) return;

    if (!o.notesLoaded) {
      // 載入 order_notes (join profiles for actor name)
      const { data } = await supabase
        .from("order_notes")
        .select("id, body, created_at, profiles:actor_id (name)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });

      const notes: OrderNote[] = (data ?? []).map((n: any) => ({
        id:         n.id,
        body:       n.body,
        actor_name: n.profiles?.name ?? "操作員",
        created_at: n.created_at,
      }));
      setOrders(prev => prev.map(x =>
        x.id === orderId ? { ...x, notes, notesLoaded: true, expanded: true } : x
      ));
    } else {
      setOrders(prev => prev.map(x =>
        x.id === orderId ? { ...x, expanded: !x.expanded } : x
      ));
    }
  }

  async function submitNote(orderId: string): Promise<void> {
    const body = (noteTexts[orderId] ?? "").trim();
    if (!body || !profile) return;
    setNoteSaving(prev => ({ ...prev, [orderId]: true }));
    const { data, error: err } = await supabase
      .from("order_notes")
      .insert({ order_id: orderId, actor_id: profile.id, body })
      .select("id, body, created_at")
      .single();
    if (err) {
      setError(err.message);
    } else if (data) {
      const newNote: OrderNote = {
        id: data.id, body: data.body,
        actor_name: profile.name ?? "我",
        created_at: data.created_at,
      };
      setOrders(prev => prev.map(x =>
        x.id === orderId ? { ...x, notes: [...x.notes, newNote] } : x
      ));
      setNoteTexts(prev => ({ ...prev, [orderId]: "" }));
    }
    setNoteSaving(prev => ({ ...prev, [orderId]: false }));
  }

  // 篩選
  const filtered = orders.filter(o => {
    if (filterStatus  && o.status !== filterStatus) return false;
    if (filterKeyword) {
      const kw = filterKeyword.toLowerCase();
      if (!o.order_no.toLowerCase().includes(kw) &&
          !o.buyer_name.toLowerCase().includes(kw) &&
          !o.buyer_phone.includes(kw)) return false;
    }
    return true;
  });

  const hasNoteOrders = orders.filter(o => o.notesLoaded && o.notes.length > 0).length;

  return (
    <AdminShell title="客服中心">
      {loading && <p className={styles.muted}>載入中…</p>}
      {error   && <div className={styles.alert}>{error}</div>}

      {!loading && !error && profile && (
        <>
          {/* KPI */}
          <div className={styles.stats} style={{ marginBottom: "1.5rem" }}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>訂單總數</span>
              <span className={styles.statValue}>{orders.length.toLocaleString("zh-TW")}</span>
              <span className={styles.statSub}>近 300 筆</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>退款 / 取消</span>
              <span className={styles.statValue}>
                {orders.filter(o => o.status === "refunded" || o.status === "cancelled").length}
              </span>
              <span className={styles.statSub}>筆</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>已有備註</span>
              <span className={styles.statValue}>{hasNoteOrders}</span>
              <span className={styles.statSub}>已展開統計</span>
            </div>
          </div>

          {/* 篩選列 */}
          <div className={styles.toolbar} style={{ marginBottom: "1rem", flexWrap: "wrap", gap: "8px" }}>
            <select className={styles.formControl} value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)} style={{ width: "auto" }}>
              <option value="">所有狀態</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className={styles.formControl} placeholder="搜尋訂單號 / 姓名 / 電話"
              value={filterKeyword} onChange={e => setFilterKeyword(e.target.value)}
              style={{ width: "220px" }} />
            <span className={styles.muted} style={{ fontSize: ".85rem", lineHeight: "2.2rem" }}>
              {filtered.length} 筆
            </span>
          </div>

          {/* 訂單列表 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {filtered.map(o => (
              <div key={o.id} className={styles.card} style={{ padding: "1rem 1.25rem" }}>
                {/* header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "monospace", fontSize: ".9rem", fontWeight: 600 }}>{o.order_no}</span>
                    <span className={styles.badge} style={{ background: STATUS_BG[o.status] ?? "#555" }}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                    <span className={styles.muted} style={{ fontSize: ".8rem" }}>
                      {o.buyer_name}　{o.buyer_phone}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtNTD(o.total)}</span>
                    <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => toggleExpand(o.id)}>
                      {o.expanded ? "▲ 收合" : (o.notesLoaded && o.notes.length > 0
                        ? `▼ 備註 (${o.notes.length})` : "▼ 備註")}
                    </button>
                  </div>
                </div>

                {/* 備註區 */}
                {o.expanded && (
                  <div style={{ marginTop: "12px", borderTop: "1px solid var(--line-subtle,rgba(200,160,80,.2))", paddingTop: "12px" }}>
                    {o.notes.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                        {o.notes.map(n => (
                          <div key={n.id} style={{
                            background: "var(--enso-bg-elevated,#2a2e2b)", borderRadius: "6px",
                            padding: "8px 12px", fontSize: ".875rem",
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                              <strong style={{ color: "var(--enso-gold,#c9a063)" }}>{n.actor_name}</strong>
                              <span className={styles.muted} style={{ fontSize: ".78rem" }}>
                                {n.created_at.slice(0, 16).replace("T", " ")}
                              </span>
                            </div>
                            <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{n.body}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.muted} style={{ fontSize: ".85rem", marginBottom: "10px" }}>尚無備註</p>
                    )}

                    {/* 新增備註 */}
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                      <textarea
                        ref={el => { noteRefs.current[o.id] = el; }}
                        className={styles.formControl}
                        placeholder="輸入客服備註（最多 2000 字）…"
                        rows={2}
                        maxLength={2000}
                        value={noteTexts[o.id] ?? ""}
                        onChange={e => setNoteTexts(prev => ({ ...prev, [o.id]: e.target.value }))}
                        style={{ flex: 1, resize: "vertical", minHeight: "60px" }}
                      />
                      <button
                        className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}
                        disabled={noteSaving[o.id] || !(noteTexts[o.id] ?? "").trim()}
                        onClick={() => submitNote(o.id)}
                        style={{ alignSelf: "flex-end", whiteSpace: "nowrap" }}
                      >
                        {noteSaving[o.id] ? "儲存中…" : "新增備註"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className={styles.card}><p className={styles.muted}>無符合條件的訂單</p></div>
            )}
          </div>
        </>
      )}
    </AdminShell>
  );
}
