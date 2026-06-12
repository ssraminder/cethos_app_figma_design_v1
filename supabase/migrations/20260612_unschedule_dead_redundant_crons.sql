-- Remove cron jobs that call permanently dead edge functions (bundle lost,
-- no recoverable source) and whose purpose is either superseded or was
-- temporary. User-approved 2026-06-12 during the dead-bundle audit.
--
-- 1. update-exchange-rates-daily (job 23): legacy daily fetcher, redundant
--    with the fetch-exchange-rates observations cron (job 37) since April.
-- 2-4. XTRF patch runners (jobs 20/21/22): temporary cache-patch/backfill
--    runners from the March XTRF cache work, superseded by the CSV-based
--    full-history import (2026-05-22) and reconciliation (2026-06-10).
--    Each was hitting its dead endpoint every 1-2 minutes (~2,000 useless
--    503s/day in net._http_response).
--
-- NOT touched: crons for the 8 dead functions slated for rebuild
-- (check-sla-deadlines, check-missed-deadlines, check-overdue-orders,
-- xtrf-sync-incremental, xtrf-sync-vendor-cache, daily-audit,
-- marketing-report-run, send-review-request) and vendor-invitation-reminder
-- (left dead deliberately: first restored run would email 1,469 vendors).

SELECT cron.unschedule('update-exchange-rates-daily');
SELECT cron.unschedule('patch-branch-runner');
SELECT cron.unschedule('xtrf-gap-fill');
SELECT cron.unschedule('xtrf-branch-patch-new');
