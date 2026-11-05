import { SHIPPING_BASE } from "./commerce/orderTotals.ts";
/** Stored subtotal is gross; discounts are subtracted exactly once. */
export function validateOrderAmounts(
  order: { subtotal: number; discount: number; shipping_fee: number; total: number },
  items: { unit_price: number; qty: number }[],
): boolean {
  if (!items.length || items.some(i => !Number.isSafeInteger(i.unit_price) || i.unit_price < 0 || !Number.isSafeInteger(i.qty) || i.qty < 1)) return false;
  const gross = items.reduce((sum, i) => sum + i.unit_price * i.qty, 0);
  return [gross, order.subtotal, order.discount, order.shipping_fee, order.total].every(Number.isSafeInteger)
    && order.subtotal === gross
    && order.discount >= 0 && order.discount <= gross
    && (order.shipping_fee === 0 || order.shipping_fee === SHIPPING_BASE)
    && order.total > 0
    && order.total === gross - order.discount + order.shipping_fee;
}
