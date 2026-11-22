import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import {
  AdminCreditAdjustRequestSchema,
  AdminOrderActionRequestSchema,
  ApiErrorResponseSchema,
  CheckoutRequestSchema,
  CheckoutResponseSchema,
  DeliveryProcessRequestSchema,
  DeliveryProcessResponseSchema,
  DeliveryReconcileResponseSchema,
  ScheduledDeliveryResponseSchema,
  TappayNotifyRequestSchema,
  TappayRequestSchema,
  TappayResponseSchema,
} from "./schemas";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();
registry.register("ApiErrorResponse", ApiErrorResponseSchema);
registry.register("CheckoutRequest", CheckoutRequestSchema);
registry.register("CheckoutResponse", CheckoutResponseSchema);
registry.register("TappayRequest", TappayRequestSchema);
registry.register("TappayResponse", TappayResponseSchema);
registry.register("AdminOrderActionRequest", AdminOrderActionRequestSchema);
registry.register("AdminCreditAdjustRequest", AdminCreditAdjustRequestSchema);
registry.register("DeliveryProcessRequest", DeliveryProcessRequestSchema);
registry.register("DeliveryProcessResponse", DeliveryProcessResponseSchema);
registry.register("DeliveryReconcileResponse", DeliveryReconcileResponseSchema);
registry.register("ScheduledDeliveryResponse", ScheduledDeliveryResponseSchema);
registry.register("TappayNotifyRequest", TappayNotifyRequestSchema);

const jsonResponse = (description: string, schema: z.ZodType) => ({
  description,
  content: {
    "application/json": { schema },
  },
});

const errorResponse = (description: string) => jsonResponse(description, ApiErrorResponseSchema);

const bearerSecurity = [{ BearerAuth: [] }];

registry.registerPath({
  method: "post",
  path: "/checkout-create",
  tags: ["Checkout"],
  summary: "Create a server-priced order",
  description: "Requires a Supabase user JWT. Product prices and member details are loaded and verified server-side.",
  security: bearerSecurity,
  request: {
    body: { content: { "application/json": { schema: CheckoutRequestSchema } } },
  },
  responses: {
    200: jsonResponse("Order created or an idempotent retry returned the existing order.", CheckoutResponseSchema),
    400: errorResponse("Invalid checkout input."),
    401: errorResponse("Authentication is required."),
    409: errorResponse("The checkout request conflicts with an existing request or current order state."),
    500: errorResponse("Order creation failed."),
  },
});

