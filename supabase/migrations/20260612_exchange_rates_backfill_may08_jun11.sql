-- Backfill USD→CAD exchange rates for 2026-05-08 .. 2026-06-11.
--
-- The fetch-exchange-rates edge function bundle was lost on 2026-05-08
-- (LOAD_FUNCTION_ERROR; the "Supabase bundle-loss" pattern), so the
-- 4x-daily cron recorded nothing for 5 weeks. The function was rebuilt and
-- redeployed on 2026-06-12 (source now committed at
-- supabase/functions/fetch-exchange-rates/index.ts).
--
-- Sources for this backfill (close-of-day, one observation per business day):
--   mid_market_rate: api.frankfurter.dev (ECB reference rate, USD base)
--   boc_rate:        bankofcanada.ca/valet FXUSDCAD (NULL on 2026-05-18,
--                    Victoria Day — BoC published no rate)
-- approx_bank_rate is GENERATED ALWAYS AS (boc_rate * 0.969) — no backfill needed.

INSERT INTO exchange_rate_observations
  (rate_date, source, mid_market_rate, boc_rate, mid_market_source, boc_source)
VALUES
  ('2026-05-08', 'backfill', 1.3658, 1.3686, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-11', 'backfill', 1.3667, 1.3667, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-12', 'backfill', 1.3706, 1.3710, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-13', 'backfill', 1.3691, 1.3703, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-14', 'backfill', 1.3724, 1.3725, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-15', 'backfill', 1.3756, 1.3752, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-18', 'backfill', 1.3741, NULL,   'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-19', 'backfill', 1.3756, 1.3757, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-20', 'backfill', 1.3758, 1.3751, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-21', 'backfill', 1.3770, 1.3783, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-22', 'backfill', 1.3801, 1.3809, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-25', 'backfill', 1.3813, 1.3804, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-26', 'backfill', 1.3812, 1.3812, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-27', 'backfill', 1.3834, 1.3831, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-28', 'backfill', 1.3854, 1.3809, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-05-29', 'backfill', 1.3805, 1.3798, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-06-01', 'backfill', 1.3830, 1.3837, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-06-02', 'backfill', 1.3837, 1.3834, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-06-03', 'backfill', 1.3857, 1.3884, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-06-04', 'backfill', 1.3897, 1.3896, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-06-05', 'backfill', 1.3882, 1.3924, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-06-08', 'backfill', 1.3937, 1.3947, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-06-09', 'backfill', 1.3921, 1.3947, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-06-10', 'backfill', 1.3929, 1.3930, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet'),
  ('2026-06-11', 'backfill', 1.3979, 1.3993, 'api.frankfurter.dev (ECB)', 'bankofcanada.ca/valet');

-- Roll each backfilled day up into the exchange_rates summary table
DO $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT DISTINCT rate_date
    FROM exchange_rate_observations
    WHERE source = 'backfill'
      AND rate_date BETWEEN '2026-05-08' AND '2026-06-11'
  LOOP
    PERFORM refresh_daily_exchange_rate(d);
  END LOOP;
END $$;

-- NOTE: the 22:00 UTC "update-exchange-rates-daily" cron (job 23) still points
-- at the legacy update-exchange-rates function, whose bundle is also dead.
-- It predates the observations system and is fully redundant with the
-- fetch-exchange-rates cron (job 37); unscheduling it is pending a decision.
