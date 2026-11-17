# Products Domain (Storefront)

## Overview

The storefront displays the ENSO product catalog fetched from the backend API. Products have time-gated availability and tier-restricted access. The browser trusts the server for all pricing — it never computes or validates prices itself.

---

## ADDED Requirements

### Requirement: Product Listing
The system SHALL fetch and display products from the backend, filtering out items that are not yet available for the current user's member tier.

#### Scenario: Normal member — all publicly available products shown
- **WHEN** a `normal` member browses `/products`
- **THEN** only products whose `available_at` has passed are visible

#### Scenario: VIP member — early access products shown
- **WHEN** a `silver` or `gold` member browses `/products`
- **THEN** products whose `vip_available_at` has passed (but `available_at` has not) are also visible

#### Scenario: Guest (unauthenticated)
- **WHEN** an unauthenticated visitor browses `/products`
- **THEN** only publicly available products are shown; VIP-gated items are hidden

---

### Requirement: Product Detail
The system SHALL display a product detail page with title, description, price, imagery, and an Add-to-Cart control.

#### Scenario: Out-of-stock product
- **WHEN** a product has `stock = 0` (or equivalent flag)
- **THEN** the Add-to-Cart button is disabled and labelled "已售罄"

#### Scenario: VIP-only product visited by normal member
- **WHEN** a normal member navigates directly to a VIP product's URL
- **THEN** the page shows a membership upgrade prompt and hides the purchase controls

---

### Requirement: Price Display
The system SHALL display prices exactly as returned by the API. It SHALL NOT apply any client-side discount calculations.

---

## Domain Entities (Frontend View)

### Product (display model)
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Product identifier |
| `title` | string | Display name |
| `description` | string | Marketing copy |
| `price` | integer | NTD, authoritative from server |
| `imageUrl` | string | CDN URL for hero image |
| `available_at` | ISO datetime | General availability timestamp |
| `vip_available_at` | ISO datetime | VIP early access timestamp |
| `vip_only` | boolean | Hidden from non-VIP members |
| `stock` | integer | Available units (0 = sold out) |
