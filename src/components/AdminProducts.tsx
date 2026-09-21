// src/components/AdminProducts.tsx — 後台：商品管理（admin only）
import { useEffect, useState, type JSX } from "react";

import { usePageTitle } from "@/hooks/usePageTitle";
import { getCurrentProfile } from "@/services/db/auth";
import { supabase } from "@/lib/supabase";
import type { ProductRow, ProfileRow } from "@/services/db/types";

const GOLD = "#c9a063";

type FormData = {
  title: string;
  category: string;
  price: string;
  origin_price: string;
  unit: string;
  description: string;
  content: string;
  image_url: string;
  inventory: string;
  is_enabled: boolean;
};

const emptyForm = (): FormData => ({
  title: "",
  category: "",
  price: "",
  origin_price: "",
  unit: "",
  description: "",
  content: "",
  image_url: "",
  inventory: "0",
  is_enabled: true,
});

const productToForm = (p: ProductRow): FormData => ({
  title: p.title,
  category: p.category ?? "",
  price: String(p.price),
  origin_price: p.origin_price != null ? String(p.origin_price) : "",
  unit: p.unit ?? "",
  description: p.description ?? "",
  content: p.content ?? "",
  image_url: p.image_url ?? "",
  inventory: String(p.inventory),
  is_enabled: p.is_enabled,
});

