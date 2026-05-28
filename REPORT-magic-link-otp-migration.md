# Customer Authentication Report: OTP + Magic Link (Without Supabase Auth)

**Date:** February 14, 2026
**Scope:** Full audit of the customer login system -- both OTP and Magic Link methods
**Goal:** Support both login methods using custom auth only (no `supabase.auth.*`)

---

## 1. Executive Summary

The customer login system currently **names everything "OTP"** but **only implements magic links**. Neither login method works end-to-end today:

| Method | Frontend UI | Backend Send | Backend Verify | Callback Route | Status |
|--------|------------|-------------|---------------|----------------|--------|
| **OTP (6-digit code)** | Toggle + input field exist | Ignores `method` param -- always sends magic link | Expects `{ token }`, rejects `{ email, otp }` | N/A | **Broken** |
| **Magic Link** | Toggle exists, shows toast | Generates token + emails link to `/login/verify?token=...` | Token verification works | `/login/verify` route **does not exist** | **Broken** |

**Neither method delivers a working login today.** This report details every gap and proposes the minimum changes needed to make both work.

---

## 2. Current Architecture

### 2.1 Technology Stack (Customer Auth Only)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React + Vite + TypeScript | SPA at `portal.cethos.com` |
| Auth context | `CustomerAuthContext.tsx` | localStorage-based, no Supabase Auth |
| Edge functions | Supabase Edge Functions (Deno) | Service role key, no Supabase Auth dependency |
| Database | PostgreSQL (Supabase) | `customer_sessions` table with RLS |
| Email | Brevo (Sendinblue) API | Template #20 for magic link emails |
| Staff auth (separate) | Supabase Auth (password + OTP) | Completely separate system, not in scope |

### 2.2 Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `client/pages/Login.tsx` | Login page with OTP/magic link toggle | 330 |
| `client/context/CustomerAuthContext.tsx` | Session state, localStorage persistence | 141 |
| `client/App.tsx` | Route definitions | 378 |
| `supabase/functions/send-customer-login-otp/index.ts` | Generate token + email magic link | 193 |
| `supabase/functions/verify-customer-login-otp/index.ts` | Validate magic link token, create session | 183 |
| `supabase/migrations/20260214_magic_link_auth.sql` | `customer_sessions` table DDL | 47 |

---

## 3. Detailed Findings

### 3.1 Finding: `send-customer-login-otp` Ignores the `method` Parameter

**File:** `supabase/functions/send-customer-login-otp/index.ts`
**Lines:** 53-54

```typescript
const body = await req.json();
const { email, quoteNumber, submissionDate } = body;
// 'method' is never destructured or read
```

The frontend sends `{ email, method: "otp" | "magic_link" }` (Login.tsx:42-45), but the edge function **never reads `method`**. It always:

1. Generates a 32-byte hex token (line 90)
2. Hashes it with SHA-256 (line 91)
3. Stores the hash in `customer_sessions` (lines 98-106)
4. Builds a magic link URL: `${SITE_URL}/login/verify?token=${rawToken}` (line 114)
5. Sends it via Brevo template #20 (lines 117-168)

**Impact:** Selecting "Email Code (Recommended)" on the login page still sends a magic link email, not a 6-digit code. Users see "Check your email for the verification code" but receive a clickable link instead.

---

### 3.2 Finding: `verify-customer-login-otp` Only Accepts `{ token }`, Not `{ email, otp }`

**File:** `supabase/functions/verify-customer-login-otp/index.ts`
**Lines:** 49-53

```typescript
const body = await req.json();
const { token } = body;

if (!token) {
  throw new Error("Token is required");
}
```

The frontend OTP verification sends `{ email, otp }` (Login.tsx:102-105), but the edge function:
- Only destructures `token`
- Throws `"Token is required"` for any request without `token`
- Has no logic to look up a customer by email + OTP code

**Impact:** Submitting a 6-digit code on the verification screen always fails with "Token is required".

---

### 3.3 Finding: No `/login/verify` Route Exists

**File:** `client/App.tsx`
**Lines:** 116-168 (all public routes)

The magic link URL points to `/login/verify?token=...` (edge function line 114), but no React route handles this path. Confirmed by grep: zero matches for `login/verify` or `LoginVerify` anywhere in the frontend.

