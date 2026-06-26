-- RLS remediation Phase 3 (#2): close the cross-tenant leak through SECURITY DEFINER views.
--
-- WHY: these 11 views are owned by postgres (definer) and were SELECT-able by `authenticated`, so a
-- logged-in CUSTOMER could read all rows bypassing RLS (confirmed 2026-06-25: a customer saw
-- vendor_invoices_all 6,813 / cvp_application_iso_evidence 1,316 / qms_vendor_status 237).
-- `security_invoker=on` is NOT usable here: several views read comms.*/qms.* tables that `authenticated`
-- has no direct grant on (they are reached via definer functions), so invoker mode breaks staff too.
--
-- FIX: keep the views DEFINER (so underlying access keeps working) but wrap each so it returns rows only
-- to active staff: `SELECT * FROM (<original definition>) WHERE is_active_staff()`. is_active_staff()
-- evaluates the caller's JWT, so staff get all rows and customers/anon get none. (Anon SELECT on these
-- views was already revoked in Phase 1.)
--
-- VERIFIED 2026-06-25 via DB role-simulation (dry-run rolled back, then re-confirmed post-apply) and live
-- Chrome: customer -> 0 on every view; staff -> full counts; /admin/vendors, /admin/recruitment,
-- /admin/messages, /admin/invoices/vendor all render normally.
--
-- NOTE: this DO block wraps each view's then-current definition; re-running adds a redundant (harmless)
-- nested wrapper.

do $$
declare v text; def text;
  views text[] := array['vendor_invoices_all','v_vendor_invoices_tax','qms_vendor_status','qms_vendor_qualified_roles','qms_competence_bases','qms_evidence_types','qms_role_types','v_unified_messages','cvp_ready_for_approval','cvp_application_iso_evidence','cvp_pipeline_needs_reference_request'];
begin
  foreach v in array views loop
    def := rtrim(btrim(pg_get_viewdef(('public.'||v)::regclass, true)), ';');
    execute format('create or replace view public.%I as select * from (%s) _g where is_active_staff()', v, def);
  end loop;
end$$;
