import { z } from "zod";

const uuidSchema = z.string().uuid();

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const CheckoutRequestSchema = z.object({
  requestId: uuidSchema,
  items: z.array(z.object({
    productId: uuidSchema,
    qty: z.number().int().min(1).max(999),
  })).min(1).max(100),
  recipient: z.object({
    name: z.string().min(1).max(80),
    email: z.string().email().max(254),
    tel: z.string().min(1).max(30),
    address: z.string().min(6).max(300),
  }),
  couponCode: z.string().max(100).nullable().optional(),
  creditUsed: z.number().int().min(0).max(2_000_000_000).optional(),
}).passthrough();

export const CheckoutResponseSchema = z.object({
  order: z.object({
    id: uuidSchema,
    order_no: z.string(),
    status: z.string(),
    subtotal: z.number(),
    discount: z.number(),
    shipping_fee: z.number(),
    total: z.number(),
  }).passthrough(),
});

export const TappayRequestSchema = z.object({
  orderId: uuidSchema,
  prime: z.string().min(10).max(512),
  method: z.enum(["card", "linepay"]).optional(),
}).passthrough();

export const TappayResponseSchema = z.object({
  success: z.literal(true),
  method: z.enum(["card", "linepay"]),
  orderNo: z.string().optional(),
  recTradeId: z.string(),
  amount: z.number().optional(),
  requires3ds: z.boolean().optional(),
  paymentUrl: z.string().url().optional(),
});

const adminOrderActions = [
  "ship",
  "complete",
  "cancel",
  "update_recipient",
  "refund",
  "full_refund",
  "void_invoice",
  "mock_invoice",
  "receive_return",
  "exchange_ship",
] as const;

export const AdminOrderActionRequestSchema = z.object({
  orderId: uuidSchema,
  action: z.enum(adminOrderActions),
  trackingNumber: z.string().optional(),
  recipient: z.record(z.string(), z.unknown()).optional(),
  refundId: uuidSchema.optional(),
  result: z.enum(["succeeded", "rejected"]).optional(),
  error: z.string().nullable().optional(),
  invoiceId: uuidSchema.optional(),
  itemId: uuidSchema.optional(),
  receiptId: uuidSchema.optional(),
  quantity: z.number().int().positive().optional(),
  requestKey: z.string().optional(),
  note: z.string().optional(),
}).passthrough();

export const AdminCreditAdjustRequestSchema = z.object({
  memberId: uuidSchema,
  amount: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
  note: z.string().trim().min(2).max(500),
});

export const DeliveryProcessRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("process"),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  z.object({
    action: z.literal("reconcile"),
    job_id: z.string().min(1),
    outcome: z.enum(["confirmed_sent", "confirmed_not_sent"]),
    note: z.string().trim().min(5),
    reference: z.string().optional(),
  }),
]).or(z.object({ limit: z.number().int().min(1).max(10).optional() }));

export const DeliveryProcessResponseSchema = z.object({
  processed: z.number().int(),
  results: z.array(z.object({
    id: z.string(),
    status: z.string(),
  }).passthrough()),
});

export const DeliveryReconcileResponseSchema = z.object({
  reconciled: z.literal(true),
  job: z.unknown(),
});

export const ScheduledDeliveryResponseSchema = z.object({
  processed: z.number().int(),
  results: z.array(z.unknown()),
});

export const TappayNotifyRequestSchema = z.object({
  rec_trade_id: z.string().min(6).max(40).regex(/^[A-Za-z0-9_-]+$/),
}).passthrough();
