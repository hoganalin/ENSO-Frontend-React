import { getProduct, listProducts } from "./db/products";
import type { ProductRow } from "./db/types";
import type { Product } from "../types/product";

// Keep the UI contract while using the same UUID and price as checkout.
export function toStoreProduct(row: ProductRow): Product {
  return {
    ...row,
    category: row.category ?? "",
    origin_price: row.origin_price ?? row.price,
    unit: row.unit ?? "件",
    description: row.description ?? "",
    content: row.content ?? "",
    top_smell: row.top_smell ?? "",
    heart_smell: row.heart_smell ?? "",
    base_smell: row.base_smell ?? "",
    imageUrl: row.image_url ?? "",
    imagesUrl: row.images_url ?? [],
    scenes: row.scenes ?? [],
    feature: "",
  };
}

export const getProductApi = async (page: number, category: string) => {
  const rows = (await listProducts()).filter(
    (row) => !category || category === "all" || row.category === category,
  );
  const total_pages = Math.max(1, Math.ceil(rows.length / 12));
  const current_page = Math.min(total_pages, Math.max(1, Math.trunc(page) || 1));
  return { data: {
    success: true,
    products: rows.slice((current_page - 1) * 12, current_page * 12).map(toStoreProduct),
    pagination: { total_pages, current_page, has_pre: current_page > 1, has_next: current_page < total_pages, category },
  } };
};

export const getAllProductsApi = async () => ({
  data: { success: true, products: (await listProducts()).map(toStoreProduct) },
});

export const getSingleProductApi = async (id: string) => {
  const row = await getProduct(id);
  if (!row) throw new Error("商品不存在或已下架");
  return { data: { success: true, product: toStoreProduct(row) } };
};
