# Cethos Linguist Competence & Qualification Model (ISO 17100 §6.1)

**Owner:** Recruitment / QMS · **Last revised:** 2026-06-23 · **For:** IQVIA EQA-Vendor audit (Jun 2026)
**Status:** living document — describes how Cethos establishes and records translator competence.

> Cethos is *working toward* ISO 17100 (Stage 2 target Dec 2026); it is not yet certified. This document states the model in use, including the data-integrity controls added 2026-06-23.

## 1. The two things we establish

ISO 17100 §6.1.2 requires, for every translator, **(i) a qualification basis** and **(ii) demonstrated competence**. Cethos records both, separately and with evidence.

### 1a. Qualification basis (§3.1.4 / §6.1.2 routes) — established in order
| Route | Evidence | How verified |
|-------|----------|--------------|
| **(a)** | Recognised **degree in translation** | Diploma on file, staff-verified (AI-screened then confirmed) |
| **(b)** | Degree in another field **+ ≥2 yrs** professional translation | Diploma + references / experience docs |
| **(c)** | **≥5 yrs** full-time professional translation | References confirming the span (see §4 — being strengthened) |

The basis is recorded on the application (`qualification_basis`, `qualification_basis_recorded_at/by`) by a competent staff member **before** approval.

### 1b. Demonstrated competence — by TESTING (the IQVIA-weighted evidence)
- **General translation test** — the core competence gate. AI-graded against a rubric; **≥70 = pass**. A pass is a real, reproducible record: a `test_submission_id` + an `ai_score`.
- **ISO competence quiz** — applicant-choice alternative (40 MCQ across the five §6.1.2 competences); deterministic grading.
- **COA Linguistic Validation quiz** — the **clinical** assessment: English methodology/research/technical MCQs (bar = 90%) **plus graded EN→target Part-2 translations** (MQM-scored). This is the only domain-specific clinical test in the system today.

## 2. Domain competence (§6.1.6) — what qualifies a domain
A domain (medical, pharmaceutical, life-sciences, legal, certified, immigration, financial, insurance, COA) is **high-risk**: a general pass does **not** cover it. A high-risk domain is qualified only by:
1. a **passed domain-specific test** in that domain (real `test_submission_id` + `ai_score`), **or**
2. a **passed COA quiz** (for the clinical domains), **or**
3. a **domain-specific certificate** verified by staff.

Declared-but-unevidenced high-risk domains are **not** qualified. At final approval the reviewer qualifies **only the evidenced domains**.

## 3. Data-integrity controls (added 2026-06-23)
A prior policy auto-cascaded `approved` onto every *declared* domain when the general test passed, and a backfill stamped more — producing combos marked "approved" with **no test behind them** (1,551 of 1,651). Corrected:
- **`status='approved'` now means a genuine graded pass only** (`test_submission_id` + `ai_score`). The cascade now writes **`declared_unverified`** (a declared specialization, not a tested pass). The 1,551 phantom rows were relabeled.
- **The approval function qualifies only evidenced domains** — graded+passed combos + COA-quiz clinical domains; never cascaded/declared-only. No real evidence → approval blocked.
- **The reviewer guide** credits a passed domain test or COA quiz; everything else is shown as untested.
- **The "Ready for Approval" queue** requires a real graded test or a passed quiz (≥70) **plus** a reference.
- **Confidentiality:** every applicant accepts an NDA (clickwrap) before the assessment opens; the signature is bound to the application record.

**Reproducibility:** every test/quiz stores the inputs, the AI rubric output, the score, and the timestamp; references store the referee's verbatim answers. Qualifications are an append-only audit log.

## 4. Known limitations / roadmap (being closed)
- **Domain-test coverage (Gap 6A):** today only *general* + *COA* are graded tests. Other high-risk domains (medical, pharma, legal…) have **no per-domain test** yet — they are qualified by COA quiz or verified cert, otherwise left declared-unverified. **Roadmap:** author domain-specific test items + per-domain send/grade so each high-risk domain can be earned by test.
- **Route (c) rigor (Gap 7):** the "≥5 yrs" is currently derived from the earliest referee-confirmed start year (elapsed time), which does not prove *full-time*. **Roadmap:** add a "full-time / approx. annual volume" question to the reference form and require the reviewer to confirm ≥5 full-time years before recording basis = route (c).