**Impact:** Clicking the magic link in the email results in the NotFound (404) page. The token is never consumed.

---

### 3.4 Finding: No Database Table or Column for OTP Codes

**File:** `supabase/migrations/20260214_magic_link_auth.sql`

The `customer_sessions` table has these columns:

```sql
id UUID PRIMARY KEY
customer_id UUID NOT NULL
token_hash TEXT NOT NULL     -- SHA-256 of magic link token
expires_at TIMESTAMPTZ
created_at TIMESTAMPTZ
used_at TIMESTAMPTZ
ip_address INET
user_agent TEXT
```

There is:
- No `otp_code` or `otp_hash` column
- No `session_type` column to distinguish OTP vs magic link sessions
- No separate `customer_login_otps` table
- No way to store or verify a 6-digit code

**Impact:** Even if the send function generated a 6-digit OTP, there's nowhere to store it.

---

### 3.5 Finding: Login.tsx Tells Users "Code expires in 10 minutes" But Tokens Expire in 15 Minutes

**File:** `client/pages/Login.tsx` line 288 vs `send-customer-login-otp/index.ts` line 18

```
Frontend: "Code expires in 10 minutes"
Backend:  MAGIC_LINK_EXPIRY_MINUTES = 15
```

**Impact:** Minor UX inconsistency. Users may think their code expired prematurely, or have an extra 5-minute grace period they don't know about.

---

### 3.6 Finding: `window.location.reload()` Hack After Login

**File:** `client/pages/Login.tsx` lines 126-130

```typescript
setTimeout(() => {
  navigate("/dashboard");
  window.location.reload();
}, 500);
```

After successful verification, the page does a hard reload to force the `CustomerAuthProvider` to re-read localStorage. This is because `setCustomerSession()` writes directly to localStorage (a module-level function), bypassing React state.

**Impact:** Works but causes a jarring full-page reload. The proper fix is to call a context method that updates both localStorage and React state simultaneously.

---

### 3.7 Finding: No Server-Side Session Invalidation on Sign Out

**File:** `client/context/CustomerAuthContext.tsx` lines 76-91

```typescript
const signOut = async () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(CUSTOMER_KEY);
  setSession(null);
  setCustomer(null);
  // Could also call an Edge Function to invalidate session in DB
  // But for now, just clear client-side
};
```

The comment at line 86 acknowledges this gap. The 24-hour session token remains valid in the database even after the user "signs out."

**Impact:** If an attacker obtains the session token (e.g., from browser storage), it cannot be revoked. Low priority for now, but should be addressed.

---

### 3.8 Finding: No Rate Limiting on Login Requests

**File:** `supabase/functions/send-customer-login-otp/index.ts`

There is no rate limiting of any kind -- no per-email throttle, no IP-based limit, no attempt counter. An attacker could:
- Spam login emails to any address
- Enumerate valid emails by timing (though the response is uniform, network timing may differ)
- Abuse Brevo email quota

**Impact:** Medium risk. Should add rate limiting before production launch.

---

### 3.9 Finding: CustomerAuthProvider Re-instantiated Per Route

**File:** `client/App.tsx` lines 170-230

Each `/dashboard/*` route wraps its component in a new `<CustomerAuthProvider>`:

```tsx
<Route path="/dashboard" element={
  <CustomerAuthProvider>
    <ProtectedCustomerRoute><CustomerDashboard /></ProtectedCustomerRoute>
  </CustomerAuthProvider>
} />
<Route path="/dashboard/quotes" element={
  <CustomerAuthProvider>
    <ProtectedCustomerRoute><CustomerQuotes /></ProtectedCustomerRoute>
  </CustomerAuthProvider>
} />
```

**Impact:** Every navigation between dashboard sub-pages creates a new provider instance, re-triggering the localStorage load. This works but is wasteful and risks state flickering (loading = true briefly on each navigation).

---

### 3.10 Finding: Brevo Template #20 Only Supports Magic Link

The email template receives these parameters (line 130-141):

```typescript
params: {
  CUSTOMER_NAME: customer.full_name || "there",
  LOGIN_LINK: loginLink,           // <-- magic link URL
  QUOTE_NUMBER: quoteNumber || "",
  SUBMISSION_DATE: submissionDate || "...",
}
```

