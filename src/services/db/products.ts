// Public storefront reads only enabled products; checkout revalidates server-side.
import { supabase } from "@/lib/supabase";
import type { ProductRow } from "./types";

export const isProductId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// 把 products 的 inventory 換成「可售量」（實體在庫 − 下單預留）。
// 透過 SECURITY DEFINER 函式 product_availability 取得；失敗則保留實體在庫，不影響顯示。
async function withAvailability<T extends ProductRow>(products: T[]): Promise<T[]> {
  if (!products.length) return products;
  try {
    const ids = products.map(p => p.id);
    const { data, error } = await supabase.rpc("product_availability", { p_ids: ids });
    if (error || !data) return products;
    const avail = new Map<string, number>();
    for (const r of data as { product_id: string; available: number }[]) avail.set(r.product_id, Number(r.available));
    return products.map(p => (avail.has(p.id) ? { ...p, inventory: avail.get(p.id)! } : p));
  } catch {
    return products; // 任何意外(含測試 mock 無 rpc)一律退回實體在庫,不影響顯示
  }
}

export async function listProducts(): Promise<ProductRow[]> {
  const { data, error } = await supabase.from("products").select("*")
    .eq("is_enabled", true).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return withAvailability((data ?? []) as ProductRow[]);
}

export async function getProduct(id: string): Promise<ProductRow | null> {
  if (!isProductId(id)) return null;
  const { data, error } = await supabase.from("products").select("*")
    .eq("id", id).eq("is_enabled", true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [p] = await withAvailability([data as ProductRow]);
  return p ?? null;
}

export async function getProductsByIds(ids: string[]): Promise<ProductRow[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from("products").select("*")
    .in("id", ids).eq("is_enabled", true);
  if (error) throw new Error(error.message);
  return withAvailability((data ?? []) as ProductRow[]);
}
