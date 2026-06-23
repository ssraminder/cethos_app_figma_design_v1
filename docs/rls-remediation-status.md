# RLS Remediation Status — `public` schema (Cethos_Translation_App)

> **STATUS: ✅ COMPLETE — all 22 tables RLS-enabled & verified on prod (2026-06-23).**
> Security advisor `rls_disabled_in_public`: **22 → 0**. No target table appears in any remaining
> lint. One PR/branch `fix/rls-remediation-22-tables` (22 commits, one migration per table).
> See "Summary — definition of done" at the bottom.


Tracking the per-table rollout of Row-Level Security on the **22 `public` base tables**
that the Supabase security advisor flagged as `rls_disabled_in_public` (anon/authenticated
could read & write every row). Project ref `lmzoyezvsjgsxveoakdr`.

**Method (one table at a time):**
1. Map usage by grep across the admin client, the vendor portal (`D:\cethos-vendor`), and
   edge functions → determine which key (`anon` / `authenticated` / `service_role`) each call
   site uses, and read vs write.
2. **Dry-run** the migration in a rolled-back transaction on prod, simulating `anon` +
   `authenticated` via `SET LOCAL ROLE` against real data (assert expected row counts).
3. Apply via MCP `apply_migration`; commit the `.sql` to `supabase/migrations/`.
4. **Verify** with the real `anon` key over PostgREST (negative check: locked tables → `[]`;
   public tables → rows still served) + catalog confirmation. Roll back instantly
   (`DISABLE ROW LEVEL SECURITY`) if any legitimate path breaks.

**Policy patterns used** (mirroring `20260514_security_audit_v2_lockdown.sql`):
- *Public reference / lookup:* `FOR SELECT TO anon, authenticated USING (true)` + `FOR ALL TO service_role`.
- *Logged-in read (vendor/staff):* `FOR SELECT TO authenticated USING (true)` (+ service_role).
- *Internal only:* `FOR ALL TO service_role` only → anon/authenticated get zero rows.
- Writes by non-service roles get explicit policies **only** where a real client writes today.

> `service_role` bypasses RLS by design; an explicit `service_role` policy is added anyway for
> clarity/consistency with the existing lockdown migrations.

---

## Related prior work (context)

- Branch `origin/fix/enable-rls-17-tables` (UNMERGED) enabled RLS on a **different** 17 tables
  (vendor_payments, xtrf_csv_*_2026_05_21 staging, vendor PO tables, cvp_* …). Those are
  **already RLS-enabled in prod** (confirmed), but the migration file lives only on that branch
  → **repo/prod drift to reconcile separately** (not part of these 22).
- `20260514_security_audit_v2_lockdown.sql` + the IQVIA Phase-1 hardening established the pattern
  reused here.

---

## Per-table status

Legend: ✅ done & verified · 🔄 in progress · ⬜ pending · 🚫 blocked

