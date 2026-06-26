const URL = 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/manage-sops';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtem95ZXp2c2pnc3h2ZW9ha2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDkzNTIsImV4cCI6MjA4NDQyNTM1Mn0.6XtRrAuganzIb65FbG_NKQ8JuOxoPLSXBYsffZg2Y3c';
const STAFF = 'a8b2d97e-4832-41d4-9334-4d6a58558154';
const EFFECTIVE = '2026-06-26';

const call = async (body) => {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
};

const SOP039_MD = `## Why this exists

Cethos holds obligations under ISO 17100:2015, PIPEDA and applicable privacy law, client contracts, and sector-specific regulatory requirements. Without a single maintained register that maps each obligation to the control or SOP that satisfies it, gaps accumulate silently and only surface at audit time. This SOP creates the mechanism that keeps that register current, assigns clear ownership, and ties compliance gaps directly into the corrective-action system.

## Scope

Applies to all Cethos staff. Covers every obligation category:

- **ISO 17100:2015** — process, human-resource, and records requirements
- **Privacy legislation** — PIPEDA (federal Canada), applicable provincial equivalents
- **Client contractual obligations** — SLAs, confidentiality terms, data-handling clauses in MSAs
- **Regulatory** — any sector-specific requirement arising from client work (e.g. health-data handling for life-sciences clients)

This SOP is the structural framework. Individual controls are documented in their own SOPs; the compliance register is the index that connects them.

## Procedure

### 1. The compliance register

The compliance register is a versioned document (spreadsheet or structured table) held in the portal under **Documents → Compliance**. Each row covers one obligation and contains:

| Field | What to record |
|---|---|
| Obligation | The specific requirement (e.g. "ISO 17100 §5.3.2 — revision by a second linguist") |
| Source | ISO 17100 / PIPEDA / Client MSA / Regulatory |
| Control or SOP | The SOP number, policy, or technical control that satisfies it |
| Owner | Role responsible for maintaining the control |
| Evidence location | Where to find proof (portal Documents, Supabase table, audit log) |
| Status | Compliant / Gap identified / CAPA raised / Closed |
| Last reviewed | Date of last check |

The Quality Manager owns the register. No one else may change the Status column without QM sign-off.

### 2. Maintaining the register

The register is a living document. It must be updated:

- **Quarterly** — QM reviews all rows, confirms controls are still in place and evidence is accessible
- **After any non-conformance** — when an NC is closed, the relevant register row is updated to reflect whether the root cause exposed a previously unrecognised gap
- **After an audit finding** — internal or external; any finding that reveals a missing or failed control triggers an immediate row update and, if needed, a new CAPA

### 3. Annual compliance review cycle

The annual review is triggered by the Management Review (see SOP-013). The sequence is:

1. QM prepares a compliance review report summarising register status, any open CAPAs, and any new obligations identified since the last review.
2. Management Review meeting receives the report and agrees on any required actions.
3. Outputs of the review: updated register (new version saved to portal), any new SOPs or policy changes assigned to owners with target dates, any CAPAs raised through the NC system (SOP-011).
4. Minutes of the Management Review record the compliance review discussion and decisions. These are filed in portal Documents under Management Review records.

### 4. Raising a compliance gap

Any staff member who identifies a compliance gap — a requirement that is not met or not evidenced — must:

1. Log a non-conformance in the portal (follow SOP-011).
2. In the NC description, reference the specific obligation and the register row if one exists.
3. The NC owner assigns a CAPA as required by SOP-011.
4. Once the CAPA is closed, the QM updates the compliance register row: status → Compliant, evidence location updated, CAPA reference noted.

Do not attempt to resolve a compliance gap informally. Every gap must go through the NC log so it is auditable.

### 5. Pre-audit compliance sweep

Before any external audit (ISO surveillance, client audit, regulatory inspection), the QM runs a pre-audit sweep:

1. Open the current compliance register.
2. For each row relevant to the audit scope, confirm the evidence is on file and accessible — either in portal Documents, the portal audit log, or a linked external location.
3. Any row where evidence cannot be located is immediately logged as an NC and escalated to management.
4. Prepare an audit-readiness summary listing confirmed evidence locations for each relevant obligation. This summary is filed in portal Documents under the relevant audit folder.

The sweep must be completed at least five business days before the scheduled audit date to leave time to address any gaps found.

## Records

| Record | Location | Retention |
|---|---|---|
| Compliance register (all versions) | Portal Documents → Compliance | Permanent |
| Annual compliance review report | Portal Documents → Management Review | 7 years |
| Management Review minutes (compliance section) | Portal Documents → Management Review | 7 years |
| Pre-audit sweep summary | Portal Documents → Audit folder (per audit) | 7 years |
| NCs and CAPAs raised via this SOP | Portal NC/CAPA log | 7 years |
`;