There is no `OTP_CODE` parameter. To support OTP via email, either:
- Template #20 needs a new variable, or
- A separate template is needed for OTP emails

---

## 4. What Works Today

Despite the issues, these pieces are solid and should be preserved:

1. **Token generation** -- 32-byte cryptographically secure random tokens (send function, line 22-28)
2. **SHA-256 hashing** -- tokens are never stored in plaintext (both functions)
3. **Single-use enforcement** -- `used_at` column prevents token replay (verify function, lines 82-96)
4. **Expiry validation** -- tokens checked against `expires_at` (verify function, lines 98-111)
5. **Email enumeration prevention** -- always returns success (send function, lines 72-79)
6. **Session invalidation on new request** -- old unused sessions are marked used (send function, lines 82-87)
7. **Persistent session creation** -- 48-byte, 24-hour session token for the frontend (verify function, lines 136-151)
8. **IP + User-Agent audit trail** -- captured on every session (both functions)
9. **RLS policy** -- `customer_sessions` restricted to service role only (migration, lines 24-28)
10. **CustomerAuthContext** -- clean localStorage persistence with expiry checking (context file)

---

## 5. Suggested Changes

### 5.1 Database Migration: Add OTP Support to `customer_sessions`

Add two columns to distinguish session types and store OTP hashes:

```sql
ALTER TABLE customer_sessions
  ADD COLUMN session_type TEXT NOT NULL DEFAULT 'magic_link'
    CHECK (session_type IN ('magic_link', 'otp', 'persistent'));

ALTER TABLE customer_sessions
  ADD COLUMN otp_hash TEXT;

CREATE INDEX idx_customer_sessions_type ON customer_sessions(session_type);
```

**`session_type` values:**
- `'magic_link'` -- existing magic link tokens (15 min, single-use)
- `'otp'` -- new 6-digit code sessions (10 min, single-use)
- `'persistent'` -- 24-hour session tokens returned after verification

**`otp_hash`:** SHA-256 hash of the 6-digit code, stored only for `session_type = 'otp'`.

**Rationale:** Using the existing table avoids creating a new table, keeps RLS policies intact, and the `session_type` column lets both verify paths query the same table.

---

### 5.2 Edge Function: Update `send-customer-login-otp`

Branch on the `method` parameter:

**When `method === "otp"`:**
1. Generate a random 6-digit numeric code (`Math.floor(100000 + Math.random() * 900000)`)
2. SHA-256 hash the code
3. Insert into `customer_sessions` with:
   - `session_type: 'otp'`
   - `otp_hash: <hashed code>`
   - `token_hash: <a random placeholder or the same hash>`
   - `expires_at: NOW() + 10 minutes`
4. Email the 6-digit code (not a link) via Brevo -- either a new template or Template #20 with an `OTP_CODE` parameter
5. Update `customers.magic_link_sent_at`

**When `method === "magic_link"` (default):**
- Keep the existing logic unchanged

**Key security detail:** The OTP code must be hashed before storage, just like the magic link token.

---

### 5.3 Edge Function: Update `verify-customer-login-otp`

Accept two payload shapes:

**Shape 1 -- Magic Link (existing):** `{ token }`
- Existing logic, no changes needed

**Shape 2 -- OTP (new):** `{ email, otp }`
1. Normalize email
2. Look up customer by email
3. SHA-256 hash the provided OTP code
4. Query `customer_sessions` where:
   - `customer_id = <customer.id>`
   - `otp_hash = <hashed code>`
   - `session_type = 'otp'`
   - `used_at IS NULL`
   - `expires_at > NOW()`
5. If no match: return 401 "Invalid or expired code"
6. Mark session as used (`used_at = NOW()`)
7. Continue with existing logic: fetch customer, update `last_login_at`, generate persistent session token, return response

**Routing logic at the top:**
```typescript
const { token, email, otp } = body;

if (token) {
  // Magic link flow (existing)
} else if (email && otp) {
  // OTP flow (new)
} else {
  throw new Error("Provide either {token} or {email, otp}");
}
```

Both paths converge at step 6 (mark as used) and share the same session creation + response code.

---

### 5.4 Frontend: Create `/login/verify` Page (Magic Link Callback)

**New file:** `client/pages/LoginVerify.tsx`

