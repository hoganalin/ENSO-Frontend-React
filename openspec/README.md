# ENSO Storefront OpenSpec

This directory follows the [OpenSpec](https://github.com/Fission-AI/OpenSpec) format used by [Spectra](https://spectra.5xcamp.us/?locale=tw) — a Specification-Driven Development (SDD) tool by 5xRuby.

## Directory Structure

```
openspec/
  specs/             # Living specification documents
    domain/          # Domain models and business rules
    api/             # Backend Edge Function API contracts (frontend perspective)
    features/        # End-to-end UX feature flows
  changes/           # Active change proposals (each in its own sub-folder)
  archive/           # Completed / merged changes
```

## How to Use with Spectra

1. Download Spectra from https://spectra.5xcamp.us/?locale=tw
2. Open Spectra and point it at the `ENSO-main-React/` root folder
3. Spectra will detect the `openspec/` directory and display all specs

## Workflow

| Phase    | Description |
|----------|-------------|
| discuss  | Explore problems, align direction |
| propose  | Create a new `changes/<name>/proposal.md` |
| apply    | Implement tasks from `changes/<name>/tasks.md` |
| ingest   | Update specs when requirements change |
| archive  | Move completed changes to `archive/` |

## Coverage

| Area | Spec File |
|------|-----------|
| Product catalog domain | `specs/domain/products.md` |
| Cart domain | `specs/domain/cart.md` |
| Order domain (frontend) | `specs/domain/orders.md` |
| Member & auth domain | `specs/domain/members.md` |
| checkout-create API contract | `specs/api/checkout-create.md` |
| payment-create API contract | `specs/api/payment-create.md` |
| payment-notify webhook | `specs/api/payment-notify.md` |
| Checkout UX flow | `specs/features/checkout-flow.md` |
| Member auth UX flow | `specs/features/member-auth.md` |
