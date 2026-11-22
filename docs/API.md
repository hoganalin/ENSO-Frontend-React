# OpenAPI / Swagger UI

The API reference covers the seven current Supabase Edge Functions. Its request and response contracts are defined with Zod in `openapi/schemas.ts`, converted to OpenAPI 3.0 with `@asteasolutions/zod-to-openapi`, and validated with the maintained `@apidevtools/swagger-parser` package.

The existing `scripts/gen-openapi.mjs` remains the Postman workflow: it fetches local PostgREST metadata and supplements it with selected functions. The new OpenAPI workflow is independent of a running Supabase instance and documents the Edge Functions only; it does not replace or alter Postman generation.

## Generate and validate

```bash
npm run openapi:typecheck
npm run openapi:generate
npm run openapi:validate
```

Generation writes `docs/openapi.json` and fails if `swagger-parser` detects an invalid document. `OPENAPI_SERVER_URL` can be set to either the Supabase project base URL or the full `/functions/v1` URL. If unset, the local Supabase Functions URL is used. This variable is only read by Node tooling and is never exposed in the Vite browser bundle.

## Browse Swagger UI

```bash
npm run docs:api
```

Open [http://127.0.0.1:4174/api-docs](http://127.0.0.1:4174/api-docs). The JSON document is also available at [http://127.0.0.1:4174/openapi.json](http://127.0.0.1:4174/openapi.json). `OPENAPI_PORT` changes the listener port; the server binds to loopback by default and can be configured with `OPENAPI_HOST` if remote access is intentionally required.

This is a standalone Node/Express documentation server, not a route in the Vite SPA. It is not automatically deployed by the Vercel static frontend configuration.

## Documented functions

- `checkout-create`
- `tappay-pay`
- `admin-order-action`
- `admin-credit-adjust`
- `delivery-process`
- `scheduled-delivery`
- `tappay-notify`

The Supabase-generated PostgREST table endpoints are outside this document's scope.
