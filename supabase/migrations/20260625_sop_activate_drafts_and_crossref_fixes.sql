-- ============================================================
-- Migration: 20260625_sop_activate_drafts_and_crossref_fixes
-- 1. Update qms_list_vendor_qualifications to return subject_matter.code
-- 2. Populate draft SOP-002, SOP-004, SOP-026, SOP-027 with real content
-- 3. Activate SOP-002, SOP-004, SOP-026, SOP-027
-- 4. Create corrected versions of SOP-008 (SOP-006→019, SOP-007→011)
--    and SOP-009 (SOP-006→019, SOP-007→011, SOP-PR-001→SOP-008)
-- 5. Activate new versions, supersede old ones
-- ============================================================

-- 1. Update qms_list_vendor_qualifications to include subject_matter.code
-- (needed so the admin VendorQmsTab can derive COA qualification status)
CREATE OR REPLACE FUNCTION public.qms_list_vendor_qualifications(p_vendor_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'qms', 'public'
AS $function$
  SELECT jsonb_build_object(
    'qualifications', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id,
        'status', q.status,
        'qualified_at', q.qualified_at,
        're_qualification_due', q.re_qualification_due,
        'role_type', (SELECT jsonb_build_object('id', rt.id, 'code', rt.code, 'name', rt.name) FROM qms.role_types rt WHERE rt.id = q.role_type_id),
        'competence_basis', (SELECT jsonb_build_object('id', cb.id, 'code', cb.code, 'short_label', cb.short_label) FROM qms.competence_bases cb WHERE cb.id = q.competence_basis_id),
        'language_pair_qualifications', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'direction', lp.direction,
            'source_language', (SELECT jsonb_build_object('id', sl.id, 'code', sl.code, 'name', sl.name) FROM public.languages sl WHERE sl.id = lp.source_language_id),
            'target_language', (SELECT jsonb_build_object('id', tl.id, 'code', tl.code, 'name', tl.name) FROM public.languages tl WHERE tl.id = lp.target_language_id)
          ))
          FROM qms.language_pair_qualifications lp WHERE lp.role_qualification_id = q.id
        ), '[]'::jsonb),
        'subject_matter_qualifications', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'subject_matter', (SELECT jsonb_build_object('id', sm.id, 'code', sm.code, 'name', sm.name) FROM qms.subject_matters sm WHERE sm.id = smq.subject_matter_id),
            'proficiency', smq.proficiency,
            'notes', smq.notes
          ))
          FROM qms.subject_matter_qualifications smq WHERE smq.role_qualification_id = q.id
        ), '[]'::jsonb),
        'evidence', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', ce.id,
            'title', ce.title,
            'evidence_type', (SELECT et.name FROM qms.evidence_types et WHERE et.id = ce.evidence_type_id),
            'issuing_organization', ce.issuing_organization,
            'verified', ce.verified,
            'tier', CASE
              WHEN ce.verified THEN 'verified'
              WHEN ce.verification_method = 'ai_cv_extraction' THEN 'screened'
              ELSE 'unverified' END,
            'verification_method', ce.verification_method,
            'verification_notes', ce.verification_notes,
            'verified_at', ce.verified_at,
            'issued_date', ce.issued_date,
            'expiry_date', ce.expiry_date,
            'has_file', (ce.storage_path IS NOT NULL),
            'has_hash', (ce.sha256 IS NOT NULL)
          ) ORDER BY ce.created_at DESC)
          FROM qms.competence_evidence ce WHERE ce.role_qualification_id = q.id
        ), '[]'::jsonb)
      ) ORDER BY q.qualified_at DESC)
      FROM qms.role_qualifications q WHERE q.vendor_id = p_vendor_id
    ), '[]'::jsonb),
    'unlinked_evidence', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'title', ce.title,
        'evidence_type', (SELECT et.name FROM qms.evidence_types et WHERE et.id = ce.evidence_type_id),
        'issuing_organization', ce.issuing_organization,
        'verified', ce.verified,
        'tier', CASE
          WHEN ce.verified THEN 'verified'
          WHEN ce.verification_method = 'ai_cv_extraction' THEN 'screened'
          ELSE 'unverified' END,
        'verification_method', ce.verification_method,
        'verification_notes', ce.verification_notes,
        'verified_at', ce.verified_at,
        'issued_date', ce.issued_date,
        'expiry_date', ce.expiry_date,
        'has_file', (ce.storage_path IS NOT NULL),
        'has_hash', (ce.sha256 IS NOT NULL)
      ) ORDER BY ce.created_at DESC)
      FROM qms.competence_evidence ce
      WHERE ce.vendor_id = p_vendor_id AND ce.role_qualification_id IS NULL
    ), '[]'::jsonb),
    'ndas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'status', n.status, 'signed_date', n.signed_date,
        'effective_date', n.effective_date, 'expiry_date', n.expiry_date,
        'template_version', n.template_version
      ) ORDER BY n.signed_date DESC)
      FROM qms.nda_agreements n WHERE n.vendor_id = p_vendor_id
    ), '[]'::jsonb),
    'portal_nda_signed_at', (
      SELECT max(s.signed_at) FROM public.vendor_nda_signatures s
      WHERE s.vendor_id = p_vendor_id AND s.is_current AND s.agreement_type = 'nda'
    )
  );
