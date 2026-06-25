# Internal ISO 17100 Audit — Vendor Approval Queue (Sample of 10)

**Standard:** ISO 17100:2015 — Translation services — Requirements
**Audit type:** Internal readiness audit (pre-IQVIA EQA-Vendor, 29–30 Jun 2026)
**Auditor:** Claude (acting ISO 17100 internal auditor)
**Date:** 2026-06-23
**Scope:** "Ready for Approval" queue (70 applicants); sample of the 10 most recent translator profiles, reviewed on the live admin portal and cross-checked against QMS / application records in the database.
**Reminder:** Cethos is *working toward* ISO 17100 (Stage 2 target Dec 2026); it is **not** certified. This audit assesses readiness, not conformity of a certified system.

---

## 1. Overall conclusion

The "Ready for Approval" queue is a **human-verification staging area**, not an auto-approver, and the portal does surface useful decision-support (an "ISO 17100 evidence" panel + a §-referenced reviewer guide that labels AI document screening "ALL UNVERIFIED"). Mitigating design also exists: per system design, approving with a NULL competence basis keeps the vendor `under_review` rather than auto-qualifying.

**However, for all 10 sampled profiles the core ISO 17100 §6.1.2 competence evidence is absent or unverified, and the decision-support text overstates the evidence.** An IQVIA-style sample of any of these records would find **no documented, verified qualification basis and no completed competence assessment.** Two of ten have no confidentiality agreement at all. The reviewer guide nonetheless returns "→ Approvable" for several. This is the principal readiness risk.

---

## 2. Evidence matrix (sample of 10)

| # | App | Name | Edu (self-declared) | Yrs claimed | AI pre-screen | Tier | §6.1.2 basis recorded | Competence test | NDA | Domains declared / evidenced |
|---|-----|------|------|----|----|----|----|----|----|----|
| 1 | APP-26-0946 | Gabriela Hernandez | bachelor | 10 | 82 | Expert | **No** | **0 passed** (2 skip) | by-email only | 10 / 0 (certified "tested" via skip) |
| 2 | APP-26-0809 | Laetitia Zumstein | master | 10 | 92 | Expert | **No** | **0 passed** (2 skip) | **None** | 15 / 0 |
| 3 | APP-26-0773 | Stephen Zemsing | master | 10 | 78 | Senior | **No** | **0 passed** | by-email only | 14 / 0 |
| 4 | APP-26-0756 | Javier Rozette | bachelor | 10 | 72 | Expert | **No** | **0 passed** | by-email (NDA only, no GVSA) | 8 / 0 |
| 5 | APP-26-0734 | Maryline Pinton | master | 10 | **0** | none | **No** | **0 passed** (7 skip) | by-email only | 15 / 0 |
| 6 | APP-26-0709 | Andriy Yasharov | master | 10 | **0** | none | **No** | **0 passed** | **None** | 9 / 0 |
| 7 | APP-26-0695 | Veronique Eloir | bachelor | 10 | **0** | none | **No** | **0 passed** | by-email only | 8 / 0 |
| 8 | APP-26-0687 | Preeti Madhwal | master | 10 | **0** | none | **No** | **0 passed** | by-email only | 18 / 0 |
| 9 | APP-26-0677 | Mariana Herrera | bachelor | 10 | **0** | none | **No** | **0 passed** | by-email only | 12 / 0 |
| 10 | APP-26-0664 | Bernardo M. Sabão | diploma/cert | 10 | **0** | none | **No** | **0 passed** (2 skip) | by-email only | 15 / 0 |

*Test-combination statuses across all 10: 284 `pending` + 24 `skip_manual_review`; **zero** `assessed`/`approved`. No quiz completed by any.*

---

## 3. Non-conformities

### NC-1 — No qualification basis recorded (CRITICAL) · ISO 17100 §6.1.2; records §3
`qualification_basis = NULL` and `qualification_basis_recorded_at = NULL` for **all 10**. The competence route — (a) recognised degree in translation, (b) degree in another field + 2 yrs full-time translation experience, or (c) 5 yrs full-time professional translation experience — is **self-declared and not verified/recorded by a competent person.** Supporting documents, where present, are AI-screened and explicitly flagged **UNVERIFIED** with low confidence (e.g. Maryline: degree AI 52%, cert AI 25%; Bernardo: CIT diploma AI 42%). One profile (Laetitia, 0809) has **no diploma at all — CV only.** ISO 17100 requires the LSP to obtain and keep documented evidence of competence before assigning work.

