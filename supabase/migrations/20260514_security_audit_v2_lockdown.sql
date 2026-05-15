-- =====================================================================
-- Security audit v2 lockdown (2026-05-14)
--
-- Follow-up to 20260514_v5_replace_misconfigured_staff_policies. The
-- May 14 audit re-run (Documents/cvp-audit-report-2026-05-14-v2.md) found
-- a third tier of leaks the emergency/v2/v3/v4/v5 passes hadn't covered:
--
--   * SECURITY DEFINER mutator functions still anon-callable
--     (purge_storage_bucket, apply_customer_credit, create_invoice_*,
--      delete_document_group, refresh_daily_exchange_rate, etc).
--   * Tables with RLS still disabled and anon-readable via PostgREST
--     (step_deliveries, branches, branch_payment_methods, email_templates,
--      staff, ai_audit_settings, conversion_fire_log, workflow_templates).
--
-- Closes the following findings from the audit:
--   C-1, C-2, C-3, H-1, H-6, H-7, H-8, H-9, H-10, H-11, L-2
--
-- Strategy:
--   - Revoke EXECUTE from anon on every SECURITY DEFINER mutator. Keep
--     authenticated so admin UI (signed-in via Supabase auth) keeps
--     working. Helper functions used by RLS expressions
--     (cvp_is_active_staff, get_staff_id, current_customer_id, etc.)
--     are intentionally left anon-callable.
--   - Enable RLS on sensitive public tables and add explicit
--     authenticated SELECT + service_role ALL policies so admin and
--     edge functions keep reading.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. REVOKE anon EXECUTE on dangerous SECURITY DEFINER mutators
-- ---------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.purge_storage_bucket(text, integer)             FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unschedule_cron_job(text)                       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_secure_upload_otps()                      FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.apply_customer_credit(uuid, numeric, uuid, uuid, uuid) FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.create_invoice_from_order(uuid, character varying)              FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_invoice_from_order(uuid, character varying, numeric)     FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.delete_document_group(uuid)                     FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_document_group(uuid, text, text, text, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_document_group(uuid, text, text, text, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_file_to_group(uuid, uuid, uuid)          FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_item_to_group(uuid, text, uuid, uuid, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_page_to_group(uuid, uuid, uuid)          FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.combine_pages_into_document(uuid, uuid, uuid[], uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.split_file_into_pages(uuid, integer)            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_from_group(uuid)                         FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unassign_item_from_group(uuid)                  FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.recalculate_order_totals(uuid)                  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_daily_exchange_rate(date)               FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.apply_vendor_activation_email_schedule()        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_messages_read(uuid, character varying)     FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_post_view_count(uuid)                 FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_kb_applied(uuid[], timestamp with time zone) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_kb_matched(uuid[], timestamp with time zone) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_or_create_conversation(uuid)                FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.qms_check_assignment(uuid, uuid, text, text, text, uuid, uuid, uuid, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_conversation_summaries(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_review_eligible_customers(integer, integer)    FROM anon, PUBLIC;

-- ---------------------------------------------------------------------
-- 2. ENABLE RLS on sensitive tables + add authenticated-SELECT policies
-- ---------------------------------------------------------------------

-- staff: drop the unnecessary anon-read policy, then enable RLS.
DROP POLICY IF EXISTS "Anon can read staff for login" ON public.staff;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_authenticated_select" ON public.staff
  FOR SELECT TO authenticated USING (true);

-- step_deliveries: vendor work product. Admin UI reads it from
-- OrderWorkflowSection. Lock anon out; allow authenticated read.
ALTER TABLE public.step_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "step_deliveries_authenticated_select" ON public.step_deliveries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "step_deliveries_service_role_all" ON public.step_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- branches: business addresses + tax numbers. Admin-only.
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branches_authenticated_select" ON public.branches
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "branches_service_role_all" ON public.branches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- branch_payment_methods: payment + banking detail schema.
ALTER TABLE public.branch_payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branch_payment_methods_authenticated_select" ON public.branch_payment_methods
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "branch_payment_methods_service_role_all" ON public.branch_payment_methods
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- email_templates: internal email content.
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_templates_authenticated_select" ON public.email_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "email_templates_service_role_all" ON public.email_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ai_audit_settings: AI configuration.
ALTER TABLE public.ai_audit_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_audit_settings_authenticated_select" ON public.ai_audit_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_audit_settings_service_role_all" ON public.ai_audit_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- conversion_fire_log: contains session_id PII per advisor flag.
-- service_role only (analytics write/read).
ALTER TABLE public.conversion_fire_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversion_fire_log_service_role_all" ON public.conversion_fire_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- workflow_templates + workflow_template_steps: admin-only business
-- workflow definitions.
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_templates_authenticated_select" ON public.workflow_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "workflow_templates_service_role_all" ON public.workflow_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.workflow_template_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_template_steps_authenticated_select" ON public.workflow_template_steps
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "workflow_template_steps_service_role_all" ON public.workflow_template_steps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
