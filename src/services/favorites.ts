import { isProductId } from "./db/products";

const keyFor = (memberId: string) => `enso.favorites.v1.${memberId}`;
export const FAVORITES_CHANGED = "enso:favorites-changed";

/** Device-local, scoped per signed-in account; contains product IDs only. */
export function readFavorites(memberId: string): string[] {
  if (!isProductId(memberId)) return [];
  const value: unknown = JSON.parse(localStorage.getItem(keyFor(memberId)) ?? "[]");
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isProductId).map(id => id.toLowerCase()))];
}

export function setFavorite(memberId: string, productId: string, selected: boolean): string[] {
  if (!isProductId(memberId) || !isProductId(productId)) throw new Error("請先登入並重新選擇商品");
  const ids = new Set(readFavorites(memberId));
  if (selected) ids.add(productId.toLowerCase()); else ids.delete(productId.toLowerCase());
  localStorage.setItem(keyFor(memberId), JSON.stringify([...ids]));
  window.dispatchEvent(new Event(FAVORITES_CHANGED));
  return [...ids];
}