$function$;


-- 2a. SOP-002 — Staff Training and Competence (draft → content + activate)
UPDATE sop_versions SET content_md = $SOP002$CETHOS TRANSLATION SERVICES — 12537494 Canada Inc.

# STANDARD OPERATING PROCEDURE — Staff Training and Competence

| Field | Value |
|---|---|
| **Document Number** | SOP-002 |
| **Title** | Staff Training and Competence |
| **Category** | Human Resources |
| **Version** | 1.0 (effective 25 June 2026) |
| **Effective Date** | 25 June 2026 |
| **Document Owner** | Acting Quality Manager |
| **Classification** | Confidential |
| **ISO / Regulatory reference** | ISO 17100:2015 §3.1.5; ISO 9001:2015 §7.2; 21 CFR Part 11 §11.10(i) |
| **Review Cycle** | Annual, or on significant change to roles or systems |

| Prepared By | Reviewed By | Approved By |
|---|---|---|
| Raminder Shah — Acting Quality Manager | Amrita Shah — Managing Director | Raminder Shah — Founder & CEO |

## 1. Purpose
To ensure that every member of Cethos staff is **competent** for the role they perform and is **trained** on the procedures and computerised systems they use, and that this competence and training is **recorded and retained** as auditable evidence. This procedure governs internal staff; the qualification of external linguists is governed separately by SOP-003 and SOP-019.

## 2. Scope
All Cethos staff in roles that can affect service quality or data integrity — currently: Founder & CEO / Acting Quality Manager, Managing Director, Life Sciences Manager, Lead Vendor Manager, Project Coordinator, Account Managers, and Accounts (AP/AR). It covers onboarding training, ongoing/refresher training, competence assessment, and the maintenance of training records.

## 3. Definitions
**Competence** — the demonstrated ability (education, training, skills, experience) to perform a role. **Training record** — the documented evidence that a person completed a defined training item. **Role profile** — the competence requirements for a role, derived from its job description (JD-001).

## 4. Responsibilities
- **Acting Quality Manager** — owns this procedure; defines role profiles and the training curriculum; verifies competence; maintains the training records and reviews them at Management Review (SOP-013).
- **Managing Director** — ensures resources for training; reviews competence of direct reports.
- **Each staff member** — completes assigned training, keeps their CV current, and acknowledges procedures relevant to their role.

## 5. Competence requirements (role profiles)
Each role has a documented profile (from its job description, JD-001) stating the required education/experience, the SOPs the role must be trained on, and the systems the role uses. As a minimum, every staff member is trained on: the Quality Policy (QP-001), Document Control (SOP-001), Data Security & Confidentiality (SOP-014), Data Backup awareness (SOP-016), and the portal modules used in their role. Role-specific SOPs are added per the profile (e.g., vendor managers on SOP-003/019; PMs on the project-management and production SOPs).

## 6. Onboarding training
On joining (or on role change), the Acting Quality Manager assigns the role's onboarding curriculum. The new staff member's **CV** is placed on file, their **job description** is acknowledged, and each required training item is completed and recorded before the person works unsupervised on in-scope (COA / clinical) work.

## 7. Ongoing and refresher training
Training is refreshed: (a) annually for core quality/security SOPs; (b) whenever an SOP they rely on is revised (the revised version is re-acknowledged); and (c) when a new system or material process change is introduced. Competence is re-confirmed at least annually at Management Review.

