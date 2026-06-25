# IT Security — Live Evidence Pack

**Purpose:** factual snapshot of the technical controls referenced by the IT-001…IT-005 policies, pulled live from the production environment for the IQVIA audit (29–30 Jun 2026). Re-runnable so the auditor can see the controls are real, not aspirational.

**Snapshot date:** 2026-06-20 · **Source:** Supabase project `lmzoyezvsjgsxveoakdr` (production).

---

## 1. Platform / architecture
| Component | Detail |
|---|---|
| Core platform | **Supabase** — managed PostgreSQL **17.6**, Auth, Storage, Edge Functions |
| Cloud / region | AWS **us-east-1** (project created 2026-01-19) |
| Frontends | React/Vite (admin portal, customer portal, vendor portal, public apply) — hosted on Netlify/Vercel *(confirm + attach config)* |
| Corporate email / identity | **Microsoft 365 / Exchange Online** (`cethos.com`) |
| Transactional email | Brevo (notifications) + Mailgun (recruiting inbound/OTP) |
| Error monitoring | Sentry |
| Sub-processor register | 14 processors — see `approved-supplier-list.md` §B and SOP-SM-002 |

> **Data-residency note (audit-material):** the Canadian legal entity (12537494 Canada Inc. o/a Cethos Translations, Calgary AB) hosts production data — including uploaded trial/COA documents — in the **US (us-east-1)**. This is documented honestly in IT-003 and tracked as a risk item.

## 2. Access control / logical security
| Metric | Value |
|---|---|
| Internal staff users | **9** (super_admin 3 · admin 4 · reviewer 2) |
| Staff linked to a single auth identity (`auth.users`) | 9 / 9 |
| Public tables | 290 |
| Public tables with **Row-Level Security enabled** | **252 (87%)** |
| RLS policies (public) | 607 |
| RLS policies (qms) | 51 |
| Admin auth | Supabase Auth (email/OTP); vendor & applicant portals use scoped session tokens |

## 3. Audit trail / tamper-evidence (also supports 21 CFR Part 11)
| Control | Object |
|---|---|
| **Hash-chained, append-only** audit log (no UPDATE / no DELETE) | `qms.qualification_audit_log` (**967 rows**), `tr.audit_log` |
| WORM (no DELETE) | `public.notification_log` (**5,541 rows**), `public.order_workflow_steps`, `qms.assignment_eligibility_events` |
| WORM (no post-approval UPDATE) | `step_deliveries` (roster), append-only event tables |
| Row-level audit triggers (write history on change) | `qms.role_qualifications`, `qms.competence_evidence`, `qms.nda_agreements` |

## 4. Change control
- Source control: **GitHub** — admin repo (`cethos_app_figma_design_v1`) + vendor repo (`cethos-vendor`).
- Every change via **pull request** (review before merge); DB changes via **Supabase migrations** committed to the repo (repo mirrors prod).
- Edge-function deploys via Supabase CLI (`--no-verify-jwt` where the function does its own auth).

## 5. Backup & recovery
- Supabase **managed automated backups** + **Point-in-Time Recovery** (retention per plan tier — *confirm tier + attach backup config / last restore-test record*).
- Storage buckets (CVs, certifications, trial documents) carried in the managed platform.

## 6. Encryption
- **At rest:** AES-256 (Supabase/AWS managed). **In transit:** TLS 1.2+ (HTTPS to all endpoints; Postgres over TLS).

---

### Re-runnable queries (for the auditor)
```sql
-- RBAC tiers
SELECT role, count(*) FROM public.staff_users GROUP BY role;
-- RLS coverage
SELECT count(*) total, count(*) FILTER (WHERE c.relrowsecurity) rls
FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename AND c.relnamespace='public'::regnamespace
WHERE t.schemaname='public';
SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','qms');
-- Tamper-evidence triggers
SELECT event_object_schema, event_object_table, trigger_name, event_manipulation
FROM information_schema.triggers
WHERE trigger_name ~* 'worm|no_delete|no_update|audit|hash_chain'
ORDER BY 1,2;
```

*Open evidence to attach before the audit:* Supabase plan tier + backup retention window + a dated restore-test record; Netlify/Vercel hosting config; M365 admin security baseline (MFA enforcement); sub-processor DPAs (SOP-SM-002).
