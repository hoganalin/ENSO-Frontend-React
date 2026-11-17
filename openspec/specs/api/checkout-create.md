# API: checkout-create (Frontend Contract)

## Overview

**Endpoint:** `POST /functions/v1/checkout-create`  
**Auth:** Required — Supabase JWT Bearer token  
**Called from:** Checkout confirmation step  
**Purpose:** Submit the cart to the backend to create an order with server-verified pricing. The frontend never sends price data — only product IDs and quantities.

---

## ADDED Requirements

### Requirement: Idempotency Key
The frontend SHALL generate a UUID v4 as `checkout_request_id` per checkout attempt and persist it in component state. If the same checkout is retried (e.g. after a network timeout), the same UUID is reused so the backend can deduplicate.

#### Scenario: First attempt
- **WHEN** the user clicks "確認訂單" for the first time
- **THEN** a new UUID is generated, stored in state, and sent as `checkout_request_id`

#### Scenario: Retry after timeout
- **WHEN** the checkout call times out and the user retries
- **THEN** the same `checkout_request_id` is sent; the backend returns the existing order

---

### Requirement: Auth Header
The frontend SHALL attach the Supabase session JWT as a `Bearer` token in the `Authorization` header.

#### Scenario: Session expired mid-checkout
- **WHEN** the session expires between cart-fill and checkout
- **THEN** the API returns 401 and the frontend redirects to `/login` with the cart preserved

---

### Requirement: Error Handling
The frontend SHALL handle all documented error codes with user-visible messages.

| HTTP | Code | UI Behaviour |
|------|------|-------------|
| 401 | `unauthorized` | Redirect to `/login` |
| 400 | `invalid_checkout` | Show "訂單資料有誤，請重試" |
| 409 | `request_conflict` | Show "請勿修改訂單後重複送出" |
| 409 | `checkout_conflict` | Show "訂單衝突，請稍後再試" |
| 5xx | — | Show generic error toast, allow retry |

---

## Request Body

```json
{
  "checkout_request_id": "<uuid-v4>",
  "items": [
    { "productId": "<uuid>", "qty": 1 }
  ]
}
```

## Success Response (200)

```json
{
  "order": {
    "id": "<uuid>",
    "order_no": "ENS-20240920-0001",
    "status": "pending",
    "subtotal": 980,
    "discount": 100,
    "shipping_fee": 80,
    "total": 960
  }
}
```

## Frontend Flow After Success

1. Clear Redux cart slice
2. Store `order.id` in navigation state
3. Navigate to `/checkout/confirm?order=<order_no>`
4. Immediately call `payment-create` to start ECPay redirect flow
