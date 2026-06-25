# Handover — IQVIA blinded CVs → Usman roster + external-contractor onboarding
**Date:** 2026-06-25 · **Supabase project:** `lmzoyezvsjgsxveoakdr` · **Admin repo:** `D:\cethos\portal\cethos_app_figma_design_v1`

This continues the "Blinded CVs for IQVIA" work. Read this top-to-bottom; it is accurate as of the
hand-off and includes every ID, gotcha, and open decision needed to continue.

---

## 0. TL;DR — where we are

The IQVIA "Blinded CVs" batch (79 PDFs, in `C:\Users\RaminderShah\Downloads\Blinded CVs for IQVIA-20260624T215440Z-3-001\Blinded CVs for IQVIA`)
was split into:

- **56 cognitive-debriefing consultants → Usman Khan's blinded agency roster** — **DONE & live-verified.**
- **23 translators → direct Cethos external-contractor vendor profiles** — **profiles + CVs + specializations DONE; onboarding paperwork NOT yet sent.**

**The active task now = onboarding the 23 contractors:** email each a **signed link** to an e-sign onboarding
package (NO Word files), record the signature for audit, and save the signed copy into the contractor's
profile/documentation — using the SAME machinery as the existing vendor NDA/GVSA signing. Then flip them
to `active`. User will also upload **country of residence** and **payment/invoice history** to record.

---

## 1. Phase A — Usman Khan agency roster (COMPLETE, do not redo)

**Vendor:** Usman Khan, `vendor_id = ae80a3ba-2b1e-4340-a0e6-fdb7b13b3803`, email `lv@cogdeb.com`, `vendor_type=agency`, active.

- **56 CD-consultant blinded profiles** on `vendor_roster_linguists`, **handle = the IQVIA Vendor ID code** (`CSCD####`).
  15 were matched onto pre-existing locale CD entries (renamed to code), 41 created new. **All 56 eligible.**
  Each: role `cd_interviewer`, domain `life_sciences`, competence basis **`rev_domain_specialist`**, `iso_attested`,
  pair `EN→<target>`, `cv_path = <vendor_id>/<handle>/cv.pdf` in the **`vendor-roster-cvs`** bucket.
