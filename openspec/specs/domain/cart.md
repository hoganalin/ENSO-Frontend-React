# Cart Domain

## Overview

The cart is a client-side, Redux-managed collection of product line items. It is ephemeral — persisted only in Redux store (and optionally synced to `localStorage`). Cart totals shown in the UI are for display only; authoritative totals are computed server-side at checkout.

---

## ADDED Requirements

### Requirement: Add to Cart
The system SHALL allow authenticated users to add a product to the cart from the product listing or detail page.

#### Scenario: Add new item
- **WHEN** a user clicks "加入購物車" on a product
- **THEN** the product is added to the Redux cart slice with `qty = 1`

#### Scenario: Add duplicate item
- **WHEN** a user adds a product that already exists in the cart
- **THEN** the existing cart line item's `qty` is incremented by 1

#### Scenario: Unauthenticated user adds item
- **WHEN** a guest clicks "加入購物車"
- **THEN** the user is redirected to `/login` with a redirect hint back to the product page

---

### Requirement: Cart Quantity Management
The system SHALL allow the user to increase or decrease the quantity of any cart line item, or remove it entirely.

#### Scenario: Decrease to zero
- **WHEN** a user decreases the quantity of a cart item to 0
- **THEN** the item is removed from the cart

---

### Requirement: Display-Only Totals
The system SHALL show a subtotal computed as `Σ(unit_price × qty)` for user convenience. This value is labelled as an estimate and is NOT sent to the server as an authoritative total.

---

### Requirement: Cart Persistence
The system SHALL persist the cart to `localStorage` so it survives a page reload. Cart state is restored on app init from `localStorage`.

---

## Domain Entities

### CartItem (Redux slice)
| Field | Type | Notes |
|-------|------|-------|
| `productId` | UUID | References the catalog product |
| `title` | string | Snapshot of product name at add-time |
| `unit_price` | integer | Snapshot price at add-time (display only) |
| `imageUrl` | string | Snapshot image URL |
| `qty` | integer | Quantity ≥ 1 |
