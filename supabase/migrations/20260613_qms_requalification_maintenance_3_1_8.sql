-- §3.1.8 maintenance: competences must be maintained by continuing practice
-- and re-qualified periodically, with records kept. Monthly the system renews
-- qualifications whose holder kept working and had no serious quality events,
-- and flags the rest to a human review queue. Auto-renewal is logged by the
-- existing role_qualifications audit trigger (action='re_qualified').

CREATE TABLE public.qms_requalification_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_qualification_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  reason text NOT NULL,                 -- inactive | quality_events | auto_renew_failed
  detail jsonb,
  due_date timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.staff_users(id),
  resolution_note text
);
CREATE UNIQUE INDEX uq_qms_requal_open ON public.qms_requalification_reviews(role_qualification_id) WHERE status = 'open';
ALTER TABLE public.qms_requalification_reviews ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.qms_requalification_reviews TO service_role;

CREATE OR REPLACE FUNCTION public.qms_run_requalification_maintenance(p_window_days int DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = qms, public AS $$
DECLARE
  rq record;
  v_interval_months int;
  v_practiced boolean;
  v_serious int;
  v_renewed int := 0;
  v_flagged int := 0;
  v_considered int := 0;
BEGIN
  SELECT COALESCE((value::text)::int, 12) INTO v_interval_months
  FROM qms.config WHERE key = 're_qualification_interval_months';
  v_interval_months := COALESCE(v_interval_months, 12);

  FOR rq IN
    SELECT * FROM qms.role_qualifications
    WHERE status = 'qualified'
      AND re_qualification_due IS NOT NULL
      AND re_qualification_due <= now() + make_interval(days => p_window_days)
  LOOP
    v_considered := v_considered + 1;

    IF EXISTS (SELECT 1 FROM public.qms_requalification_reviews
               WHERE role_qualification_id = rq.id AND status = 'open') THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.order_workflow_steps s
      WHERE s.vendor_id = rq.vendor_id
        AND s.status IN ('completed','approved')
        AND COALESCE(s.delivered_at, s.approved_at) >= now() - make_interval(months => v_interval_months)
    ) INTO v_practiced;

    SELECT count(*) INTO v_serious
    FROM qms.performance_events pe
    WHERE pe.vendor_id = rq.vendor_id
      AND pe.severity IN ('high','critical')
      AND pe.occurred_at >= COALESCE(rq.last_re_qualified_at, rq.qualified_at);

    IF v_practiced AND v_serious = 0 THEN
      BEGIN
        UPDATE qms.role_qualifications
        SET last_re_qualified_at = now(),
            re_qualification_due = now() + make_interval(months => v_interval_months),
            updated_by = COALESCE(updated_by, qualified_by)
        WHERE id = rq.id;
        v_renewed := v_renewed + 1;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.qms_requalification_reviews (role_qualification_id, vendor_id, reason, detail, due_date)
        VALUES (rq.id, rq.vendor_id, 'auto_renew_failed',
                jsonb_build_object('error', SQLERRM), rq.re_qualification_due);
        v_flagged := v_flagged + 1;
      END;
    ELSE
      INSERT INTO public.qms_requalification_reviews (role_qualification_id, vendor_id, reason, detail, due_date)
      VALUES (rq.id, rq.vendor_id,
              CASE WHEN NOT v_practiced THEN 'inactive' ELSE 'quality_events' END,
              jsonb_build_object('practiced', v_practiced, 'serious_events', v_serious),
              rq.re_qualification_due);
      v_flagged := v_flagged + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'considered', v_considered, 'renewed', v_renewed, 'flagged', v_flagged,
    'interval_months', v_interval_months, 'window_days', p_window_days, 'ran_at', now()
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.qms_run_requalification_maintenance(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qms_run_requalification_maintenance(int) TO service_role;