- **20 old placeholder roster entries retired** (`is_active=false`); **all orphan storage files purged** (0 left).
- **Live-verified** on the admin Blinded Roster tab.
- **OPEN (user's external action):** 2 duplicate IQVIA codes — **`CSCD3501`** (German + Greek) and **`CSCD6592`**
  (French + Turkish) were each on two different people. Suffixed to `CSCD3501-DE/-EL`, `CSCD6592-FR/-TR` to keep
  handles unique. User to assign real unique codes if wanted + tell IQVIA. **Did NOT email IQVIA.**

Deliverables (in the Downloads IQVIA folder): `Usman-Roster-CV-Inventory.xlsx`, `Usman-Khan-Roster-Handle-Mapping.xlsx`.

---

## 2. Phase B — 23 external-contractor translator profiles (state)

These are the 23 translators set aside from the roster (21 `CSV*` + the 2 translation-primary `CSCD4903`/`CSCD5620`).
Created as **direct Cethos vendors** (NOT on Usman's roster). User supplied real names + `@ext.cethos.com` emails + join dates.

**DONE for all 23:**
- `vendors` row: `vendor_type=translator`, `contractor_type=individual`, **`status=inactive`** (activate post-onboarding),
  `rate_currency=CAD` (default — likely should be USD; set with rates later).
- **Blended `full_name` = `{Code} · {SRC}⇄{TGT} · {Real Name}`** (e.g. `CSV0133 · KO⇄EN · Ji-woo Park`). There is **no
  vendor "code" column** — the code lives inside `full_name`.
- **42 `vendor_language_pairs`** (UPPERCASE codes; both directions for `⇄`).
- **`vendors.specializations`** (jsonb) = `["COA","Life Sciences","Pharmaceutical","Medical"]`.
- **Blinded CV attached**: file in **`vendor-cvs`** bucket at `{vendor_id}/v1-{epoch}-{sanitized}.pdf` + a **`vendor_cvs`**
  row (`version=1, is_current=true, uploaded_by_vendor=false, notes='IQVIA blinded CV (staff onboarding upload)'`).

**NOT done yet:** country of residence (NULL), portal access / NDA / onboarding paperwork, activation, rates,
payment/invoice history.

### The 23 contractors (master reference)

| Code | Name | Email | vendor_id | Lang pair (display) | Date of joining |
|---|---|---|---|---|---|
| CSCD4903 | Marites Bumanglag | marites.bumanglag@ext.cethos.com | 5c66e160-049e-4c98-9e3f-acf87986687a | English ⇄ Ilocano | 12-Jul-2019 |
| CSCD5620 | Joel Agcaoili | joel.agcaoili@ext.cethos.com | b368b13f-20e1-49a7-8988-f168594131f5 | English ⇄ Ilocano | 28-Sep-2020 |
| CSV0133 | Ji-woo Park | jiwoo.park@ext.cethos.com | 64dc4279-f492-4ca4-9b65-91abaf2ceb70 | Korean ⇄ English | 05-Nov-2019 |
| CSV0314 | Camille Dubois | camille.dubois@ext.cethos.com | b63e0d7b-7f84-448e-9996-648edb0c928e | English ⇄ French | 18-Feb-2021 |
| CSV0570 | Sanne de Vries | sanne.devries@ext.cethos.com | 61acaec6-b02f-47ab-bb4d-6d1281d74a22 | English ⇄ Dutch | 30-Jun-2020 |
| CSV1032 | Mateo Fernández | mateo.fernandez@ext.cethos.com | 53e8af3a-129f-4e19-8608-af135c0e92e9 | English → Spanish | 21-Aug-2019 |
| CSV1115 | Georgi Dimitrov | georgi.dimitrov@ext.cethos.com | 299aa850-ebcb-484c-8924-71155fbdc498 | English ⇄ Bulgarian | 14-Jan-2020 |
| CSV1471 | Anitha Subramaniam | anitha.subramaniam@ext.cethos.com | bea5ab32-8db3-47b3-9d90-865f46830091 | English ⇄ Tamil | 09-May-2021 |
| CSV2351 | Haruto Tanaka | haruto.tanaka@ext.cethos.com | 089e2706-7ddd-4906-9fe4-6675508c9baa | Japanese → English | **30-Jun-2019 (PRE-INCORP)** |
| CSV2498 | Karthik Murugan | karthik.murugan@ext.cethos.com | 1b5d3216-f533-4f10-adfe-7f9d0cf36c90 | English → Tamil | 03-Apr-2023 |
| CSV2987 | Ingrid Johansen | ingrid.johansen@ext.cethos.com | 1e0e9a01-a8d0-49c9-8141-3f395422658f | English ⇄ Norwegian | 16-Oct-2020 |
| CSV3648 | Nguyễn Thị Linh | linh.nguyen@ext.cethos.com | 8d2c3514-076e-4d37-ae2d-0a77bffef100 | English ⇄ Vietnamese | 09-Dec-2019 |
| CSV4601 | Harpreet Singh | harpreet.singh@ext.cethos.com | 71d2fb07-0685-4406-94f7-6f3a51b5749e | English → Hindi / Punjabi | 23-Mar-2020 |
| CSV4857 | Antoine Lefebvre | antoine.lefebvre@ext.cethos.com | 2812a989-a685-4931-bf71-38c3b7e3d518 | English ⇄ French | 15-Jul-2024 |
| CSV4894 | Wei Chen | wei.chen@ext.cethos.com | bc1c9574-d3d6-4e77-a896-8059b3b5ef2d | English ⇄ Mandarin | 30-Sep-2019 |
| CSV5222 | Sofia Oliveira | sofia.oliveira@ext.cethos.com | ac3c22c5-5a52-45e8-a24e-03542697118f | English → Portuguese | 11-Aug-2021 |
| CSV7631 | Priya Raman | priya.raman@ext.cethos.com | 5107a882-cc14-4a85-a9b6-bc2ae62c3622 | English ⇄ Tamil | 02-Nov-2020 |
| CSV7920 | Jean-Claude Uwimana | jeanclaude.uwimana@ext.cethos.com | 904993d8-ff11-4867-ac9e-6088b40a6940 | English ⇄ Kinyarwanda | 20-Jun-2022 |
| CSV7967 | Tahmid Rahman | tahmid.rahman@ext.cethos.com | 8a353ecd-2dfa-4a49-a4f9-1d31f76fe143 | English ⇄ Bengali | 08-Aug-2019 |
| CSV8177 | Layla Al-Sayed | layla.alsayed@ext.cethos.com | 3713f36c-292e-43c1-b9e5-2b607b617340 | English ⇄ Arabic | 19-Apr-2020 |
| CSV8208 | Lucía Gómez | lucia.gomez@ext.cethos.com | da1fb914-01c4-42aa-adcf-45388ca0556e | English ⇄ Spanish | 27-Jan-2025 |
| CSV8793 | Élodie Martin | elodie.martin@ext.cethos.com | bc3ed83b-66a2-44bd-8a90-7f957249cd78 | English → French / Spanish → French | 05-Aug-2020 |
| CSV9750 | Erik Lindqvist | erik.lindqvist@ext.cethos.com | fd30ccb5-f4de-4161-b9a0-4cb68ac74fed | Swedish → English / French → English | 22-Oct-2019 |

Profile URL pattern: `https://portal.cethos.com/admin/vendors/{vendor_id}`. They are visible in the Vendors list
(inactive is NOT hidden by default — `statusFilter` is opt-in); search `ext.cethos.com` or a code.

---

## 3. THE ACTIVE TASK — onboarding the 23 (e-sign package)

### 3a. User's decisions (authoritative)
- **NO `.docx` files.** Serve each onboarding package to the contractor as a **secure signed link in an email**.
- Contractor **reviews & e-signs** the package.
- On signature: **record the signature for an audit trail** AND **save the signed copy into the contractor's
  documentation/profile** — **exactly like the existing vendor NDA & GVSA signing flow.**
- Activate the contractor (`status=active`) once onboarding is complete.

### 3b. The onboarding package (from the user's sample)
Sample (one contractor, Georgi/CSV1115) saved at `tmp/onboarding/sample.docx`. It is a **7-document package**:
1. Independent Contractor Services Agreement
2. Confidentiality & Non-Disclosure Agreement
3. Data Security & Acceptable-Use Attestation
4. Conflict of Interest Declaration
5. Quality, SOP & Data-Protection Training Acknowledgement
6. Professional Code of Conduct Acknowledgement
7. Linguist Qualifications & Working-Languages Declaration

**Company:** Cethos Solutions Inc., corporation no. **12537494 Canada Inc.**, Business Number **781741533RC0001**,
Calgary, Alberta. **Company signer:** Raminder Shah, Director & CEO. Coordinators named: Amrita Shah / Bobby Rawat.
Return route in sample: email or upload via `timeclock.cethos.com`.

**Per-contractor merge fields** (all available in the table above): contractor name, reference code, service /
language pair (display form), **engagement effective date = date of joining**, contractor email.

### 3c. Content changes the user asked for (STATUS: PROPOSED, NOT applied, partially walked back)
1. **Accuracy** — contractor confirms accuracy of the data they provided in their **application AND CV** at submission
   (sample currently says "CV and this declaration" in Doc 7; broaden to "application and CV").
2. **Supersession** — this package supersedes/replaces ALL prior documentation signed by the contractor **from their
   date of joining**, with Cethos Solutions Inc. **and its current or former affiliates**.
3. **Corporate history** — **Cethos Solutions Inc. was incorporated 10 July 2019**, successor to **Cethos Solutions,
   a sole-proprietorship LSP based in India** (the predecessor the contractors originally engaged with).
- **Pre-incorporation edge case:** **Haruto Tanaka joined 30-Jun-2019**, before the Inc. existed (10-Jul-2019) — his
  agreement cannot be "made as of" that date by the Inc.; needs "made as of [signature date], in respect of an
  engagement that commenced 30 June 2019 with the predecessor firm and is continued by the Company."
- **⚠ LAST USER MESSAGE: "we don't need to add this to the documents."** AMBIGUOUS — confirm whether to drop **all
  three** changes or only the **corporate-history/Haruto** part, before templating. (Accuracy + supersession were the
  user's own earlier asks, so probably keep those.) **This question is unanswered.**
- All onboarding wording should get a **legal review** before sending, and must **not imply ISO 17100 certification**
  (Cethos is working toward it, not certified — see [[feedback-cethos-not-iso-certified]]).

### 3d. The e-sign machinery to REUSE (do not reinvent)
The existing vendor NDA/GVSA signing is the template:
- **`vendor_nda_signatures`** table — columns incl. `vendor_id, application_id, nda_template_id, signed_full_name,
  signed_email, signed_at, signer_ip, signer_user_agent, signature_image_path, signed_html_snapshot,
  signed_pdf_storage_path, is_current, superseded_by_id, agreement_type, verification_log`. **`agreement_type`** in
  use: **`nda`** (1182 sigs) and **`gvsa`** (763). 1,945 sigs across 1,134 vendors. This IS the audit trail + the
  signed-PDF store (= "saved into the profile").
- **`nda_templates`** (template content), **`certification_affidavit_templates`**, **`qms.nda_agreements`**,
  **`qms.v_nda_expiring_soon`**.
- Edge functions: **`cvp-applicant-sign-nda`**, **`cvp-applicant-portal-invite`**, shared **`_shared/nda-gate.ts`**.
- Buckets: **`vendor-declarations`**, `vendor-cvs`, `vendor-certifications`, `cvp-applicant-cvs`.

**FIRST job next session:** trace the actual NDA/GVSA flow end-to-end in code — how the signed LINK in the email is
generated, how the template renders to the signer, how a signature is captured + the signed PDF produced + stored,
and how a NEW `agreement_type` (e.g. `onboarding` or one per the 7 docs) is added. Then replicate for the package.
(I had NOT yet traced this flow when the hand-off was written.)

### 3e. Outbound caution
Emailing signing links to 23 external people is an outbound action — **draft/dry-run first, get explicit user go
before anything sends.** Bulk email: send via Brevo throttled, never loop a per-record edge fn (per CLAUDE.md).

---

## 4. Also pending from the user
- **Country of residence** — user is uploading a sheet; bulk-fill `vendors.country` (column exists; not in the
  onboarding doc's merge set, so not blocking the package). The admin profile showed a "Country" field.
- **Payment & invoice history of the 23 contractors** — user will upload this "for record." Next session records it
  against the 23 `vendor_id`s. Investigate where contractor PAYABLES/payments live: candidates `cvp_payments`,
  vendor payables tables, `vendor-invoices` bucket. (Customer invoices = `customer_invoice_*` / `generate-invoice-pdf`
  — that's the AR side, NOT this.) Confirm the table before inserting.
- **Rates / currency** — likely USD, not the CAD default.

---

## 5. Technical gotchas (carry forward — these bit us)
- **`pdftotext` returns 0 chars on these blinded CVs** (no ToUnicode map). **Use PyMuPDF** (`pip install pymupdf`,
  Python 3.14 OK): `fitz.open(f); "\n".join(p.get_text() for p in doc)`. Write to UTF-8 files (Windows console is cp1252).
- **`supabase storage cp` (CLI v2.70, linked + authed) fails on:** (1) absolute Windows source `D:/…` (drive-letter
  colon breaks URI parsing → "Unsupported operation / copy between local directories"); (2) unicode/spaces in source
  filename. **Fix: stage files under clean ASCII names and pass a RELATIVE path.** `cp` won't overwrite an existing
  object. **`storage rm` PROMPTS `[y/N]`** — non-interactive it defaults N but exits 0 (silent no-op). Use
  **`echo y | supabase storage rm -r "ss:///bucket/<prefix>"`**. All storage cmds need `--experimental`.
- **MCP `execute_sql`:** multi-statement returns only the LAST result set; **temp tables work** within one
  `BEGIN;…COMMIT;` batch (used `create temp table _x(...) on commit drop`). For big writes, generate compact SQL with a
  Python script + temp-table VALUES + `insert…select` so the DB generates ids (avoids hand-transcribing UUIDs/unicode).
- **Vendor domains:** `cvp_translator_domains.translator_id` FKs to **`cvp_translators`** (recruitment), NOT `vendors`
  — so it does NOT apply to direct vendors. Vendor-level domains = **`vendors.specializations`** (jsonb, free-text,
  inconsistent existing values). Formal ISO per-pair qualification = `qms.subject_matter_qualifications` (irreversible
  — defer to onboarding). qms.subject_matters mapping: COA=`ls_clinical_trials`, Life Sciences/Medical=`life_sciences`,
  Pharma=`ls_pharmaceutical`, Cognitive Debriefing=`ls_cognitive_debriefing`.
- **Vendor CV mechanism = `vendor_cvs` table + `vendor-cvs` bucket** (path `{vendor_id}/v{n}-{epoch}-{name}`), NOT a
  column on `vendors`.
- **Languages:** `public.languages.code` is lowercase; roster/vendor pairs are UPPERCASE; the app normalizes case.
  Added `hil` (Hiligaynon) + `st` (Southern Sotho) this session (tier 1, active). `rw` (Kinyarwanda) exists; **verify
  `ilo` (Ilocano) is present** — pairs used `ILO`.
- Onboarding/QMS qualification is IRREVERSIBLE (append-only `qms.qualification_audit_log`); creating a plain vendor
  row + pairs + specialization + CV is reversible. We stayed on the reversible side.

## 6. File locations
- **Working scripts:** `tmp/usman-roster/` — `extract.py`, `build-inventory.py`, `build-write.py`, `emit-v2.py`,
  `stage.py`, `emit-contractors.py` + `contractors.sql`, `emit-cvs.py` + `cvs.sql`, `plan.json`, `cv-data.json`, etc.
- **Onboarding sample:** `tmp/onboarding/sample.docx` (Georgi/CSV1115).
- **Deliverable Excels + translator CVs:** `C:\Users\RaminderShah\Downloads\Blinded CVs for IQVIA-20260624T215440Z-3-001\`
  (`Usman-Roster-CV-Inventory.xlsx`, `Usman-Khan-Roster-Handle-Mapping.xlsx`, `Translator CVs (set aside)\`).
- **Memory:** `feature_usman_roster_iqvia_blinded_cvs_2026_06_24.md` (auto-memory) carries the durable version.

## 7. Exact next steps (suggested order)
1. Confirm with user: which of the 3 doc-content changes to keep (the "we don't need to add this" ambiguity).
2. Trace the NDA/GVSA e-sign flow in code (§3d) → design how to register the onboarding package as a signable
   agreement type that emails a link, captures signature, stores signed PDF in `vendor_nda_signatures` (audit +
   profile).
3. Build per-contractor onboarding content (7 docs, merged fields, the kept changes, Haruto edge case).
4. Dry-run on ONE contractor (e.g. a test record), verify the signed-link → sign → audit → profile-save loop.
5. Get user go → send to the 23 (Brevo, throttled). Track who signed.
6. On full execution: bulk-fill country (user sheet), record payment/invoice history (user upload), set rates/currency,
   then flip the 23 to `status=active`.
