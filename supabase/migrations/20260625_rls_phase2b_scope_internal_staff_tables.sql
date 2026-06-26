-- RLS remediation Phase 2b: scope `authenticated` to staff-only on internal/back-office tables that had
-- leftover `TO public USING(true)` policies (so any logged-in customer could cross-tenant read them).
-- These tables are not read directly by customer or public flows; the vendor portal reads cvp_* via edge
-- functions (service_role, BYPASSRLS). order_status_history is written only by triggers
-- fn_auto_complete_on_final_deliverable / fn_auto_complete_on_invoiced (fire on staff/edge actions, never
-- under a customer role); payment_confirmation_queue is written by edge functions only.
--
-- VERIFIED 2026-06-25 via DB role-simulation (dry-run rolled back, then re-confirmed post-apply):
--   customer (auth 651c50e6…) -> 0 rows on every table;
--   staff (is_active_staff, auth 818768c3…) -> full access (cvp_payments 1043, payment_requests 24,
--   order_status_history 481, ocr_ai_analysis 1205).

drop policy if exists customer_credit_log_insert on public.customer_credit_log;
drop policy if exists customer_credit_log_select on public.customer_credit_log;
create policy customer_credit_log_staff_all on public.customer_credit_log for all to authenticated using (is_active_staff()) with check (is_active_staff());

drop policy if exists statements_all on public.customer_statements;
create policy customer_statements_staff_all on public.customer_statements for all to authenticated using (is_active_staff()) with check (is_active_staff());

drop policy if exists statement_items_all on public.customer_statement_items;
create policy customer_statement_items_staff_all on public.customer_statement_items for all to authenticated using (is_active_staff()) with check (is_active_staff());

drop policy if exists "Service role full access on cvp_jobs" on public.cvp_jobs;
create policy cvp_jobs_staff_all on public.cvp_jobs for all to authenticated using (is_active_staff()) with check (is_active_staff());

drop policy if exists "Service role full access on cvp_payments" on public.cvp_payments;
create policy cvp_payments_staff_all on public.cvp_payments for all to authenticated using (is_active_staff()) with check (is_active_staff());

drop policy if exists invoice_adjustments_insert on public.invoice_adjustments;
drop policy if exists invoice_adjustments_select on public.invoice_adjustments;
create policy invoice_adjustments_staff_all on public.invoice_adjustments for all to authenticated using (is_active_staff()) with check (is_active_staff());

drop policy if exists order_adjustments_insert on public.order_adjustments;
drop policy if exists order_adjustments_select on public.order_adjustments;
create policy order_adjustments_staff_all on public.order_adjustments for all to authenticated using (is_active_staff()) with check (is_active_staff());

drop policy if exists order_status_history_insert on public.order_status_history;
drop policy if exists order_status_history_select on public.order_status_history;
create policy order_status_history_staff_all on public.order_status_history for all to authenticated using (is_active_staff()) with check (is_active_staff());

drop policy if exists confirmation_queue_all on public.payment_confirmation_queue;
create policy payment_confirmation_queue_staff_all on public.payment_confirmation_queue for all to authenticated using (is_active_staff()) with check (is_active_staff());

drop policy if exists invoice_queue_all on public.invoice_generation_queue;
create policy invoice_generation_queue_staff_all on public.invoice_generation_queue for all to authenticated using (is_active_staff()) with check (is_active_staff());

drop policy if exists payment_requests_insert on public.payment_requests;
drop policy if exists payment_requests_select on public.payment_requests;
drop policy if exists payment_requests_update on public.payment_requests;
create policy payment_requests_staff_all on public.payment_requests for all to authenticated using (is_active_staff()) with check (is_active_staff());

-- ocr_ai_analysis: keep the service_role policy; replace the over-permissive "Staff can ..." policies
-- (which actually allowed ANY authenticated user) with a proper is_active_staff() gate.
drop policy if exists "Staff can insert manual documents" on public.ocr_ai_analysis;
drop policy if exists "Staff can update analysis results" on public.ocr_ai_analysis;
drop policy if exists "Staff can delete manual documents" on public.ocr_ai_analysis;
drop policy if exists "Staff can read analysis results" on public.ocr_ai_analysis;
create policy ocr_ai_analysis_staff_all on public.ocr_ai_analysis for all to authenticated using (is_active_staff()) with check (is_active_staff());
