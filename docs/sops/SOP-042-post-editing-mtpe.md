# SOP-042 — Post-Editing (Machine Translation Post-Editing, MTPE)

**Category:** Production
**ISO 17100 reference:** §5.4 (Production process); aligned with ISO 18587 (MTPE)
**Workflow template:** `post_editing` (Post-Editing → QA Review → Final Deliverable)

## 1. Purpose
To define the process for **Post-Editing (MTPE)** — the editing by a qualified linguist of machine/neural machine-translation (MT) output to bring it to the agreed quality level (full post-editing to publishable quality unless the client specifies light post-editing).

## 2. Scope
Applies to all Post-Editing / MTPE orders, including TransPerfect PostEdit jobs. It covers editing of MT output against the source; it does not cover human translation from scratch (see the applicable translation SOP) or in-context screenshot review (SOP-041).

## 3. Definitions
- **MT / NMT:** machine / neural machine translation output provided as the starting point.
- **Full post-editing:** editing to a quality comparable to human translation — accurate, fluent, correct terminology, publishable.
- **Light post-editing:** editing to a "fit for purpose / understandable" level only, where the client has expressly agreed to it.
- **Bilingual file:** the working file (e.g. TXLF/XLIFF) pairing source and MT/target segments.

## 4. Responsibilities
- **Post-editor (external vendor / qualified linguist):** edits the MT output to the agreed level against source, glossary and client spec.
- **Internal QA Reviewer:** verifies the post-edited output (QA Review step).
- **Project Manager (PM):** confirms the post-editing level (full vs light), the package and deliverable format, and releases the Final Deliverable.

## 5. Procedure
1. **Receive & verify package.** Confirm source, MT/bilingual files, instructions, glossary/TM, and the agreed **post-editing level** (full unless the client specified light). Flag missing input to the PM before starting.
2. **Post-edit.** Edit the MT output segment-by-segment against the source: correct accuracy and mistranslation, terminology (glossary/TM), grammar/fluency, completeness (no omissions/additions), formatting, tags/placeholders. Apply full post-editing unless light has been expressly agreed.
3. **Self-check.** Run automated QA checks (tags, numbers, terminology, consistency) and resolve flags before delivery.
4. **Deliver.** Deliver the post-edited bilingual/target file to the **Post-Editing** step folder.
5. **QA Review (internal).** Internal review verifies the post-edited output against source and spec; returns for correction if needed.
6. **Finalize & deliver.** On QA sign-off, package in the client-required format and release as the **Final Deliverable**.

## 6. Records
Retained per order in the team-Dropbox ISO record (`01_Source`, `02_Reference`, `Post-Editing`, `Final Deliverable`) and the `PROJECT-RECORD.md` (actors, timestamps, SHA-256 hashes): source/MT package, post-edited file(s), QA sign-off, final deliverable.

## 7. References
- ISO 17100:2015 §5.4; ISO 18587:2017 (MTPE)
- SOP-028 — Post-Delivery Revision Rounds
- Applicable translation / QA SOPs

## 8. Revision History
| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-06-26 | Raminder Shah | Initial version. New controlled SOP for the Post-Editing (MTPE) service. |