## 8. Training records
Training and competence are recorded in the **portal training system** (assignable training modules with per-staff completion tracking and a competence record) and, where a controlled paper record is required, on **FORM-TR-001 (Training & Competence Record)** retained per the records-retention statement (STMT-001). Each staff record holds: the person's role and job description, CV, the list of completed training items with dates, and the competence verification. Records are retained for at least the retention period in STMT-001.

## 9. Competence assessment and sign-off
Competence is verified by the Acting Quality Manager against the role profile — by reviewing the CV/credentials, confirming training completion, and (where applicable) observing work output or a check of a representative deliverable. The verification is signed and dated in the training record. A person is not assigned unsupervised in-scope work until their competence is signed off.

## 10. Review
The completeness of staff training records and any competence gaps are reviewed at each Management Review (SOP-013) and at internal audit (SOP-012). Gaps are managed through CAPA (SOP-011).

## 11. Related documents
QP-001 Quality Policy; JD-001 Staff Job Descriptions; FORM-TR-001 Training & Competence Record; SOP-001 Document Control; SOP-012 Internal Audits; SOP-013 Management Review; SOP-011 CAPA; STMT-001 Inspection History & Records Retention; SOP-014 Data Security.

## 12. Revision History
| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 25 Jun 2026 | R. Shah (Acting QM) | Initial issue — closes gap G1 (IA-2026-002) and supports CAPA on staff training records. |

*** END OF DOCUMENT ***$SOP002$
WHERE id = '93c6ff64-4aec-4af6-81f9-abecacea7223';

UPDATE sop_versions SET status = 'active', effective_date = NOW()
WHERE id = '93c6ff64-4aec-4af6-81f9-abecacea7223';


-- 2b. SOP-004 — Project Management and Customer Support
UPDATE sop_versions SET content_md = $SOP004$CETHOS TRANSLATION SERVICES — 12537494 Canada Inc.

# STANDARD OPERATING PROCEDURE — Project Management and Customer Support

| Field | Value |
|---|---|
| **Document Number** | SOP-004 |
| **Title** | Project Management and Customer Support |
| **Category** | Operations / Customer Support |
| **Version** | 1.0 (effective 25 June 2026) |
| **Effective Date** | 25 June 2026 |
| **Document Owner** | Acting Quality Manager |
| **Classification** | Confidential |
| **ISO / Regulatory reference** | ISO 17100:2015 §4.4, §5; ISO 9001:2015 §8.2, §8.5 |
| **Review Cycle** | Annual, or on significant change to the workflow |

| Prepared By | Reviewed By | Approved By |
|---|---|---|
| Raminder Shah — Acting Quality Manager | Amrita Shah — Managing Director | Raminder Shah — Founder & CEO |

## 1. Purpose
To define how Cethos manages a client translation / linguistic-validation project from enquiry through delivery and invoicing, and how it supports customers — including service-level expectations and the handling of client feedback. Complaints are handled under SOP-011; this procedure covers normal project delivery and routine support.

## 2. Scope
All client projects, with emphasis on the in-scope service — Linguistic Validation of Clinical Outcome Assessments (COA). It spans enquiry/quote, order set-up, resource assignment, production, quality review, delivery, client feedback/revision rounds, and invoicing, in the Cethos portal.

## 3. Roles
- **Account Manager** — primary client contact; quotes, order confirmation, and client communication.
- **Project Coordinator / Project Manager** — runs the project: assigns qualified linguists, tracks the workflow steps and deadlines, manages revision rounds.
- **Life Sciences Manager** — oversight of clinical/COA projects.
- **Acting Quality Manager** — quality oversight; manages complaints/CAPA and SLA exceptions.

## 4. Project lifecycle
(1) **Enquiry / quote** — client request is captured and quoted (or set up as a direct order for AR/business clients). (2) **Order set-up** — an order/project is created with the service, language pair(s), delivery date, client project reference, and client PM. (3) **Resource assignment** — only linguists **qualified** for the role, language pair and domain (per SOP-003 and, for COA, SOP-019) are assigned to each workflow step. (4) **Production** — the work proceeds through the service workflow (e.g., for COA: forward translation, reconciliation, back-translation, review, cognitive debriefing per SOP-008, clinician review per SOP-009, harmonisation, finalisation as applicable). (5) **Quality review** — deliverables are reviewed before release. (6) **Delivery** — the deliverable is provided to the client. (7) **Client feedback / revision rounds** — every client feedback or revision round is **logged on the order** (append-only client-communication log) and actioned; each round is tracked. (8) **Invoicing** — the order is invoiced per the agreed terms.

