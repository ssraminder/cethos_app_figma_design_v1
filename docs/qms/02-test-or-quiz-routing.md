# QMS — Test-or-Quiz Routing for Translator Recruitment

**Status:** Design — Phase 0 (schema landed, content + wiring pending).
**Last updated:** 2026-05-15.
**Owner:** Raminder Shah.

This document describes how Cethos chooses between a **translation test** (applied skill assessment, AI-graded) and an **ISO competence quiz** (theoretical competence, deterministic MCQ-graded) when evaluating a candidate translator for a given (target_language × domain) combination.

It is intended to be read alongside [00-foundations.md](00-foundations.md) §4 (architectural canon) and [01-roadmap-ai-consultant.md](01-roadmap-ai-consultant.md).

---

## 1. Why two instruments

ISO 17100 §6.1.2 requires translators to demonstrate competence across five dimensions:

1. Translation competence
2. Linguistic and textual competence in source + target languages
3. Research, information acquisition, and processing
4. Cultural competence
5. Technical competence
6. Domain competence

The current recruitment flow tests #1 only — via a graded translation sample in `cvp_test_library`. The other five are inferred informally from CV / interview / references.

For ISO 17100 conformance, every translator we hire needs **documented evidence against each of the six competences**. A translation test alone covers #1; an MCQ quiz covers #2–#6 cheaply and reproducibly. Using both gives us a defensible evidence pack per hire without driving up the cost of recruitment.

A second motivation: when no translation test exists in the library for a (lang_pair × domain) combination, today the combination falls into `skip_manual_review` and the application stalls. There are 65 such combinations in prod as of 2026-05-15. A quiz is a viable substitute when no translation sample is available.

---

## 2. Routing rule

**The applicant chooses between two paths** *(decided 2026-05-15, revised from option (b) to "applicant choice").*

When the applicant clicks the V3 invitation link they land on a **Choose your assessment** page presenting two equivalent options:

1. **Translation test path** — One or more graded translation samples (one per pending `(lang_pair × domain)` combination where the library has a matching test). AI-graded by `cvp-assess-test` against the existing 75 / 60 thresholds. Demonstrates competence #1 (applied translation skill) directly; competences #2–#6 inferred from the produced text + §6.1.3 prerequisite check.
2. **Quiz path** — One combined ISO competence quiz per target_language, 40 questions covering the 5 §6.1.2 competences (8 each, MCQ, deterministic grading). Quiz pass thresholds: **≥80% pass, 70–79% staff review, <70% fail.** Demonstrates competences #1–#6 theoretically; competence #1 backed by §6.1.3 experience-or-degree prerequisite (recorded separately in `qms.professional_experience`).

The choice applies to **all of the applicant's pending combinations**. An applicant with three Spanish combinations + two French combinations who picks "quiz" takes one Spanish quiz and one French quiz — the choice is one-shot per recruitment, not per language. The applicant can switch their mind only by emailing recruitment; staff can re-issue the alternative path manually.

Fallback rules (when the applicant's chosen path isn't available):

| Applicant picks | Library has matching test? | Quiz pool covers target_language? | What runs |
|---|---|---|---|
| Test | ✅ | n/a | **Translation test** |
| Test | ❌ for some combos | n/a | Test for covered combos; staff sees "no test for these — issue quiz?" prompt for the rest |
| Quiz | n/a | ✅ | **Quiz** |
| Quiz | n/a | ❌ | Application sits in `staff_review` with prompt "no quiz pool for this target language — issue test or wait?" |
| (no choice yet, 240 h elapsed) | — | — | Expires — same path as the current V5 expiry flow |

The applicant's choice is recorded on `cvp_applications.instrument_choice` (`'test'` | `'quiz'` | `NULL`).

Staff can pre-select for an applicant from the admin recruitment-detail page — typically when a candidate's CV shows recent ISO-conformant work that should bypass the translation test, or when staff want to fast-track a high-confidence candidate via the quiz. The override skips the applicant's "Choose your assessment" page; the V3 email goes directly to the chosen path's link.