This page handles the magic link callback URL (`/login/verify?token=...`):

1. On mount, extract `token` from `URLSearchParams`
2. If no token: show error ("Invalid link")
3. POST `{ token }` to `verify-customer-login-otp`
4. On success: call `setCustomerSession(data.session, data.customer)`, navigate to `/dashboard`
5. On failure: show error message with a "Request new link" button linking to `/`

**States:**
- Loading: "Verifying your login..."
- Success: "Logged in! Redirecting..."
- Error: "This link is invalid or expired" + retry button

---

### 5.5 Frontend: Add Route in `App.tsx`

Add the route alongside the existing public routes (between lines 117 and 118):

```tsx
<Route path="/login/verify" element={<LoginVerify />} />
```

No auth provider wrapper needed -- this page creates the session.

---

### 5.6 Frontend: Fix Expiry Text in Login.tsx

**Line 288:** Change `"Code expires in 10 minutes"` to match the actual backend expiry, or change the backend to 10 minutes for OTP (recommended -- shorter expiry is better for OTP codes).

Suggested: Set OTP expiry to 10 minutes in the backend, keep magic link expiry at 15 minutes. The UI text then correctly says "10 minutes" for OTP mode.

---

### 5.7 Brevo Email Template

**Option A (Recommended):** Create a new Brevo template (e.g., Template #21) for OTP emails:
- Subject: "Your Cethos Login Code"
- Body: "Hi {{CUSTOMER_NAME}}, your verification code is: **{{OTP_CODE}}**. This code expires in 10 minutes."
- No clickable link, just the code prominently displayed

**Option B:** Update Template #20 to conditionally show either a link or a code using Brevo's template language.

---

## 6. Architectural Improvement (Optional, Not Required for MVP)

### 6.1 Wrap Dashboard Routes in a Single CustomerAuthProvider

Instead of wrapping each route individually:

```tsx
<Route element={
  <CustomerAuthProvider>
    <ProtectedCustomerRoute>
      <Outlet />
    </ProtectedCustomerRoute>
  </CustomerAuthProvider>
}>
  <Route path="/dashboard" element={<CustomerDashboard />} />
  <Route path="/dashboard/quotes" element={<CustomerQuotes />} />
  <Route path="/dashboard/quotes/:id" element={<CustomerQuoteDetail />} />
  {/* ... */}
</Route>
```

This eliminates re-instantiation on every sub-page navigation.

### 6.2 Eliminate `window.location.reload()` in Login.tsx

Expose a `login(session, customer)` method on the context that updates both localStorage and React state atomically. Then `Login.tsx` can import and call it without needing a page reload.

### 6.3 Add Server-Side Session Invalidation

Create a `logout-customer` edge function that:
1. Accepts `{ token }`
2. Hashes the token
3. Sets `used_at = NOW()` on the matching `customer_sessions` row

Call it from the `signOut()` method in `CustomerAuthContext.tsx`.

### 6.4 Add Rate Limiting

Add a `login_attempts` counter or use a separate rate limiting table:
- Max 5 OTP/magic link requests per email per 15-minute window
- Max 3 OTP verification attempts per session before invalidation
- Return 429 Too Many Requests when exceeded

---

## 7. Implementation Priority

| Priority | Item | Effort | Risk if Skipped |
|----------|------|--------|-----------------|
| **P0** | 5.1 DB migration (add `session_type`, `otp_hash`) | Small | Blocks all OTP work |
| **P0** | 5.2 Update `send-customer-login-otp` to branch on `method` | Medium | OTP flow doesn't exist |
| **P0** | 5.3 Update `verify-customer-login-otp` to handle `{ email, otp }` | Medium | OTP verification doesn't work |
| **P0** | 5.4 Create `LoginVerify.tsx` magic link callback page | Small | Magic links 404 |
| **P0** | 5.5 Add `/login/verify` route in App.tsx | Trivial | Magic links 404 |
| **P1** | 5.7 Brevo OTP email template | Small | OTP email would show a link instead of a code |
| **P1** | 5.6 Fix expiry text mismatch | Trivial | UX confusion |
| **P2** | 6.1 Single CustomerAuthProvider wrapper | Small | Performance/UX flicker |
| **P2** | 6.2 Eliminate reload hack | Small | Jarring page reload |
| **P3** | 6.3 Server-side logout | Small | Token remains valid after logout |
| **P3** | 6.4 Rate limiting | Medium | Abuse potential |

---

## 8. Data Flow Diagrams

### 8.1 OTP Flow (After Changes)

```
User selects "Email Code" + enters email
         |
         v
Login.tsx: POST /send-customer-login-otp
  body: { email, method: "otp" }
         |
         v
Edge Function:
  1. Look up customer by email
  2. Generate 6-digit code
  3. Hash code with SHA-256
  4. INSERT customer_sessions (session_type='otp', otp_hash=<hash>)
  5. Send email with code via Brevo Template #21
         |
         v
User receives email with "Your code: 847293"
User enters code in Login.tsx verification step
         |
         v
Login.tsx: POST /verify-customer-login-otp
  body: { email, otp: "847293" }
         |
         v
Edge Function:
  1. Look up customer by email
  2. Hash provided OTP
  3. Query customer_sessions (otp_hash match, not used, not expired)
  4. Mark session used_at = NOW()
  5. Generate 48-byte persistent session token
  6. INSERT customer_sessions (session_type='persistent', 24hr expiry)
  7. Return { session: { token, expires_at }, customer: {...} }
         |
         v
Login.tsx: setCustomerSession(session, customer) -> localStorage
Navigate to /dashboard
```

### 8.2 Magic Link Flow (After Changes)

```
User selects "Login Link" + enters email
         |
         v
Login.tsx: POST /send-customer-login-otp
  body: { email, method: "magic_link" }
  Toast: "Check your email for the login link"
  (No step change -- stays on email screen)
         |
         v
Edge Function (existing logic):
  1. Generate 32-byte token
  2. Hash + store in customer_sessions (session_type='magic_link')
  3. Email magic link: https://portal.cethos.com/login/verify?token=<raw>
         |
         v
User clicks link in email
         |
         v
Browser navigates to /login/verify?token=abc123...
         |
         v
LoginVerify.tsx (NEW):
  1. Extract token from URL
  2. POST /verify-customer-login-otp { token }
  3. On success: setCustomerSession() -> navigate to /dashboard
  4. On failure: show error + "Request new link" button
```

---

## 9. Security Considerations

### What's Already Good
- Tokens hashed with SHA-256 before storage
- Single-use enforcement via `used_at`
- Expiry validation
- Email enumeration prevention
- Service-role-only RLS

### What Must Be Added for OTP
- **OTP codes must be hashed** before storage (never store `"847293"` in plaintext)
- **OTP brute-force protection**: 6-digit code = 1M possibilities. At ~100ms per attempt, exhaustive search takes ~28 hours. Add:
  - Max 5 attempts per OTP session (after 5 wrong attempts, invalidate the session)
  - This can be tracked with an `attempts` INTEGER column on `customer_sessions`
- **Shorter OTP expiry**: 10 minutes (vs 15 for magic link) to reduce attack window
- **Constant-time comparison** when verifying OTP hashes (prevent timing attacks)
  - In practice, comparing SHA-256 hashes as strings is already effectively constant-time at the hash level, but using `crypto.timingSafeEqual()` is best practice

### Recommendations for Later
- Implement rate limiting (P3)
- Add server-side session invalidation on logout (P3)
- Add `pg_cron` job to purge expired sessions older than 24 hours
- Consider adding session token rotation (issue new token on each API call)

---

## 10. Summary

**Both login methods are broken today.** The fix requires 5 coordinated changes:

1. **DB migration** -- add `session_type` and `otp_hash` columns
2. **Send function** -- branch on `method` param to generate OTP code or magic link
3. **Verify function** -- branch on payload to handle `{ email, otp }` or `{ token }`
4. **New `LoginVerify.tsx` page** -- handle magic link `?token=` callback
5. **New route in `App.tsx`** -- register `/login/verify`

The existing magic link token infrastructure is well-built and secure. The OTP path reuses the same `customer_sessions` table with a `session_type` discriminator and an `otp_hash` column. Both paths converge on the same persistent session creation logic, so the frontend `CustomerAuthContext` needs no changes.

No Supabase Auth (`supabase.auth.*`) is used or needed for customer login. Staff authentication remains on Supabase Auth separately and is unaffected.
