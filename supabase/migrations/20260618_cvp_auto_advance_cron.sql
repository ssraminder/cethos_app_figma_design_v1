-- Phase A of "no human until final approval": schedule the cvp-auto-advance
-- sweep that moves translator applicants prescreen→assessment automatically
-- (hard-junk auto-reject + test/quiz choice invite for everyone else). The
-- edge function is idempotent and re-spam-guarded. Applied to prod via MCP.
SELECT cron.schedule('cvp-auto-advance', '*/10 * * * *', $$
  SELECT net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/cvp-auto-advance',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
