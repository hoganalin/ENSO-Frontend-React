import { getProductsByIds, isProductId } from "./db/products";
import { toStoreProduct } from "./product";

export const CART_STORAGE_KEY = "enso.cart.v1";
const MAX_QTY = 99;
type StoredItem = { product_id: string; qty: number };
let queue: Promise<unknown> = Promise.resolve();
let epoch = 0;

function validQty(qty: unknown): qty is number {
  return typeof qty === "number" && Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY;
}

function readItems(): StoredItem[] {
  if (typeof window === "undefined") return [];
  let parsed: unknown;
  try { parsed = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "[]"); }
  catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const items = new Map<string, number>();
  for (const item of parsed) {
    if (!item || !isProductId(item.product_id) || !validQty(item.qty)) continue;
    const id = item.product_id.toLowerCase();
    items.set(id, Math.min(MAX_QTY, (items.get(id) ?? 0) + item.qty));
  }
  return [...items].map(([product_id, qty]) => ({ product_id, qty }));
}

function writeItems(items: StoredItem[]) {
  if (typeof window === "undefined") throw new Error("購物車只能在瀏覽器使用");
  // Never persist names, prices, discounts, or totals supplied by the browser.
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items.map(({ product_id, qty }) => ({ product_id, qty }))));
}

export function clearStoredCart() {
  epoch += 1; // Invalidate requests queued before payment/clear completed.
  if (typeof window !== "undefined") window.localStorage.removeItem(CART_STORAGE_KEY);
}

async function hydrate(items: StoredItem[], generation: number, requiredIds: string[] = []) {
  const rows = await getProductsByIds(items.map((item) => item.product_id));
  const byId = new Map(rows.filter((row) => row.is_enabled && Number.isFinite(row.price) && row.price >= 0)
    .map((row) => [row.id.toLowerCase(), row]));
  const available = items.filter((item) => byId.has(item.product_id));
  if (requiredIds.some(id => !byId.has(id))) throw new Error("部分商品已下架或無法購買，購物車未變更。請重新選擇商品。");
  if (generation !== epoch) return emptyResponse();
  writeItems(available);
  const carts = available.map((item) => {
    const product = toStoreProduct(byId.get(item.product_id)!);
    const total = product.price * item.qty;
    return { id: item.product_id, ...item, product, total, final_total: total };
  });
  const total = carts.reduce((sum, item) => sum + item.total, 0);
  return { data: { success: true, data: { carts, total, final_total: total } } };
}

function emptyResponse() {
  return { data: { success: true, data: { carts: [], total: 0, final_total: 0 } } };
}

// Serialize the complete read/change/reprice/write cycle to avoid lost additions.
function transact(change: (items: StoredItem[]) => StoredItem[], requiredIds: string[] = []) {
  const generation = epoch;
  const result = queue.then(async () => {
    if (generation !== epoch) return emptyResponse();
    return hydrate(change(readItems()), generation, requiredIds);
  });
  queue = result.catch(() => undefined);
  return result;
}

function validate(product_id: string, qty: number) {
  if (!isProductId(product_id)) throw new Error("商品識別碼無效，請重新選擇商品");
  if (!validQty(qty)) throw new Error("商品數量需為 1 到 99 的整數");
}

export const getCartApi = () => transact((items) => items);

/** Merge a previous order atomically; prices are always fetched from current products. */
export const addCartItemsApi = (additions: StoredItem[]) => transact((items) => {
  if (!additions.length) throw new Error("此訂單沒有可再次購買的商品");
  for (const addition of additions) {
    validate(addition.product_id, addition.qty);
    const product_id = addition.product_id.toLowerCase();
    const existing = items.find(item => item.product_id === product_id);
    if (existing) { validate(product_id, existing.qty + addition.qty); existing.qty += addition.qty; }
    else items.push({ product_id, qty: addition.qty });
  }
  return items;
}, additions.map(item => item.product_id.toLowerCase()));

export const addCartApi = ({ product_id, qty }: StoredItem) => transact((items) => {
  validate(product_id, qty);
  product_id = product_id.toLowerCase();
  const existing = items.find((item) => item.product_id === product_id);
  if (existing) {
    validate(product_id, existing.qty + qty);
    existing.qty += qty;
  } else items.push({ product_id, qty });
  return items;
});

export const deleteSingleCartApi = (id: string) => transact((items) =>
  items.filter((item) => item.product_id !== id.toLowerCase()));

export const deleteAllCartApi = async () => {
  clearStoredCart();
  return emptyResponse();
};

export const updateCartApi = (id: string, { product_id, qty }: StoredItem) => transact((items) => {
  validate(product_id, qty);
  if (id.toLowerCase() !== product_id.toLowerCase()) throw new Error("購物車商品不一致");
  const existing = items.find((item) => item.product_id === product_id.toLowerCase());
  if (!existing) throw new Error("購物車商品不存在");
  existing.qty = qty;
  return items;
});
