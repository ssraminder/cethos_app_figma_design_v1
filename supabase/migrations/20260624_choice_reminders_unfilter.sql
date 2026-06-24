-- Phase 0 / Item 1 — un-filter instrument-choice reminders.
--
-- The cvp-choice-reminders cron (calls edge fn cvp-send-choice-reminders) was
-- domain-filtered to 4 clinical domains
-- (coa_linguistic_validation, life_sciences, pharmaceutical, medical), so
-- general translators stuck at status='prescreened' with no instrument choice
-- (~272 applicants) were NEVER nudged to pick a test/quiz.
--
-- Fix: drop the `domains` body param so ALL eligible applicants are reminded,
-- and raise the per-run limit (50 -> 100) to drain the backlog faster.
--
-- The function applies the domain filter ONLY when body.domains is a non-empty
-- array (cvp-send-choice-reminders/index.ts: omit => no restriction). Every
-- other guardrail is independent of this filter and remains in force:
--   * kill-switch  cvp_system_config.choice_reminders_enabled (fail-closed)
--   * deliverability guard: only EN->non-English dispatchable combos
--   * per-applicant cap: 6 reminders max
--   * throttle: >= 24h between reminders
--   * do-not-contact suppression
--
-- Look up by jobname (not a hard-coded jobid) for portability.

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'cvp-choice-reminders';
  if jid is null then
    raise notice 'cvp-choice-reminders cron job not found; nothing to alter';
  else
    perform cron.alter_job(
      job_id := jid,
      command := $job$ SELECT net.http_post(
        url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/cvp-send-choice-reminders',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{"limit":100}'::jsonb
      ); $job$
    );
  end if;
end $$;
