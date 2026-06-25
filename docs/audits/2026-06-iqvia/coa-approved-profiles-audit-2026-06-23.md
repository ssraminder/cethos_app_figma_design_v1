# Internal Audit Report — COA-Approved Translator Profiles

**Date:** 2026-06-23 · **Auditor:** independent review (acting auditor) · **Subject:** the 5 vendors approved for COA Linguistic Validation earlier this session · **Standard:** ISO 17100:2015 §3.1.4 (translator competence routes), §6.1 (qualification records), §6.1.2 (competence evidence), confidentiality (NDA), plus domain/pair scoping and traceability.

**Method:** direct query of `qms.role_qualifications`, `qms.competence_evidence`, `qms.nda_agreements`, `qms.qualification_audit_log`, `cvp_translator_domains`, `cvp_application_references`, `cvp_quiz_submissions`. No reliance on prior session notes.

## Scorecard

| App | Name | Vendor | §6.1 qual | §3.1.4 basis | Basis doc verified? | COA quiz reco | NDA | Audit log | Domains (evidenced only) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 0694 | **Rémi Coutant** | active | qualified | route a (M.A. Translation, Sorbonne) | ✅ **human/auto-verified** | Recommend approve | ✅ active | ✅ | COA+gen+LS+pharma (EN→FR) | ✅ **Fully compliant** |
| 0415 | Karine Blanchard Gagné | active | qualified | route c (2 received refs, medical_pharma confirmed, 12y) | ⚠️ refs not mirrored to QMS | Recommend approve | ✅ active | ✅ | COA+gen+LS+pharma (EN→FR-CA) | ✅ Compliant (1 obs) |
| 0596 | Maurice Dzeuga | active | qualified | route a (M.A. Translation, Buea — attestation) | ⚠️ AI-screened only | Recommend approve | ✅ active | ✅ | COA+gen+LS+medical (EN→FR/FR-CA) | ✅ Compliant (minor) |
| 0590 | Miriam Soares Martins | active | qualified | route a (PUC-Rio translation spec.) | ⚠️ AI-screened only | **Needs human review** | ✅ active | ✅ | COA+gen+LS+medical (EN→PT-BR) | 🟡 **Conditional** |
| 0948 | Victor Vinuela | active | qualified | route b (BSc CS + 1 ref) | ⚠️ AI-screened only | **Needs human review** | ✅ active | ✅ | COA+gen+LS+medical (EN→ES) | 🟡 **Conditional** |

## Conformities (all 5)
- **C1 §6.1** — exactly one role_qualification per vendor, status `qualified`, `recruitment_approved=true`, `qualified_at` stamped.
- **C2 §3.1.4** — competence basis recorded (`competence_basis_id` / basis code) and the basis credential file is on record for every profile.
- **C3 §6.1.2** — ≥1 **verified** competence-evidence row each (the graded COA quiz, `verified=true`).
- **C4 confidentiality** — exactly one **active** NDA each.
- **C5 traceability** — append-only `qualification_audit_log` populated end-to-end (`evidence_added → nda_signed → submitted_for_review → qualified`); approver recorded as `raminder@cethos.com` (active super-admin).
- **C6 scope** — operational domains restricted to the evidenced set (general + clinical + COA); **no over-scoping** (legal/financial/etc. excluded). COA is **EN→target** only.

## Findings

**NC-1 — Minor (Victor 0948, Miriam 0590): COA domain competence adjudicated internally on auto-grader-flagged quizzes.**
Both COA quizzes carry `assessment_recommendation = "Needs human review — translation(s) flagged"` (Victor 9 pass/1 review/0 fail; Miriam 3 pass/6 review/0 fail). They were approved on internal (AI) judgement, not an accredited human linguist's clinical sign-off. The other three are unambiguous "Recommend approve — passed."
→ **Corrective action:** an accredited reviewer (e.g. `fayza@cethos.com`) confirms the flagged Part-2 translations and the verdict is recorded, before these two are treated as fully audit-clean for COA.

**NC-2 — Minor (Miriam, Maurice, Victor; Rémi exempt; Karine n/a): §3.1.4 basis credential AI-screened, not human-verified.**
Degree evidence is `verified=false / ai_document_screen` for Miriam, Maurice, Victor. Only Rémi's degree is `verified=true / ai_auto_verified`. The qualification reached `qualified` on the verified **quiz** evidence + NDA + basis_id, but the basis **credential** itself has had no documented human verification.
→ **Corrective action:** a named verifier confirms each basis credential (files are on record) and sets `verified=true` with verifier id/date.

**OBS-1 — Victor 0948 (highest residual risk).** Route-b experience is met by a **single** received reference, but it is **legal**-domain (his approved domains are medical/clinical) and shows a rating anomaly (1/5 yet would-work-again=yes, no text); 2 further references pending. Clinical competence therefore rests solely on the COA quiz, which is itself "needs human review." → Prioritise the confirmatory review; obtain a clinical-domain reference.

**OBS-2 — Karine 0415.** Route-c experience evidence (2 received references, confirmed 2014/2020, medical_pharma) lives in `cvp_application_references`, not mirrored as a `qms.competence_evidence` row. Traceable but split across tables.

**OBS-3 — Miriam 0590.** Route-a basis is a 360-hour lato-sensu Translation **specialisation certificate** (PUC-Rio), system-typed `degree_translation`. Confirm this satisfies "recognised degree in translation," or reclassify to route b (Engineering master's + experience).

**OBS-4 — Maurice 0596.** Basis credential is an "Attestation of Results" (confirms the M.A. was awarded) rather than the diploma; native French (Cameroon) approved into French (France) + French (Canada) — locale variance. Acceptable; noted.

**OBS-5 — all.** Native language is not captured as a discrete verified field; it is inferred (country + degree language + passing EN→target COA quiz). Consider recording it explicitly.

## Verdict
All five profiles are **structurally compliant** with ISO 17100 §6.1/§3.1.4: qualified record, recorded basis with credential on file, ≥1 verified competence evidence, active NDA, full append-only audit trail, evidenced-only domain scope.

- ✅ **Rémi (0694)** — fully audit-clean.
- ✅ **Karine (0415), Maurice (0596)** — compliant; close NC-2 (human-verify the basis) + OBS.
- 🟡 **Miriam (0590), Victor (0948)** — **conditionally compliant**; do **not** present as fully audit-clean until NC-1 (accredited-human confirmatory review of the flagged COA translations) is closed. Victor additionally needs OBS-1 addressed.

**Pre-IQVIA corrective-action priority:** (1) accredited-human confirmatory review for Victor + Miriam; (2) documented human verification of the four AI-screened basis credentials; (3) strengthen Victor's reference set.