`cvp_test_combinations.instrument_kind` records which instrument actually ran for this combo: `'test'`, `'quiz'`, or `'skip'`. The compound `'test_and_quiz'` value is removed from the planned schema (no longer needed under the choice model).

---

## 3. Quiz coverage and language priority

Per the 2026-05-15 confidence assessment, we author quiz content in five Tier-A target languages first, then expand:

**Pilot batch (Option A):** Spanish (Spain), French, German, Italian, Portuguese (Brazil).

**Next batch (deferred to Phase 2):** Russian, Polish, Turkish, Mandarin (Simplified), Japanese.

**High-demand but lower confidence (Phase 3, needs native-speaker review):** Persian (Farsi), Dari, Pashto, Somali, Khmer.

For each language in the pilot, we author **24 new questions** at the cross-domain baseline (`domain IS NULL`):

- `linguistic_textual_competence` — 8 questions on grammar, register, idiomaticity in the target language
- `cultural_competence` — 8 questions on locale-specific conventions, addressing forms, dates/numbers, formal-vs-informal
- `domain_competence` — 8 questions on target-language general terminology and source-text comprehension

The remaining 16 questions in the 40-question quiz come from the existing cross-language baseline (`target_language_id IS NULL`):

- `research_competence` — 8 questions (existing); CAT tools, source-document research, terminology databases — language-agnostic
- `technical_competence` — 8 questions (existing); file formats, encoding, project management — language-agnostic

Total new authoring for the pilot: 24 questions × 5 languages = **120 new rows**. Plus the 16 reused cross-language rows = 40 questions per applicant quiz.

Per-domain quiz variants (legal-Spanish, medical-French, etc.) are a Phase 2 expansion when the pilot proves the routing.

---

## 4. Schema additions

### 4.1 `iso_competence_quizzes.target_language_id` *(landed 2026-05-15)*

```sql
ALTER TABLE iso_competence_quizzes
  ADD COLUMN target_language_id uuid REFERENCES languages(id) ON DELETE RESTRICT;
```

NULL = cross-language baseline. Non-NULL = authored for a specific target language.

Migration file: `supabase/migrations/20260515_iso_quiz_target_language.sql`.

### 4.2 `cvp_applications.instrument_choice` *(planned)*

```sql
ALTER TABLE cvp_applications
  ADD COLUMN instrument_choice text NULL
    CHECK (instrument_choice IN ('test','quiz'));
ALTER TABLE cvp_applications
  ADD COLUMN instrument_choice_at timestamptz NULL,
  ADD COLUMN instrument_choice_by uuid NULL REFERENCES staff_users(id);
```

Holds the applicant's (or staff override's) choice between the translation-test path and the quiz path. NULL until the applicant lands on the "Choose your assessment" page and clicks one of the two options — or staff pre-selects from the admin UI. The `_by` column is NULL when the applicant chose for themselves and set to the staff user id when staff pre-selected.

### 4.3 `cvp_test_combinations.instrument_kind` *(planned)*

```sql
ALTER TABLE cvp_test_combinations
  ADD COLUMN instrument_kind text NULL
    CHECK (instrument_kind IN ('test','quiz','skip'));
```

Recorded at the moment the actual instrument is dispatched (V3 sent or quiz token issued). NULL while the combo is still `pending` and the applicant hasn't chosen. After choice + dispatch, populated and immutable.

### 4.3 `cvp_quiz_submissions` *(planned, separate table)*

We do not extend `cvp_test_submissions` to dual-purpose. Quiz submissions are MCQ-shaped, not free-text, and grading is deterministic — they deserve their own table to keep schema and audit clean.

