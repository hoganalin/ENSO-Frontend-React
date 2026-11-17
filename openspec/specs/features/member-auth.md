# Feature: Member Auth Flow

## Overview

Authentication is handled entirely by **Supabase Auth** (email + password). The frontend uses `@supabase/supabase-js` v2 for auth operations. Session state is managed in Redux `authSlice` and synced from Supabase's `onAuthStateChange` listener on app init.

---

## ADDED Requirements

### Requirement: Login Page
The system SHALL provide a `/login` page with email and password fields.

#### Scenario: Redirect after login
- **WHEN** the user was redirected to `/login` from a protected route
- **THEN** after successful login they are sent back to the originally requested page

#### Scenario: Already logged in
- **WHEN** a logged-in user navigates to `/login`
- **THEN** they are immediately redirected to the home page

---

### Requirement: Registration
The system SHALL provide a registration flow (either a separate page `/register` or a modal).

#### Scenario: Email confirmation required
- **WHEN** Supabase is configured with email confirmation enabled
- **THEN** after registration the UI shows "請確認您的 Email 以完成註冊"

---

### Requirement: Protected Routes
The system SHALL wrap all routes requiring authentication in a `ProtectedRoute` component that redirects to `/login` if no session is found.

#### Protected routes include:
- `/cart`
- `/checkout` and sub-routes
- `/account` and sub-routes (order history, profile)

---

### Requirement: Session Refresh
The system SHALL rely on Supabase's automatic token refresh. When the access token is near expiry, Supabase refreshes it silently using the stored refresh token.

#### Scenario: Background refresh fails
- **WHEN** the refresh token is also expired or revoked
- **THEN** `onAuthStateChange` emits `SIGNED_OUT`, the `authSlice` is cleared, and the user is redirected to `/login`

---

### Requirement: Profile Fetch
The system SHALL fetch the user's `profiles` row from Supabase immediately after login to populate `member_tier` and `display_name` in `authSlice`.

#### Scenario: Profile missing
- **WHEN** no `profiles` row exists for the user (edge case — new user, trigger not fired)
- **THEN** the system defaults to `member_tier = normal` and logs a warning; the app remains functional

---

## Components Involved

| Component | Location |
|-----------|----------|
| LoginPage | `src/pages/LoginPage.tsx` |
| RegisterPage | `src/pages/RegisterPage.tsx` |
| ProtectedRoute | `src/components/ProtectedRoute.tsx` |
| authSlice | `src/slice/authSlice.ts` |
| supabaseClient | `src/services/supabaseClient.ts` |