## 5. Service Level Agreements (SLAs)
Cethos operates to documented service-level expectations, including: acknowledgement of a client enquiry within one business day; a quoted/agreed delivery date for each project; revision rounds actioned within the agreed turnaround; and internal review (HITL) steps tracked against a deadline in the portal (SLA breaches are flagged automatically). Project-specific SLAs in a client contract or MSA take precedence and are recorded against the project. SLA exceptions are escalated to the Account Manager and the Acting Quality Manager.

## 6. Client communication and confidentiality
Client communications are conducted through controlled channels and, where they concern a project, **logged on the order record** for traceability. Clinical/COA content is handled only within the controlled systems (Supabase, Dropbox, SharePoint, AWS) and is never sent to AI tools or carried in general email attachments (SOP-014, SOP-018).

## 7. Complaints
Any expression of client dissatisfaction is recorded and handled as a complaint under SOP-011 (logged in the quality system, triaged, root-caused, and resolved via CAPA where warranted).

## 8. Records
Project records — order, workflow steps, assignments, client communications, deliverables and invoices — are retained in the portal and the controlled stores per STMT-001.

## 9. Review
Project performance (on-time delivery, revision rates, SLA exceptions, complaints) is reviewed at Management Review (SOP-013).

## 10. Related documents
SOP-003 Vendor Qualification; SOP-019 COA LV Qualification; SOP-008 Cognitive Debriefing; SOP-009 Clinician Reviews; SOP-011 CAPA & Complaints; SOP-014 Data Security; SOP-018 Sub-processor Management; STMT-001 Records Retention.

## 11. Revision History
| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 25 Jun 2026 | R. Shah (Acting QM) | Initial issue — closes gap G3 (IA-2026-002); documents project management, customer support and SLAs. |

*** END OF DOCUMENT ***$SOP004$
WHERE id = '93403c51-c0d9-4001-9ddf-112afb842da0';

UPDATE sop_versions SET status = 'active', effective_date = NOW()
WHERE id = '93403c51-c0d9-4001-9ddf-112afb842da0';


-- 2c. SOP-026 — SDLC and Defect Management (SOP-023 proposed → SOP-026; SOP-025→SOP-027)
UPDATE sop_versions SET content_md = $SOP026$CETHOS TRANSLATION SERVICES — 12537494 Canada Inc.

# STANDARD OPERATING PROCEDURE — Software Development Lifecycle and Defect Management

| Field | Value |
|---|---|
| **Document Number** | SOP-026 |
| **Title** | Software Development Lifecycle (SDLC) and Defect Management |
| **Category** | IT / Systems |
| **Version** | 1.0 (effective 25 June 2026) |
| **Effective Date** | 25 June 2026 |
| **Document Owner** | Acting Quality Manager (System Owner: Founder & CEO) |
| **Classification** | Confidential |
| **ISO / Regulatory reference** | 21 CFR Part 11; FDA General Principles of Software Validation (2002); GAMP 5; ISO 9001:2015 §8.3 |
| **Review Cycle** | Annual, or on significant change to the development process |

| Prepared By | Reviewed By | Approved By |
|---|---|---|
| Raminder Shah — Acting Quality Manager | Amrita Shah — Managing Director | Raminder Shah — Founder & CEO |

## 1. Purpose
To control how the Cethos portal software (the GxP-supporting platform used to manage quotes, orders, production, qualification and quality records) is **specified, built, tested, released and corrected**, so that changes are deliberate, traceable and validated, and defects are managed to closure. Validation of the platform is covered by the Computer System Validation documents (CSV-001, CSV-002); infrastructure/release approval is covered by SOP-027 Change Control.

## 2. Scope
The Cethos portal (admin, vendor and customer applications), the production database and edge functions (hosted on Supabase), and supporting tools. Development is performed by Cethos's IT partner (Cital Enterprises) under Cethos's System Owner.

## 3. Definitions
**SDLC** — the controlled lifecycle from requirement to release. **Defect** — any behaviour of the system that deviates from its intended/specified behaviour. **Release** — a deployed change to production. **Version control** — the Git repository holding the application source and database migrations.

## 4. Responsibilities
- **System Owner (Founder & CEO)** — approves the intended use, prioritises work, and authorises releases of GxP-relevant changes.
- **IT (Cital Enterprises)** — implements, tests and deploys changes under version control.
- **Acting Quality Manager** — ensures GxP-relevant changes are risk-assessed and validated (CSV), and that defects affecting quality/data integrity are managed through CAPA where warranted.

