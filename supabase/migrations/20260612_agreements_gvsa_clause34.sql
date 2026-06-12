-- Agreements rollout 2026-06-12:
--  1. Generalize the NDA stack to multiple agreement types ('nda' +
--     'gvsa' — General Vendor Service Agreement). One active template
--     per (jurisdiction, agreement_type); signatures carry the type.
--  2. vendors.gvsa_* mirror columns (admin dashboards, same pattern as
--     nda_signed_at / nda_template_id).
--  3. vendor_client_declarations — NDA clause 3.4 pre-existing-client
--     submissions with evidence files + staff review (approve/reject).
--  4. Private storage bucket for declaration evidence.
--  5. Seed NDA v3.0 + GVSA v1.0 templates INACTIVE. Activation is the
--     launch switch — flipping is_active starts the 14-day clause-7.6
--     grace clock (dismissable modal → blocking) for existing vendors;
--     vendors created on/after effective_from are blocked from day 1.

-- 1. agreement_type ----------------------------------------------------

ALTER TABLE nda_templates
  ADD COLUMN IF NOT EXISTS agreement_type TEXT NOT NULL DEFAULT 'nda'
    CHECK (agreement_type IN ('nda', 'gvsa'));

ALTER TABLE vendor_nda_signatures
  ADD COLUMN IF NOT EXISTS agreement_type TEXT NOT NULL DEFAULT 'nda'
    CHECK (agreement_type IN ('nda', 'gvsa'));

-- One active template per jurisdiction *per agreement type*.
DROP INDEX IF EXISTS idx_nda_templates_active_per_jurisdiction;
CREATE UNIQUE INDEX IF NOT EXISTS idx_nda_templates_active_per_jur_type
  ON nda_templates (jurisdiction, agreement_type)
  WHERE is_active = true;

DROP INDEX IF EXISTS idx_vendor_nda_signatures_current;
CREATE INDEX IF NOT EXISTS idx_vendor_nda_signatures_current
  ON vendor_nda_signatures (vendor_id, agreement_type, is_current)
  WHERE is_current = true;

-- 2. vendors mirror columns -------------------------------------------

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS gvsa_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gvsa_template_id UUID REFERENCES nda_templates(id);

-- 3. Clause 3.4 pre-existing client declarations -----------------------

