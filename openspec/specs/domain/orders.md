# Orders Domain (Storefront)

## Overview

From the storefront's perspective, an Order is a read-only record returned by the backend after a successful checkout. The frontend initiates order creation via the `checkout-create` Edge Function and tracks the resulting order status. The browser never computes prices or mutates order state.

---

## ADDED Requirements

### Requirement: Order Creation Trigger
The system SHALL submit the cart contents to `checkout-create` when the user confirms checkout. The request includes a client-generated `checkout_request_id` UUID for idempotency.

#### Scenario: Successful checkout
- **WHEN** the user submits a valid checkout form with a non-empty cart
- **THEN** the frontend calls `checkout-create`, receives an order object with `status = pending`, clears the cart, and navigates to the order confirmation page

#### Scenario: Network retry (same idempotency key)
- **WHEN** the user retries a timed-out checkout with the same `checkout_request_id`
- **THEN** `checkout-create` returns the existing pending order and the frontend treats it as success

---

### Requirement: Order History
The system SHALL display a list of the authenticated user's past orders, showing order number, date, total, and status.

#### Scenario: Empty history
- **WHEN** a user has no orders
- **THEN** the order history page shows an empty-state illustration

---

### Requirement: Order Detail View
The system SHALL display an order detail page with a full breakdown of items, totals, recipient info, and payment status.

---

### Requirement: Payment Redirect
The system SHALL call `payment-create` after a pending order is confirmed, receive an ECPay payment form, and submit it to redirect the user to the payment gateway.

#### Scenario: Payment form received
- **WHEN** `payment-create` returns an HTML form
- **THEN** the frontend programmatically submits the form to redirect to ECPay

---

## Domain Entities (Frontend View)

### Order (read model)
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Order identifier |
| `order_no` | string | Human-readable e.g. `ENS-20240920-0001` |
| `status` | enum | `pending \| paid \| shipped \| completed \| cancelled` |
| `subtotal` | integer | NTD |
| `discount` | integer | NTD |
| `shipping_fee` | integer | `0` or `80` NTD |
| `total` | integer | NTD — amount charged |
| `recipient` | object | `{ name, email, address, tel }` |
| `items` | array | See OrderItem below |
| `created_at` | ISO datetime | Order creation time |

### OrderItem (read model)
| Field | Type | Notes |
|-------|------|-------|
| `product_id` | UUID | |
| `title` | string | Snapshot name |
| `unit_price` | integer | Snapshot price |
| `qty` | integer | |
