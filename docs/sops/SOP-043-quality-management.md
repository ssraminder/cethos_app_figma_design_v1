# SOP-043 — Quality Management (QM) Check

**Category:** Production
**ISO 17100 reference:** §5.3.6 (Verification), §5.4 (Production process)
**Workflow template:** `quality_management` (Quality Management → QA Review → Final Deliverable)

## 1. Purpose
To define the process for an independent **Quality Management (QM) check** — a structured, error-categorised review of a completed translation against the source, glossary/TM, and client specification, producing a QM report and (where in scope) corrected files.

## 2. Scope
Applies to all Quality Management / QM orders, including TransPerfect QM jobs. It covers an independent quality check of completed translated content; it does not cover the original translation or in-context screenshot review (SOP-041).

## 3. Definitions
- **QM check:** independent verification of a completed translation against defined quality criteria.
- **Error category:** classification of a finding — Accuracy (mistranslation/omission/addition), Terminology, Language (grammar/spelling/style), Country/locale, Formatting, or Compliance (client spec). Each finding is assigned a severity (e.g. critical / major / minor).
- **QM report:** the structured record of findings, categories, severities, and recommended corrections (or an error-rate score where a metric such as a scorecard is specified by the client).

## 4. Responsibilities
- **QM reviewer (external vendor / qualified linguist):** performs the independent QM check, logs error-categorised findings, recommends corrections.
- **Internal QA Reviewer:** verifies the QM output for completeness and correct categorisation (QA Review step).
- **Project Manager (PM):** confirms the QM criteria/scorecard, the package and deliverable format, and releases the Final Deliverable.

## 5. Procedure
1. **Receive & verify package.** Confirm source, target, instructions, glossary/TM, and the **QM criteria** (client scorecard/metric where supplied). Flag missing input to the PM before starting.
2. **QM check.** Review the completed translation against the source and spec for: accuracy and completeness, terminology, language quality, country/locale conventions, formatting, and client-specific compliance.
3. **Log & categorise findings.** Record each finding with location, error category (§3), severity, and a recommended correction, in the client-required format (scorecard where supplied, otherwise the Cethos QM report).
4. **Deliver QM output.** Deliver the QM report (and corrected files where in scope) to the **Quality Management** step folder.
5. **QA Review (internal).** Internal review verifies completeness, correct categorisation, and consistency; returns for correction if needed.
6. **Finalize & deliver.** On QA sign-off, package in the client-required format and release as the **Final Deliverable**.

## 6. Records
Retained per order in the team-Dropbox ISO record (`01_Source`, `02_Reference`, `Quality Management`, `Final Deliverable`) and the `PROJECT-RECORD.md` (actors, timestamps, SHA-256 hashes): source/target package, QM report (and corrected files where in scope), QA sign-off, final deliverable.

## 7. References
- ISO 17100:2015 §5.3.6, §5.4
- SOP-028 — Post-Delivery Revision Rounds
- Applicable translation SOP (for the content under QM check)

## 8. Revision History
| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-06-26 | Raminder Shah | Initial version. New controlled SOP for the Quality Management (QM) service. |