const SOP040_MD = `## Why this exists

When a staff member leaves or a vendor relationship ends, two things must happen immediately and completely: access to Cethos systems must be revoked, and confidential information must be handled correctly. Gaps in either area create security exposure, potential confidentiality breaches, and ISO 17100 records-management failures. This SOP provides a repeatable checklist-driven process so no step is missed regardless of how the departure happens.

## Scope

Covers:

- All internal staff (employees and fixed-term contractors on internal systems), whether departing voluntarily, at contract end, or by termination
- All vendor and external-contractor relationships ending for any reason

Does not cover temporary suspension of vendor status (handled in the vendor record without full offboarding). If a vendor is reactivated within 12 months of deactivation, access may be restored without re-running the full onboarding sequence at management discretion.

## Procedure

### 1. Trigger and logging

**For staff:** notice of resignation or a termination decision triggers this SOP. The HR lead or PM logs the exit date in the staff record in the portal and notifies the QM on the same day.

**For vendors/contractors:** contract end date triggers this SOP automatically (QM or PM is responsible for tracking contract end dates). Relationship termination for cause triggers it immediately.

The QM creates an offboarding checklist document in the portal (see Records) on the day the trigger occurs. All subsequent steps are recorded against that checklist.

### 2. Staff offboarding

#### 2a. Knowledge transfer (before exit date)

The departing staff member completes a handover document covering:

- All active orders they are responsible for: order number, current status, next action, due date
- Client contacts: names, relationship context, any open discussions
- In-flight tasks not tied to a specific order (e.g. vendor onboarding in progress, ongoing CAPA)
- Location of any working files not yet in the portal

The handover document is reviewed by the staff member's manager before the exit date and filed in portal Documents. If the departure is immediate (termination without notice), the manager is responsible for reconstructing the handover from available records.

#### 2b. Access revocation (same day as exit)

The following access must be revoked on or before the staff member's last working hour. The QM or a delegated system administrator confirms each item and records it on the offboarding checklist:

- **Supabase auth** — staff account disabled (set is_active = false on the staff record; disable the auth user)
- **Google Workspace** — account suspended immediately; do not delete for 30 days (to allow email/Drive access for handover purposes if needed)
- **GitHub** — removed from the Cethos organisation
- **Netlify** — removed from team if they had access
- **Client portals** — any external client system the staff member had access to; QM contacts the client or client-system administrator to confirm removal
- **Brevo** — if the staff member had a named sending account or API access, revoke it
- **Any other system** listed in the staff record's access log

Each revocation must be confirmed in writing — a screenshot of the disabled state or a confirmation email — and attached to the offboarding checklist.

#### 2c. Final administrative steps

- Issue final payment per employment agreement terms.
- Send a written reminder that the confidentiality obligations in the employment agreement are perpetual and survive termination. This is a reminder only — no new agreement is required.
- HR updates the staff record in the portal: status → inactive, exit date recorded, departure reason recorded (internal field, not visible to vendors).

### 3. Vendor and contractor offboarding

#### 3a. Check for active assignments

Before deactivating a vendor, check the portal for any active order assignments. If assignments exist:

1. Reassign them immediately to another qualified vendor. Do not wait until deactivation is complete.
2. Notify the client if the reassignment affects delivery timeline (follow SOP-024 or the relevant workflow SOP for the order type).
3. Confirm reassignment is complete before proceeding.

#### 3b. Access revocation

- **Vendor portal login** — disable the Supabase auth user. Set vendor status to inactive in the vendor record.
- **Shared project folders** — remove access to any Google Drive, SharePoint, or Dropbox folders shared with the vendor for active projects.
- **Any client-system access granted for specific projects** — contact the client to confirm removal.

Confirm each revocation in writing and attach to the offboarding checklist in the vendor record.

#### 3c. NDA and confidentiality

Vendor NDAs and the confidentiality provisions of the GVSA (General Vendor Services Agreement) are perpetual. No separate termination step is required for confidentiality obligations. No new document is issued on departure unless the vendor specifically requests written confirmation of their obligations, in which case the QM may provide a brief written reminder referencing the original signed agreement.

#### 3d. Vendor record update

- Set vendor status to inactive in the portal.
- Record exit date and departure reason in the vendor record notes.
- Do not delete the vendor record. Qualification records, competence evidence, and NDA signatures must be retained (see Data Management below).

### 4. Data management on departure

#### 4a. Work product

All translations, COA data, project files, and deliverables produced by or for Cethos are Cethos property. They are retained per client contract terms, with a minimum retention period of 7 years from project completion. No work product is deleted on offboarding.

#### 4b. Personal data of departed individuals

Cethos retains personal data only as long as there is a lawful basis to do so. The following rules apply:

- **Audit log entries** (Supabase append-only audit tables, qualification audit log) are immutable by design and are retained permanently as required by the ISO 17100 records obligation. Names and identifiers in audit logs are not pseudonymized.
- **Operational records** (staff record, vendor record, contact details, CV) are retained for 7 years from the exit date for ISO 17100 compliance and potential legal purposes.
- **After 2 years of inactivity**, the individual may request pseudonymization of their name and contact details in non-audit tables. The QM assesses whether any legal hold applies before acting on such a request. If pseudonymization is approved, it is logged as a data-management action in portal Documents.
- **Legal hold** — if a departed individual is involved in an outstanding dispute, regulatory inquiry, or client complaint, all data related to them is placed on legal hold and may not be pseudonymized or deleted until the hold is lifted by management.

#### 4c. Storage files (CVs, documents)

Vendor CVs, qualification documents, and competence-evidence files stored in Supabase storage are retained for 7 years from the vendor's exit date. After the retention period:

1. The QM schedules an annual review of departed-vendor storage (calendar reminder set at offboarding).
2. Files past their retention period with no legal hold are flagged for deletion.
3. Deletion is carried out by the QM or a delegated system administrator and logged in portal Documents (a brief record: file name or category, vendor ID, deletion date, authorised by).

Do not delete storage files outside this process.

## Records

| Record | Location | Retention |
|---|---|---|
| Offboarding checklist (staff) | Portal Documents → HR → Staff offboarding, per person | 7 years from exit date |
| Offboarding checklist (vendor) | Portal vendor record → Documents tab | 7 years from exit date |
| Access revocation confirmations | Attached to the relevant offboarding checklist | 7 years from exit date |
| Handover document (staff) | Portal Documents → HR → Staff offboarding, per person | 7 years from exit date |
| Data deletion log entries | Portal Documents → Data Management | 7 years from deletion date |
| Legal hold notices | Portal Documents → Legal | Duration of hold + 7 years |
`;

