# SOP-VM-001 — Linguist Qualification Pipeline (Vendor-Manager Operational Runbook)

| | |
|---|---|
| **Document ID** | SOP-VM-001 |
| **Title** | How a vendor manager runs the linguist qualification pipeline (screen → verify → approve / request / test → audit) |
| **Owner** | Vendor Management |
| **Applies to** | Any staff member qualifying linguists in the admin portal (`portal.cethos.com`) |
| **Status** | Active · v1.0 (2026-06-24) |
| **Governing policy** | SOP-001 (Qualifying translators & revisers), SOP-002 (Keeping qualifications up to date), SOP-003 (Approval authority & quality oversight), SOP-006 (COA linguistic validation qualification) |
| **Standard** | ISO 17100:2015 §3.1.4 (translator competence), §6.1 (qualification records & evidence) |

---

## 1. Purpose & principle

SOP-001/003/006 say **what** qualification requires. This runbook says **how** to actually do it, applicant by applicant, in the portal — including the AI-assisted batch workflow, the exact tables/functions, and the traps that have bitten us.

**The one principle that governs everything:** *qualify only what you have auditable evidence for.* Every approved domain and language pair must trace to a specific, recorded piece of evidence. When in doubt, **request** — don't approve. Qualification is **irreversible** (the QMS audit log is append-only — see §12), so accuracy beats volume.

---

## 2. The systems you touch

| System | Role |
|---|---|
| **Approval queue** (`/admin/recruitment/approval-queue`, view `cvp_approval_queue`) | Worklist of applicants. Bucket `ready` = has profile/NDA; `need_info`; `other`. **Note:** an applicant stays in `ready` until they become an active vendor — sending a test/info-request does **not** remove them (see §11). |
| **QMS qualification** (`qms.role_qualifications`, `qms.competence_evidence`, `qms.nda_agreements`) | The ISO record. This is what the auditor reads and what makes a vendor *qualified*. |
| **Operational scope** (`cvp_translator_domains`) | Which domains an applicant-route vendor is approved for. Written by the approval function. |
| **Assignability** (`vendor_language_pairs` + `qms_check_assignment` RPC) | What Find-Vendor actually gates on. **NOT `cvp_translator_domains`** — see §11 / §12. |
| **Edge functions** | `cvp-approve-application` (approve), `cvp-request-info` (ask for docs/targets), `cvp-send-targeted-test` (send a domain/general test or COA quiz), `qms-evidence-download` (open a degree file), `cvp-get-cv-url` (open a CV). |

Always invoke edge functions **from the authenticated admin session** (`supabase.functions.invoke`) so the approver is recorded from the JWT. Never hand-roll `fetch` (drops auth). Run as an **active** staff account (an inactive staff row → 403 `staff_inactive`).

---

## 3. The qualification gate (what makes someone `qualified` + assignable)

A vendor reaches `role_qualifications.status = 'qualified'` only when **all** of these hold (`qms_promote_provisional_if_verified`):

1. **≥1 verified competence evidence** (`competence_evidence.verified = true`) — a human-verified degree, a passed internal test (AI score ≥ 75), or a passed COA quiz.
2. **A §3.1.4 competence basis** (`competence_basis_id` not null) — route a / b / c (see §4).
3. **An active NDA** (`qms.nda_agreements`, status active).
4. **`recruitment_approved = true`** (set by the approval).

Miss any one → stays `under_review` (not usable). A **quiz/test pass alone, with no §3.1.4 basis, does NOT qualify** — it sets domain competence but `competence_basis_id` stays null.

**Assignable** is a *separate* check: an active `vendor_language_pairs` row matching the request **and** `qms_check_assignment` returning eligible. The approval flow creates the language pairs; QMS-qualified status makes the gate pass.

---

## 4. Evidence rules — the §3.1.4 routes and what counts

| Route | Basis (`qualificationBasis`) | What it needs | Refs needed? |
|---|---|---|---|
| **a** | `degree_translation` | A **conferred** university **degree/diploma in translation or linguistics** | No (degree is the competence) |
| **b** | `degree_other_plus_2y` | A degree in **another field** **+** ≥2 yrs documented translation experience **+** demonstrated competence (a passed test) | Experience via references and/or a test |
| **c** | `experience_5y` | ≥5 yrs documented professional translation experience (no degree) | Yes — references confirming the years |

