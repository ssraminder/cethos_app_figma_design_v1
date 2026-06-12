-- Seed the first two SOPs as DRAFTS (plain language). Activation is a human
-- decision recorded with approved_by — that activation is the ISO 17100 §3.1.1
-- "documented process" signoff.

WITH s1 AS (
  INSERT INTO public.sops (slug, sop_number, title, category, iso_clause_reference)
  VALUES ('qualify-translators-revisers', 'SOP-001', 'How we qualify translators and revisers', 'Human Resources', 'ISO 17100:2015 §3.1.1–3.1.5')
  RETURNING id
), v1 AS (
  INSERT INTO public.sop_versions (sop_id, version_number, content_md, change_summary, status, created_by_name)
  SELECT id, 1, $md$# How we qualify translators and revisers

**Why this exists:** ISO 17100 says every translator working on our jobs must qualify in one of three ways, and we must keep proof on file:

1. They have a degree in translation, **or**
2. They have a degree in any field **plus 2 years** of translation work, **or**
3. They have **5 years** of translation work.

Revisers need the same, plus experience revising.

## Where the proof lives

Every vendor has a **QMS tab** on their profile page. It shows their qualifications and the documents behind them (CV, diplomas, work history). Records are never deleted — only superseded.

## How qualification happens (mostly automatic)

1. **The system gathers what we already have**: the vendor's CV from their portal, their signed NDA, their declared years of experience, and their real work history from our own payment records.
2. **AI reads the CV** and writes down the facts it finds (degrees, work history, certifications). Every fact comes with a word-for-word quote from the CV, so anyone can check it against the document in seconds.
3. **Fixed rules — not AI — make the decision.** The rules check which of the three ISO criteria the facts satisfy. AI never picks the outcome; it only reads documents.
4. **If the evidence is clear**, the qualification record is created automatically. It is labelled as machine-verified (`automated_pipeline_v1`) so nobody mistakes it for a human review.
5. **If anything is unclear or contradictory** (for example, the CV says 1 year but the vendor claims 6), the vendor goes to a **human review queue** instead. Nothing is recorded until a person decides.

## When a person must act

- **Exceptions queue** — vendors the rules could not decide.
- **Agencies** — a person checks the agency's own ISO 17100 certificate or its linguists' credentials.
- **Reviewers (domain specialists)** — a person judges domain expertise.
- **Monthly spot-check** — every month we re-check a random 10% of the automatic records. If too many are wrong, the automatic pipeline pauses itself until fixed.

## Revisers

A reviser must hold a translator qualification **plus** revision experience (our own job records count). The system never lets the same person translate and revise the same file — this is enforced by software and cannot be switched off.

## Vendors with no documents

The system emails them a document request automatically and reminds them. Until proof arrives, the assignment screen shows a warning on that vendor.
$md$, 'Initial version.', 'draft', 'System (seeded)'
  FROM s1 RETURNING id, sop_id
)
SELECT 1;

WITH s2 AS (
  INSERT INTO public.sops (slug, sop_number, title, category, iso_clause_reference)
  VALUES ('keep-qualifications-current', 'SOP-002', 'How we keep qualifications up to date', 'Human Resources', 'ISO 17100:2015 §3.1.8')
  RETURNING id
), v2 AS (
  INSERT INTO public.sop_versions (sop_id, version_number, content_md, change_summary, status, created_by_name)
  SELECT id, 1, $md$# How we keep qualifications up to date

**Why this exists:** ISO 17100 says it is not enough to qualify someone once. We must show their skills are **maintained by regular work** and **kept current**, and we must keep records of this.

## The 24-month cycle

Every qualification gets a **review date 24 months** after it is granted.

Once a month, the system checks every qualification coming up for review:

- **Renewed automatically** if the vendor kept working for us during the period (completed jobs count as continuing practice) **and** there are no serious quality problems on file.
- **Sent to a person** if the vendor was inactive, or if there are serious quality events. A person decides whether to renew, ask for refresher training, or suspend.

## Quality events

Problems found during revision, late deliveries, and customer complaints are logged against the vendor as **performance events**. Small issues just accumulate as history. Serious ones flag a person right away.

## Training and development

Certificates for courses, workshops, and professional development can be added to a vendor's QMS tab at any time. They count as evidence at the next review.

## Records

Every renewal, suspension, and decision is recorded with who (or what) made it and when. Nothing is deleted.
$md$, 'Initial version.', 'draft', 'System (seeded)'
  FROM s2 RETURNING id, sop_id
)
SELECT 1;

-- Link current_version_id in a separate statement: an UPDATE in the same
-- statement as the inserting CTEs cannot see those rows (same-snapshot rule).
UPDATE public.sops s SET current_version_id = v.id
FROM public.sop_versions v
WHERE v.sop_id = s.id AND v.version_number = 1 AND s.current_version_id IS NULL;