export default function AdminProducts(): JSX.Element {
  usePageTitle("商品管理");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (!active) return;
        setProfile(p);
        if (p?.role === "admin") {
          const { data, error: dbErr } = await supabase
            .from("products")
            .select("*")
            .order("created_at", { ascending: false });
          if (dbErr) throw dbErr;
          if (active) setProducts((data ?? []) as ProductRow[]);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const handleFieldChange = (field: keyof FormData, value: string | boolean): void => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAdd = (): void => {
    setShowAddForm(true);
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
  };

  const handleEdit = (p: ProductRow): void => {
    setEditingId(p.id);
    setShowAddForm(false);
    setForm(productToForm(p));
    setFormError(null);
  };

  const handleCancel = (): void => {
    setEditingId(null);
    setShowAddForm(false);
    setForm(emptyForm());
    setFormError(null);
  };

  const handleDelete = async (id: string, title: string): Promise<void> => {
    if (!window.confirm(`確定要刪除商品「${title}」嗎？`)) return;
    try {
      const { error: dbErr } = await supabase.from("products").delete().eq("id", id);
      if (dbErr) throw dbErr;
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "刪除失敗");
    }
  };

  const handleSave = async (): Promise<void> => {
    setFormError(null);
    if (!form.title.trim()) { setFormError("商品名稱不得為空"); return; }
    if (!form.price || isNaN(Number(form.price))) { setFormError("售價格式不正確"); return; }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category.trim() || null,
        price: Number(form.price),
        origin_price: form.origin_price ? Number(form.origin_price) : null,
        unit: form.unit.trim() || null,
        description: form.description.trim() || null,
        content: form.content.trim() || null,
        image_url: form.image_url.trim() || null,
        inventory: Number(form.inventory) || 0,
        is_enabled: form.is_enabled,
      };

      if (editingId) {
        const { error: dbErr } = await supabase.from("products").update(payload).eq("id", editingId);
        if (dbErr) throw dbErr;
        setProducts((prev) =>
          prev.map((p) => (p.id === editingId ? { ...p, ...payload } : p))
        );
      } else {
        const { data, error: dbErr } = await supabase
          .from("products")
          .insert(payload)
          .select()
          .single();
        if (dbErr) throw dbErr;
        if (data) setProducts((prev) => [data as ProductRow, ...prev]);
      }

      handleCancel();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="container py-5 text-center text-muted">載入中…</div>;
  if (error) return <div className="container py-5 text-center text-danger">{error}</div>;
  if (!profile || profile.role !== "admin") {
    return <div className="container py-5 text-center text-muted">此頁僅限最高管理者存取。</div>;
  }

  const renderForm = (): JSX.Element => (
    <div className="card mb-4 border-0 shadow-sm">
      <div className="card-body">
        <h5 className="card-title mb-3" style={{ color: GOLD }}>
          {editingId ? "編輯商品" : "新增商品"}
        </h5>
        {formError && <div className="alert alert-danger py-2">{formError}</div>}
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">商品名稱 *</label>
            <input
              className="form-control"
              value={form.title}
              onChange={(e) => handleFieldChange("title", e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">分類</label>
            <input
              className="form-control"
              value={form.category}
              onChange={(e) => handleFieldChange("category", e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">單位</label>
            <input
              className="form-control"
              value={form.unit}
              onChange={(e) => handleFieldChange("unit", e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">售價 *</label>
            <input
              type="number"
              className="form-control"
              value={form.price}
              onChange={(e) => handleFieldChange("price", e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">原價</label>
            <input
              type="number"
              className="form-control"
              value={form.origin_price}
              onChange={(e) => handleFieldChange("origin_price", e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">庫存</label>
            <input
              type="number"
              className="form-control"
              value={form.inventory}
              onChange={(e) => handleFieldChange("inventory", e.target.value)}
            />
          </div>
          <div className="col-md-3 d-flex align-items-end">
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                id="is_enabled_check"
                checked={form.is_enabled}
                onChange={(e) => handleFieldChange("is_enabled", e.target.checked)}
              />
              <label className="form-check-label" htmlFor="is_enabled_check">
                上架中
              </label>
            </div>
          </div>
          <div className="col-12">
            <label className="form-label">圖片網址</label>
            <input
              className="form-control"
              value={form.image_url}
              onChange={(e) => handleFieldChange("image_url", e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="col-12">
            <label className="form-label">商品描述</label>
            <textarea
              className="form-control"
              rows={2}
              value={form.description}
              onChange={(e) => handleFieldChange("description", e.target.value)}
            />
          </div>
          <div className="col-12">
            <label className="form-label">詳細內容</label>
            <textarea
              className="form-control"
              rows={3}
              value={form.content}
              onChange={(e) => handleFieldChange("content", e.target.value)}
            />
          </div>
        </div>
        <div className="d-flex gap-2 mt-3">
          <button
            type="button"
            className="btn"
            style={{ background: GOLD, color: "#1a1512", fontWeight: 600 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "儲存中…" : "儲存"}
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={handleCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container py-5" style={{ maxWidth: 1100 }}>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h1 className="h3 mb-0" style={{ letterSpacing: 2 }}>商品管理</h1>
        {!showAddForm && editingId === null && (
          <button
            type="button"
            className="btn"
            style={{ background: GOLD, color: "#1a1512", fontWeight: 600 }}
            onClick={handleAdd}
          >
            + 新增商品
          </button>
        )}
      </div>

      {showAddForm && renderForm()}

      <div className="table-responsive">
        <table className="table align-middle">
          <thead className="table-light">
            <tr>
              <th>商品名稱</th>
              <th>分類</th>
              <th style={{ width: 90 }}>售價</th>
              <th style={{ width: 90 }}>原價</th>
              <th style={{ width: 70 }}>庫存</th>
              <th style={{ width: 80 }}>狀態</th>
              <th style={{ width: 130 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <>
                <tr key={p.id}>
                  <td>
                    <div className="fw-semibold">{p.title}</div>
                    {p.unit && <div className="text-muted small">{p.unit}</div>}
                  </td>
                  <td>{p.category ?? "—"}</td>
                  <td>NT$ {p.price.toLocaleString()}</td>
                  <td>{p.origin_price != null ? `NT$ ${p.origin_price.toLocaleString()}` : "—"}</td>
                  <td>{p.inventory}</td>
                  <td>
                    <span className={`badge ${p.is_enabled ? "text-bg-success" : "text-bg-secondary"}`}>
                      {p.is_enabled ? "上架" : "下架"}
                    </span>
                  </td>
                  <td>
                    <div className="d-flex gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => handleEdit(p)}
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDelete(p.id, p.title)}
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
                {editingId === p.id && (
                  <tr key={`${p.id}-edit`}>
                    <td colSpan={7} className="p-0">
                      <div className="p-3 bg-light">{renderForm()}</div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
                  尚無商品資料。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