```sql
CREATE TABLE cvp_quiz_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES cvp_applications(id) ON DELETE CASCADE,
  combination_id uuid NOT NULL REFERENCES cvp_test_combinations(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  token_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','viewed','submitted','expired','archived')),
  -- Per-question: { question_id, selected_option }
  responses jsonb,
  score_pct numeric(5,2), -- 0-100, NULL until submitted
  correct_count int,
  total_count int,
  submitted_at timestamptz,
  ai_assessed_at timestamptz, -- present for parity with cvp_test_submissions, but grading is deterministic so this is just the submit timestamp echo
  reminder_1_sent_at timestamptz,
  reminder_2_sent_at timestamptz,
  reminder_3_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Status lifecycle mirrors `cvp_test_submissions` so the existing `cvp-check-test-followups` reminder cron can be extended to cover quizzes with minimal change.

---

## 5. Edge function plan

| Function | Responsibility | Pattern |
|---|---|---|
| `cvp-send-tests` *(existing, modify)* | When pre-screen passes, instead of dispatching tests directly: insert a single `cvp_instrument_choice_invitations` row with a token, send a V3-shaped "Choose your assessment" invitation. Only AFTER the applicant chooses (or staff pre-selects on `cvp_applications.instrument_choice`) does this function dispatch the actual test or quiz rows. | Two-phase: invite-to-choose, then dispatch-on-choice. |
| `cvp-record-instrument-choice` *(new)* | Vendor-facing: applicant POSTs `{ token, choice: 'test' \| 'quiz' }`. Function validates token, records on `cvp_applications.instrument_choice`, then triggers the appropriate dispatch (translation tests via existing path, or quiz token issuance). | Idempotent — re-submitting the same choice is a no-op; switching choice is blocked once instrument_kind has been set on any combination (i.e. once tests/quiz have been sent). |
| `cvp-get-quiz` *(new)* | Vendor-facing: given a quiz token, return the questions (without `correct_option` or `explanation`) plus rendering metadata. | Mirror `cvp-get-test`'s contract |
| `cvp-submit-quiz` *(new)* | Vendor-facing: accept responses, score deterministically against `correct_option`, persist score breakdown, send applicant confirmation, notify staff. | Pass thresholds ≥80 / 70–79 / <70 per §2. |
| `cvp-check-test-followups` *(existing, extend)* | Cover three lifecycles: pending-choice (applicant got the invitation but hasn't picked), pending-test-submission, pending-quiz-submission. Same reminder cadence for all three. | One follow-up function for both instruments; reduce drift. |
| `cvp-preview-quiz` *(landed 2026-05-15)* | Staff smoke-test helper. Renders a 40-question quiz exactly as `cvp-get-quiz` will serve it, with answer key + explanations appended for staff review. **Staff-only — must add staff-auth check before P1 ships.** | See [supabase/functions/cvp-preview-quiz/index.ts](../../supabase/functions/cvp-preview-quiz/index.ts). |

Public routes follow the existing pattern: `https://join.cethos.com/choose/{token}` for the choose-your-assessment landing page; `https://join.cethos.com/test/{token}` and `https://join.cethos.com/quiz/{token}` for the actual instrument pages after the choice is recorded.

---

## 6. Admin UI changes

- **Recruitment detail page** ([client/pages/admin/RecruitmentDetail.tsx](../../client/pages/admin/RecruitmentDetail.tsx)) — show `instrument_choice` at the application level (with chooser/timestamp if recorded). Before the applicant chooses, expose a "Pre-select for applicant" dropdown so staff can fast-track a candidate to a specific path. After choice is recorded, show which path ran and (when applicable) a "Switch path" button that resets `instrument_choice` and re-issues the invitation — used when staff want to give a borderline candidate the alternative instrument.
- **"Tests to Review" tab** — extend the PR2 filter to surface both AI-graded test combos AND deterministically-graded quiz submissions. Quizzes don't need human review for scoring per se, but staff sign-off is still required for ISO evidence purposes (§7).
- **Quiz preview** — a "Preview quiz" button next to "Preview tests", calling `cvp-preview-quiz` to email the staff reviewer the rendered quiz before approving it for applicant use.
- **Choose-your-assessment landing page** ([client/pages/recruitment/ChooseAssessment.tsx](../../client/pages/recruitment/ChooseAssessment.tsx) — *planned*) — applicant-facing page hosted under `/choose/{token}`. Two equally-weighted cards: "Translation test" (estimated 60–120 min depending on combinations) vs "ISO competence quiz" (estimated 20–30 min). Each card lists what it measures, ISO §6.1.2 mapping, and any prerequisites the applicant should be aware of. One click → recorded → redirected to the actual instrument.

