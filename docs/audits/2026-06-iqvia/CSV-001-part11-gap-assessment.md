# Computer System Validation & 21 CFR Part 11 — Gap Assessment

| | |
|---|---|
| **Document Title** | CSV & 21 CFR Part 11 Gap Assessment — Cethos Portal |
| **Document Number** | CSV-001 |
| **Version** | 1.0 |
| **Effective Date** | June 24, 2026 |
| **Review Date** | Annually, or on a material system change |
| **Document Owner** | Acting Quality Manager (Founder & CEO), with IT |
| **Approved By** | Raminder Shah — Founder & CEO |
| **Scope** | The Cethos web portal (admin + vendor + customer) and its Supabase backend, as used for COA linguistic-validation service delivery |
| **Reference** | 21 CFR Part 11; FDA *Computerized Systems Used in Clinical Investigations* (2007); FDA *General Principles of Software Validation* (2002); EMA computerised-systems guideline (2023); MHRA GxP Data Integrity (2018); GAMP 5 |

> **Honest position (per MD ruling).** The Cethos portal is **not a formally validated GxP/Part 11 system today**. It does, however, implement a substantial set of the technical and procedural controls Part 11 requires. This assessment states the position as **"Partially compliant"**, inventories existing controls against each Part 11 clause, and sets out a risk‑based remediation roadmap. **No claim of full validation is made.**

## 1. System characterization & Part 11 applicability

The Cethos portal is a **business / service‑delivery system**: it manages vendor qualification, orders/projects, invoicing, and the QMS register. **It is not an electronic data capture (EDC) system and does not capture patient/subject data or COA responses from trial participants.** COA instruments and trial materials are handled as controlled documents during a project, not stored as the system of record for trial data.

**Implication:** the highest Part 11 obligations attach to systems that *create, modify, or store regulated trial records*. For Cethos the relevant Part 11 surface is narrower — the integrity of **supplier‑qualification records, project records, audit trails, and electronic signatures (NDAs/approvals)** — for which the controls below apply. This scoping is itself a key data‑integrity control (it bounds what must be validated).

## 2. Sub-processor / data-flow inventory (systems touching the service)

| Sub‑processor | Role | Trial/COA content? | Residency |
|---|---|---|---|
| **Supabase** | Core DB, Auth, Storage, Edge Functions | Yes (documents in storage) | confirm region |
| Anthropic (Claude) | AI screening/assistance | Metadata + document text | US |
| Mistral / Google Document AI | OCR | Document text | US |
| Brevo / Mailgun | Transactional + OTP email | Metadata only | EU / US |
| Stripe | Payments | No trial content | US |
| Twilio / RingCentral | SMS / voice | No trial content | US |
| Dropbox | Project file storage | Possibly (project folders) | confirm |
| Sentry | Error monitoring | Metadata only | confirm |

*Action: confirm each region + DPA/BAA status; flag any that process COA instrument content vs metadata only (data‑residency note for the clinical context).*

## 3. Control inventory vs 21 CFR Part 11 (live-verified 2026‑06‑24)

### Subpart B — Electronic Records
| Clause | Requirement | Cethos control | Status |
|---|---|---|---|
| **11.10(a)** | System validation | No formal validation lifecycle/documentation yet | 🔴 **Gap** |
| **11.10(b)** | Accurate, complete copies (human‑readable + electronic) | DB exports; PDF generation (quotes/invoices/PO); human‑readable record views | 🟢 |
| **11.10(c)** | Record protection over retention period | Append‑only audit logs; Supabase point‑in‑time backups; storage retention; ≥5y QMS retention (SOPs) | 🟢 |
| **11.10(d)** | Limit access to authorized individuals | Supabase Auth + **Row‑Level Security on 293/293 public tables (0 unprotected)**; role‑based staff access; vendor‑scoped JWT | 🟢 |
| **11.10(e)** | Secure, computer‑generated, time‑stamped audit trail | `qms.qualification_audit_log` + `qms.quality_event_log` — **append‑only (no‑update/no‑delete triggers)**, timestamped, hash‑chained; `assignment_eligibility_events`, `performance_events`, `cvp_application_decisions` | 🟢 |
| **11.10(f)** | Operational checks (sequencing) | Workflow state machines (recruitment pipeline, order steps) enforce sequence | 🟡 Partial (document) |
| **11.10(g)** | Authority checks | `requireStaff` + role checks (super_admin); RLS authority enforcement | 🟢 |
| **11.10(i)** | Personnel education/training | Staff training system; **TRAIN‑COA‑001** for COA linguists | 🟢 |
| **11.10(j)** | Accountability policies | SOP suite + IT‑001…005 policies | 🟢 |
| **11.10(k)** | Controls over documentation | `/admin/sops` module — **versioned, immutable‑after‑approval**; Documents & Manuals library with version history | 🟢 |
| **11.30** | Open‑system controls (encryption) | TLS in transit; Supabase encryption at rest | 🟡 Partial (document the encryption controls) |

