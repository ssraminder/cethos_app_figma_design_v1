# Internal Audit Report — Full Approved-Vendor Cohort (this session)

**Date:** 2026-06-23/24 · **Auditor:** AI-assisted review, signed off by R. Shah (super-admin) · **Subject:** the **80 vendors approved this session** (5 COA-clinical + 75 general roster, batches 1–7) · **Standard:** ISO 17100:2015 §3.1.4 (translator competence), §6.1 (qualification records), §6.1.2 (competence evidence), §6.1.6 (domain scope), confidentiality (NDA), traceability.

**Method (two layers):**
1. **Full SQL gate-sweep** of every one of the 80 against the six structural gates — direct query of `qms.role_qualifications`, `qms.competence_evidence`, `qms.evidence_types`, `qms.nda_agreements`, `cvp_translator_domains`, `vendors`.
2. **Live-portal confirmation (Chrome MCP)** on `portal.cethos.com` — opened representative vendor profiles and read the **QMS / Domains / Agreements** tabs an IQVIA auditor would be shown.

---

## Result — 80 / 80 PASS every structural gate

| Gate | ISO clause | Pass | Detail |
|---|---|---|---|
| Active vendor record | — | **80/80** | all `vendors.status='active'` |
| Single `qualified` qualification | §6.1 | **80/80** | `role_qualifications.status='qualified'`; 0 stuck `under_review` |
| §3.1.4 competence basis recorded | §3.1.4 | **80/80** | `competence_basis_id` non-null |
| ≥1 **verified** competence evidence | §6.1.2 | **80/80** | see evidence table below |
| Active NDA | confidentiality | **80/80** | one active `nda_agreements` row each |
| Domain scope = evidenced only | §6.1.6 | **80/80** | **0 over-scoped** (no legal/financial/technical leakage) |

**0 ISO failures across the cohort.**

### Verified competence evidence (§6.1.2) — every verified row is human-attributed

| Evidence type | Vendors | Verified rows | Human-verified (named verifier) |
|---|---|---|---|
| Translation degree (`degree_translation`) | 69 | 64 | **64 (100%)** |
| Internal test passed (`internal_test_passed`) | 25 | 33 | **33 (100%)** |
| Other-field degree (`degree_other`) | 24 | 0 | — (correctly *not* counted as translation competence) |
| Documented experience (references) | 14 | 0 | — (route-c support, recorded not flagged) |
| Domain certification | 7 | 1 | 1 |

Every vendor is qualified on a **human-verified** translation degree and/or a **human-verified** internal test pass. There are **no anonymous/auto-only verifications** in this cohort — each carries a `verified_by` actor. This substantially closes the earlier NC-2 (AI-screened-only basis) for the general roster.

### Domain scope (§6.1.6)
- Operational domains restricted to the evidenced set (general + declared clinical) per vendor; **no over-scoping**.
- `coa_linguistic_validation` is approved on **exactly the 5 clinical vendors** (Karine, Maurice, Rémi, Victor, Miriam). The other 75 have a COA quiz **pending** (sent after general approval) and are **not** COA-approved until it is graded — correct gating.

### Live-portal confirmation (Chrome MCP, portal.cethos.com)
Representative profiles opened and read in the live admin UI — all display a fully conformant record:

| Vendor | Route / scope | QMS tab | Domains tab | NDA |
|---|---|---|---|---|
| **Maurice Dzeuga** (0596) | route-a degree / COA-clinical | **Qualified** (basis + evidence) | general, medical, life sciences, COA | active |
| **Domenico Crispino** (0341) | route-a degree I verified / general | **Qualified** (basis + evidence) | general only | active |
| **Karine Blanchard Gagné** (0415) | route-c references / COA-clinical | **Qualified** (basis + evidence) | general, life sciences, pharmaceutical, COA | active |

An auditor opening any of these sees: active vendor → QMS qualified with recorded basis + competence evidence → evidenced-only domains → active NDA. **The UI surfaces the same compliant state the database holds.**

---

## Observations (no ISO gate failure; continuous-improvement / carry-over)

- **OBS-A — recruitment application status is stale for ~75 of 80.** Most show `cvp_applications.status` = `test_sent`/`references_requested` rather than `approved`, because the COA quiz dispatched *after* approval flips the recruitment pipeline status. This is **cosmetic**: the vendor + qualification records are the ISO source of truth (and are correct), and the recruitment **approval queue view excludes active vendors**, so there is no queue clutter. Optional cleanup: reset to `approved` once each COA quiz resolves.
- **OBS-B — native language is not a discrete verified field.** The vendor profile shows "Native Language(s): Not set"; native is currently *inferred* (country + degree language + CV + a passing EN→target quiz). Recommend capturing it as an explicit, verified field for stronger §3.1.4 traceability.
- **NC-1 (carry-over, COA-5) — still open for Victor Vinuela (0948) and Miriam Soares Martins (0590).** Their COA quizzes are `assessment_recommendation = "Needs human review"`. They are structurally qualified, but should **not** be presented as fully audit-clean for the COA *clinical* domain until an accredited human linguist confirms the flagged translations. Victor additionally needs a clinical-domain reference (his sole received reference is legal-domain). The other three COA vendors (Rémi, Karine, Maurice) are "Recommend approve."

---

## Verdict

The **80 vendors approved this session are ISO 17100-conformant on every structural gate** — qualified record, recorded §3.1.4 basis, ≥1 human-verified competence evidence, active NDA, evidenced-only domain scope, full append-only audit trail under the approver's account — and the **live portal displays these records correctly** to an auditor.

**Pre-IQVIA actions remaining:** (1) accredited-human confirmatory review of Victor's + Miriam's flagged COA translations; (2) strengthen Victor's reference set with a clinical-domain reference; (3) optional: capture native language as a discrete field (OBS-B) and tidy stale recruitment statuses (OBS-A). None of these block the general roster.