registry.registerPath({
  method: "post",
  path: "/tappay-pay",
  tags: ["Payments"],
  summary: "Start a TapPay card or LINE Pay transaction",
  description: "Requires a Supabase user JWT. The order owner and amount are verified server-side.",
  security: bearerSecurity,
  request: {
    body: { content: { "application/json": { schema: TappayRequestSchema } } },
  },
  responses: {
    200: jsonResponse("Payment started or completed.", TappayResponseSchema),
    400: errorResponse("Invalid payment request."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Order not found."),
    409: errorResponse("Order is not payable or its amount could not be verified."),
    402: errorResponse("Payment was declined."),
    500: errorResponse("Payment processing failed."),
    502: errorResponse("Payment gateway response was invalid."),
  },
});

registry.registerPath({
  method: "post",
  path: "/admin-order-action",
  tags: ["Admin"],
  summary: "Perform an authorized order or after-sales action",
  description: "Requires a Supabase user JWT and a role permitted for the requested action. Additional fields depend on action.",
  security: bearerSecurity,
  request: {
    body: { content: { "application/json": { schema: AdminOrderActionRequestSchema } } },
  },
  responses: {
    200: { description: "The result object depends on the selected action." },
    400: errorResponse("Invalid action or action-specific input."),
    401: errorResponse("Authentication is required."),
    403: errorResponse("The current role cannot perform this action."),
    404: errorResponse("Order not found."),
    409: errorResponse("The order state does not allow this action."),
    500: errorResponse("Order action failed."),
    502: errorResponse("Payment gateway request failed."),
  },
});

registry.registerPath({
  method: "post",
  path: "/admin-credit-adjust",
  tags: ["Admin"],
  summary: "Adjust a member's store credit",
  description: "Requires a Supabase user JWT and the admin or finance role.",
  security: bearerSecurity,
  request: {
    body: { content: { "application/json": { schema: AdminCreditAdjustRequestSchema } } },
  },
  responses: {
    200: { description: "The store-credit adjustment result." },
    400: errorResponse("Invalid adjustment input or adjustment rejected."),
    401: errorResponse("Authentication is required."),
    403: errorResponse("Only admin or finance roles may adjust credit."),
    500: errorResponse("Adjustment failed."),
  },
});

registry.registerPath({
  method: "post",
  path: "/delivery-process",
  tags: ["Delivery"],
  summary: "Process or reconcile delivery notification jobs",
  description: "Requires a Supabase user JWT and the finance or admin role.",
  security: bearerSecurity,
  request: {
    body: { content: { "application/json": { schema: DeliveryProcessRequestSchema } } },
  },
  responses: {
    200: {
      description: "Delivery processing or reconciliation result.",
      content: { "application/json": { schema: z.union([DeliveryProcessResponseSchema, DeliveryReconcileResponseSchema]) } },
    },
    400: errorResponse("Unsupported action or invalid reconciliation input."),
    401: errorResponse("Authentication is required."),
    403: errorResponse("Only finance or admin roles may process jobs."),
    409: errorResponse("The delivery job cannot be reconciled."),
    500: errorResponse("Delivery processing failed."),
  },
});

registry.registerPath({
  method: "post",
  path: "/scheduled-delivery",
  tags: ["Delivery"],
  summary: "Run the scheduled delivery worker",
  description: "Server-to-server endpoint. Send the configured 64-character token in `x-delivery-cron-token`.",
  security: [{ DeliveryCronToken: [] }],
  request: {
    headers: z.object({
      "x-delivery-cron-token": z.string().length(64).regex(/^[a-f0-9]{64}$/),
    }),
  },
  responses: {
    200: jsonResponse("Scheduled delivery results.", ScheduledDeliveryResponseSchema),
    401: { description: "Cron token is missing or invalid.", content: { "application/json": { schema: z.object({ error: z.string() }) } },
    405: { description: "Only POST is supported.", content: { "application/json": { schema: z.object({ error: z.string() }) } },
    409: { description: "The environment is not configured for simulation.", content: { "application/json": { schema: z.object({ error: z.string() }) } },
    503: { description: "Delivery worker is unavailable.", content: { "application/json": { schema: z.object({ error: z.string() }) } },
  },
});

registry.registerPath({
  method: "post",
  path: "/tappay-notify",
  tags: ["Payments"],
  summary: "Receive a TapPay transaction notification",
  description: "Public TapPay server-to-server callback. The notification is verified against TapPay's transaction API before settlement.",
  request: {
    body: { content: { "application/json": { schema: TappayNotifyRequestSchema } } },
  },
  responses: {
    200: { description: "Callback accepted or ignored.", content: { "text/plain": { schema: z.string() } } },
    500: { description: "Settlement failed; TapPay may retry.", content: { "text/plain": { schema: z.string() } } },
  },
});

export function createOpenApiDocument(serverUrl = "http://127.0.0.1:54321/functions/v1") {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "ENSO Incense API",
      version: "1.0.0",
      description: "Supabase Edge Function contracts. Auto-generated PostgREST table endpoints are documented separately.",
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: "Checkout" },
      { name: "Payments" },
      { name: "Admin" },
      { name: "Delivery" },
    ],
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        DeliveryCronToken: { type: "apiKey", in: "header", name: "x-delivery-cron-token" },
      },
    },
  });
}
