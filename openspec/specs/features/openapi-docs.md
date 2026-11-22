# Feature: OpenAPI documentation

## Overview

Supabase Edge Function contracts are described by Zod schemas and rendered as an OpenAPI 3.0 document. The document is validated before it is written or served, and a standalone Express process exposes Swagger UI separately from the Vite SPA.

## Requirements

### Requirement: Edge Function OpenAPI contract
The project SHALL define request and response contracts for every current Supabase Edge Function with Zod schemas and generate an OpenAPI 3.0 document from those contracts.

#### Scenario: Generate API document
- **WHEN** a developer runs `npm run openapi:generate`
- **THEN** `docs/openapi.json` is generated for all current Edge Functions
- **AND** the document uses the configured Supabase Functions base URL without exposing credentials

### Requirement: Validate generated API document
The project SHALL validate the generated OpenAPI document with `swagger-parser` before it is written or served.

#### Scenario: Invalid OpenAPI document
- **WHEN** the document is invalid or cannot be read
- **THEN** generation, validation, or server startup SHALL fail with an explicit error

### Requirement: Interactive API reference
The project SHALL provide a standalone Express server that serves the generated OpenAPI JSON and an interactive Swagger UI page.

#### Scenario: Browse API documentation
- **WHEN** a developer starts the API documentation server
- **THEN** the OpenAPI JSON is available at `/openapi.json`
- **AND** Swagger UI is available at `/api-docs`
- **AND** neither Express nor Swagger UI is included in the Vite browser bundle
