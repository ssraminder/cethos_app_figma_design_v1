-- ============================================================
-- Migration: 20260625_sop_crossref_fixes_019_028
-- SOP-019 v3: fix §1 SOP-001→SOP-003, §5 SOP-005→SOP-014, update version header
-- SOP-028 v2: fix SOP-007→SOP-011, SOP-PR-001…011→current production SOP numbers
-- ============================================================

-- SOP-019 v3 (full content rewrite — short SOP, three targeted fixes + revised history)
INSERT INTO sop_versions (sop_id, version_number, status, effective_date, content_md, created_by)
SELECT sop_id, 3, 'active', NOW(), $SOP019V3$# SOP-019 — Qualification of Linguists for COA Linguistic Validation

| Field | Value |
|---|---|
| SOP Number | SOP-019 (formalises and supersedes the draft "VM-001") |
| Version | 3.0 (active — effective 25 June 2026) |
| ISO Reference | ISO 17100:2015 §3.1, §5.2; IQVIA COA; ICH GCP |
| Owner | Acting Quality Manager / Managing Director |

## 1. Purpose
Defines the additional, COA-specific qualification requirements for linguists performing Linguistic Validation of Clinical Outcome Assessments, over and above the general translator/reviser qualification (SOP-003).

## 2. A COA linguist is qualified only with ALL of:
1. **Role qualification** (translator and/or reviser) in the QMS with a documented §3.1.4 basis and **Tier-2 verified** evidence — verified by a competent person, never AI-only.
2. **Subject-matter qualification** in Life Sciences / Medical (or a clinical child area: Clinical Trials, Cognitive Debriefing), with evidence.
3. **Active NDA** + clinical/sponsor confidentiality acknowledgement.
4. **COA Linguistic Validation training** completed (methodology, ISPOR/FDA principles, the migration / back-translation / reconciliation / clinician-review workflow) — recorded in the training file.

## 3. Competence demonstration
- COA methodology knowledge (assessed; pass bar 90%) plus a graded EN→target sample translation (MQM-scored), recorded with model/rubric version for reproducibility.
- Clinical experience evidenced by verified documents or first-party project history at or above the §3.1.4(c) threshold.

## 4. Assignment control
COA workflow services (cognitive debriefing, clinician review, reconciliation, harmonization, back-translation, linguistic-validation migration, screenshot review, post-review) are assigned **only** to linguists meeting §2 — enforced by the QMS assignment gate (per-service block + clinical subject-matter requirement).

## 5. Maintenance
Re-qualified every 12 months and on any serious quality event (SOP-002 / §3.1.8). Confidentiality and data handling per SOP-014 and sponsor requirements.

| Version | Date | Summary | Approved By |
|---|---|---|---|
| 1.0 (Draft) | Jun 2026 | Initial release — formalises COA qualification; supersedes VM-001 draft | Raminder Shah |
| 2.0 | 24 Jun 2026 | Activated; cross-reference corrections pending | Raminder Shah |
| 3.0 | 25 Jun 2026 | Cross-references corrected: §1 general-qualification SOP updated to SOP-003; §5 data-security SOP updated to SOP-014; version header updated | R. Shah (Acting QM) |
$SOP019V3$,
'a8b2d97e-4832-41d4-9334-4d6a58558154'
FROM sop_versions WHERE id = '5046db47-5bd0-4181-b406-c561fc67d950';

UPDATE sop_versions SET status = 'superseded'
WHERE id = '5046db47-5bd0-4181-b406-c561fc67d950';


-- SOP-028 v2: targeted replace() chain
INSERT INTO sop_versions (sop_id, version_number, status, effective_date, content_md, created_by)
SELECT sop_id, 2, 'active', NOW(),
  replace(
    replace(content_md,
      'SOP-007',
      'SOP-011'
    ),
    'SOP-022' || chr(8230) || '025, SOP-PR-001' || chr(8230) || '011',
    'SOP-008 (Cognitive Debriefing), SOP-009 (Clinician Reviews), SOP-022' || chr(8211) || 'SOP-025, SOP-028'
  ),
  'a8b2d97e-4832-41d4-9334-4d6a58558154'
FROM sop_versions WHERE id = '33c216e2-4c51-4976-a2b0-2784f5dbd0a3';

UPDATE sop_versions SET status = 'superseded'
WHERE id = '33c216e2-4c51-4976-a2b0-2784f5dbd0a3';