### NC-2 — No completed competence assessment (CRITICAL) · §6.1.1, §6.1.3
**0 of 10** have a passed or assessed translation test; all combinations are `pending` or `skip_manual_review`, and no quiz was completed. The portal's "Test passed (N combos)" counts `skip_manual_review` combinations — i.e. the test was **bypassed** and routed to manual review, not demonstrated. Result: competence is **neither tested nor credential-verified** for any sampled profile.

### NC-3 — Confidentiality agreement not bound to the record; 2 missing (MAJOR) · §5.6 confidentiality; records
NDAs, where present (8/10), are matched **only by email — `application_id` is NULL on every signature row**, so the confidentiality agreement is not linked to the application/qualification record (a traceability defect). **Laetitia (0809) and Andriy (0709) have no NDA at all** yet appear in the approval queue. (Where present, NDA evidence quality is otherwise good: signer IP, user-agent, timestamp, HTML/PDF snapshot.)

### NC-4 — Domain over-scoping vs evidence (MAJOR) · §6.1 domain competence ("§6.1.6")
Each profile declares **8–18 domains**; **none** has domain-specific competence evidence (only "certified_official," and that via skip, not a test). Declared services include high-risk/specialised work: medical (6/10), legal (4/10), and for Laetitia the **full COA suite** (back-translation, reconciliation, harmonisation, clinician review, linguistic-validation migration) — the exact services in IQVIA's scope — with zero supporting evidence. The reviewer guide simultaneously instructs "approve only evidenced domains (§6.1.6)" **and** states "none are high-risk … Safe to approve all," which is contradictory and unsafe for medical/COA.

### NC-5 — Decision-support overstates evidence / internally inconsistent (MAJOR) · reproducibility, competence control
The reviewer guide:
- marks **"Competence ✓ translation test passed"** on `skip_manual_review` (no test performed);
- asserts **"General test pass confirms professional linguistic competence"** when no test was passed (and AI pre-screen = 0 for 6/10);
- marks **"References ✓"** while the references corroborate **fewer years than the route-(c) threshold** — Maryline ~1 yr, Laetitia ~3 yrs, Bernardo ~4 yrs (all < 5 yrs; each claims 10);
- returns **"→ Approvable. Record the basis and approve"** (Gabriela, Maryline, Bernardo) despite an unrecorded basis, low-confidence/unverified documents, and references that don't meet route (c).

A staffer following this guidance would qualify candidates on insufficient evidence.

### NC-6 — Data-quality / credential-currency defects (MODERATE)
- **Uniform `years_experience = 10`** across all 10 — almost certainly a form default/cap; undermines self-declared experience as route-(c) evidence.
- **6/10 have AI pre-screen score = 0 and no assigned tier**, yet sit in "Ready for Approval."
- **Expired / dubious credentials:** Maryline — ITI exp. Apr 2025, ATESS exp. Dec 2019; Bernardo — ITI exp. Feb 2026 and a personal **"ISO 17100 (exp. Mar 2026)"** certificate (ISO 17100 certifies *organisations*, not individuals — a claim that should be flagged, not accepted).
- **Location inconsistency:** Bernardo recorded as "Chimoio, Portugal" (Chimoio is in Mozambique).

---

## 4. Mitigating controls observed (in fairness)

- "ISO 17100 evidence" panel pre-computes competence/basis/documents/references/domains and labels AI document screening **"ALL UNVERIFIED, CONFIRM BEFORE RECORDING BASIS."**
- Reviewer guide flags basis (⚠) and missing NDA (⚠) and, in some cases, returns **"→ Not yet — resolve"** (e.g. Laetitia).
- "Flags are review prompts, not gates," and by design approval with a NULL competence basis keeps the vendor `under_review` (no auto-qualification) until a basis + active NDA exist.

These reduce — but do not close — the risk, because the decision text is permissive and the underlying evidence is absent for all 10.

---

## 5. Recommendations (CAPA)

