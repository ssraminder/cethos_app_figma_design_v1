-- RLS remediation Phase 2a: scope the `authenticated` role on customer-facing financial tables to
-- staff-or-owner, closing the cross-tenant leak. Before this, leftover `TO public USING(true)` policies
-- let ANY logged-in customer read ALL customers' invoices/payments (demonstrated 2026-06-25: a customer
-- owning 2 of 8,686 invoices saw all 8,686).
--
-- VERIFIED 2026-06-25 via DB role-simulation (SET ROLE authenticated + request.jwt.claims), dry-run in a
-- rolled-back transaction then re-confirmed post-apply:
--   * customer (auth 651c50e6…, owns 2/8,686) -> sees exactly 2 invoices, 1 payment, 0 cross-tenant
--   * customer -> CAN insert their own payment intent (PaymentModal flow); foreign customer_id rejected
--     by WITH CHECK (customer_id = current_customer_id())
--   * staff (is_active_staff) -> still sees all (8,686 / 4,998 / 4,931); live-confirmed on /admin/ar
--   * anon -> already blocked in Phase 1
-- service_role has BYPASSRLS, so edge functions are unaffected.

-- These tables already carry staff (is_active_staff) + customer-owner + service_role policies;
-- the always-true policies below were overriding them — drop the always-true ones.
drop policy if exists customer_invoices_insert on public.customer_invoices;
drop policy if exists customer_invoices_select on public.customer_invoices;
drop policy if exists customer_invoices_update on public.customer_invoices;

drop policy if exists customer_payments_all on public.customer_payments;
drop policy if exists customer_payments_insert on public.customer_payments;
drop policy if exists customer_payments_select on public.customer_payments;
drop policy if exists customer_payments_update on public.customer_payments;

drop policy if exists allocations_all on public.customer_payment_allocations;
drop policy if exists payment_allocations_insert on public.customer_payment_allocations;
drop policy if exists payment_allocations_select on public.customer_payment_allocations;

drop policy if exists refunds_insert on public.refunds;
drop policy if exists refunds_select on public.refunds;
drop policy if exists refunds_update on public.refunds;

-- These tables only had an always-true policy; replace with staff-all + customer-owner.
drop policy if exists payment_intents_all on public.customer_payment_intents;
create policy customer_payment_intents_staff_all on public.customer_payment_intents
  for all to authenticated using (is_active_staff()) with check (is_active_staff());
create policy customer_payment_intents_customer_select on public.customer_payment_intents
  for select to authenticated using (customer_id = current_customer_id());
create policy customer_payment_intents_customer_insert on public.customer_payment_intents
  for insert to authenticated with check (customer_id = current_customer_id());

drop policy if exists intent_invoices_all on public.customer_payment_intent_invoices;
create policy cpii_staff_all on public.customer_payment_intent_invoices
  for all to authenticated using (is_active_staff()) with check (is_active_staff());
create policy cpii_customer_select on public.customer_payment_intent_invoices
  for select to authenticated using (invoice_id in (select id from public.customer_invoices where customer_id = current_customer_id()));
create policy cpii_customer_insert on public.customer_payment_intent_invoices
  for insert to authenticated with check (invoice_id in (select id from public.customer_invoices where customer_id = current_customer_id()));