**What is NOT a route-a degree** (request a real one instead — these are the recurring false positives):
- A **transcript** or "analytical record" (≠ the conferred diploma).
- An **"en trámite" / provisional** certificate is acceptable **only if** it confirms the degree was *completed/conferred* (diploma pending). A transcript showing only "Years 1–3" is **not** — that's incomplete study.
- A **short course / specialized certificate** (e.g. a 60–190-hour program, UCSD/NYU "continuing studies certificate", a translators'-association "constancia"). *(A Brazilian 360-hr lato-sensu postgraduate **specialization in Translation** is accepted as route a — it's a recognised postgraduate qualification.)*
- A **degree in another field** (e.g. "Applied Foreign Languages/LEA", Engineering, "Applied Culture Studies") → that's **route b**, needs experience/a test, not route a.
- An **MT post-editing certificate** (e.g. RWS) — not a formal translation qualification.
- An **interpreting** qualification — interpreting ≠ translation; route via a test/references.
- A **language-proficiency certificate** (Georgetown, etc.) — proficiency ≠ translation competence.

**References:** **one** confirming, independent reference is sufficient evidence *if* it corroborates the claim (years, relationship, would-rehire). Prefer year-verified, independent referees. A self-declared CV is **corroboration, never an evidence route**.

**Native language:** confirm from the CV ("mother tongue / native") where stated; otherwise infer from country + an EN→native translation degree + the declared target, and word the note accordingly (don't claim an explicit CV statement that isn't there).

---

## 5. Per-applicant procedure (the core loop)

For each applicant in `ready` (work in batches of ~15 — see §10):

1. **Pull the dossier** — degree screening note (`competence_evidence.verification_notes`), declared target language(s), NDA status, any references, any test/quiz results.
2. **Open the CV** (`cvp-get-cv-url`) — confirm **native language** and that the person matches the application.
3. **Open the degree** (`qms-evidence-download`) when the screening note is ambiguous, borderline, or a non-translation field. Read it; if it won't open (corrupt/invalid file) **request a legible re-upload** — never record a verification you couldn't actually review.
4. **Decide the route** (§4) and the **evidenced domains only** (§6).
5. **Act:**
   - **Approve** if there's a §3.1.4 basis + native + NDA → §7.
   - **Request** if the basis is weak/missing or the target is undeclared → §8.
   - **Hold** structural non-fits (e.g. an *into-English* applicant: target = English only doesn't fit the EN→native roster) with a staff note, and send a clarifying request so they leave your active worklist.
6. **Record** the decision in `staffNotes` separating **auditable evidence** (degree / references / passed test) from **CV corroboration**. For a route-a degree you reviewed, record your verification on the evidence row (`verified=true`, `verified_by`, dated note).

---

## 6. Domain scoping — evidenced only, no over-scope (ISO §6.1.6)

- Approve **general** from the §3.1.4 basis (degree/experience).
- Approve a **declared clinical/specialised domain only if separately evidenced** — a passed domain test, the COA quiz for COA, or documented domain experience.
- **COA Linguistic Validation** is granted **only** on a COA quiz `assessment_recommendation = "Recommend approve"` (§9). The clinical cluster (`medical` / `life_sciences` / `pharmaceutical`) may accompany a confirmed COA pass where declared; do **not** grant it on a "needs review" or failed COA.
- **Never** carry unevidenced domains (legal, financial, technical, automotive, government, academic, etc.). Applicants who "select all" get de-scoped to what's evidenced. Pass a **curated `combinationIds`** (only the evidenced general + COA combos) to the approval — never the skip-to-approve-all path, which over-scopes.

---

## 7. Approving (the mechanism)

Invoke `cvp-approve-application` from the authenticated session with the **combined payload**:

```js
sb.functions.invoke('cvp-approve-application', { body: {
  applicationId,
  skipTesting: true,
  qualificationBasis: 'degree_translation' | 'degree_other_plus_2y' | 'experience_5y',
  combinationIds: [ <general EN→native combo>, <COA combo if COA-evidenced> ],
  combinationRationales: { '<comboId>': 'why this domain is evidenced' },
  staffNotes: '[<batch tag> - Approved by Raminder Shah] basis + evidence + scope + CV=corroboration'
}})
```

- `requalified: 1` in the response = promoted to `qualified`. If it's absent/0, **verify in SQL** (don't assume) — a pre-existing under-review vendor may need its basis linked manually (§12).
- To **add COA to an existing vendor**: insert a `cvp_test_combinations` COA row (`domain='coa_linguistic_validation'`, `status='pending'`) for them, then include that combo id in `combinationIds`.
- Neither portal button alone is correct: domain-pick records no basis (stays `under_review`); skip-to-approve over-scopes. The **combined invoke** is the only ISO-clean path.