## 5. Development lifecycle
Each change follows: (1) **Requirement** — the need is captured (feature request / fix), with intended use and any GxP impact noted; (2) **Design/Build** — implemented in a branch of the version-controlled repository; (3) **Test** — verified against the requirement (functional check; for GxP-relevant changes, against CSV expectations); (4) **Review** — code review / peer or System-Owner review; (5) **Release** — merged and deployed to production; database changes are applied as **migrations** that are then committed to version control so the repository reflects production; edge functions are deployed and versioned. The Git history is the development audit trail.

## 6. Risk and validation
GxP-relevant changes (those affecting qualification records, quality records, audit trails, e-records/e-signatures, or in-scope COA workflows) are risk-assessed and validated per the CSV programme (CSV-001 Part-11 gap assessment; CSV-002 validation summary) and approved per SOP-027. Non-GxP cosmetic/operational changes follow a lighter path but remain version-controlled.

## 7. Defect management
Defects are captured from two channels: the in-application **bug-report** facility (staff and vendors file reports, stored in the `bug_reports` record) and **automated exception monitoring** (Sentry captures unhandled errors). Reported issues are **triaged** by severity and impact (data integrity / quality first), **assigned**, **fixed**, **tested**, and **closed**, with the fix released per §5. A session-start review of open bug reports and unresolved exceptions is performed. Defects that affected delivered quality or a regulated record are additionally handled as nonconformities/CAPA (SOP-011).

## 8. Records
The development and defect audit trail comprises: the Git repository history (requirements/branches/reviews/releases), the database migration history, the deployed edge-function versions, the `bug_reports` log, and the Sentry exception log. These are retained per STMT-001.

## 9. Review
The development process and the open-defect backlog are reviewed at Management Review (SOP-013) and internal audit (SOP-012).

## 10. Related documents
CSV-001 Computer System Validation – Part 11 Gap Assessment; CSV-002 CSV Summary; SOP-027 Infrastructure Change Control; SOP-014 Data Security; SOP-011 CAPA; SOP-016 Data Backup & Recovery; STMT-001 Records Retention.

## 11. Revision History
| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 25 Jun 2026 | R. Shah (Acting QM) | Initial issue — closes gap G2 (IA-2026-002). |

*** END OF DOCUMENT ***$SOP026$
WHERE id = 'ac699fb5-bf96-4921-a113-ffb7a8215473';

UPDATE sop_versions SET status = 'active', effective_date = NOW()
WHERE id = 'ac699fb5-bf96-4921-a113-ffb7a8215473';


-- 2d. SOP-027 — Infrastructure and Application Change Control (SOP-025 proposed → SOP-027; SOP-023→SOP-026)
UPDATE sop_versions SET content_md = $SOP027$CETHOS TRANSLATION SERVICES — 12537494 Canada Inc.

# STANDARD OPERATING PROCEDURE — Infrastructure and Application Change Control

| Field | Value |
|---|---|
| **Document Number** | SOP-027 |
| **Title** | Infrastructure and Application Change Control |
| **Category** | IT / Systems |
| **Version** | 1.0 (effective 25 June 2026) |
| **Effective Date** | 25 June 2026 |
| **Document Owner** | Acting Quality Manager (System Owner: Founder & CEO) |
| **Classification** | Confidential |
| **ISO / Regulatory reference** | 21 CFR Part 11; GAMP 5; ISO/IEC 27001 A.8.32; ISO 9001:2015 §8.5.6 |
| **Review Cycle** | Annual, or on significant change to the environment |

| Prepared By | Reviewed By | Approved By |
|---|---|---|
| Raminder Shah — Acting Quality Manager | Amrita Shah — Managing Director | Raminder Shah — Founder & CEO |

## 1. Purpose
To ensure that changes to Cethos's production infrastructure and application are **assessed, approved, implemented in a controlled way, tested and recorded**, so that changes do not compromise service quality, data integrity or the validated state of GxP-relevant systems. Software development practice is covered by SOP-026; this procedure governs the approval and control of changes to the production environment.

## 2. Scope
Changes to: the production database (schema/migrations, roles, security policies), edge functions and application releases, environment configuration and secrets, the hosting platform (Supabase), third-party integrations (e.g., email/SMS providers, payment, telephony), and the backup configuration (Supabase PITR and the AWS S3 replica).

