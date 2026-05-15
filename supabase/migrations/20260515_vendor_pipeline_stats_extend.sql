-- Extend get_vendor_activation_drip_stats to surface recruitment-queue
-- counters: applications awaiting review + tests pending review +
-- new-apps-7d + stale test invites. Same filter semantics the
-- RecruitmentList tabs use.
CREATE OR REPLACE FUNCTION public.get_vendor_activation_drip_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_sent          int := 0;
  v_last_run_at         timestamptz;
  v_last_run_sent       int;
  v_batch_size          int;
  v_cron_expression     text;
  v_enabled             boolean;
  v_unique_emailed      int := 0;
  v_activated           int := 0;
  v_in_scope            int := 0;
  v_passing_gates       int := 0;
  v_still_needs_gates   int := 0;
  v_dedup_count         int := 0;
  v_backlog_ready       int := 0;
  v_apps_pending        int := 0;
  v_apps_staff_review   int := 0;
  v_apps_info_requested int := 0;
  v_apps_new_7d         int := 0;
  v_tests_pending       int := 0;
  v_tests_expired       int := 0;
BEGIN
  SELECT total_sent, last_run_at, last_run_sent, batch_size, cron_expression, enabled
    INTO v_total_sent, v_last_run_at, v_last_run_sent, v_batch_size, v_cron_expression, v_enabled
    FROM public.vendor_activation_email_schedule WHERE id = 1;

  SELECT COUNT(DISTINCT recipient_id)
    INTO v_unique_emailed
    FROM public.notification_log
   WHERE event_type = 'vendor_activation_email'
     AND recipient_id IS NOT NULL;

  WITH scope AS (
    SELECT v.id, v.vendor_type
      FROM public.vendors v
     WHERE COALESCE(v.status,'') NOT IN ('suspended','inactive')
       AND v.email IS NOT NULL
  ),
  gates AS (
    SELECT s.id,
           (LOWER(COALESCE(s.vendor_type,'')) = 'agency'
              OR EXISTS (SELECT 1 FROM public.vendor_cvs c WHERE c.vendor_id = s.id))
           AND EXISTS (
             SELECT 1 FROM public.vendor_nda_signatures n
              WHERE n.vendor_id = s.id AND n.is_current
           ) AS passes
      FROM scope s
  )
  SELECT
    (SELECT COUNT(*) FROM scope),
    (SELECT COUNT(*) FROM gates WHERE passes),
    (SELECT COUNT(*) FROM gates WHERE NOT passes)
   INTO v_in_scope, v_passing_gates, v_still_needs_gates;

  SELECT COUNT(*)
    INTO v_activated
    FROM public.notification_log nl
    JOIN public.vendors v ON v.id = nl.recipient_id
   WHERE nl.event_type = 'vendor_activation_email'
     AND nl.recipient_id IS NOT NULL
     AND COALESCE(v.status,'') NOT IN ('suspended','inactive')
     AND (
       LOWER(COALESCE(v.vendor_type,'')) = 'agency'
       OR EXISTS (SELECT 1 FROM public.vendor_cvs c WHERE c.vendor_id = v.id)
     )
     AND EXISTS (
       SELECT 1 FROM public.vendor_nda_signatures n
        WHERE n.vendor_id = v.id AND n.is_current
     );

  SELECT COUNT(DISTINCT recipient_id)
    INTO v_dedup_count
    FROM public.notification_log
   WHERE event_type = 'vendor_activation_email'
     AND created_at > now() - interval '7 days'
     AND recipient_id IS NOT NULL;

  v_backlog_ready := GREATEST(v_still_needs_gates - v_dedup_count, 0);

  SELECT
    COUNT(*) FILTER (WHERE status IN ('staff_review','info_requested')),
    COUNT(*) FILTER (WHERE status = 'staff_review'),
    COUNT(*) FILTER (WHERE status = 'info_requested'),
    COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')
   INTO v_apps_pending, v_apps_staff_review, v_apps_info_requested, v_apps_new_7d
   FROM public.cvp_applications;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('test_submitted','assessed')),
    COUNT(*) FILTER (WHERE status = 'test_sent'
                       AND created_at < now() - interval '14 days')
   INTO v_tests_pending, v_tests_expired
   FROM public.cvp_test_combinations;

  RETURN jsonb_build_object(
    'total_sent',              v_total_sent,
    'unique_emailed',          v_unique_emailed,
    'activated',               v_activated,
    'activation_rate',
       CASE WHEN v_unique_emailed > 0
            THEN ROUND((v_activated::numeric / v_unique_emailed::numeric) * 100, 1)
            ELSE NULL END,
    'in_scope_total',          v_in_scope,
    'passing_gates_total',     v_passing_gates,
    'still_needs_gates_total', v_still_needs_gates,
    'backlog_ready_now',       v_backlog_ready,
    'dedup_window_count',      v_dedup_count,
    'last_run_at',             v_last_run_at,
    'last_run_sent',           v_last_run_sent,
    'batch_size',              v_batch_size,
    'cron_expression',         v_cron_expression,
    'enabled',                 v_enabled,
    'apps_pending_review',     v_apps_pending,
    'apps_staff_review',       v_apps_staff_review,
    'apps_info_requested',     v_apps_info_requested,
    'apps_new_7d',             v_apps_new_7d,
    'tests_pending_review',    v_tests_pending,
    'tests_stale_sent',        v_tests_expired
  );
END;
$$;
