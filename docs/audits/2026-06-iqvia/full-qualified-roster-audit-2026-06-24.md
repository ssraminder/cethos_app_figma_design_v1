# Internal Audit Report — Full Qualified-Vendor Roster

**Date:** 2026-06-24 · **Auditor:** AI-assisted internal audit, signed off by R. Shah (super-admin, raminder@cethos.com) · **Standard:** ISO 17100:2015 §3.1.4 (translator competence), §6.1 (qualification records), §6.1.2 (competence evidence), §6.1.6 (domain/specialization scope), confidentiality (NDA), traceability · **Scope:** **every vendor holding a `qualified` role-qualification** (not just this session's cohort).

---

## Audit method (steps performed)

1. **Population.** Selected all distinct vendors with ≥1 `qms.role_qualifications.status = 'qualified'`. Segmented into *this-session cohort* (`qualified_at ≥ 2026-06-23`) and *pre-existing* (`< 2026-06-23`).
2. **Core-gate sweep** across the whole population, one `count(*) FILTER` per gate:
   - vendor record `active`;
   - §3.1.4 basis recorded (`competence_basis_id` non-null);
   - ≥1 **verified** competence evidence (`qms.competence_evidence.verified = true`);
   - active NDA (`qms.nda_agreements.status='active'`, not expired).
3. **Domain-scope check (§6.1.6).** For each vendor, counted approved `cvp_translator_domains` and flagged any domain **outside** the evidenced set {general, medical, life_sciences, pharmaceutical, coa_linguistic_validation}.
4. **Zero-domain drill-down.** Investigated every vendor showing 0 approved operational domains.
5. **Provenance check** on the pre-existing group: evidence type, verifier, verification notes, NDA presence, append-only audit-log presence.
6. **Over-scope drill-down** on the single flagged vendor: mapped declared domains against held evidence.
7. **Summary statistics**: basis-route distribution and COA-clinical count.

All steps were run as read-only SQL against `qms.*` and `cvp_*`; no records were modified during the audit (the one earlier fix — Gabriela — was made during processing *before* this audit and is reflected as clean here).

---

## Results

### Population
**147 qualified vendors** — **110** qualified this session, **37** pre-existing.

### Core gates — 147 / 147 PASS each

| Gate | ISO clause | Pass |
|---|---|---|
| Vendor active | — | **147/147** |
| §3.1.4 basis recorded | §3.1.4 | **147/147** |
| ≥1 verified competence evidence | §6.1.2 | **147/147** |
| Active NDA | confidentiality | **147/147** |

### Basis-route distribution (qualification instances)
`t_a_degree_translation`: **105** · `t_c_5y_experience`: **37** · `t_b_degree_other_plus_2y`: **5** · `r_translator_plus_revision`: **9** (reviser-role quals). **COA Linguistic Validation (clinical) domain: 9 vendors.**

### Domain scope (§6.1.6)
- **146 / 147** are scoped to evidenced domains only.
- **1 over-scoped** (Omotola — see NC-2). The entire **this-session cohort (110) is clean** — 0 over-scoped.

### The two pre-existing groups
- **36 first-party-experience vendors** (qualified 13–19 Jun). Basis = §3.1.4(c), evidenced by **Cethos's own first-party job/payment records** (verification notes cite completed-job counts, dates, and CAD billed; "first-party payment/PO evidence, VM-001 §5.5"). All 36 carry an **active NDA** and an **append-only audit-log trail** (36/36). They qualified *outside* the recruitment-application flow, so they have **no `cvp_translator_domains` rows** → **OBS-1**.
- **1 recruitment vendor (Omotola)** — multi-evidence (degree + experience + 2 internal tests + a domain cert), 8 approved domains → **NC-2**.

---

## Findings

**NC-1 — Minor, carry-over (Victor Vinuela 0948, Miriam Soares Martins 0590): COA clinical competence adjudicated on auto-grader-flagged quizzes.** Both COA quizzes are `assessment_recommendation = "Needs human review"`. They are structurally qualified, but must **not** be presented as fully audit-clean for the **COA clinical** domain until an accredited human linguist confirms the flagged Part-2 translations. → *Corrective action: accredited-reviewer sign-off recorded before treating their COA domain as closed.* (The other 7 COA vendors are "Recommend approve".)

**NC-2 — Minor, NEW (Omotola Onabanjo, qualified 2026-06-22 — pre-existing) — ✅ REMEDIATED 2026-06-24.** Eight approved domains, but her test record showed `general:approved` (passed) while all seven specialised domains (academic_scientific, business_corporate, certified_official, energy, immigration, marketing_advertising, technical) were `declared_unverified`; her one `domain_specific_certification` is an **RWS machine-translation post-editing** certificate (screening-flagged as "not a formal ISO 17100 translation qualification"). **Action taken:** de-scoped to **general only** — the 21 specialised domain rows set to `rejected` with an audit note; the 3 general rows (her evidenced + degree-backed scope) retained. Now consistent with the evidenced-only standard.

**OBS-1 — 36 first-party-experience vendors: assignability ✅ CONFIRMED (no defect).** Initial concern was that they lack `cvp_translator_domains` rows. **Investigation 2026-06-24 (read `find-matching-vendors` v37):** Find-Vendor does **not** use `cvp_translator_domains` at all — it gates on the **`vendor_language_pairs`** table for language matching and the **`qms_check_assignment`** RPC for the ISO gate. Verified: **all 36 have active `vendor_language_pairs`** and `qms_check_assignment` returns **eligible=true** for them (they are QMS-qualified). So the 36 are fully assignable; the earlier "empty `cvp_translator_domains`" worry was a stale assumption about the wrong table. **No record creation performed (correctly avoided — it would have been the wrong table and an untested app-less pattern).** *Minor operational note: 16 of the 36 have no `vendor_rates` row, so they may not surface in rate-bounded searches until a rate is set — a rate-setup task, not a qualification or assignability defect.*

**OBS-2 — Native language is not a discrete verified field** (carry-over). It is inferred (country + degree language + CV + a passing EN→target test/quiz). → *Consider recording native language explicitly.*

**OBS-3 — Recruitment application status is stale for much of the session cohort** (carry-over, cosmetic). Post-approval COA-quiz sends flip the *application* pipeline status to `test_sent`; the **vendor + qualification records are the ISO source of truth and are correct**, and the approval queue excludes active vendors, so there is no operational impact.

---

## Verdict

The qualified roster (**147 vendors**) is **substantially conformant** with ISO 17100 §6.1/§3.1.4: every vendor has an active record, a recorded competence basis, ≥1 verified competence evidence, an active NDA, and (146/147) an evidenced-only domain scope, with append-only audit-log traceability.

## Roster readiness (2026-06-24, post-remediation)

**147 qualified vendors — 147/147 active, §3.1.4 basis recorded, ≥1 verified competence evidence, active NDA, and assignable** (active `vendor_language_pairs` + `qms_check_assignment` eligible). **0 over-scoped.** **7 COA-clinical vendors, all "Recommend approve — passed"** (Karine, Maurice, Rémi, Gabriela, Estela, Agustina, Laura). This is the presentable IQVIA roster — **no open nonconformities.**

**Resolved for presentation:**
1. ~~NC-2 — Omotola over-scope~~ — ✅ de-scoped to general.
2. ~~OBS-1 — 36 assignability~~ — ✅ confirmed assignable (Find-Vendor uses `vendor_language_pairs`, which all 36 have; no fix needed).
3. ~~NC-1 — Victor/Miriam COA "needs human review"~~ — ✅ **resolved by withholding clinical scope:** both de-scoped to **general-only** (valid general qualification retained); COA + clinical-cluster domains removed pending an accredited linguist's confirmation of the flagged translations, with a documented re-instatement path. The presented COA roster is now 7, all unambiguously "Recommend approve."

*Operational follow-up (not a nonconformity):* 16 of the 36 first-party vendors have no `vendor_rates` row → set rates so they surface in rate-bounded assignment searches. *Re-instatement (post-audit):* if an accredited reviewer confirms Victor's / Miriam's flagged COA translations, re-add their COA + clinical domains.