### Subpart B — Electronic Signatures
| Clause | Requirement | Cethos control | Status |
|---|---|---|---|
| **11.50** | Signature manifestation (name, date/time, meaning) | **1,732 NDA e‑signatures** capturing `signed_full_name`, `signed_at`, `signer_ip`, `signer_user_agent`, `signed_html_snapshot` (full document as signed), purpose | 🟢 |
| **11.70** | Signature/record linking | Signatures bound to the vendor/application record; `is_current` + supersede chain; `verification_log` | 🟢 |

### Subpart C — Electronic Signatures (identity & controls)
| Clause | Requirement | Cethos control | Status |
|---|---|---|---|
| **11.100** | Unique signatures, verified identity | Email‑verified accounts; one identity per signer | 🟡 Partial (formal identity‑proofing procedure) |
| **11.200** | Signature components & controls | Clickwrap + authenticated session bound to the record; not a re‑authenticated per‑signing ceremony | 🟡 Partial |
| **11.300** | ID codes / password controls | Supabase Auth (passwordless OTP / magic‑link); no shared accounts | 🟡 Partial (document the auth policy) |

**Summary:** 🟢 11 controls in place · 🟡 6 partial (mostly *documentation* of an existing control) · 🔴 1 true gap (formal validation).

## 4. Gaps & risk-based remediation roadmap

| # | Gap | Risk | Remediation | Priority |
|---|---|---|---|---|
| 1 | No formal CSV / validation documentation (11.10(a)) | Med (business system, not EDC) | Adopt a **GAMP 5 category‑appropriate** CSV SOP; produce a validation summary (URS → risk assessment → IQ/OQ/PQ‑lite) for the **COA‑relevant modules** (qualification, audit trail, e‑signature). Risk‑scaled, not full GxP validation. | High |
| 2 | E‑signature ceremony rigor (11.200) | Low–Med | Document the clickwrap‑signature control; evaluate re‑authentication at signing for high‑impact approvals | Med |
| 3 | Encryption controls not documented (11.30) | Low | Write an encryption/data‑in‑transit‑and‑at‑rest control statement (IT‑003 extension) | Med |
| 4 | Sub‑processor DPAs / residency not consolidated | Med (clinical data residency) | Complete the §2 inventory; obtain/record DPAs; flag US‑resident processors that touch instrument content | High |
| 5 | Identity‑proofing procedure (11.100) | Low | Document account‑provisioning + identity verification for signers | Low |

## 5. Audit position statement

Cethos presents the portal as a **controlled business system with strong data‑integrity foundations** — full row‑level access control, append‑only time‑stamped audit trails, immutable‑after‑approval document control, and record‑linked electronic signatures — **with a defined, risk‑based plan to formalize computer‑system validation** for the modules supporting COA service delivery. Cethos does not claim, and is not representing, a fully validated GxP system; the validation roadmap (item 1 above) is the controlling CAPA‑style commitment.

## 6. Review & version control

| Version | Date | Summary | Approved By |
|---|---|---|---|
| 1.0 | Jun 24, 2026 | Initial gap assessment — controls inventory (live‑verified) + remediation roadmap | Raminder Shah |

*CSV-001 | Version 1.0 (Active) | Cethos Solutions | source: live system inventory 2026‑06‑24*
