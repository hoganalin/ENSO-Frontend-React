import SwaggerParser from "swagger-parser";

import { createOpenApiDocument } from "../../openapi/spec";
import {
  AdminCreditAdjustRequestSchema,
  CheckoutRequestSchema,
  TappayRequestSchema,
} from "../../openapi/schemas";

describe("OpenAPI contracts", () => {
  it("generates a valid document for every current Edge Function", async () => {
    const document = createOpenApiDocument();

    expect(Object.keys(document.paths ?? {}).sort()).toEqual([
      "/admin-credit-adjust",
      "/admin-order-action",
      "/checkout-create",
      "/delivery-process",
      "/scheduled-delivery",
      "/tappay-notify",
      "/tappay-pay",
    ]);
    await expect(SwaggerParser.validate(document)).resolves.toBeDefined();
  });

  it("accepts valid checkout and payment payloads", () => {
    const checkout = {
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      items: [{ productId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8", qty: 1 }],
      recipient: {
        name: "Test User",
        email: "test@example.com",
        tel: "0912345678",
        address: "台北市信義區測試路 1 號",
      },
    };
    expect(CheckoutRequestSchema.safeParse(checkout).success).toBe(true);
    expect(TappayRequestSchema.safeParse({
      orderId: checkout.requestId,
      prime: "a-valid-prime-value",
      method: "card",
    }).success).toBe(true);
  });

  it("rejects invalid adjustment amounts", () => {
    expect(AdminCreditAdjustRequestSchema.safeParse({
      memberId: "550e8400-e29b-41d4-a716-446655440000",
      amount: 0,
      note: "原因",
    }).success).toBe(false);
  });
});