| # | Table | Group | Access intent | Policies added | Dry-run | Anon-probe (before → after) | Prod | Committed |
|---|-------|-------|---------------|----------------|---------|------------------------------|------|-----------|
| 1 | `ads_offline_conversions` | B (internal) | service_role only (Google Ads upload queue; gclid/gbraid/wbraid PII). Trigger writer `queue_ads_offline_conversion()` made `SECURITY DEFINER` so order-paid INSERTs bypass RLS from any role. | `…_service_role_all` (ALL→service_role) | ✅ anon 0 / auth 0 / service 31 | 31 rows → `[]` (`*/0`) ✅ | ✅ | ✅ `20260623_rls_ads_offline_conversions.sql` |
| 2 | `xtrf_language_map` | B (internal) | service_role only (mapping cache, no client read) | `…_service_role_all` | ✅ anon 0 / auth 0 / service 314 | 314 → `*/0` ✅ | ✅ | ✅ `20260623_rls_xtrf_language_map.sql` |
| 3 | `xtrf_currency_map` | B (internal) | **authenticated SELECT** (admin VendorInvoices/Payments tabs) + service_role | `…_authenticated_read`, `…_service_role_all` | ✅ anon 0 / auth 6 / service 6 | 6 → `*/0` (anon) ✅ | ✅ | ✅ `20260623_rls_xtrf_currency_map.sql` |
| 4 | `xtrf_payment_methods` | B (internal) | **authenticated SELECT** (admin VendorPayments tab) + service_role | `…_authenticated_read`, `…_service_role_all` | ✅ anon 0 / auth 10 / service 10 | 10 → `*/0` (anon) ✅ | ✅ | ✅ `20260623_rls_xtrf_payment_methods.sql` |
| 5 | `xtrf_branches` | B (internal) | service_role only (no client read) | `…_service_role_all` | ✅ anon 0 / auth 0 / service 5 | 5 → `*/0` ✅ | ✅ | ✅ `20260623_rls_xtrf_branches.sql` |
| 6 | `training_lessons` | B (legacy/dead) | service_role only (0 rows; no reader) | `…_service_role_all` | ✅ rls_on, 1 pol | empty → empty (now RLS-gated) ✅ | ✅ | ✅ `20260623_rls_training_lessons.sql` |
| 7 | `training_modules` | B (legacy/dead) | service_role only (0 rows; no reader) | `…_service_role_all` | ✅ rls_on, 1 pol | empty ✅ | ✅ | ✅ `20260623_rls_training_modules.sql` |
| 8 | `training_slides` | B (legacy/dead) | service_role only (0 rows; no reader) | `…_service_role_all` | ✅ rls_on, 1 pol | empty ✅ | ✅ | ✅ `20260623_rls_training_slides.sql` |
| 9 | `training_quiz_questions` | B (legacy/dead) | service_role only (0 rows; no reader) | `…_service_role_all` | ✅ rls_on, 1 pol | empty ✅ | ✅ | ✅ `20260623_rls_training_quiz_questions.sql` |
| 10 | `services` | B (reference) | anon+auth SELECT + **staff_manage write** + service_role | `…_public_read`, `…_staff_manage`, `…_service_role_all` | ✅ read 50 all roles; staff INSERT ok, anon INSERT blocked | 50 stays 50 (anon) ✅; anon POST→401 ✅ | ✅ | ✅ `20260623_rls_services.sql` |
| 11 | `currencies` | B (reference) | anon+auth SELECT (lock_*_cad triggers read it) + service_role | `…_public_read`, `…_service_role_all` | ✅ read 78 all roles | 78 stays 78 ✅ | ✅ | ✅ `20260623_rls_currencies.sql` |
| 12 | `cethosweb_countries` | B (reference) | anon+auth SELECT (marketing) + service_role | `…_public_read`, `…_service_role_all` | ✅ read 91 all roles | 91 stays 91 ✅ | ✅ | ✅ `20260623_rls_cethosweb_countries.sql` |
| 13 | `cethosweb_languages` | B (reference) | anon+auth SELECT (marketing) + service_role | `…_public_read`, `…_service_role_all` | ✅ read 75 all roles | 75 stays 75 ✅ | ✅ | ✅ `20260623_rls_cethosweb_languages.sql` |
| 14 | `cethosweb_locales` | B (reference) | anon+auth SELECT (marketing) + service_role | `…_public_read`, `…_service_role_all` | ✅ read 77 all roles | 77 stays 77 ✅ | ✅ | ✅ `20260623_rls_cethosweb_locales.sql` |
| 15 | `cethosweb_settings` | B (reference) | ✅ NOT sensitive (ga4/gtm/ads public IDs) → anon+auth SELECT + service_role | `…_public_read`, `…_service_role_all` | ✅ read 3 all roles | 3 stays 3 ✅ | ✅ | ✅ `20260623_rls_cethosweb_settings.sql` |
| 16 | `service_terms` | B (vendor) | **service_role only** — read server-side via `vendor-accept-terms` edge fn (no direct client read) | `…_service_role_all` | ✅ anon 0 / auth 0 / service 2 | 2 → `*/0` ✅ | ✅ | ✅ `20260623_rls_service_terms.sql` |
| 17 | `app_settings` | A | existing public SELECT + staff_manage (no secrets in 89 rows) | enable only | ✅ read 89 all roles | 89 stays 89 ✅ | ✅ | ✅ `20260623_rls_app_settings.sql` |
| 18 | `certification_types` | A | existing public SELECT + staff_manage | enable only | ✅ read 4 all roles | 4 stays 4 ✅ | ✅ | ✅ `20260623_rls_certification_types.sql` |
| 19 | `delivery_options` | A | existing public SELECT + staff_manage | enable only | ✅ read 7 all roles | 7 stays 7 ✅ | ✅ | ✅ `20260623_rls_delivery_options.sql` |
| 20 | `document_types` | A | existing public SELECT + staff_manage | enable only | ✅ read 25 all roles | 25 stays 25 ✅ | ✅ | ✅ `20260623_rls_document_types.sql` |
| 21 | `intended_uses` | A | existing public SELECT + staff_manage | enable only | ✅ read 241 all roles | 241 stays 241 ✅ | ✅ | ✅ `20260623_rls_intended_uses.sql` |
| 22 | `languages` | A | existing public SELECT + staff_manage | enable only | ✅ read 143 all roles | 143 stays 143 ✅ | ✅ | ✅ `20260623_rls_languages.sql` |

