import { describe, expect, it } from "vitest";
import { validateOrderAmounts } from "../../supabase/functions/_shared/orderAmounts";
const items = [{ unit_price: 1000, qty: 2 }];
const order = { subtotal: 2000, discount: 200, shipping_fee: 150, total: 1950 };
describe("payment stored amount contract", () => {
  it("accepts historical gross-subtotal discounted orders", () => expect(validateOrderAmounts(order, items)).toBe(true));
  it("supports free shipping and no discount", () => expect(validateOrderAmounts({ ...order, discount: 0, shipping_fee: 0, total: 2000 }, items)).toBe(true));
  it("subtracts a discount exactly once", () => {
    expect(validateOrderAmounts({ ...order, total: 1680 }, items)).toBe(false);
    expect(validateOrderAmounts({ ...order, subtotal: 1800 }, items)).toBe(false);
  });
  it.each([{ discount: -1 }, { discount: 2001 }, { shipping_fee: 10 }, { total: NaN }, { subtotal: 2000.5 }])("rejects invalid totals %o", patch => expect(validateOrderAmounts({ ...order, ...patch }, items)).toBe(false));
  it("rejects missing items and invalid quantities", () => {
    expect(validateOrderAmounts(order, [])).toBe(false);
    expect(validateOrderAmounts(order, [{ unit_price: 1000, qty: 2.5 }])).toBe(false);
  });
});
