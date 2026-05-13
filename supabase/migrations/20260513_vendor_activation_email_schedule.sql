-- ============================================================================
-- vendor_activation_email_schedule — singleton config row driving the
-- vendor-activation-email-cron job. Admin picks batch size + interval
-- + an optional subject/body override; the cron function reads this
-- row each run and emails up to batch_size vendors who haven't been
-- contacted in the last 7 days.
--
-- One row enforced via CHECK (id = 1). Updates from the admin schedule
-- modal also re-schedule the pg_cron job via the schedule helper fn.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vendor_activation_email_schedule (
  id                int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled           boolean NOT NULL DEFAULT false,
  batch_size        int NOT NULL DEFAULT 10 CHECK (batch_size BETWEEN 1 AND 500),
  cron_expression   text NOT NULL DEFAULT '*/15 * * * *',
  subject_override  text,
  body_html_override text,
  last_run_at       timestamptz,
  last_run_sent     int,
  total_sent        int NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Seed the singleton row.
INSERT INTO public.vendor_activation_email_schedule (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.vendor_activation_email_schedule IS
  'Singleton config for the vendor-activation-email-cron drip job. Admin updates via the Send activation emails modal.';

-- Apply / reapply the pg_cron schedule based on the current row. Called
-- from the edge function when the admin updates the schedule.
CREATE OR REPLACE FUNCTION public.apply_vendor_activation_email_schedule()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_row public.vendor_activation_email_schedule%ROWTYPE;
BEGIN
  SELECT * INTO current_row FROM public.vendor_activation_email_schedule WHERE id = 1;
  -- Always unschedule the job first if it exists.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vendor-activation-email-cron') THEN
    PERFORM cron.unschedule('vendor-activation-email-cron');
  END IF;
  -- Only re-schedule if enabled.
  IF current_row.enabled THEN
    PERFORM cron.schedule(
      'vendor-activation-email-cron',
      current_row.cron_expression,
      $cron$
        SELECT net.http_post(
          url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/vendor-activation-email-cron',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END;
$$;

-- Auto-apply the schedule any time the row changes.
CREATE OR REPLACE FUNCTION public.trg_apply_vendor_activation_email_schedule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  PERFORM public.apply_vendor_activation_email_schedule();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_activation_email_schedule_apply
  ON public.vendor_activation_email_schedule;
CREATE TRIGGER trg_vendor_activation_email_schedule_apply
  AFTER UPDATE ON public.vendor_activation_email_schedule
  FOR EACH ROW EXECUTE FUNCTION public.trg_apply_vendor_activation_email_schedule();
