# Change Proposal: OpenAPI documentation

## Summary
Add a Zod-based OpenAPI contract workflow for Supabase Edge Functions, validate generated documents, and serve interactive Swagger UI outside the Vite client bundle.

## Problem
The repository has a PostgREST/Postman generator, but no independently generated and validated API contract or browsable documentation for the deployed Edge Functions.

## Proposed Solution
Define Edge Function request and response schemas with Zod, generate OpenAPI 3.0 with `@asteasolutions/zod-to-openapi`, validate it with `swagger-parser`, and serve it through a standalone Express server using `swagger-ui-express`.

## Scope
- **In scope:** The seven current Supabase Edge Functions, generated JSON, validation scripts, a local Swagger UI server, and developer documentation.
- **Out of scope:** Changing Edge Function runtime behavior, documenting auto-generated PostgREST table routes, or hosting Express as part of the production Vite SPA.

## Affected Specs
- [x] `specs/features/openapi-docs.md` (new)
- [ ] `specs/domain/products.md`
- [ ] `specs/domain/cart.md`
- [ ] `specs/domain/orders.md`
- [ ] `specs/domain/members.md`
- [ ] `specs/api/checkout-create.md`
- [ ] `specs/api/payment-create.md`
- [ ] `specs/api/payment-notify.md`
- [ ] `specs/features/checkout-flow.md`
- [ ] `specs/features/member-auth.md`

## Open Questions
- None.
