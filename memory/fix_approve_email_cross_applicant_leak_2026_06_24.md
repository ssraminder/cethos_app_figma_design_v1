# Approval-email cross-applicant leak — guard + remediation (2026-06-24)

**Incident (P0, privacy/ISO).** Applicant Ninon (APP-26-0254) emailed that her "Welcome to CETHOS" approval email contained **another applicant's** internal review notes. Confirmed + measured blast radius via `cvp_application_decisions`: the V11 `staffMessage` (AI-rewritten welcome line) was a verbatim echo of the approval PROMPT for a DIFFERENT applicant, e.g. `ai_output = "Human: Applicant: Joonseo Cha\nApplication: APP-25-2918\n\nStaff notes (internal): batch 1 - approved by R. Shah ..."`.

**3 contaminated approvals found** (ai_output echoes a foreign applicant):
- APP-26-0393 Joséphine Iannuzzelli ← Magnolia Tyrwhitt-Drake (APP-26-0438)
- APP-26-0254 Ninon Dion ← Joonseo Cha (APP-25-2918)
- APP-26-0166 live-test agency ← Manon Tremblay (APP-25-1847) [test recipient, low concern]

**Mechanism.** `claudeRewrite` is stateless, so the wrong-applicant data came from the **batch-approval run** (R. Shah's "batch 1"/"batch 2 general roster" approvals) misaligning each applicant's note, AND the model echoing the raw prompt back. `cvp-approve-application` then injected that `staffMessage` straight into V11 with **no cross-applicant guard**.

**Fix shipped (admin PR — branch `fix/approve-email-leak-guard`).**
- New `sanitizeApplicantMessage(text, currentAppNumber)` in `_shared/decision-ai.ts`: returns `{clean, leaked, reason}`; drops the line (→ null) when it (a) starts with `Human:`/`Assistant:` (transcript echo), (b) contains `Staff notes (internal)`, (c) has the `Applicant: … Application:` prompt header, or (d) references any `APP-NN-NNNN` ≠ the current applicant's number. Own app number is allowed (no false positive).
- Wired into `cvp-approve-application` **send path** (drops leaked welcome line → V11 falls back to default copy, sets `aiError=welcome_line_dropped:<reason>`) AND **dryRun preview** (Preview shows exactly what would ship).
- Hardened `APPROVE_NOTE_SYSTEM_PROMPT`: treat notes as untrusted, never echo, never include "Applicant:/Application:/Staff notes", never an app number, never another person.
- Deployed `--no-verify-jwt`; health-checked (OPTIONS 200 / unauth POST 401). Guard verified by logic review against the known leak strings (the `Human:` echo + foreign `APP-` both caught).

**Remediation (separate step):** corrected welcome + brief apology to Joséphine (APP-26-0393) + Ninon (APP-26-0254) — affected recipients. (Approve is idempotent → re-running won't resend; send a fresh corrected message instead.) Draft + user-confirm before sending.

**Follow-ups:** extend `sanitizeApplicantMessage` to cvp-reject-application / cvp-waitlist-application (same claudeRewrite→applicant-email pattern); find & fix the batch-approval script that misaligned notes at source.

Context: surfaced while triaging "app issues reported by email" — the dominant email issue (apply-form Submit outage, apps 220→10/day on 2026-06-23) was the declaration-checkbox bug, already patched by vendor c8159bc (#270) and recovering; see [[fix_apply_declaration_silent_submit_2026_06_23]].