const SOPS = [
  {
    sop_number: 'SOP-039',
    title: 'Compliance Management Plan',
    category: 'Quality Assurance',
    iso_clause_reference: 'ISO 17100:2015 §4.3, §4.6',
    content_md: SOP039_MD,
  },
  {
    sop_number: 'SOP-040',
    title: 'Offboarding Procedure (Staff and Vendor) and Data Management',
    category: 'Human Resources',
    iso_clause_reference: 'ISO 17100:2015 §3.1.6',
    content_md: SOP040_MD,
  },
];

(async () => {
  for (const s of SOPS) {
    console.log(`\n=== ${s.sop_number} — ${s.title} ===`);

    const created = await call({
      action: 'create_sop',
      title: s.title,
      category: s.category,
      iso_clause_reference: s.iso_clause_reference,
      content_md: s.content_md,
      staff_id: STAFF,
      sop_number: s.sop_number,
    });
    console.log('CREATE', created.status, JSON.stringify(created.json).slice(0, 300));

    const sop = created.json?.sop;
    if (!sop?.id) { console.log('!! NO SOP ID — stopping'); continue; }

    const got = await call({ action: 'get', sop_id: sop.id });
    const versions = got.json?.versions ?? [];
    const draft = versions.find((v) => v.status === 'draft') ?? versions[0];
    if (!draft?.id) { console.log('!! NO DRAFT VERSION — stopping'); continue; }
    console.log('DRAFT', draft.id, 'v' + draft.version_number, draft.status);

    const activated = await call({ action: 'activate', version_id: draft.id, staff_id: STAFF, effective_date: EFFECTIVE });
    console.log('ACTIVATE', activated.status, JSON.stringify(activated.json).slice(0, 300));
  }
  console.log('\nDONE');
})();
