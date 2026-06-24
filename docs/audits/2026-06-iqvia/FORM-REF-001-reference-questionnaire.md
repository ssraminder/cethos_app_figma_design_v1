# Controlled Form — Linguist Reference Questionnaire

| | |
|---|---|
| **Document Title** | Linguist Reference Questionnaire (referee-facing) |
| **Form Number** | FORM-REF-001 |
| **Version** | 2.0 |
| **Effective Date** | 2026-06-23 |
| **Review Date** | Annually, or on any change to the live form |
| **Document Owner** | Vendor Management / Quality Manager |
| **Approved By** | Raminder Shah — Managing Director |
| **Scope** | All professional references collected during linguist (translator / reviser / COA) qualification |
| **Regulatory Reference** | ISO 17100:2015 §3.1.4 (documented competence evidence), §6.1; IQVIA Supplier Management |
| **Live implementation** | Form: `apps/recruitment/src/pages/ReferenceFeedback.tsx` + `components/references/{CompetenceMcqSection,EngagementDetailsSection}.tsx` + `data/referenceMcqs.ts` (vendor repo). Endpoint: `cvp-submit-reference-feedback`. Storage: `public.cvp_application_references`. **This document must be re-versioned whenever those change.** |

## 1. Purpose
Defines the exact, controlled wording of the questionnaire sent to a linguist applicant's professional references, and the data it captures, so reference-based §3.1.4 evidence is reproducible and auditable. References are documented third-party evidence of competence, experience, domain exposure, and professional standing.

## 2. How it is issued (process)
1. Staff request references on the applicant's recruitment profile → email **V18** invites the applicant to enter 2–3 referee contacts (`cvp-request-references`).
2. Applicant submits referee contacts (`cvp-submit-reference-contacts`) → each referee receives email **V19** with a private, tokenised link (`/reference-feedback/<token>`, expires 21 days).
3. Referee completes this questionnaire (or declines). Responses are private to Cethos vendor-management; **not** shared with the applicant. Ack email **V20** is sent on completion.
- Policy: **2 references requested, approvable on 1** credible reference (per MD).

## 3. Questionnaire content (verbatim)

> `{name}` = applicant's first name. All competence items use a consistent letter scale: **a** strong positive · **b** solid positive · **c** mixed/partial · **d** negative · **e** can't speak to this.

### 3.1 Working-period start (shown only when the applicant gave an approximate start year)
*"{name} said you started working together around {YYYY}. Does that match your recollection?"* — **Yes, roughly that year** / **Actually, it was more like… [year]** / **I can't recall the exact year.** (Accepted range 1980–current+1.)

### 3.2 Domain confirmation *(v2.0 — keyed off the applicant's CLAIMED approval domains)*
*"{name} is applying to translate in the domain(s) below. Tick the ones you can personally vouch for — where you saw their work."* — checkboxes are the applicant's claimed domains (`cvp_applications.domains_offered`, e.g. Medical, Life Sciences / Clinical Trials, **COA / Linguistic Validation**, Pharmaceutical, Legal, …) + free-text for "Other" + **"I can't recall the domains we worked on."** When the application declares no domains, falls back to a free pick.

### 3.3 Competence (ISO 17100 §6.1.2) — six MCQs (once, or per confirmed domain when ≥2 confirmed)
1. **Translation quality** — a Consistently publishable / b Reliable, minor edits / c Acceptable, needed reviewer pass / d Frequently needed substantial revision / e Can't speak to this.
2. **Linguistic/textual (reads native?)** — a Always / b Usually / c Mixed / d Often unnatural / e Can't speak.
3. **Research (unfamiliar terminology)** — a Resourceful / b Competent / c Sometimes guessed / d Frequent errors / e Can't speak.
4. **Cultural adaptation** — a Strong localiser / b Adapted when prompted / c Mostly literal / d Cultural misses / e Can't speak.
5. **Technical (CAT/files/workflow)** — a Proactive / b Competent / c Needed reminders / d Struggled / e Didn't use CAT tools.
6. **Domain subject-matter knowledge** — a Expert / b Solid / c Surface-level / d Out of depth / e Can't speak.

### 3.4 Would work again
*"Would you work with {name} again on a similar project?"* — **Yes / Probably / Probably not / No.** (Required.)

### 3.5 Engagement details *(v2.0 — new)*
- **How did you work with {name}?** client / employer-manager / project manager / reviser-editor / peer translator / other → **+ your job title / role** (optional).
- **Full-time or part-time translator?** Full-time / Part-time-occasional / Not sure.
- **Approx. annual volume** (optional) — <50k / 50k–150k / 150k–500k / >500k words/yr / Not sure.
- **Still working together?** Yes (ongoing) / No → **last year** (optional).
- **Independence** — *"Are you independent of {name}?"* **Yes — not a relative, no financial stake** / **No / not entirely** → optional note. *(Non-independent = credibility red flag.)*

### 3.6 Optional
- Overall recommendation **1–5** (optional). Free-text "Anything else?" (optional). **Decline** path with optional reason.

## 4. Data captured (`cvp_application_references`) + verification
- `competence_responses` (jsonb: 6 MCQs ×a–e, `would_work_again`, optional `by_domain`), `feedback_rating`, `feedback_text`.
- `reference_confirmed_start_year` + `year_verification` (matches ≤1yr / close 2–3 / disagrees ≥4 / cant_recall).
- `reference_confirmed_domains` (**claimed-domain codes since v2.0**) + `domain_verification` (matches / partial / disjoint / cant_recall, vs `domains_offered`).
- `referee_employment_type`, `referee_annual_volume`, `reference_confirmed_end_year`, `reference_relationship_ongoing`, `referee_independent` (+ note), `referee_relationship_type` (+ role title / other).
- AI analysis (`ai_analysis`, Opus): sentiment, strength 1–5, themes, **red_flags** (incl. year DISAGREES, domain DISJOINT, non-independent referee), summary. Append-only; advisory to the human reviewer.

## 5. Change history
| Version | Date | Change | By |
|---|---|---|---|
| 1.0 | 2026-05-19 | First structured questionnaire (un-versioned in production): start-year confirmation, 8-bucket domain confirmation, 6 competence MCQs, would-work-again, optional rating + free text, decline path. | Vendor Management |
| **2.0** | **2026-06-23** | Domain confirmation re-keyed off the applicant's **claimed approval domains** (23-code set incl. COA) instead of the 8 generic buckets; added engagement details (full-time/part-time, annual volume, period end/ongoing, **independence attestation**, referee role + relationship type). Backend `cvp-submit-reference-feedback` + migration `20260623_reference_form_engagement_fields`. Vendor PR #271 / admin PR #1102. | Claude + R. Shah |

## 6. Control note
The live form is the source of truth; this document mirrors it. Any change to the questions, options, or captured fields requires a new version row above **and** review of the dependent §3.1.4 / §6.1.6 approval logic (`cvp_application_iso_evidence`, `IsoReviewerGuide`, `cvp-approve-application`). Consider also uploading the current version to the in-app Documents library (`/admin/documents`, audience = staff).
