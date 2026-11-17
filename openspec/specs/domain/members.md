# Members Domain (Storefront)

## Overview

Member authentication is handled entirely by **Supabase Auth** (email + password). The frontend uses `@supabase/supabase-js` to obtain a JWT session, which is passed as a Bearer token in all authenticated API calls. Member tier (`normal`, `silver`, `gold`) is stored in the `profiles` table and fetched after login to drive UI gating.

---

## ADDED Requirements

### Requirement: Registration
The system SHALL allow new users to register with email and password via Supabase Auth.

#### Scenario: Successful registration
- **WHEN** a user submits a valid email and password
- **THEN** Supabase creates the user, sends a verification email, and the UI prompts the user to confirm their inbox

#### Scenario: Duplicate email
- **WHEN** a user attempts to register with an email already in use
- **THEN** the form shows an inline error "此 Email 已被註冊"

---

### Requirement: Login
The system SHALL authenticate users via Supabase `signInWithPassword` and store the session token in Redux `authSlice`.

#### Scenario: Valid credentials
- **WHEN** the user submits correct email and password
- **THEN** the Supabase session is stored, the `authSlice` is populated, and the user is redirected to the home page (or the pre-login intended page)

#### Scenario: Invalid credentials
- **WHEN** the user submits incorrect credentials
- **THEN** the form shows "Email 或密碼錯誤" without revealing which field is wrong

---

### Requirement: Session Persistence
The system SHALL persist the Supabase session across page reloads using Supabase's built-in `localStorage` persistence.

#### Scenario: Page reload with active session
- **WHEN** a user reloads the page with a valid unexpired session
- **THEN** they remain logged in and the `authSlice` is rehydrated from Supabase's session

#### Scenario: Expired session
- **WHEN** the stored Supabase session has expired
- **THEN** the user is silently logged out and redirected to `/login` on the next protected route access

---

### Requirement: Member Tier Gating
The system SHALL fetch the user's `member_tier` from `profiles` after login and store it in `authSlice`. UI components use this to show/hide VIP content.

#### Scenario: Gold member
- **WHEN** a `gold` member is logged in
- **THEN** they see all VIP early-access products and receive a "VIP" badge in the account menu

---

### Requirement: Logout
The system SHALL call Supabase `signOut`, clear `authSlice`, and redirect to the home page.

---

## Domain Entities (Frontend View)

### AuthUser (Redux authSlice)
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Supabase user ID |
| `email` | string | |
| `member_tier` | enum | `normal \| silver \| gold` |
| `display_name` | string | From `profiles.full_name` |
| `session` | object | Supabase session object (access + refresh tokens) |
