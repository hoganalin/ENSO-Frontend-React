# API: payment-notify (Frontend Contract)

## Overview

**Endpoint:** `POST /functions/v1/payment-notify` (server-side; called by ECPay)  
**Auth:** None — ECPay posts directly to this URL  
**Handled by:** Backend (Supabase Edge Function); the frontend does NOT call this endpoint  
**Purpose:** Receive ECPay's payment result callback, verify the checksum, and update the order status from `pending` to `paid`.

The frontend's role is to poll or subscribe to order status changes **after** the user is redirected back from ECPay's payment page, and display the final result.

---

## ADDED Requirements

### Requirement: Return URL Handling
The frontend SHALL provide ECPay with a `ReturnURL` (backend notify endpoint) and a `ClientBackURL` (frontend return page). After payment, ECPay redirects the browser to `ClientBackURL`.

#### Scenario: Successful payment — user redirected back
- **WHEN** ECPay redirects the user back to the storefront's `/checkout/result` page
- **THEN** the frontend displays "付款成功" and the order status shows `paid`

#### Scenario: Failed payment — user redirected back
- **WHEN** ECPay redirects back with a failed payment status
- **THEN** the frontend displays "付款失敗，請重試" and provides a "重新付款" action

---

### Requirement: Order Status Polling
The frontend SHALL poll or subscribe to the order's status after the user returns from ECPay, since the `payment-notify` webhook is async and may arrive slightly after the browser redirect.

#### Scenario: Brief polling after redirect
- **WHEN** the user arrives at `/checkout/result`
- **THEN** the frontend fetches the order status every 2 seconds for up to 10 seconds until `status = paid` or an error is confirmed; it then stops polling

---

### Requirement: Idempotent Return Page
The system SHALL render the result page correctly even if the user navigates to it directly (e.g. refreshes).

---

## Backend Notify Flow (for reference)

1. ECPay POSTs to `/functions/v1/payment-notify` with signed form data
2. Edge Function verifies ECPay checksum (`CheckMacValue`)
3. If valid and `RtnCode = 1` (success), updates `orders.status = paid`
4. Responds with `1|OK` to ECPay
5. Frontend polling detects the status change

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| Checkout result | `/checkout/result` | Shows final payment outcome |
| Order detail | `/account/orders/:id` | Full order view with current status |
