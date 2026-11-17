# Feature: Checkout Flow

## Overview

The checkout flow takes the user from a filled cart to a paid order. It spans three pages: Cart, Checkout Form, and Order Confirmation/Result. All pricing authority resides on the backend; the UI only displays estimates and confirms the final amount returned from the API.

---

## ADDED Requirements

### Requirement: Cart Review Step
The system SHALL show the user a cart summary before they enter recipient information.

#### Scenario: Empty cart — checkout blocked
- **WHEN** a user navigates to `/cart` with an empty cart
- **THEN** an empty-state message is shown and the "前往結帳" button is hidden

#### Scenario: Non-empty cart
- **WHEN** a user navigates to `/cart` with items
- **THEN** a table of items (image, title, price, qty, line total) and a display-only subtotal are shown

---

### Requirement: Recipient Information Form
The system SHALL collect recipient name, email, phone, and delivery address on the checkout form page (`/checkout`). The form uses React Hook Form with validation.

#### Scenario: Missing required fields
- **WHEN** the user submits the form with a missing required field
- **THEN** inline validation errors appear beneath each invalid field

#### Scenario: Valid form submission
- **WHEN** all fields are valid and the user clicks "確認訂單"
- **THEN** the form is disabled, a loading spinner appears, and `checkout-create` is called

---

### Requirement: Order Confirmation Page
The system SHALL display the server-verified order total (from `checkout-create` response) before initiating payment. The user sees the authoritative `total` before being redirected to ECPay.

#### Scenario: Total differs from cart estimate
- **WHEN** the server-computed `total` differs from the client-side subtotal shown in the cart
- **THEN** the confirmation page highlights the difference with a note "伺服器已重新計算金額"

---

### Requirement: ECPay Redirect
The system SHALL call `payment-create` and redirect the user to ECPay within the same user gesture (button click) to prevent browser popup blockers from interfering.

---

## Page Flow

```
/cart → /checkout → [checkout-create API] → /checkout/confirm → [payment-create API] → ECPay → /checkout/result
```

## Components Involved

| Component | Location |
|-----------|----------|
| CartPage | `src/pages/CartPage.tsx` |
| CheckoutPage | `src/pages/CheckoutPage.tsx` |
| CheckoutConfirmPage | `src/pages/CheckoutConfirmPage.tsx` |
| CheckoutResultPage | `src/pages/CheckoutResultPage.tsx` |
| cartSlice | `src/slice/cartSlice.ts` |