---

## 7. ISO evidence audit trail

A quiz submission becomes an entry in `qms.competence_evidence` once it's scored, similar to how a passed translation test does today. The evidence type is `quiz_score` and the payload includes:
- `quiz_token`
- `competence_slug`
- `target_language_id`
- `score_pct`
- `correct_count / total_count`
- `submitted_at`
- `prompt_version` (which question pool revision was used)

This satisfies ISO 17100 §6.1.2 evidence-of-competence requirements and is reproducible for any future audit — every submission can be re-graded deterministically from the stored responses.

---

## 8. Resolved decisions (2026-05-15)

1. **Applicant choice** *(revised same day from "both by default")* — The applicant chooses between the translation-test path and the quiz path on a landing page reached from the V3 invitation. Choice applies to all their pending combinations. Staff can pre-select to skip the choose page. ISO evidence defensibility: quiz path passes documents §6.1.2 competences #1–#6 via MCQ, with §6.1.3 (experience-or-degree) checked separately at staff sign-off; test path documents #1 directly and #2–#6 implicitly from the produced text.
2. **Pass threshold for quizzes:** ≥80% auto-approve, 70–79% staff review, <70% fail. Re-calibrate after the first 50 quiz submissions if the borderline band is empty or overfull.
3. **Re-take policy:** Same as translation tests today — one-shot. Staff can issue a re-quiz after manual review if the failure looks like a question-quality issue rather than a competence gap; this is tracked as a separate `cvp_quiz_submissions` row.
4. **Switching paths after choice:** The applicant cannot self-switch — once the choose page is committed, the alternative path requires staff intervention (e.g. via a "Switch path" button on the admin recruitment detail page that resets `instrument_choice` to NULL and re-issues the invitation). This prevents an applicant from sampling both instruments and presenting whichever scores better.

---

## 9. Phasing

| Phase | Scope | Status |
|---|---|---|
| **P0** | Schema (target_language_id on quizzes); design doc | **Landed 2026-05-15** |
| **P1** | Content authoring — 120 new questions for 5 Tier-A languages (24 each, see §3); `cvp_applications.instrument_choice`; `cvp_test_combinations.instrument_kind`; `cvp_quiz_submissions` table; `cvp-record-instrument-choice` + `cvp-get-quiz` + `cvp-submit-quiz` edge functions; choose-your-assessment landing page; V3 email points to `/choose/{token}` | Spanish seed in P1a (PR #622) |
| **P2** | Domain-specific quiz variants, second language batch (Russian / Polish / Turkish / Mandarin / Japanese), per-question difficulty calibration | After P1 proves out |
| **P3** | Persian / Dari / Pashto / Somali / Khmer — needs native-speaker review of every question | After P2 |
| **P4** | Re-qualification quizzes (annual / triggered) — same content, different `qms.competence_evidence` entry semantic | After P3, tied to ISO 17100 §6.1.5 retention |

---

## 10. Cross-references

- ISO 17100:2015 §6.1.2 — Professional competences of translators.
- ISO 17100:2015 §6.1.3 — Translator qualifications (experience-vs-degree paths; recorded separately in `qms.professional_experience`).
- Memory: `project_qms_phase1.md` (Phase 1 schema status), `project_test_submission_fixes_2026_05_15.md` (related fixes to the test pipeline this routing builds on).