CREATE TABLE IF NOT EXISTS vendor_client_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  relationship_details TEXT,
  first_engaged_date DATE,
  -- [{ path, name, size_bytes, content_type }] in the
  -- vendor-declarations bucket.
  evidence_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_staff_id UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_client_declarations_vendor
  ON vendor_client_declarations (vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_client_declarations_pending
  ON vendor_client_declarations (status)
  WHERE status = 'pending';

ALTER TABLE vendor_client_declarations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_client_declarations_service_role_all ON vendor_client_declarations;
CREATE POLICY vendor_client_declarations_service_role_all
  ON vendor_client_declarations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS vendor_client_declarations_staff_all ON vendor_client_declarations;
CREATE POLICY vendor_client_declarations_staff_all
  ON vendor_client_declarations FOR ALL TO authenticated
  USING (is_active_staff()) WITH CHECK (is_active_staff());

-- 4. Evidence bucket (private). Bucket-level MIME + size limits enforce
--    independently of edge-function checks — keep both in lockstep.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-declarations', 'vendor-declarations', false, 10485760,
  ARRAY[
    'application/pdf', 'image/png', 'image/jpeg',
    'message/rfc822',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Staff can read evidence straight from the admin client (signed-URL
-- creation also goes through SELECT). Vendor access goes through the
-- service-role edge functions only.
DROP POLICY IF EXISTS vendor_declarations_staff_read ON storage.objects;
CREATE POLICY vendor_declarations_staff_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vendor-declarations' AND is_active_staff());

-- 5. Seed templates (INACTIVE — activation is the manual launch switch)

INSERT INTO nda_templates (version_label, jurisdiction, title, body_html, effective_from, is_active, agreement_type, notes)
SELECT
  'v3.0', 'global', 'Vendor Confidentiality and Non-Solicitation Agreement',
  $nda$<p><em>Standard form — accepted by the Vendor on registration with Cethos Solutions Inc., or as otherwise provided in this Agreement.</em></p>
<h2>Parties</h2>
<p>This Confidentiality and Non-Solicitation Agreement (the “Agreement”) is entered into between:</p>
<p>(1) Cethos Solutions Inc., a corporation with offices at 421, 7th Avenue SW, Floor 30, Calgary, Alberta T2P 4K9 (“Cethos” or the “Company”); and</p>
<p>(2) the person or entity registering as a vendor and accepting these terms (the “Vendor”),</p>
<p>each a “Party” and together the “Parties”. This Agreement is accepted by the Vendor electronically on registration and is effective from the date of that acceptance (the “Effective Date”).</p>
<h2>1. Definitions</h2>
<p><strong>1.1</strong> “Confidential Information” means any non-public information relating to the Company or its business, clients, prospects, former clients or their affiliates, disclosed to or accessed by the Vendor in any form, including client and prospect identities and contact details, pricing, quotations, requests for quotation (RFQs), proposals, audit and qualification materials, project materials and source documents, methodologies, workflows, and the terms of this and any related agreement. It excludes information the Vendor can demonstrate was lawfully known to it before disclosure by the Company, is or becomes public through no fault of the Vendor, or was lawfully received from a third party free of any duty of confidence.</p>
<p><strong>1.2</strong> “Cethos Client” means any client, prospect, former client or customer of the Company (and any of their affiliates) to whom the Vendor was first introduced, or for whom the Vendor first performed services, through or by the Company. It does not include a client with whom the Vendor had a genuine relationship that genuinely pre-dates the Vendor’s first engagement by or through the Company, as established under clause 3.4.</p>
<p><strong>1.3</strong> “Representatives” means the Vendor’s employees, officers, agents, subcontractors and any person or entity acting on the Vendor’s behalf or under its direction.</p>
<h2>2. Confidentiality</h2>
<p><strong>2.1</strong> The Vendor will keep all Confidential Information strictly confidential and will not use, disclose or reproduce it for any purpose other than performing services for the Company, except with the Company’s prior written consent or as required by law.</p>
<p><strong>2.2</strong> The Vendor will ensure its Representatives are bound by confidentiality obligations no less protective than those in this Agreement, and the Vendor remains responsible for their compliance.</p>
<p><strong>2.3</strong> If the Vendor is legally compelled to disclose Confidential Information, it will, where lawful, notify the Company promptly and disclose only what is strictly required.</p>
<p><strong>2.4</strong> On the Company’s request, or on termination of the relationship, the Vendor will return or, at the Company’s direction, securely delete all Confidential Information in its possession or control, and confirm having done so in writing. Where litigation is reasonably anticipated, the Vendor will instead preserve such information as the Company directs.</p>
<p><strong>2.5</strong> The confidentiality obligations in this clause 2 survive termination of the relationship and continue for so long as the information remains confidential.</p>
<h2>3. Non-Solicitation and Non-Circumvention of Cethos Clients</h2>
<p><strong>3.1</strong> During the relationship and for a period of eighteen (18) months after it ends, the Vendor will not, directly or indirectly, solicit, canvass, approach, accept work from, deal with, or enter into any business relationship with any Cethos Client in respect of services of the type the Vendor performed through the Company, otherwise than through the Company.</p>
<p><strong>3.2</strong> The restriction in clause 3.1 applies whether the Vendor acts on its own account or through or with any Representative, family member, or any other person or entity in which the Vendor or a family member has an interest, or from which the Vendor or a family member could benefit. The Vendor will not do indirectly what it is restricted from doing directly.</p>
<p><strong>3.3</strong> The Vendor will not encourage or assist any Cethos Client to move, divert or migrate its work, vendor identity or account away from the Company, and all communication and work with a Cethos Client must run through the Company.</p>
<p><strong>3.4</strong> <strong>Pre-existing relationships.</strong> The restrictions in this clause 3 do not apply to a client with whom the Vendor had a genuine, substantive and ongoing commercial relationship that genuinely pre-dates the Vendor’s first engagement by or through the Company. Whether a relationship is sufficiently genuine and substantive, and whether it pre-dates the Vendor’s first engagement, is assessed as at the date that engagement began — not as at the date of this Agreement or any later date. The Vendor may submit any such pre-existing client relationship, with supporting evidence, through the Company’s vendor portal for the Company’s review and approval or rejection, on accepting this Agreement (or, for a Vendor accepting this Agreement after its initial registration, at the time of that acceptance) and at any time thereafter. The burden of demonstrating a genuine pre-existing relationship rests on the Vendor, and any client relationship not so established will be presumed to have arisen through the Company.</p>
<p><strong>3.5</strong> <strong>Client-initiated contact.</strong> If a Cethos Client contacts the Vendor directly and without any solicitation by the Vendor, the Vendor is not in breach merely by receiving that contact. The Vendor must, promptly and before accepting or pursuing any work or relationship arising from it, give the Company written disclosure of the approach, together with the original record of the first communication (including the email with full headers and metadata, or the platform message). The Vendor may deal with the Cethos Client directly in respect of that approach only with the Company’s prior written consent. The burden of demonstrating genuine client-initiated contact rests on the Vendor, the Company may verify the circumstances with the client, and any communication for which the Vendor cannot produce such a record, or which the Vendor pursues without the Company’s written consent, will be treated as a breach of this clause 3.</p>
<h2>4. Non-Solicitation of Personnel</h2>
<p><strong>4.1</strong> During the relationship and for eighteen (18) months after it ends, the Vendor will not, directly or indirectly, solicit, entice away, employ, engage or hire any employee, officer, contractor or other personnel of the Company, nor induce any of them to leave or reduce their engagement with the Company.</p>
<h2>5. Work Product and the Vendor’s Own Methods</h2>
<p><strong>5.1</strong> All work product, deliverables, materials and results that the Vendor develops, produces or creates on the instruction or request of the Company, or in carrying out any job, project or assignment for the Company, together with all intellectual property in them, become the sole property of the Company automatically on creation, and the Vendor assigns such rights to the Company and waives, in favour of the Company and its assignees, all moral rights in such work product. Nothing in this Agreement, however, transfers to the Company the Vendor’s own pre-existing methods, know-how, training materials, systems or network of personnel, which the Vendor owned or developed independently of its work for the Company and which remain the Vendor’s property; the Company makes no claim to them. The Vendor’s use of its own pre-existing methods or know-how to perform an assignment does not give the Company ownership of those methods or know-how, nor does it give the Vendor any ownership of, or stake in, the work product or the Company’s client relationships.</p>
<h2>6. Remedies</h2>
<p><strong>6.1</strong> The Vendor acknowledges that a breach of this Agreement could cause the Company loss not adequately compensable in damages, and that the Company is entitled to seek injunctive relief in addition to any other remedy, and to be indemnified for losses arising from the Vendor’s or its Representatives’ breach.</p>
<p><strong>6.2</strong> The Vendor acknowledges that the restrictions in this Agreement are reasonable and necessary to protect the Company’s legitimate interests in its confidential information and client relationships.</p>
<h2>7. General</h2>
<p><strong>7.1</strong> <strong>Governing law.</strong> This Agreement is governed by the laws of the Province of Alberta and the federal laws of Canada applicable there, and the Parties submit to the jurisdiction of the courts of Alberta sitting in Calgary.</p>
<p><strong>7.2</strong> <strong>Notices.</strong> Any notice under this Agreement must be in writing. Notices to the Company are given by email to legal@cethos.com; notices to the Vendor are given to the email address in the Vendor’s registration. A notice is treated as received on the next business day after it is sent, absent evidence of earlier receipt.</p>
<p><strong>7.3</strong> <strong>Severability.</strong> If any provision is held invalid or unenforceable, it is severed and the remaining provisions continue in full force.</p>
<p><strong>7.4</strong> <strong>No waiver.</strong> No failure or delay by the Company in exercising any right operates as a waiver of it.</p>
<p><strong>7.5</strong> <strong>Entire agreement.</strong> This Agreement, together with any service agreement between the Parties, is the entire agreement on its subject matter. However, where the Parties have an existing, separately negotiated and signed agreement in force, this Agreement supplements and does not supersede or replace that agreement, which continues in full force; in the event of conflict on confidentiality or non-solicitation, the provision more protective of the Company prevails.</p>
<p><strong>7.6</strong> <strong>Acceptance.</strong> By registering as a vendor and indicating acceptance, the Vendor confirms it has read, understood and agreed to this Agreement, and that it has had the opportunity to obtain independent legal advice. In addition, the Vendor’s continuing to act as a vendor, or its acceptance or performance of any paid assignment, on or after the date falling fourteen (14) days after this Agreement is first made available to the Vendor, constitutes acceptance of and agreement to this Agreement, whether or not the Vendor has separately indicated acceptance. A Vendor that does not wish to accept this Agreement must notify the Company, by email to legal@cethos.com, before that date; vendor access will not continue beyond fourteen (14) days without acceptance.</p>$nda$,
  now(), false, 'nda',
  'Counsel-approved 2026-06-12. Supersedes v2.3. Adds non-solicitation/non-circumvention (cl. 3), clause 3.4 portal-based pre-existing-client declarations, clause 3.5 client-initiated contact, personnel non-solicit (cl. 4), moral-rights waiver (cl. 5.1), notices (cl. 7.2), 14-day deemed acceptance (cl. 7.6).'
WHERE NOT EXISTS (
  SELECT 1 FROM nda_templates WHERE agreement_type = 'nda' AND version_label = 'v3.0'
);

INSERT INTO nda_templates (version_label, jurisdiction, title, body_html, effective_from, is_active, agreement_type, notes)
SELECT
  'v1.0', 'global', 'General Vendor Service Agreement',
  $gvsa$<p><em>Standard form — accepted by the Vendor on registration with Cethos Solutions Inc., or as otherwise provided in this Agreement.</em></p>
<h2>Parties</h2>
<p>This General Vendor Service Agreement (the “Agreement”) is between Cethos Solutions Inc., 421, 7th Avenue SW, Floor 30, Calgary, Alberta T2P 4K9 (“Cethos” or the “Company”), and the person or entity registering as a vendor and accepting these terms (the “Contractor”). It is accepted electronically on registration and effective from that date (the “Effective Date”).</p>
<h2>1. Engagement and Services</h2>
<p><strong>1.1</strong> The Company may, but is not obliged to, engage the Contractor to provide language and related services (translation, editing, proofreading, cognitive debriefing, clinician review, cultural consulting and similar services) as the Company assigns from time to time (the “Services”).</p>
<p><strong>1.2</strong> Each engagement is non-exclusive. The Company is under no obligation to assign any work or any minimum volume, makes no representation as to how much work (if any) the Contractor will receive, and may use other vendors or its own staff for any work. No past assignment creates any obligation to assign further work.</p>
<h2>2. Performance and Responsibility</h2>
<p><strong>2.1</strong> The Contractor will perform the Services to professional standards, in accordance with the Company’s and the relevant client’s instructions, specifications, quality requirements and timelines, and will complete and deliver assigned work to the Company’s and the client’s satisfaction.</p>
<p><strong>2.2</strong> The Contractor is bound by, and automatically accepts, the terms of the Company’s service agreements with its clients to the extent they apply to the work the Contractor performs (the “flow-down terms”), as if those terms were set out in this Agreement — limited to terms of a kind customary in the language-services industry, including confidentiality, data protection and security, regulatory and compliance requirements, quality and process requirements, and intellectual-property provisions. Where an assignment is subject to flow-down terms that are materially more onerous than is customary, the Company will identify those terms in the assignment. The Contractor may request the text of any applicable flow-down terms by email to legal@cethos.com, and the Company will provide the relevant text promptly. The Contractor’s acceptance of customary flow-down terms is not conditional on having requested or received that text.</p>
<p><strong>2.3</strong> The Contractor is responsible for the acts and omissions of its Representatives (employees, subcontractors and agents) as if they were its own, and will indemnify the Company against claims, losses, refunds, re-work and reasonable legal costs arising from the Contractor’s or its Representatives’ performance, errors, delay or breach, save to the extent caused by the Company’s own fault.</p>
<h2>3. Fees and Expenses</h2>
<p><strong>3.1</strong> The Company will pay the Contractor the fee agreed for each assignment, as set out in the relevant purchase order, statement of work or assignment confirmation. No fee is payable for work not assigned by the Company.</p>
<p><strong>3.2</strong> The Contractor must submit an invoice for the fees for each assignment. Payment is due within forty-five (45) days of the Company’s receipt of a correct invoice, unless otherwise agreed in writing.</p>
<p><strong>3.3</strong> <strong>Expenses.</strong> Expenses are reimbursable only where pre-approved by the Company in writing before they are incurred, and only to the extent reasonable, necessary and actually incurred in performing the Services. The Contractor must submit, with each expense claim, the vendor invoice, proof of payment to the vendor, the identity of the vendor, the project the expense relates to, and currency/exchange-rate backup where applicable. The Company may decline to reimburse, or may adjust, any expense that is not supported by such documentation.</p>
<h2>4. Work Product and the Contractor’s Own Methods</h2>
<p><strong>4.1</strong> All work product, deliverables, materials and results that the Contractor develops, produces or creates on the instruction or request of the Company, or in carrying out any job, project or assignment for the Company, together with all intellectual property in them, become the sole property of the Company automatically on creation, and the Contractor assigns such rights to the Company, waives in favour of the Company and its assignees all moral rights in such work product, and will do what is reasonably necessary to give effect to this.</p>
<p><strong>4.2</strong> Nothing in this Agreement, however, transfers to the Company the Contractor’s own pre-existing methods, know-how, training materials, systems or network of personnel, which the Contractor owned or developed independently of its work for the Company and which remain the Contractor’s property; the Company makes no claim to them. The Contractor’s use of its own pre-existing methods or know-how to perform an assignment does not give the Company ownership of those methods or know-how, nor does it give the Contractor any ownership of, or stake in, the work product or the Company’s client relationships.</p>
<h2>5. Confidentiality and Non-Solicitation</h2>
<p><strong>5.1</strong> The Contractor’s confidentiality and non-solicitation obligations are set out in the Vendor Confidentiality and Non-Solicitation Agreement, which the Contractor has accepted as part of the same registration or acceptance process and which is incorporated into this Agreement by reference. Those obligations survive termination of this Agreement in accordance with their terms. In the event of any conflict between the two agreements on confidentiality or non-solicitation, the provision more protective of the Company governs.</p>
<h2>6. Independent Contractor</h2>
<p><strong>6.1</strong> The Contractor is an independent contractor and not an employee, partner, joint venturer or agent of the Company. The Contractor uses its own methods, tools and personnel, controls how the Services are performed, is free to provide services to others, and is responsible for its own taxes, insurance and statutory obligations. Nothing in this Agreement creates a partnership or profit-sharing relationship; fees are the Contractor’s sole entitlement.</p>
<p><strong>6.2</strong> The Contractor acknowledges and agrees that it is engaged solely as an independent contractor; that it is not, and will not claim to be, a partner, joint venturer, employee or co-owner of the Company; that it has no right to any profit share, equity, goodwill or other stake in the Company, its business or its client relationships; and that its sole entitlement under this Agreement is to the fees agreed for assigned work.</p>
<h2>7. Term and Termination</h2>
<p><strong>7.1</strong> This Agreement begins on the Effective Date and continues until terminated. Either Party may terminate on thirty (30) days’ written notice.</p>
<p><strong>7.2</strong> <strong>Material breach — notice and cure.</strong> If either Party commits a material breach that is capable of being cured, the other Party may give written notice specifying the breach, and the breaching Party will have fifteen (15) days from that notice to cure it. If the breach is not cured within that period, the non-breaching Party may terminate this Agreement immediately and recover all reasonable damages arising from the breach. A material breach that is not capable of cure — including, without limitation, breach of confidentiality, breach of the non-solicitation or non-circumvention obligations, or abandonment of work in hand — entitles the non-breaching Party to terminate immediately, without any cure period, and to recover all reasonable damages.</p>
<p><strong>7.3</strong> During any notice period, and on any termination, the Contractor will complete, or fully and properly hand over to the Company, all work in hand — including current status, files, work product and client contacts — so that delivery to clients is not disrupted. A hand over reduces but does not remove the Company’s loss. If the Contractor fails to complete or properly hand over the work in hand, the Contractor is responsible for all reasonable losses the Company suffers as a result, including the cost and disruption of arranging completion of the work at short notice and any damage to client relationships.</p>
<p><strong>7.4</strong> On termination the Contractor will return all Company property, records and Confidential Information (as defined in the Vendor Confidentiality and Non-Solicitation Agreement), and the obligations intended to survive (including confidentiality, non-solicitation, intellectual property, indemnity and this clause) continue.</p>
<h2>8. General</h2>
<p><strong>8.1</strong> <strong>Governing law.</strong> Alberta law and the federal laws of Canada applicable there govern this Agreement; the Parties submit to the courts of Alberta sitting in Calgary.</p>
<p><strong>8.2</strong> <strong>Assignment.</strong> The Contractor may not assign this Agreement or subcontract the Services without the Company’s prior written consent; where subcontracting is permitted, the subcontractor is the Contractor’s agent and the Contractor remains fully responsible.</p>
<p><strong>8.3</strong> <strong>Notices.</strong> Any notice under this Agreement must be in writing. Notices to the Company are given by email to legal@cethos.com; notices to the Contractor are given to the email address in the Contractor’s registration. A notice is treated as received on the next business day after it is sent, absent evidence of earlier receipt.</p>
<p><strong>8.4</strong> <strong>Severability; no waiver; entire agreement.</strong> Invalid provisions are severed and the rest continues. No delay in exercising a right waives it. This Agreement, with the Vendor Confidentiality and Non-Solicitation Agreement, is the entire agreement on its subject matter; however, where the Parties have an existing, separately negotiated and signed agreement in force, this Agreement supplements and does not supersede or replace it, and that agreement continues in full force.</p>
<p><strong>8.5</strong> <strong>Acceptance.</strong> By registering and indicating acceptance, the Contractor confirms it has read, understood and agreed to this Agreement, and that it has had the opportunity to obtain independent legal advice. In addition, the Contractor’s continuing to act as a vendor, or its acceptance or performance of any paid assignment, on or after the date falling fourteen (14) days after this Agreement is first made available to the Contractor, constitutes acceptance of and agreement to this Agreement, whether or not the Contractor has separately indicated acceptance. A Contractor that does not wish to accept this Agreement must notify the Company, by email to legal@cethos.com, before that date; vendor access will not continue beyond fourteen (14) days without acceptance.</p>$gvsa$,
  now(), false, 'gvsa',
  'Initial GVSA 2026-06-12. Cl. 2.2 flow-down bounded to customary terms; cl. 3.2 payment-due wording; cl. 5.1 registration-or-acceptance; cl. 7.4 defined-term cross-reference. 14-day deemed acceptance (cl. 8.5).'
WHERE NOT EXISTS (
  SELECT 1 FROM nda_templates WHERE agreement_type = 'gvsa' AND version_label = 'v1.0'
);
