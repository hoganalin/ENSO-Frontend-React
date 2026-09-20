// Public storefront reads only enabled products; checkout revalidates server-side.
import { supabase } from "@/lib/supabase";
import type { ProductRow } from "./types";

export const isProductId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function listProducts(): Promise<ProductRow[]> {
  const { data, error } = await supabase.from("products").select("*")
    .eq("is_enabled", true).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductRow[];
}

export async function getProduct(id: string): Promise<ProductRow | null> {
  if (!isProductId(id)) return null;
  const { data, error } = await supabase.from("products").select("*")
    .eq("id", id).eq("is_enabled", true).maybeSingle();
  if (error) throw new Error(error.message);
  return data as ProductRow | null;
}

export async function getProductsByIds(ids: string[]): Promise<ProductRow[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from("products").select("*")
    .in("id", ids).eq("is_enabled", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductRow[];
}
