-- Fix: cvp_applications.application_number was generated via count(*)+1 in the
-- edge function. That collides with an existing number whenever count(*) drifts
-- below the real max suffix -- which happened once a dummy row (APP-26-9900) plus
-- several deleted test applications pushed count below the highest issued number.
-- Result: count(*)+1 = "APP-26-0400", which already existed -> unique-violation ->
-- EVERY new submission failed with "Failed to submit application. Please try again."
-- (~1h full outage during the ProZ recruitment blast, 2026-06-19 23:36 -> 00:42 UTC).
--
-- Replace with an atomic Postgres sequence so application numbers can never
-- collide, even under concurrent submissions or after row deletions.

CREATE SEQUENCE IF NOT EXISTS public.cvp_application_seq;

-- Seed to the current real max suffix (ignoring out-of-range dummies like 9900)
-- so the next value is max+1 and can't hit an existing number.
SELECT setval('public.cvp_application_seq',
  GREATEST(1, (
    SELECT COALESCE(max((regexp_replace(application_number, '^APP-[0-9]{2}-', ''))::int), 0)
    FROM public.cvp_applications
    WHERE application_number ~ '^APP-[0-9]{2}-[0-9]{4}$'
      AND (regexp_replace(application_number, '^APP-[0-9]{2}-', ''))::int < 9000
  )));

CREATE OR REPLACE FUNCTION public.cvp_next_application_number()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT 'APP-' || to_char(CURRENT_DATE, 'YY') || '-' ||
         lpad(nextval('public.cvp_application_seq')::text, 4, '0');
$$;
GRANT EXECUTE ON FUNCTION public.cvp_next_application_number() TO service_role, anon, authenticated;
