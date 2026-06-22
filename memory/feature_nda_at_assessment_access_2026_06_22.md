# NDA gate moved from invitation-send → assessment-access (2026-06-22)

## Problem
Sending an assessment invitation returned `{ error: "nda_required" }` —
`cvp-send-instrument-choice-invitation` held the invite until the applicant had a
signed NDA (when env `APPLICANT_LOGIN_ENABLED=true`, which it is in prod). But the
assessment pages on join.cethos.com had NO NDA step, so the only way to get an NDA
signed was the vendor portal first. Paul Kremel (APP-26-0816) genuinely had 0 NDA
signatures, so the gate fired correctly — he just had no way to sign at access.

## Decision (user)
Send the invitation WITHOUT a pre-signed NDA; enforce the NDA at ACCESS instead
(clickwrap before any quiz/test content is shown). Mention the NDA in the email.
Signature method = **clickwrap** (type full legal name + "I agree"). Gate **both**
quiz and test paths.

## What shipped (2 repos, same Supabase project)
**Admin (cethos_app_figma_design_v1) — PR #1071:**
- `_shared/nda-gate.ts`: `hasCurrentNda(appId,email)` (checks vendor_nda_signatures
  by application_id OR vendor-by-email, agreement_type='nda', is_current),
  `getActiveNdaTemplate()`, `ndaGateEnabled()` (= APPLICANT_LOGIN_ENABLED==='true').
- `cvp-get-quiz` / `cvp-get-test`: if gate enabled & no current NDA → return soft-200
  `{ nda_required:true, nda, applicantName, applicantEmail }` BEFORE any content.
- `cvp-applicant-sign-nda` (NEW): token-based clickwrap. Resolves application from the
  quiz/test token, writes auditable vendor_nda_signatures row (signed_full_name,
  signed_email, signer_ip, signer_user_agent, signed_html_snapshot, nda_template_id,
  agreement_type='nda', is_current, verification_log{method:clickwrap}); supersedes
  prior current NDA; links vendor_id when an email match exists.
- `cvp-send-instrument-choice-invitation`: REMOVED the send-time nda_required hold —
  always sends. Chooser email now mentions the NDA step.
- `cvp-record-instrument-choice`: quiz + cog-debrief link emails mention the NDA.

**Vendor (cethosvendorportal, apps/recruitment = join.cethos.com) — PR #264:**
- New `<NdaGate>` clickwrap component (renders active NDA template, full-name + agree
  → POST cvp-applicant-sign-nda → re-load assessment).
- QuizSubmission + TestSubmission: load made re-callable; `nda_required` page-state
  renders `<NdaGate onSigned={reload}/>` before content.

## Ship ordering (matters)
Recruitment UI (#264) shipped + Netlify-live FIRST (commit 20bc11f, deploy ready
22:55), THEN edge functions deployed — because the gate is enforced by the already-
true `APPLICANT_LOGIN_ENABLED` flag and 13 apps had live tokens without an NDA; an
un-handled nda_required would have crashed the old quiz page.

## Active NDA template
`Vendor Confidentiality and Non-Solicitation Agreement` v3.0 (agreement_type='nda',
global, id bf61e3e6-aabd-499b-a9f3-5e33233cf986).

## Deploy gotcha
Supabase edge deploy rejects mixing `??` and `||` without parens ("Nullish coalescing
operator requires parens when mixing with logical operators"). First deploy of
cvp-applicant-sign-nda 400'd on the IP-extraction line; fixed by splitting into
`const xff = ...; const ip = a ?? (xff || null)`. All 5 functions now deployed
--no-verify-jwt.

## Verified (read-only, prod)
- cvp-get-quiz on a live un-NDA'd token → nda_required + v3.0 template + applicant name.
- sign-nda guards: bad token → "Invalid or expired assessment link"; short name → "Please
  type your full legal name to sign". Happy-path sign NOT run on a real applicant.

## One-time / audit-ready / reliable (2026-06-22, PR #1072 admin + #265 vendor)
User directive: "NDA signature should be a one time activity." Findings + fixes:
- Real applicants get a vendor row at APPLICATION time (cvp-approve-application line ~369,
  APPLICANT_LOGIN_ENABLED), so their access-time signature is vendor-linked immediately →
  QMS doc created (trigger) + vendor portal recognises it (get-nda-status keys on vendor_id)
  → already one-time. Only the test dummy had a vendor-less signature (aliased email).
- cvp-applicant-sign-nda: idempotency — if a current NDA exists (by application OR vendor),
  return the existing signature ({alreadySigned:true}); never insert a duplicate. Verified
  live (2 re-sign attempts → same signatureId, 1 current row, 0 dupes).
- cvp-approve-application: carry-over — backfill vendor_id onto any access-time applicant-only
  signature on approval (non-fatal). Trigger fires on UPDATE (events = INSERT UPDATE) → QMS
  doc. Covers the edge case where no vendor row existed at sign time.
- NdaGate UX: copy tells the applicant it's one-time (carries to assessments + vendor account).
- NOT done: signed-PDF for the applicant clickwrap (vendor sign-nda makes one; applicant flow
  stores HTML snapshot + e-sig metadata only — audit-defensible, PDF is a follow-up). Carry-over
  not live-tested (would need a real approval = irreversible onboarding; verified by logic +
  the confirmed UPDATE-trigger behaviour).

## Open / next
- Paul Kremel (APP-26-0816): the send is now unblocked — user can retry "send invitation"
  in the portal; he'll sign the NDA at access.
- NDA mention not yet added to the V3 test-link email (cvp-send-tests) or cvp-auto-advance
  link emails — gate still enforces regardless; copy is a follow-up.
- Live UI pass (Chrome MCP) still owed for this + the earlier reminder/COA work (Chrome MCP
  was down all session).
