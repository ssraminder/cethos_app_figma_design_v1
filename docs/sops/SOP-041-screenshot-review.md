# SOP-041 — Screenshot Review (In-Context Linguistic Review)

**Category:** Production
**ISO 17100 reference:** §5.3.6 (Verification), §5.4 (Production process)
**Workflow template:** `screenshot_review` (Screenshot Review → QA Review → Final Deliverable)

## 1. Purpose
To define the process for **Screenshot Review (SSR)** — the in-context linguistic review of translated user-interface (UI) strings, e-learning, or other material against client-supplied screenshots — so that the translation is verified as correct, complete, and fit for purpose in its real display context.

## 2. Scope
Applies to all Screenshot Review orders, including those received from localization clients (e.g. TransPerfect SSR jobs). It covers review of already-translated content in context; it does not cover the original translation, which is performed under the applicable translation SOP.

## 3. Definitions
- **SSR (Screenshot Review):** review of translated strings as they appear in screenshots of the final product.
- **In-context:** evaluated as displayed to the end user (layout, position, surrounding content), not as an isolated segment.
- **Truncation:** text cut off or overflowing its container in the rendered UI.
- **Issue category:** classification of a finding — Linguistic (accuracy/terminology/grammar), Layout (truncation/overlap/wrapping), Functional (wrong string in context, untranslated, variable/placeholder error), or Query (clarification required).

## 4. Responsibilities
- **Reviewer (external vendor / qualified linguist):** performs the in-context review, logs and categorises issues, recommends corrections.
- **Internal QA Reviewer:** verifies the completeness and consistency of the review output (QA Review step).
- **Project Manager (PM):** confirms the package, the deliverable format required by the client, and releases the Final Deliverable.

## 5. Procedure
1. **Receive & verify package.** Confirm receipt of source, target, screenshots/context package, instructions, glossary/TM, and the client's issue-report format. Flag any missing input to the PM before starting.
2. **In-context review.** For each screenshot, assess the translation in context for: linguistic accuracy and terminology, **truncation/layout**, correct string in the correct place, untranslated/placeholder/variable errors, and consistency with the glossary/TM.
3. **Log & categorise issues.** Record each finding with screenshot reference, the affected string, the issue category (§3), severity, and a recommended correction, in the client-required format (or the Cethos SSR review log where none is specified).
4. **Return annotated review.** Deliver the completed review (annotated screenshots and/or issue log) to the **Screenshot Review** step folder.
5. **QA Review (internal).** Internal review verifies completeness (all screenshots covered), correct categorisation, and consistency; returns for correction if needed.
6. **Finalize & deliver.** On QA sign-off, package the review in the client-required format and release as the **Final Deliverable**.

## 6. Records
Retained per order in the team-Dropbox ISO record (`02_Reference`, `Screenshot Review`, `Final Deliverable`) and the `PROJECT-RECORD.md` (actors, timestamps, SHA-256 hashes): source/screenshot package, completed review log / annotated screenshots, QA sign-off, final deliverable.

## 7. References
- ISO 17100:2015 §5.3.6, §5.4
- SOP-028 — Post-Delivery Revision Rounds
- Applicable translation SOP (for the upstream translation under review)

## 8. Revision History
| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-06-26 | Raminder Shah | Initial version. New controlled SOP for the Screenshot Review service. |
