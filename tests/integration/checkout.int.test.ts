// 整合測試:建立訂單(checkout-create)+ 完成(admin-order-action),對「下單預留 / 完成實扣」把關。
// 前置:本機已 `supabase start`、`supabase db reset`。只打本機,不碰正式。
import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, createTestUser, createTestProduct, trackOrder, availability, onHand, cleanup } from "./_helpers";

const recipient = { name: "測試收件人", email: "it-recipient@test.local", tel: "0912345678", address: "親送／到店自取" };

afterEach(async () => { await cleanup(); });

describe("整合:建立訂單 checkout-create", () => {
  it("成功建單:HTTP/寫入/運費/總額/預留(可售−、實體不變),完成後實扣庫存", async () => {
    const buyer = await createTestUser();
    const product = await createTestProduct(5, 980); // 在庫 5、單價 980

    const availBefore = await availability(product.id);
    const onHandBefore = await onHand(product.id);
    expect(availBefore).toBe(5);
    expect(onHandBefore).toBe(5);

    const { data, error } = await buyer.client.functions.invoke("checkout-create", {
      body: { requestId: randomUUID(), items: [{ productId: product.id, qty: 2 }], couponCode: null, recipient, creditUsed: 0 },
    });
    expect(error).toBeNull();
    const order = (data as { order: Record<string, number | string> }).order;
    expect(order?.id).toBeTruthy();
    trackOrder(order.id as string);

    // 狀態與金額
    expect(order.status).toBe("pending");
    expect(order.subtotal).toBe(980 * 2);
    expect([0, 150]).toContain(order.shipping_fee);
    expect(order.total).toBe(
      (order.subtotal as number) - (order.discount as number) + (order.shipping_fee as number) - ((order.credit_used as number) ?? 0),
    );

    // order_items 正確寫入
    const { data: items } = await admin.from("order_items").select("*").eq("order_id", order.id);
    expect(items?.length).toBe(1);
    expect(items![0].qty).toBe(2);
    expect(items![0].unit_price).toBe(980);

    // 下單預留:可售 −2、實體在庫不變
    expect(await availability(product.id)).toBe(availBefore - 2);
    expect(await onHand(product.id)).toBe(onHandBefore);

    // 推進到已付款(模擬金流 webhook,整合層用 service_role 直接改),再由 admin 標記完成
    await admin.from("orders").update({ status: "paid" }).eq("id", order.id);
    const adminUser = await createTestUser({ role: "admin" });
    const { error: cErr } = await adminUser.client.functions.invoke("admin-order-action", {
      body: { orderId: order.id, action: "complete" },
    });
    expect(cErr).toBeNull();

    const { data: done } = await admin.from("orders").select("status").eq("id", order.id).single();
    expect((done as { status: string }).status).toBe("completed");
    // 完成(交貨)後才實扣在庫 −2
    expect(await onHand(product.id)).toBe(onHandBefore - 2);
  });

  it("庫存不足:建單被擋,不留半截訂單、可售/實體皆不變", async () => {
    const buyer = await createTestUser();
    const product = await createTestProduct(1, 500); // 在庫只有 1
    const availBefore = await availability(product.id);
    const onHandBefore = await onHand(product.id);

    const { error } = await buyer.client.functions.invoke("checkout-create", {
      body: { requestId: randomUUID(), items: [{ productId: product.id, qty: 2 }], couponCode: null, recipient, creditUsed: 0 },
    });
    // create_checkout_order 以 P0001 擋下 → checkout-create 回 409 → invoke 給 error
    expect(error).not.toBeNull();

    // 沒有殘留訂單
    const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", buyer.id);
    expect(count).toBe(0);

    // 可售 / 實體都不動
    expect(await availability(product.id)).toBe(availBefore);
    expect(await onHand(product.id)).toBe(onHandBefore);
  });
});
