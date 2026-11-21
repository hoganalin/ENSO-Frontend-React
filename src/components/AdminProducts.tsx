// src/components/AdminProducts.tsx — 後台：商品管理（admin only）
import { useEffect, useState, type JSX } from "react";

import AdminShell from "./AdminShell";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { ProductRow, ProfileRow } from "@/services/db/types";
import styles from "@/styles/Admin.module.css";

type FormData = {
  title: string; category: string; price: string; origin_price: string;
  unit: string; description: string; content: string; image_url: string;
  inventory: string; is_enabled: boolean;
};
const emptyForm = (): FormData => ({
  title: "", category: "", price: "", origin_price: "", unit: "",
  description: "", content: "", image_url: "", inventory: "0", is_enabled: true,
});
const productToForm = (p: ProductRow): FormData => ({
  title: p.title, category: p.category ?? "", price: String(p.price),
  origin_price: p.origin_price != null ? String(p.origin_price) : "",
  unit: p.unit ?? "", description: p.description ?? "", content: p.content ?? "",
  image_url: p.image_url ?? "", inventory: String(p.inventory), is_enabled: p.is_enabled,
});

interface InvLog {
  id: string; type: string; quantity: number; before_qty: number; after_qty: number; note: string | null; created_at: string;
}

export default function AdminProducts(): JSX.Element {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [profile, setProfile]   = useState<ProfileRow | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm]         = useState<FormData>(emptyForm());
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // 庫存手動加減面板
  const [stockPanelId, setStockPanelId] = useState<string | null>(null);
  const [stockDelta, setStockDelta] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [stockSaving, setStockSaving] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockLogs, setStockLogs] = useState<InvLog[]>([]);
  const [stockLogsLoading, setStockLogsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (p?.role === "admin") {
          const { data, error: dbErr } = await supabase.from("products").select("*").order("created_at", { ascending: false });
          if (dbErr) throw dbErr;
          if (active) setProducts((data ?? []) as ProductRow[]);
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "載入失敗"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const fc = (field: keyof FormData, value: string | boolean) => setForm(prev => ({ ...prev, [field]: value }));
  const handleAdd    = () => { setShowAddForm(true); setEditingId(null); setStockPanelId(null); setForm(emptyForm()); setFormError(null); };
  const handleEdit   = (p: ProductRow) => { setEditingId(p.id); setShowAddForm(false); setStockPanelId(null); setForm(productToForm(p)); setFormError(null); };
  const handleCancel = () => { setEditingId(null); setShowAddForm(false); setForm(emptyForm()); setFormError(null); };
  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`確定要刪除商品「${title}」嗎？`)) return;
    try {
      const { error: dbErr } = await supabase.from("products").delete().eq("id", id);
      if (dbErr) throw dbErr;
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : "刪除失敗"); }
  };

  const loadStockLogs = async (productId: string) => {
    setStockLogsLoading(true);
    try {
      const { data, error: dbErr } = await supabase.from("inventory_logs")
        .select("id,type,quantity,before_qty,after_qty,note,created_at")
        .eq("product_id", productId).order("created_at", { ascending: false }).limit(20);
      if (dbErr) throw dbErr;
      setStockLogs((data ?? []) as InvLog[]);
    } catch { setStockLogs([]); }
    finally { setStockLogsLoading(false); }
  };
  const openStock = (p: ProductRow) => {
    setStockPanelId(p.id); setEditingId(null); setShowAddForm(false);
    setStockDelta(""); setStockNote(""); setStockError(null); setStockLogs([]);
    loadStockLogs(p.id);
  };
  // 手動加減庫存：走 adjust_inventory RPC（原子更新庫存 + 寫異動紀錄 inventory_logs）
  const handleAdjust = async (p: ProductRow) => {
    setStockError(null);
    const delta = Math.trunc(Number(stockDelta));
    if (!Number.isFinite(delta) || delta === 0) { setStockError("請輸入非零的加減數量（正數加、負數減）"); return; }
    if (!stockNote.trim()) { setStockError("請填寫原因（審計用）"); return; }
    if (p.inventory + delta < 0) { setStockError(`庫存不足：目前 ${p.inventory}，無法減 ${Math.abs(delta)}`); return; }
    setStockSaving(true);
    try {
      const { data, error: dbErr } = await supabase.rpc("adjust_inventory", { p_product: p.id, p_delta: delta, p_note: stockNote.trim() });
      if (dbErr) throw dbErr;
      const newInv = (data as { inventory?: number } | null)?.inventory ?? (p.inventory + delta);
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, inventory: newInv } : x));
      setStockDelta(""); setStockNote("");
      await loadStockLogs(p.id);
    } catch (e) { setStockError(e instanceof Error ? e.message : "調整失敗"); }
    finally { setStockSaving(false); }
  };
  const handleSave = async () => {
    setFormError(null);
    if (!form.title.trim()) { setFormError("商品名稱不得為空"); return; }
    if (!form.price || isNaN(Number(form.price))) { setFormError("售價格式不正確"); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(), category: form.category.trim() || null,
        price: Number(form.price), origin_price: form.origin_price ? Number(form.origin_price) : null,
        unit: form.unit.trim() || null, description: form.description.trim() || null,
        content: form.content.trim() || null, image_url: form.image_url.trim() || null,
        inventory: Number(form.inventory) || 0, is_enabled: form.is_enabled,
      };
      if (editingId) {
        const { error: dbErr } = await supabase.from("products").update(payload).eq("id", editingId);
        if (dbErr) throw dbErr;
        setProducts(prev => prev.map(p => p.id === editingId ? { ...p, ...payload } : p));
      } else {
        const { data, error: dbErr } = await supabase.from("products").insert(payload).select().single();
        if (dbErr) throw dbErr;
        if (data) setProducts(prev => [data as ProductRow, ...prev]);
      }
      handleCancel();
    } catch (e) { setFormError(e instanceof Error ? e.message : "儲存失敗"); }
    finally { setSaving(false); }
  };

  if (loading) return <AdminShell title="商品管理"><p className={styles.muted}>載入中…</p></AdminShell>;
  if (error)   return <AdminShell title="商品管理"><div className={styles.alert}>{error}</div></AdminShell>;
  if (!profile || profile.role !== "admin") return (
    <AdminShell title="商品管理"><div className={styles.alert}>此頁僅限最高管理者存取。</div></AdminShell>
  );

  const renderForm = (): JSX.Element => (
    <div className={styles.card} style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ fontSize: "1rem", color: "#c9a063", marginBottom: "1rem" }}>{editingId ? "編輯商品" : "新增商品"}</h2>
      {formError && <div className={styles.alert} style={{ marginBottom: "1rem" }}>{formError}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
        <div className={styles.formGroup} style={{ gridColumn: "1/3" }}>
          <label className={styles.formLabel}>商品名稱 *</label>
          <input className={styles.formControl} value={form.title} onChange={e => fc("title", e.target.value)} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>分類</label>
          <input className={styles.formControl} value={form.category} onChange={e => fc("category", e.target.value)} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>售價 *</label>
          <input type="number" className={styles.formControl} value={form.price} onChange={e => fc("price", e.target.value)} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>原價</label>
          <input type="number" className={styles.formControl} value={form.origin_price} onChange={e => fc("origin_price", e.target.value)} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>庫存</label>
          <input type="number" className={styles.formControl} value={form.inventory} onChange={e => fc("inventory", e.target.value)} />
        </div>
        <div className={styles.formGroup} style={{ gridColumn: "1/3" }}>
          <label className={styles.formLabel}>單位</label>
          <input className={styles.formControl} value={form.unit} onChange={e => fc("unit", e.target.value)} />
        </div>
        <div className={styles.formGroup} style={{ display: "flex", alignItems: "center", gap: ".5rem", alignSelf: "end", marginBottom: "1rem" }}>
          <input type="checkbox" id="prod_enabled" checked={form.is_enabled} onChange={e => fc("is_enabled", e.target.checked)} />
          <label htmlFor="prod_enabled" style={{ cursor: "pointer" }}>上架中</label>
        </div>
        <div className={styles.formGroup} style={{ gridColumn: "1/4" }}>
          <label className={styles.formLabel}>圖片網址</label>
          <input className={styles.formControl} value={form.image_url} onChange={e => fc("image_url", e.target.value)} placeholder="https://..." />
        </div>
        <div className={styles.formGroup} style={{ gridColumn: "1/4" }}>
          <label className={styles.formLabel}>商品描述</label>
          <textarea className={styles.formControl} rows={2} value={form.description} onChange={e => fc("description", e.target.value)} />
        </div>
        <div className={styles.formGroup} style={{ gridColumn: "1/4" }}>
          <label className={styles.formLabel}>詳細內容</label>
          <textarea className={styles.formControl} rows={3} value={form.content} onChange={e => fc("content", e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: ".75rem", marginTop: ".5rem" }}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSave} disabled={saving}>
          {saving ? "儲存中…" : "儲存"}
        </button>
        <button type="button" className={styles.btn} onClick={handleCancel}>取消</button>
      </div>
    </div>
  );

  return (
    <AdminShell title="商品管理">
      <div className={styles.toolbar}>
        <span className={styles.muted}>{products.length} 件商品</span>
        <div className={styles.toolbarRight}>
          {!showAddForm && editingId === null && (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleAdd}>+ 新增商品</button>
          )}
        </div>
      </div>

      {showAddForm && renderForm()}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr>
            <th>商品名稱</th><th>分類</th><th style={{ width:"7rem" }}>售價</th>
            <th style={{ width:"7rem" }}>原價</th><th style={{ width:"5rem" }}>庫存</th>
            <th style={{ width:"5rem" }}>狀態</th><th style={{ width:"12rem" }}>操作</th>
          </tr></thead>
          <tbody>
            {products.map(p => (
              <>
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.title}</div>
                    {p.unit && <div className={styles.muted}>{p.unit}</div>}
                  </td>
                  <td>{p.category ?? "—"}</td>
                  <td>NT$ {p.price.toLocaleString()}</td>
                  <td>{p.origin_price != null ? `NT$ ${p.origin_price.toLocaleString()}` : "—"}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{p.inventory}</td>
                  <td>
                    <span className={styles.badge} style={{ background: p.is_enabled ? "#2e6b3c" : "#444" }}>
                      {p.is_enabled ? "上架" : "下架"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                      <button type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={() => handleEdit(p)}>編輯</button>
                      <button type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={() => openStock(p)}>庫存</button>
                      <button type="button" className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`} onClick={() => handleDelete(p.id, p.title)}>刪除</button>
                    </div>
                  </td>
                </tr>
                {editingId === p.id && (
                  <tr key={`${p.id}-edit`} className={styles.subRow}>
                    <td colSpan={7}>
                      <div style={{ padding: "1rem", background: "#121512" }}>{renderForm()}</div>
                    </td>
                  </tr>
                )}
                {stockPanelId === p.id && (
                  <tr key={`${p.id}-stock`} className={styles.subRow}>
                    <td colSpan={7}>
                      <div style={{ padding: "1.25rem", background: "#121512" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end", marginBottom: "1rem" }}>
                          <div>
                            <span className={styles.muted} style={{ fontSize: ".75rem" }}>目前庫存</span>
                            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#c9a063" }}>{p.inventory}</div>
                          </div>
                          <div className={styles.formGroup} style={{ margin: 0 }}>
                            <label className={styles.formLabel}>加 / 減數量</label>
                            <input type="number" className={styles.formControl} style={{ width: "9rem" }}
                              value={stockDelta} onChange={e => setStockDelta(e.target.value)} placeholder="例如 20 或 -3" />
                          </div>
                          <div className={styles.formGroup} style={{ margin: 0, flex: 1, minWidth: "12rem" }}>
                            <label className={styles.formLabel}>原因（必填，審計用）</label>
                            <input className={styles.formControl} value={stockNote}
                              onChange={e => setStockNote(e.target.value)} placeholder="例如：進貨補充 / 盤點修正 / 贈出" />
                          </div>
                          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => handleAdjust(p)} disabled={stockSaving}>
                            {stockSaving ? "處理中…" : "確認加減"}
                          </button>
                          <button type="button" className={styles.btn} onClick={() => setStockPanelId(null)}>關閉</button>
                        </div>
                        {stockError && <div className={styles.alert} style={{ marginBottom: "1rem" }}>{stockError}</div>}
                        <p className={styles.muted} style={{ fontSize: ".72rem", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: ".5rem" }}>庫存異動紀錄（最近 20 筆）</p>
                        {stockLogsLoading ? <p className={styles.muted}>載入中…</p> : (
                          <table className={styles.subTable}>
                            <thead><tr>
                              <th>時間</th><th style={{ width: "5rem" }}>異動</th>
                              <th style={{ width: "4rem", textAlign: "right" }}>前</th>
                              <th style={{ width: "4rem", textAlign: "right" }}>後</th><th>原因</th>
                            </tr></thead>
                            <tbody>
                              {stockLogs.map(l => (
                                <tr key={l.id}>
                                  <td className={styles.muted}>{new Date(l.created_at).toLocaleString("zh-TW")}</td>
                                  <td style={{ color: l.type === "add" ? "#6bbf59" : "#e07070", fontVariantNumeric: "tabular-nums" }}>
                                    {l.type === "add" ? `+${l.quantity}` : `-${l.quantity}`}
                                  </td>
                                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.before_qty}</td>
                                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.after_qty}</td>
                                  <td>{l.note ?? "—"}</td>
                                </tr>
                              ))}
                              {stockLogs.length === 0 && <tr><td colSpan={5} className={styles.muted}>尚無異動紀錄。</td></tr>}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign:"center", padding:"2rem" }} className={styles.muted}>尚無商品資料。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
