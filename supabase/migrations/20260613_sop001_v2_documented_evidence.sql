-- SOP-001 v2 (DRAFT) — documented-evidence rule (self-reported experience is
-- never enough), auto/pending/HITL onboarding, no-bypass evidence gate, optional
-- testing. Created in prod via the manage-sops edge function on 2026-06-15;
-- recorded here so the repo reflects prod. Idempotent (no-op once v2 exists).
INSERT INTO public.sop_versions (sop_id, version_number, content_md, change_summary, status, created_by_name)
SELECT s.id, 2,
$md$# How we qualify translators and revisers

**Why this exists:** ISO 17100 requires every translator on our jobs to qualify in one of three ways, and we must keep documented proof on file:

1. A degree in translation, linguistics, or language studies, **or**
2. A degree in any field **plus 2 years** of professional translation experience, **or**
3. **5 years** of professional translation experience.

Revisers need the same, plus revision experience.

## Documented evidence — not just what someone says

ISO requires **documented** evidence. A number an applicant types into a form is not enough on its own.

- A **translation degree** is proven by the degree itself (shown on the CV or certificate).
- **Experience** (the 2-year and 5-year routes) must be backed by **documented proof** — references that confirm when and where the person worked, or experience-proof documents. A CV that merely looks consistent is not enough.

## How an application becomes an approved vendor

When we review an application, one of three things happens:

- **Auto-approved** — only when a §3.1.4 route is met with documented evidence:
  - a translation degree clearly shown on the CV, **or**
  - experience confirmed by references.
  The system reads the CV, records the exact basis and the evidence, and onboards the vendor. Auto-approval is **off by default** and is switched on deliberately by a named manager.
- **Pending** — a route looks likely but the documented proof is not on file yet (for example, self-reported experience with no references). We request references/proof and the application waits. It qualifies once the evidence arrives.
- **Human review** — a person decides. Even here ISO is **not** bypassed: the system will not let anyone approve an experience-based applicant without documented references/proof on file. (A translation degree shown on the CV is itself the evidence for the degree route.)

## Testing is optional

ISO 17100 does not require a test. We can send a test on demand (a person triggers it), but a test is not needed to qualify or to onboard. Qualification rests on the §3.1.4 documented basis.

## Where the record lives

Every approval records the §3.1.4 basis (degree / degree + 2 years / 5 years), the supporting evidence, and who approved it and when. Records are never deleted.

## Reviewers and revisers

Revisers need translator competence plus revision experience. Reviewers are domain specialists (§3.1.6). The same documented-evidence rule applies.
$md$,
  'v2: documented-evidence rule (self-reported experience never enough), auto/pending/HITL onboarding, no-bypass evidence gate, testing optional.',
  'draft', 'Raminder Shah'
FROM public.sops s
WHERE s.slug = 'qualify-translators-revisers'
  AND NOT EXISTS (SELECT 1 FROM public.sop_versions v WHERE v.sop_id = s.id AND v.version_number = 2);
