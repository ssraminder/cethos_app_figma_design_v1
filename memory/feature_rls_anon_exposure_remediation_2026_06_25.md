# RLS anon-exposure remediation — 2026-06-25

## What was wrong
RLS was *enabled* on every table, but ~40 tables, 12 SECURITY DEFINER views, and 69 SECURITY DEFINER
functions had `TO public USING(true)` policies + default `anon`/`authenticated` grants. Net effect: the
**public anon key (shipped in the web bundle) could read and structurally write customer/vendor financial
PII directly via the REST API**, and any logged-in customer could read every other tenant's data.
Proven by querying as the `anon` and `authenticated` roles (e.g. anon saw customer_invoices 8,686 /
customer_payments 4,998 / vendor_invoices_all 6,813; a customer owning 2 invoices saw all 8,686).

## What shipped (5 migrations, applied to prod via MCP, files in `supabase/migrations/`)
- `20260625_rls_phase1_revoke_anon_financial_internal.sql` — revoke `anon` on 18 financial/internal
  tables + 11 internal views; `staff_otp` → service-role only.
- `20260625_rls_phase2a_scope_customer_financial_tables.sql` — scope `authenticated` on customer
  financial tables (customer_invoices/payments/payment_intents/allocations/statements/refunds) to
  **staff-or-owner** (is_active_staff() OR customer_id = current_customer_id()).
- `20260625_rls_phase2b_scope_internal_staff_tables.sql` — scope 12 internal tables (cvp_payments,
  cvp_jobs, payment_requests, order_status_history, ocr_ai_analysis, queues, adjustments, …) to
  **is_active_staff()**.
- `20260625_rls_phase3_lockdown_secdef_function_execute.sql` — revoke `anon` EXECUTE on 69 SECURITY
  DEFINER functions. Kept: 8 RLS-helper fns (is_active_staff/current_customer_id/…) + get_pickup_locations_for_quote
  (public quote builder). Bucket B (admin comms_* + get_staff_role + comms_list_admin_threads +
  get_vendor_activation_drip_stats) = authenticated+service. Bucket C (edge/cron/trigger/mutating) =
  service only.
- `20260625_rls_phase3b_staff_gate_definer_views.sql` — wrap the 12 definer views with
  `WHERE is_active_staff()` (security_invoker breaks on comms.*/qms.* grants).

## Key facts / gotchas (for future RLS work)
- `service_role` has `BYPASSRLS` → edge functions are unaffected by any policy change; but it does NOT
  inherit function EXECUTE via PUBLIC, so grant it explicitly when revoking from PUBLIC.
- Revoking a function from PUBLIC alone does NOT remove anon — Supabase grants EXECUTE explicitly to
  `anon`/`authenticated`; revoke from those roles directly.
- Helpers: `is_active_staff()`, `is_staff_user()`, `get_staff_id()`, `has_staff_role()`,
  `current_customer_id()` — all SECDEF/STABLE, return safe values for anon, used inside policies (must
  keep anon EXECUTE).
- The customer/vendor portals + public quote builder access these tables via **edge functions
  (service_role)** or the customer's own JWT; the public quote builder reads only reference tables and
  routes payment through the `create-checkout-session` edge function.
- **Always grep `.rpc(` with multiline matching** — a single-line grep missed 2 multi-line calls
  (get_vendor_activation_drip_stats, comms_list_admin_threads) and they were briefly over-restricted.

## Verification (DB role-simulation + live Chrome MCP on portal.cethos.com)
- DB sim: anon → denied everywhere; test customer → only own 2 invoices (was 8,686), 0 on internal
  tables/views, can still insert own payment intent; staff → full access.
- Live Chrome (logged-in staff): /quote checkout, /admin/ar, /admin/invoices/{customer,vendor,portal},
  /admin/orders/:id (Finance tab), /admin/messages, /admin/calls, /admin/sms, /admin/vendors (+ drip
  stats), /admin/recruitment, /admin/ocr-word-count — all render normally, no permission errors.

## Rollback
Each migration is reversible: re-`GRANT` the revoked table/function privileges to `anon`/`authenticated`,
or `CREATE OR REPLACE VIEW` without the `WHERE is_active_staff()` wrapper.

## Still pending (minor hardening, non-urgent)
`function_search_path_mutable` (184), `extension_in_public` (3), Auth leaked-password (HIBP) protection
OFF, `partner-logos` public bucket allows listing. Optional defense-in-depth: add internal
`is_active_staff() OR service_role` gates to the ungated Bucket C mutating functions.
