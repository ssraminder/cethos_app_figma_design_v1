-- Phase 0 / Item 3 — revive dead reference-request tokens.
--
-- ~38 translator applicants stuck at status='references_requested' had a
-- cvp_application_reference_requests row with request_token_expires_at in the
-- past (expired 2026-06-02..06-16) and no referee contacts submitted. The daily
-- cvp-reference-reminders cron's Case C (applicant-never-submitted-contacts)
-- only selects rows where request_token_expires_at > now(), so these were
-- un-remindable AND their /references/<request_token> links were dead.
--
-- Extend expiry +30d so the cron can chase them and the links work again. The
-- cron's per-request 3-reminder lifetime cap (tracked via refrem- message_id
-- markers) prevents any spam from the revival. Idempotent: only touches still-
-- expired, no-contacts, references_requested translator rows.

update cvp_application_reference_requests r
set request_token_expires_at = now() + interval '30 days'
from cvp_applications a
where r.application_id = a.id
  and a.status = 'references_requested'
  and a.role_type = 'translator'
  and r.status = 'sent'
  and r.contacts_submitted_at is null
  and r.request_token_expires_at < now();