---

## 8. Requesting info & sending tests

- **Missing/weak degree or undeclared target** → `cvp-request-info` (`{ applicationId, staffNotes, deadlineDays: 30 }`). Lead with the portal-upload CTA; degrees come in via portal upload, not email attachments.
- **Route-b / references-only applicants** (no qualifying degree) → **send a general test** so they can demonstrate competence: `cvp-send-targeted-test` (`domain:'general'`, `difficulty:'standard'`, EN source → their native target). A pass (AI score ≥ 75) becomes verified evidence → then approvable.
- **COA candidates** → send the COA quiz: `cvp-send-targeted-test` (`domain:'coa_linguistic_validation'`, `difficulty:'advanced'`).
- **Throughput note:** `cvp-send-targeted-test` (general) is slow (~12 s — it AI-generates the test). Sending sequentially times out the browser at ~3; **fire them in parallel** (`Promise.allSettled`, sub-batches of ~18) — all settle under the timeout with no rate-limit. A browser timeout does **not** mean failure — the server completes; verify via combo status and re-send only stragglers.

---

## 9. COA (clinical) — the rule that matters most

- The COA quiz is the **only** real clinical-translation signal. Readiness = **`assessment_recommendation`**, **not** `score_pct` (the MCQ %). A 100% MCQ with failed Part-2 translations is **"Not recommended."**
- `"Recommend approve — passed"` → COA-grantable (with a §3.1.4 basis).
- `"Needs human review — translation(s) flagged"` → **do not present as COA-clean.** Either obtain an accredited linguist's sign-off on the flagged translations, **or withhold the COA + clinical scope** (keep them general-qualified) until reviewed. For an imminent audit, withhold — a documented, reversible de-scope beats an unresolved nonconformity.
- `"Not recommended"` → no COA domain (they may still be general-qualified).
- A COA pass with **no degree/experience basis** does **not** qualify — request a basis (it's the §3.1.4 gate, §3).

---

## 10. Batch operating rhythm

1. Pull a tranche (~15) from `ready` filtered to the route you're working (e.g. has NDA + translation degree + no prior test + not already `info_requested`/`approved`).
2. Open CVs in one batched call; read degree notes; verify degrees in one SQL.
3. Approve in sub-batches of ~5 (the approve function is ~6 s each; >8 sequential times out the browser).
4. Send COA quizzes / requests for the rest.
5. **After every ~5 batches, run the audit (§11).** If it passes, continue; if it finds a failure, stop and fix before continuing.
6. Process **incoming responses** (a "results sweep") as they arrive: grade returned tests/quizzes, approve those who now have evidence, qualify reference-backed route-c applicants.

---

## 11. The audit (run after every 5 batches, and before any external review)

**SQL gate-sweep** over everyone qualified — every one must pass all six:

```sql
-- per qualified vendor: active · qualified · competence_basis_id not null
-- · ≥1 verified competence_evidence · active NDA · 0 over-scoped domains
-- · assignable: active vendor_language_pairs row
```

Then **Chrome MCP** on the live portal: open a representative few vendor profiles (QMS / Domains / Agreements tabs) and confirm the UI shows `Qualified` + evidenced domains + active NDA — i.e. the auditor sees what the database holds.

**Reading the queue correctly:** the `ready` count does **not** fall when you send tests/requests — `info_requested` and `test_sent` applicants stay in `ready` (it's evidence-based, not status-based); they leave only on becoming an active vendor. To judge real progress, break `ready` down by status (fresh vs info_requested vs test_sent) and account for new inflow. Approval reduction is correct when **0 approved / 0 active vendors remain in `ready`**.

---

## 12. Pitfalls & gotchas (all learned the hard way)

- **Uppercase email → approval 500s.** `cvp-approve-application`'s vendor lookup is case-sensitive vs lowercase-normalized storage. Fix per record: `UPDATE cvp_applications SET email = lower(email)` then re-approve.
- **Stale recruitment status.** Sending a COA quiz *after* approval flips the application status to `test_sent`. Harmless (the vendor + qualification are the source of truth; the approval queue excludes active vendors), but don't audit by `cvp_applications.status` — audit by the qualification record.
- **Pre-existing vendor stuck `under_review`.** The bridge doesn't set a basis on a *pre-existing* qualification. Fix: `UPDATE qms.role_qualifications SET competence_basis_id = <catalog id from qms.competence_bases>` (route a `t_a_degree_translation`, b `t_b_degree_other_plus_2y`, c `t_c_5y_experience`) then `SELECT public.qms_promote_provisional_if_verified(vendor_id, <actor auth id>)`.
- **Over-scope on legacy vendors.** "Select-all" applicants can have many unevidenced approved domains. De-scope: set the unevidenced `cvp_translator_domains` rows to `status='rejected'` with a dated note; keep only the evidenced ones.
- **`cvp_translator_domains` ≠ assignability.** Find-Vendor (`find-matching-vendors`) gates on **`vendor_language_pairs`** + `qms_check_assignment`, *not* `cvp_translator_domains`. A vendor with no domain rows but active language pairs + a QMS qualification **is** assignable. Don't create app-less translator records to "fix assignability" — wrong table.
- **First-party / non-recruitment vendors** carry pairs in `vendors.language_pairs` (JSON, sometimes nonstandard codes); they have `vendor_language_pairs` + a QMS qualification, so they're assignable even with no recruitment record. Some lack `vendor_rates` → set rates so they surface in rate-bounded searches.
- **`qms_check_assignment` call_site** must be in the allowed CHECK list (e.g. `'find_matching_vendors'`); arbitrary strings violate `assignment_eligibility_events_call_site_check`.
- **Bulk emails:** send via Brevo throttled; don't loop a per-record edge function (per-function `RateLimitError`).

---

## 13. Decision quick-reference

| What you see | Action |
|---|---|
| Conferred translation degree + native + NDA | **Approve** general (route a); send COA quiz if clinical |
| Other-field degree, no test | **Send general test** (route b); request refs for the 2 yrs |
| No degree, ≥5 yrs via ≥1 confirming reference | **Approve** general (route c) |
| Transcript / short course / proficiency cert / MT cert / interpreting | **Request** a conferred degree OR references |
| Degree on file but no target language | **Request** target pair |
| Target = English only (into-English) | **Hold** + clarify (doesn't fit EN→native roster) |
| COA quiz "Recommend approve" + has a §3.1.4 basis | **Approve** COA domain |
| COA quiz "Needs human review" | **Hold COA** (general only) pending accredited review |
| COA pass but no degree/experience | **Request** a §3.1.4 basis (quiz alone ≠ qualified) |
| Degree file won't open | **Request** legible re-upload |

---

## 14. Don't

- Don't approve on a **quiz/test pass alone** with no §3.1.4 basis.
- Don't **over-scope** — only evidenced domains, curated `combinationIds`.
- Don't record a degree **verified** you didn't actually open and read.
- Don't grant **COA** on anything but a `"Recommend approve"` quiz.
- Don't **trial-onboard on prod** — qualification is irreversible; the audit log is append-only. Validate logic on a single record only when you accept it's permanent.
- Don't audit by application status; don't treat `cvp_translator_domains` as the assignability gate.

---

## 15. Records & audit trail

Every action is captured: `staff_reviewed_by` / `recruitment_approved_by` (approver from JWT), `qms.qualification_audit_log` (append-only chain `evidence_added → nda_signed → submitted_for_review → qualified`), `competence_evidence.verified_by` + dated notes, and `cvp_translator_domains.notes` for de-scopes. The per-cycle audit reports live in `docs/audits/`. This append-only trail is the evidence pack an ISO 17100 / IQVIA auditor inspects.