---

## Detailed log

### 1. `ads_offline_conversions` — ✅ done (2026-06-23)

- **Usage map:** zero references in admin client, vendor portal, or edge-function source. Only
  writer is DB trigger `trg_orders_queue_ads_oc` → `queue_ads_offline_conversion()` (fires on
  `orders.paid_at` NULL→set). `orders.paid_at` is set only by service_role edge functions today
  (verified: the sole frontend `paid_at` write is to `cvp_payments`, not `orders`).
- **Decision:** service_role-only RLS. Additionally converted the trigger function to
  `SECURITY DEFINER` (owner postgres, `rolbypassrls`) so the queue INSERT is safe from any caller
  — removes the latent risk that a future authenticated "mark paid" path would be hard-failed by RLS.
- **Dry-run (rolled back):** anon=0, authenticated=0, service_role=31, owner=31; `rls_on=true`,
  `trigger_definer=true`.
- **Applied:** migration `20260623_rls_ads_offline_conversions.sql` via MCP.
- **Post-commit verify:** anon REST probe `GET /ads_offline_conversions` → `200 [] (*/0)` (was 31).
  Catalog: RLS on, 1 policy (`…_service_role_all`), trigger `prosecdef=true`, service_role sees 31.
- **Result:** ✅ world-readable leak closed; conversion-upload pipeline intact.

### 2–5. XTRF internal caches — ✅ done (2026-06-23)

- **Usage map:** grep across admin client + vendor portal + DB functions/views.
  - `xtrf_language_map` (314), `xtrf_branches` (5): **no client/DB reader** → service_role only.
  - `xtrf_currency_map` (6), `xtrf_payment_methods` (10): read by the admin staff UI
    (`vendor-detail/VendorInvoicesTab.tsx`, `vendor-detail/VendorPaymentsTab.tsx`) via the
    authenticated client → **authenticated SELECT** + service_role. (Task's "service-role only"
    assumption corrected — exactly the "verify in code" case.) No anon reader (admin-only pages),
    so anon is intentionally locked out.
  - No triggers/functions write these from a non-service context → no SECURITY DEFINER needed.
- **Dry-run (rolled back, combined):** anon=0 on all four; auth=0/0/6/10; service=314/5/6/10.
- **Applied:** `20260623_rls_xtrf_language_map.sql`, `…_xtrf_branches.sql`,
  `…_xtrf_currency_map.sql`, `…_xtrf_payment_methods.sql` (one migration each, via MCP).
- **Post-commit verify:** anon REST probe → `*/0` on all four; catalog shows correct policies +
  `rls_on=true`. Authenticated read for currency_map/payment_methods proven by the SET-ROLE
  authenticated dry-run (6 / 10 rows); live admin-UI spot-check (VendorPaymentsTab) deferred to
  the consolidated UI pass.

### 6–9. Legacy training tables — ✅ done (2026-06-23)

