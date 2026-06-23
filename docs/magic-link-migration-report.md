# OTP → Magic Link Migration: Current State Report

**Date:** February 14, 2026
**Status:** Research only — no changes made

---

## 1. Does Login.tsx have a toggle between "Magic Link" and "OTP code" modes?

**Yes.** `client/pages/Login.tsx:7-15` defines:

```ts
type LoginMethod = "otp" | "magic_link";
```

The UI renders radio buttons at lines 180–223 letting the user choose between:

- **"Email Code (Recommended)"** — sends a 6-digit OTP
- **"Login Link"** — sends a magic link

The default is `"otp"` (line 15). When `"magic_link"` is selected and submitted, the frontend shows a toast ("Check your email for the login link") and does **not** advance to the verify step (lines 55–66). When `"otp"` is selected, it advances to the 6-digit code input screen.

---

## 2. Does it show a 6-digit code input field after sending?

**Yes, but only for OTP mode.** Lines 250–324 render the verify step with a 6-digit input (lines 272–286, `maxLength={6}`, digits-only filter). This step calls the `verify-customer-login-otp` edge function with `{ email, otp }`.

**Critical mismatch:** The verify edge function (`supabase/functions/verify-customer-login-otp/index.ts`) does **not** accept `{ email, otp }`. It accepts `{ token }` (line 50). It validates a magic link token against `customer_sessions.token_hash` — not a 6-digit OTP code. The OTP verification path in the frontend will always fail because it sends the wrong payload shape.

---

## 3. Is there a `/login/verify?token=...` route for magic link redirects?

**No.** The route does not exist in `client/App.tsx`. The only login-related route is `/admin/login` (line 243). There is no `/login/verify` route anywhere in the frontend.

However, the `send-customer-login-otp` edge function **generates** magic link URLs pointing to this route:

```ts
// send-customer-login-otp/index.ts:114
const loginLink = `${SITE_URL}/login/verify?token=${rawToken}`;
```

This means emailed magic links will land on a **404 page**.

---

## 4. What does the verify function validate against?

The verify function (`supabase/functions/verify-customer-login-otp/index.ts`) validates a **magic link token** — not a 6-digit OTP. The flow:

1. Receives `{ token }` (line 50)
2. SHA-256 hashes the token (line 59)
3. Looks up `customer_sessions` by `token_hash` (lines 62–66)
4. Checks if already used (`used_at` not null, line 83)
5. Checks if expired (`expires_at < now`, line 99)
6. Marks the token as used (lines 114–117)
7. Fetches customer data from `customers` table (lines 120–124)
8. Creates a new persistent session (24hr) with a fresh token (lines 137–151)
9. Returns `{ success, session: { token, expires_at }, customer: {...} }`

---

## 5. Does a `customer_login_otp` table exist?

**No.** There are zero references to a `customer_login_otp` table anywhere in the codebase. The backend uses `customer_sessions` for storing token hashes — there is no OTP storage table at all.

---

## Summary of Gaps for Migration

| Component | Current State | What's Needed |
|---|---|---|
| **Login.tsx toggle** | Has OTP/magic_link radio toggle | Remove toggle, make magic-link-only |
| **6-digit input UI** | Renders after OTP send | Remove entirely |
| **`/login/verify` route** | Does not exist | Must be created to handle `?token=` callback |
| **Verify function payload** | Expects `{ token }` | Already magic-link ready; frontend sends wrong shape `{ email, otp }` |
| **`customer_login_otp` table** | Does not exist | Nothing to drop — backend already uses `customer_sessions` |
| **Send function** | Already sends magic links via Brevo template #20 | Already magic-link ready; ignores `method` param from frontend |

---

## Key Finding

The backend is **already fully migrated** to magic links:

- The `send` function ignores the `method` parameter and always generates a magic link.
- The `verify` function validates tokens, not OTP codes.

The **frontend is the sole remaining piece** — it still presents OTP UI and sends the wrong payload shape to the verify endpoint.

### Required Frontend Changes

1. **Remove** the OTP/magic_link radio toggle — always send magic link
2. **Remove** the 6-digit code input step entirely
3. **Create** a `/login/verify` route + page that:
   - Extracts `?token=` from the URL
   - POSTs `{ token }` to `verify-customer-login-otp`
   - On success: calls `setCustomerSession()` and redirects to `/dashboard`
   - On failure: shows error with "Request new link" button
4. **Simplify** `Login.tsx` to email-only input → "Check your email" confirmation screen
