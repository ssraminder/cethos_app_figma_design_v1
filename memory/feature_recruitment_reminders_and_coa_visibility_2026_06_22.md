# Recruitment review-page upgrades (2026-06-22)

Three PRs shipped to main this session, all on the admin recruitment screens.
Driven by the IQVIA COA audit prep + the user's goal of approving life-sciences/COA
translators one-by-one.

## #1066 — Recruitment list discoverability (RecruitmentList.tsx)
- Added an **"All" tab** (first tab) showing every application regardless of status.
- Fixed Role column labels (clinician_reviewer, agency were falling through to
  "CD Interviewer"). Fixed Status dropdown on the All tab (was empty).
- Why: there was no way to find COA applicants in the portal. COA applicants in the
  recruitment queue are `cognitive_debriefing` role_type, NOT translators — separate
  qualification pipeline.

## #1067 — COA quiz panel + AI decision on the review page (RecruitmentDetail.tsx)
- New full-width **"COA Linguistic Validation — Quiz Results"** panel above the grid,
  visible for any applicant with a COA quiz. Shows MCQ score, AI recommendation badge
  (red/amber/green), competence breakdown, and Part-2 translations w/ MQM verdicts.
- `IsoReviewerGuide` gained a COA-quiz step that flags "Not recommended" / "Needs human
  review" as ⚠ check items — blocks blind approval of the COA domain.

## #1069 (was #1068) — Manual reminders + logs (RecruitmentDetail.tsx + 2 edge fns)
- **References = vendor-only reminder** (explicit user policy): "Remind applicant" button
  emails the APPLICANT, never the referees, with each pending referee's form link +
  the date it was sent, so the applicant chases their own referees. Per-referee Copy-link
  + visible `/reference-feedback/<token>` URL + sent-date inline. "Applicant last reminded"
  timestamp from `cvp_outbound_messages` (marker `refrem-chase:<appId>:<ts>`).
- **Tests/quizzes**: per-submission log (issued, first-viewed, views, reminders N/3,
  expiry, submitted) + "Send reminder" button.
- Edge fns:
  - `cvp-reference-reminders` extended with `application_id` (scope to 1 applicant),
    `force` (bypass 3/7/14-day cadence for a deliberate click), `only_type:'chase'`.
    **Unscoped cron behavior UNCHANGED** — user chose to KEEP the daily direct-to-referee
    auto-emails. The vendor-only rule applies to the manual button only.
  - `cvp-send-instrument-reminder` (NEW) re-emails the EXISTING test/quiz link (reuses V4
    template / inline quiz copy) and stamps the next `reminder_N_sent_at`. NO new token,
    NO new TM-Cethos job — avoids the double-provisioning risk of re-running cvp-send-tests.
    Refuses submitted/closed/expired instruments.
  - Both deployed to prod `--no-verify-jwt`. Backend verified live via dry-runs:
    scoped reminder {chase:1,referee:0,contacts:0} → applicant email; unscoped cron
    {referee:24,chase:18,contacts:4} unchanged; guard paths reject bad input.

## COA quiz audit gaps
1. ✅ RESOLVED (#1070, 2026-06-22) — Policy set by user: **COA competence bar = 90% MCQ;
   the Part-2 translation AI verdict is ADVISORY** (corroborate the overall score with
   references + §3.1.4 + CV at approval), never an auto-block. cvp-submit-quiz now
   auto-approves COA combos at ≥90% and routes <90% to staff_review (assessed) instead of
   auto-reject. Reviewer Guide + COA panel reflect the 90% bar + "AI (advisory)" label.
   The 3 flagged applicants (Jean Carlos 96%, Sylvie 100%, Alessia 94%) all clear 90% and
   were already advanced — fine to proceed.
2. **Missing combo rows**: some COA quiz passers have NO `coa_linguistic_validation` row in
   `cvp_test_combinations` (Jean Carlos, Ilaria, Alessandro, Alessia) — the cascade in
   `cvp-submit-quiz` had no COA rows to mark approved, so the approval is silently lost.
   Backfill + a fix in cvp-submit-quiz (write ai_score + instrument_kind on the cascade,
   upsert COA rows when is_coa) is still pending.
3. Broader audit gap: ~1,309 cascade-approved combos have `instrument_kind=null`, no
   `ai_score`, no `ai_assessment_result` — they render with no evidence of what test/score
   justified them. Separate PR.

## ⚠️ PENDING verification
- Chrome MCP was DOWN all session (4 attempts) — the live UI verification on
  portal.cethos.com (per-change loop step 5) was NOT done. Backend is verified; frontend
  (Netlify from main) needs a visual pass once Chrome MCP is back.

## Resume point
Original task: review life-sciences/COA **translator** applicants one-by-one starting with
**Cecilia Pinnola (APP-26-0633)** — references_received, 2 refs in, EN↔ES-AR/ES-419, declared
life_sciences + medical + coa_linguistic_validation. She has NO COA quiz on file yet (her 4
"passed" combos are certified_official skip_manual_review). 30 translator applicants are in
cvp_ready_for_approval with life-sciences combos (Yakov Katsman 95, Monica Manunta 92, etc.).