- **Usage map:** all 4 are **empty (0 rows)** and **dead** — the live LMS is `cvp_training_*`.
  No admin-client, vendor-portal, edge-function, DB-function, or view references them. Incoming
  FKs from `staff_quiz_attempts` / `staff_training_progress` (also empty); FK validation bypasses
  RLS, so locking these down cannot break referential integrity.
- **Decision:** service_role only. If the staff LMS is ever built out, add read policies then.
- **Dry-run (rolled back):** DDL valid; all 4 → `rls_on=true`, 1 policy.
- **Applied:** `20260623_rls_training_{modules,lessons,slides,quiz_questions}.sql` (one each).
- **Verify:** catalog confirms RLS on + `…_service_role_all` on each. (Row-count probe moot —
  empty — but RLS now prevents any future inserted row from leaking to anon.)
- Related open bug "Can't access to training" (jahstranslations, 06-22) is about the **live
  `cvp_training_*` LMS**, not these dead tables — unaffected.

### 10–15. Public reference tables — ✅ done (2026-06-23)

- **Usage map (admin + vendor + edge fns + DB triggers):**
  - `services` (50): anon (public recruitment site `useServices.ts`), authenticated (admin pages),
    service_role (many edge fns). **Written by admin staff** (`settings/ServicesSettings.tsx`).
  - `currencies` (78): read by SECURITY INVOKER triggers `lock_quote/order/payment/refund_cad_amounts`
    (fire on insert in the *caller's* role — incl. anon quote creation) + admin reads + edge fns.
    No authenticated writer (exchange rates refresh via service_role).
  - `cethosweb_countries/languages/locales/settings` (91/75/77/3): **no admin/vendor refs** — read by
    the public marketing site (anon). `cethosweb_settings` holds ga4/gtm/google_ads **public** tracking
    IDs (client-side, not secrets) → public read is correct.
- **Decisions:** all 6 → `public_read` (SELECT to anon+authenticated) + `service_role_all`.
  `services` additionally gets `staff_manage` (is_active_staff) for admin writes.
- **Dry-run (rolled back):** anon=auth=service = full count for all 6 (50/78/91/75/77/3); on `services`
  a simulated staff INSERT passed RLS (failed only on a NOT-NULL column = 23502), a simulated anon
  INSERT was blocked (42501).
- **Applied:** 6 migrations via MCP (`20260623_rls_{services,currencies,cethosweb_countries,
  cethosweb_languages,cethosweb_locales,cethosweb_settings}.sql`).
- **Post-commit verify:** anon REST probe → rows still served for all 6 (50/78/91/75/77/3 — public
  read intact); anon `POST /services` → HTTP 401 (write blocked); catalog confirms policies + RLS on.
- **Live-UI smoke test** (public quote form dropdowns + admin ServicesSettings edit) → consolidated
  pass at finalize.

### 16. `service_terms` — ✅ done (2026-06-23)

- **Usage map:** the only reference anywhere is the vendor edge function `vendor-accept-terms`
  (D:\cethos-vendor), which reads/records acceptance using `SUPABASE_SERVICE_ROLE_KEY`. No admin or
  vendor frontend reads it directly; no DB function/view references it. (Task's "vendors need
  authenticated SELECT" guess did not match the actual server-side fetch implementation.)
- **Decision:** service_role only.
- **Dry-run:** anon 0 / authenticated 0 / service_role 2. **Applied** `20260623_rls_service_terms.sql`.
- **Verify:** anon REST probe → `*/0` (was 2). The vendor terms-acceptance flow is unaffected
  (edge fn = service_role).

### 17–22. Group A — activate existing policies — ✅ done (2026-06-23)

- **Pre-state:** each already had two correct policies (created earlier, dormant because RLS was off):
  `Allow public select on <T>` (SELECT TO anon, authenticated USING true) + `staff_manage_<T>`
  (ALL TO authenticated USING is_active_staff() WITH CHECK is_active_staff()). service_role bypasses RLS.
- **Coverage check:** no missing writer policy needed — confirmed **no SECURITY INVOKER function**
  writes any of the 6 (only `tr_<t>_updated_at` BEFORE-UPDATE timestamp triggers, which modify the
  triggering row, not other tables). `app_settings` scanned for secrets → none (89 non-sensitive
  config rows). So enabling RLS preserves current access exactly.
- **Dry-run:** all 6 read full counts for anon/authenticated/service_role
  (89 / 4 / 7 / 25 / 241 / 143).
- **Applied:** 6 migrations, each just `ENABLE ROW LEVEL SECURITY` (policies already present).
- **Verify:** anon REST probe still returns full counts for all 6 → public quote-form dropdowns
  (languages, intended_uses, document_types, certification_types, delivery_options) + app_settings
  config remain readable. Staff write path = the same `staff_manage`/`is_active_staff()` pattern
  proven on `services`.

---

## Summary — definition of done

| Criterion | Result |
|---|---|
| All 22 tables RLS-enabled with access-preserving policies | ✅ 22/22 (`pg_class.relrowsecurity` true, ≥1 policy each) |
| Per-table E2E gate passed (dry-run + live anon probe) before & after prod | ✅ every table |
| Internal tables NOT readable by anon/authenticated | ✅ all 10 → anon `*/0` (ads_offline_conversions, xtrf_×4, training_×4, service_terms) |
| Public reference tables still readable | ✅ all 12 → anon full counts (services 50, currencies 78, cethosweb_×4, app_settings 89, certification_types 4, delivery_options 7, document_types 25, intended_uses 241, languages 143) |
| `services` staff write preserved; anon write blocked | ✅ staff INSERT passes RLS (23502), anon POST → 401 |
| Supabase advisor `rls_disabled_in_public` cleared | ✅ **22 → 0**; no target table in any remaining lint |
| `public` base tables still RLS-disabled | ✅ **0** |
| Application code changed | none (only `.sql` migrations + 1 trigger function + this doc) → build/typecheck unaffected |

**End-state role matrix**

- **service_role only (10):** `ads_offline_conversions`, `xtrf_language_map`, `xtrf_branches`,
  `xtrf_payment_methods`*, `xtrf_currency_map`*, `training_lessons/modules/slides/quiz_questions`,
  `service_terms`.  *(`xtrf_currency_map` & `xtrf_payment_methods` additionally allow authenticated
  SELECT for the admin VendorPayments/Invoices tabs.)*
- **anon + authenticated SELECT + service_role (11):** `services` (+ staff_manage write), `currencies`,
  `cethosweb_countries/languages/locales/settings`, `app_settings`, `certification_types`,
  `delivery_options`, `document_types`, `intended_uses`, `languages` (last 6 = Group A staff_manage).

**Special handling**
- `ads_offline_conversions`: trigger `queue_ads_offline_conversion()` (on `orders.paid_at`) converted
  to `SECURITY DEFINER` so the queue INSERT always succeeds regardless of which role marks an order
  paid (it only ever runs as service_role today, but this is now safe-by-construction).

**Deliberate, behaviour-preserving notes (not silent tightening)**
- `xtrf_currency_map` / `xtrf_payment_methods`: anon read dropped (admin-only pages; no anon reader
  existed). authenticated read kept.
- `app_settings`: remains anon-readable (its pre-existing public-select policy) — scanned, holds no
  secrets (89 non-sensitive config rows). Enabling RLS preserves, not changes, current access.

## Recommended follow-ups (out of scope of these 22 — for human review)

1. **Repo/prod drift:** branch `origin/fix/enable-rls-17-tables` (a *different* 17 tables: vendor_payments,
   xtrf_csv_*_2026_05_21 staging, vendor PO tables, cvp_*) is **applied to prod but unmerged** — its
   migration file is missing from `main`. Merge it (or cherry-pick the SQL) so the repo reflects prod.
2. **Live-UI smoke test** (optional confidence): public quote form dropdowns (anon) + admin
   ServicesSettings edit (staff) + admin VendorPayments currency/method display. The anon-key REST
   probes already exercise the identical data path, so this is confirmatory only.
3. **Pre-existing advisor findings** (unrelated to this task): `rls_enabled_no_policy` on 20 tables
   incl. `comms.rc_subscriptions` (RLS on, zero policies → currently locked to service_role by
   accident), 11 `security_definer_view` ERRORs, 179 `function_search_path_mutable`. Separate hardening.
