-- RLS remediation Phase 1 (emergency stop): revoke ANONYMOUS access to financial/internal objects.
--
-- WHY: A security audit (2026-06-25) found ~40 tables + 12 SECURITY DEFINER views with
-- `TO public USING(true)` policies while the `anon` role still held default table grants. RLS was
-- enabled but bought nothing: the public anon key (shipped in the web bundle) could read — and
-- structurally write — customer/vendor financial PII directly via the REST API. Confirmed by querying
-- as the anon role: customer_invoices (8,686 rows), customer_payments (4,998), vendor_invoices_all view
-- (6,813), v_vendor_invoices_tax (5,945), cvp_payments (1,043), v_unified_messages (1,509),
-- cvp_application_iso_evidence (1,312), qms_vendor_status (237), payment_requests (24), etc.
--
-- SAFETY: Verified via grep + live Chrome MCP e2e of the public /quote → Review & Checkout flow that no
-- logged-out (anon) flow reads these directly. The public checkout reads only reference/config tables
-- (delivery_options, holidays, countries, app_settings, tax_rates, pickup_locations) and routes payment
-- through the create-checkout-session edge function (service_role, bypasses RLS). The customer payment
-- modal is behind login (authenticated, customer_id-scoped); the vendor portal accesses cvp_payments /
-- cvp_jobs / quote_files exclusively through edge functions (service_role). Revoking `anon` therefore
-- closes the anonymous exposure with zero impact on logged-in or public-builder flows.
--
-- SCOPE: `authenticated` (staff + customer) access is INTENTIONALLY retained here and continues to rely
-- on the existing USING(true) policies. That leaves a lower-severity cross-tenant gap between logged-in
-- users, which is fixed in Phase 2 (ownership-scoped policies) with full Chrome MCP verification.
--
-- REVERSIBLE: re-GRANT the listed privileges to `anon` to roll back.

-- Financial / internal tables: remove anonymous access entirely
revoke select, insert, update, delete on
  public.customer_payments, public.customer_payment_allocations, public.customer_payment_intents,
  public.customer_payment_intent_invoices, public.customer_invoices, public.customer_statements,
  public.customer_statement_items, public.customer_credit_log, public.payment_requests,
  public.refunds, public.invoice_adjustments, public.order_adjustments, public.cvp_payments,
  public.cvp_jobs, public.ocr_ai_analysis, public.payment_confirmation_queue,
  public.invoice_generation_queue, public.order_status_history
  from anon;

-- staff_otp: service-role only (no logged-in user reads OTPs directly; latent staff-auth-bypass otherwise)
revoke select, insert, update, delete on public.staff_otp from anon, authenticated;

-- Internal/financial SECURITY DEFINER views (bypass caller RLS): remove anon read
revoke select on
  public.vendor_invoices_all, public.v_vendor_invoices_tax, public.qms_vendor_status,
  public.qms_vendor_qualified_roles, public.qms_competence_bases, public.qms_evidence_types,
  public.qms_role_types, public.v_unified_messages, public.cvp_ready_for_approval,
  public.cvp_application_iso_evidence, public.cvp_pipeline_needs_reference_request
  from anon;
