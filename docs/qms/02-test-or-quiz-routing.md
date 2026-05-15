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

For each pending `cvp_test_combinations` row, the system picks one of three states:

| Instrument | When chosen | Grader |
|---|---|---|
| **Translation test** (default) | Library has an active test at `(source_lang, target_lang, domain, service_type?)` matching the combo | AI-graded by `cvp-assess-test` |
| **ISO competence quiz** | Library has no matching test, OR staff explicitly chose "quiz this one" | Deterministic — count `selected_option == correct_option` |
| **Skip / manual review** | Neither instrument available (e.g. quiz pool not yet authored for the target language) | Staff manually grants or refuses competence |

The routing is computed **once per combination** at send time and recorded on `cvp_test_combinations` (a new column `instrument_kind` — see §4) so the applicant's experience and the admin queue both know what to render.

Staff can override the auto-routing from the admin recruitment-detail page (a "Use quiz instead" / "Use test instead" toggle per combination).

---

## 3. Quiz coverage and language priority

Per the 2026-05-15 confidence assessment, we author quiz content in five Tier-A target languages first, then expand:

**Pilot batch (Option A):** Spanish (Spain), French, German, Italian, Portuguese (Brazil).

**Next batch (deferred to Phase 2):** Russian, Polish, Turkish, Mandarin (Simplified), Japanese.

**High-demand but lower confidence (Phase 3, needs native-speaker review):** Persian (Farsi), Dari, Pashto, Somali, Khmer.

For each language in the pilot, we author **40 questions** (5 competences × 8 questions). The existing 40 cross-language questions remain as a `target_language_id IS NULL` baseline — they're used for `research_competence` and `technical_competence` where the target language doesn't materially change the answer.

Per-language content focuses on:
- `linguistic_textual_competence` — grammar, register, idiomaticity in the target language
- `cultural_competence` — locale-specific conventions, addressing forms, dates/numbers, formal-vs-informal
- `domain_competence` — target-language terminology baseline (general; per-domain variants are Phase 2)

`research_competence` and `technical_competence` continue to use the cross-language pool unless a Phase 2 author adds a language-specific row.

---

## 4. Schema additions

### 4.1 `iso_competence_quizzes.target_language_id` *(landed 2026-05-15)*

```sql
ALTER TABLE iso_competence_quizzes
  ADD COLUMN target_language_id uuid REFERENCES languages(id) ON DELETE RESTRICT;
```

NULL = cross-language baseline. Non-NULL = authored for a specific target language.

Migration file: `supabase/migrations/20260515_iso_quiz_target_language.sql`.

### 4.2 `cvp_test_combinations.instrument_kind` *(planned)*

```sql
ALTER TABLE cvp_test_combinations
  ADD COLUMN instrument_kind text NOT NULL DEFAULT 'test'
    CHECK (instrument_kind IN ('test','quiz','skip'));
```

Recorded at send time; never NULL once a combo leaves `pending`.

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
| `cvp-send-tests` *(existing, modify)* | Decide test-vs-quiz per pending combination, insert into `cvp_test_submissions` or `cvp_quiz_submissions`, send V3 email with appropriate links | Add a "library has matching test?" check before falling through to quiz; insert quiz row if no test found and quiz pool has coverage for the target_language |
| `cvp-get-quiz` *(new)* | Vendor-facing: given a quiz token, return the questions (without `correct_option`) plus the metadata for the rendering UI | Mirror `cvp-get-test`'s contract |
| `cvp-submit-quiz` *(new)* | Vendor-facing: accept responses, score deterministically, send applicant confirmation, notify staff | Mirror `cvp-submit-test`. Pass/fail threshold per the recruitment scoring rubric (proposed: ≥70% pass, 60–69% staff review, <60% fail) |
| `cvp-check-test-followups` *(existing, extend)* | Add a second loop covering `cvp_quiz_submissions` with the same reminder cadence | One follow-up function for both instruments; reduce drift |

Public routes follow the existing pattern: `https://join.cethos.com/quiz/{token}` served by the recruitment app, calling `cvp-get-quiz` / `cvp-submit-quiz`.

---

## 6. Admin UI changes

- **Recruitment detail page** ([client/pages/admin/RecruitmentDetail.tsx](../../client/pages/admin/RecruitmentDetail.tsx)) — for each combination, show the chosen instrument; if the auto-route picked one, expose a "Use the other instead" toggle next to it.
- **"Tests to Review" tab** — extend the existing PR2 filter to surface AI-graded test combos AND quiz combos that passed deterministically. Quizzes don't need human review for grading per se, but a staff sign-off is still required for ISO evidence purposes; see §7.
- **Quiz preview** — a "Preview quiz" button alongside "Preview tests" so staff can read the actual questions before sending.

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

## 8. Open questions (resolve before Phase 1 launch)

1. **Pass threshold.** Translation test today uses 75 / 60 thresholds (auto-approve / staff-review / auto-reject). Quizzes should likely use a stricter pass bar (e.g. 80%) since MCQ is easier than free-form translation. Staff's call.
2. **Required vs supplementary.** Does a quiz alone qualify a translator for ISO 17100 §6.1.2 evidence purposes, or must they pass both quiz AND translation test? Initial guidance: **quiz substitutes only when no translation test exists**; passing the quiz documents linguistic / cultural / domain competence but the §6.1.3 "two-year experience OR translation degree OR five-year non-degree" prerequisite is still checked separately at staff sign-off.
3. **Re-take policy.** Translation tests today are one-shot (status check on submit). Quizzes inherit the same. Open question whether a failed quiz can be re-issued after staff review.

---

## 9. Phasing

| Phase | Scope | Status |
|---|---|---|
| **P0** | Schema (target_language_id on quizzes); design doc | **Landed 2026-05-15** |
| **P1** | Content authoring — 200 questions for 5 Tier-A languages, `cvp_quiz_submissions` table, `cvp-get-quiz` + `cvp-submit-quiz` edge functions, V3 email handles quiz links | Next |
| **P2** | Domain-specific quiz variants, second language batch (Russian / Polish / Turkish / Mandarin / Japanese), per-question difficulty calibration | After P1 proves out |
| **P3** | Persian / Dari / Pashto / Somali / Khmer — needs native-speaker review of every question | After P2 |
| **P4** | Re-qualification quizzes (annual / triggered) — same content, different `qms.competence_evidence` entry semantic | After P3, tied to ISO 17100 §6.1.5 retention |

---

## 10. Cross-references

- ISO 17100:2015 §6.1.2 — Professional competences of translators.
- ISO 17100:2015 §6.1.3 — Translator qualifications (experience-vs-degree paths; recorded separately in `qms.professional_experience`).
- Memory: `project_qms_phase1.md` (Phase 1 schema status), `project_test_submission_fixes_2026_05_15.md` (related fixes to the test pipeline this routing builds on).