## 3. Definitions
**Change** — any addition, modification or removal affecting the production environment. **Standard change** — a pre-approved, low-risk, repeatable change. **Emergency change** — a change required to restore service or remediate a security/data-integrity issue.

## 4. Responsibilities
- **System Owner (Founder & CEO)** — approves changes, especially GxP-relevant and security changes.
- **IT (Cital Enterprises)** — assesses, implements, tests and records changes.
- **Acting Quality Manager** — confirms validation impact is addressed for GxP-relevant changes.

## 5. Change procedure
(1) **Request** — the change is described with its reason and the systems/data affected. (2) **Impact & risk assessment** — including GxP/validation impact (does it touch qualification records, quality records, audit trails, e-records/e-signatures, or in-scope COA workflows?) and security/data-residency impact. (3) **Approval** — by the System Owner (with QM for GxP-relevant changes). (4) **Implementation** — performed under version control: database changes as **migrations** that are applied to production and then committed to the repository; application/edge-function changes deployed and versioned; configuration changes recorded. (5) **Test/verify** — the change is verified in production (or a sandbox where appropriate); for GxP-relevant changes, against CSV expectations (SOP-026/CSV). (6) **Record** — the change, its approval, and its verification are recorded (the Git history, migration history and deploy records form the change audit trail).

## 6. Emergency changes
Emergency changes may be implemented to restore service or remediate a security/data-integrity issue, with retrospective documentation and approval within a defined period and a review at the next Management Review.

## 7. Backup and continuity interaction
Changes to the backup configuration (PITR retention, the AWS S3 replication, encryption, retention rules) follow this procedure and are re-evidenced in the Backup Verification Record (CTS-REC-BKP-001). Changes with continuity impact are reflected in BCP-001.

## 8. Records
Change records (request, assessment, approval, implementation, verification) plus the Git/migration/deploy history are retained per STMT-001.

## 9. Review
Changes and any change-related incidents are reviewed at Management Review (SOP-013) and internal audit (SOP-012).

## 10. Related documents
SOP-026 SDLC & Defect Management; CSV-001 / CSV-002 Computer System Validation; SOP-014 Data Security; SOP-016 Data Backup & Recovery; SOP-017 BCDR; CTS-REC-BKP-001 Backup Verification Record; STMT-001 Records Retention.

## 11. Revision History
| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 25 Jun 2026 | R. Shah (Acting QM) | Initial issue — closes gap G4 (IA-2026-002). |

*** END OF DOCUMENT ***$SOP027$
WHERE id = '52241ad8-b253-43c0-8b63-1160c216ae6c';

UPDATE sop_versions SET status = 'active', effective_date = NOW()
WHERE id = '52241ad8-b253-43c0-8b63-1160c216ae6c';


-- 3. SOP-008 v3 — fix SOP-006→SOP-019, SOP-007→SOP-011 (cross-ref correction)
-- Insert corrected version (v3) derived from current active v2 content
INSERT INTO sop_versions (sop_id, version_number, status, effective_date, content_md, created_by)
SELECT
  sop_id,
  3,
  'active',
  NOW(),
  replace(replace(content_md, 'SOP-006', 'SOP-019'), 'SOP-007', 'SOP-011'),
  'a8b2d97e-4832-41d4-9334-4d6a58558154'
FROM sop_versions
WHERE id = '6ce90ca8-8637-4502-9aad-37deb3edefb4';

-- Supersede old SOP-008 v2 (immutability trigger only blocks content_md/version_number changes)
UPDATE sop_versions SET status = 'superseded'
WHERE id = '6ce90ca8-8637-4502-9aad-37deb3edefb4';


-- 4. SOP-009 v3 — fix SOP-006→SOP-019, SOP-007→SOP-011, SOP-PR-001→SOP-008
INSERT INTO sop_versions (sop_id, version_number, status, effective_date, content_md, created_by)
SELECT
  sop_id,
  3,
  'active',
  NOW(),
  replace(replace(replace(content_md, 'SOP-006', 'SOP-019'), 'SOP-007', 'SOP-011'), 'SOP-PR-001', 'SOP-008'),
  'a8b2d97e-4832-41d4-9334-4d6a58558154'
FROM sop_versions
WHERE id = '611539cd-a111-4e79-83ef-b678ed557bc3';

-- Supersede old SOP-009 v2
UPDATE sop_versions SET status = 'superseded'
WHERE id = '611539cd-a111-4e79-83ef-b678ed557bc3';
