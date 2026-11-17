# API: payment-create (Frontend Contract)

## Overview

**Endpoint:** `POST /functions/v1/payment-create`  
**Auth:** Required — Supabase JWT Bearer token  
**Called from:** Order confirmation page, after `checkout-create` succeeds  
**Purpose:** Generate an ECPay payment form for a `pending` order. The backend re-verifies prices before issuing the form; the frontend only submits the form to redirect the user to ECPay.

---

## ADDED Requirements

### Requirement: Payment Form Submission
The frontend SHALL receive an HTML form string from `payment-create`, inject it into the DOM, and programmatically call `.submit()` to redirect to ECPay.

#### Scenario: Successful form generation
- **WHEN** `payment-create` returns a 200 response with `{ form: "<html form string>" }`
- **THEN** the frontend creates a hidden `<div>`, sets its `innerHTML` to the form string, appends it to `<body>`, and calls `.querySelector('form').submit()`

#### Scenario: Price mismatch detected by backend
- **WHEN** the backend detects `order_item.unit_price !== products.price`
- **THEN** `payment-create` returns HTTP 409 `amount_mismatch` and the frontend shows "商品價格已更新，請重新結帳"

#### Scenario: Legacy order blocked
- **WHEN** the order has `checkout_source !== server-v1`
- **THEN** `payment-create` returns HTTP 409 `legacy_order` and the frontend shows "此訂單格式不支援線上付款"

---

### Requirement: Loading State
The frontend SHALL show a loading spinner and disable the "前往付款" button while awaiting the API response to prevent double-submission.

---

## Request Body

```json
{
  "order_id": "<uuid>"
}
```

## Success Response (200)

```json
{
  "form": "<form method='POST' action='https://payment-stage.ecpay.com.tw/...'>...</form>"
}
```

## Error Codes (Frontend Handling)

| HTTP | Code | UI Behaviour |
|------|------|-------------|
| 401 | `unauthorized` | Redirect to `/login` |
| 404 | `order_not_found` | Show "找不到訂單" and link to order history |
| 409 | `amount_mismatch` | "商品價格已更新，請重新結帳" + link back to cart |
| 409 | `legacy_order` | "此訂單格式不支援線上付款" |
| 409 | `order_not_pending` | "此訂單狀態不允許付款" |
| 5xx | — | Generic error toast, allow retry |