1. **Gate the "Approvable" verdict.** Require a recorded `qualification_basis` backed by either (a) a *verified* degree/experience document or (c) references corroborating ≥5 yrs — **and** either a passed test or a verified route-(a) degree. Never show "Approvable" on `skip_manual_review` alone.
2. **Fix the reference logic:** when corroborated years < claimed (or < 5 for route c), render ⚠, not ✓.
3. **Bind NDA to `application_id`** (foreign key), block approval without a current linked NDA, and backfill the existing email-matched NDAs.
4. **Relabel `skip_manual_review`** from "test passed" to "test bypassed — credential review required."
5. **Domain scope:** approve only evidenced domains; force medical/pharma/legal/COA to "requires domain evidence," overriding any "none are high-risk" text.
6. **Data quality:** fix the `years_experience` default; require a non-zero pre-screen score + tier before a profile enters the approval queue; surface expired certifications and individual-vs-LSP "ISO 17100" claims as flags.
7. **Immediate:** do not approve Laetitia (0809) or Andriy (0709) until an NDA is signed and linked.

---

## 6. Method / objective evidence

- Portal: `portal.cethos.com/admin/recruitment` → "Ready for Approval" tab; profiles APP-26-0946, -0809, -0734, -0664 inspected in full on-screen; the §-referenced reviewer guide and AI document-screening confidence captured verbatim.
- Records: `cvp_applications` (`qualification_basis*`, `education_level`, `years_experience`, `ai_prescreening_score`, `assigned_tier`, `domains_offered`, `services_offered`), `cvp_test_combinations` (status distribution), `vendor_nda_signatures` (by `application_id` and `signed_email`), `cvp_application_reference_requests`. All 10 verified in the database.

---

## 7. Remediation (2026-06-23) — PR #1082, live-verified

| NC | Status | Fix |
|----|--------|-----|
| NC-1 | ✅ Closed (control) | Verdict now blocks "Approvable" until a **verified** §3.1.4 basis exists; qualification stays `under_review` without a recorded basis (existing gate). |
| NC-2 | ✅ Closed | View splits `real_passed_combos` (status `approved`) from `skip_review_combos`. Panel shows "N in credential review (not tested)"; guide marks competence ⚠ and the verdict refuses approval ("skip-review combos are not a test pass"). |
| NC-3 | ✅ Closed | ~1,104 NDAs backfilled `signed_email`→`application_id` (also repairs the approval-time carry-over). Verdict blocks approval with no current NDA. 2/10 (Laetitia, Andriy) correctly still show no NDA. |
| NC-4 | ✅ Closed | `HIGH_RISK_DOMAINS` += COA, certified/official, immigration; guide classifies the **full** declared-domain list and lists unevidenced high-risk domains to remove; false "general test pass confirms competence" claim removed. |
| NC-5 | ✅ Closed | "Approvable" requires real competence + verified basis + ≥1 reference + current NDA + no unevidenced high-risk domain. References drop to ⚠ when corroborated years fall ≥2 short of the self-declared figure. |
| NC-6 | 🟡 Partial | Zero/low pre-screen surfaced as a flag. **Open:** expired-certification + individual-vs-LSP "ISO 17100" detection (needs cert-text parsing); `years_experience` form-default; queue still admits prescreen-0 profiles (guide now flags them). |

**Live verification:** APP-26-0946 (Gabriela) reviewer guide now reads competence ⚠ ("test BYPASSED, not passed"), domains ⚠ (medical/certified/legal/life-sciences/pharma flagged for removal), verdict **"→ Not yet — competence not demonstrated."** View confirmed: `real_passed_combos=0`, `skip_review_combos=2`, `has_verified_degree_doc=false`, NDA linked.

## 8. Separate finding (out of approval-queue scope) — IT security
The migration RLS-linter flags **17 public tables created without `ENABLE ROW LEVEL SECURITY`** (e.g. `vendor_payments`, `vendor_purchase_orders`, `cvp_coa_translation_items`, `cvp_kb_entries`, XTRF staging tables; migrations 2026-05-21 → 2026-06-22). This is a data-protection / access-control gap relevant to IQVIA IT-security review — tracked separately, not part of this approval-queue remediation.
