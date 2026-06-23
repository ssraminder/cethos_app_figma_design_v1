# RLS Remediation Status — `public` schema (Cethos_Translation_App)

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
| 2 | `xtrf_language_map` | B (internal) | service_role only (mapping cache) | — | ⬜ | — | ⬜ | ⬜ |
| 3 | `xtrf_currency_map` | B (internal) | service_role only | — | ⬜ | — | ⬜ | ⬜ |
| 4 | `xtrf_payment_methods` | B (internal) | service_role only | — | ⬜ | — | ⬜ | ⬜ |
| 5 | `xtrf_branches` | B (internal) | service_role only | — | ⬜ | — | ⬜ | ⬜ |
| 6 | `training_lessons` | B (legacy) | minimal (live LMS is `cvp_training_*`) | — | ⬜ | — | ⬜ | ⬜ |
| 7 | `training_modules` | B (legacy) | minimal | — | ⬜ | — | ⬜ | ⬜ |
| 8 | `training_slides` | B (legacy) | minimal | — | ⬜ | — | ⬜ | ⬜ |
| 9 | `training_quiz_questions` | B (legacy) | minimal | — | ⬜ | — | ⬜ | ⬜ |
| 10 | `services` | B (reference) | public read; service_role write | — | ⬜ | — | ⬜ | ⬜ |
| 11 | `currencies` | B (reference) | public read; service_role write | — | ⬜ | — | ⬜ | ⬜ |
| 12 | `cethosweb_countries` | B (reference) | public read (marketing site) | — | ⬜ | — | ⬜ | ⬜ |
| 13 | `cethosweb_languages` | B (reference) | public read | — | ⬜ | — | ⬜ | ⬜ |
| 14 | `cethosweb_locales` | B (reference) | public read | — | ⬜ | — | ⬜ | ⬜ |
| 15 | `cethosweb_settings` | B (reference) | ⚠️ inspect contents — public read vs sensitive | — | ⬜ | — | ⬜ | ⬜ |
| 16 | `service_terms` | B (vendor read) | authenticated (+anon?) read; admin write | — | ⬜ | — | ⬜ | ⬜ |
| 17 | `app_settings` | A | existing: public SELECT + staff_manage | enable only | ⬜ | — | ⬜ | ⬜ |
| 18 | `certification_types` | A | existing: public SELECT + staff_manage | enable only | ⬜ | — | ⬜ | ⬜ |
| 19 | `delivery_options` | A | existing: public SELECT + staff_manage | enable only | ⬜ | — | ⬜ | ⬜ |
| 20 | `document_types` | A | existing: public SELECT + staff_manage | enable only | ⬜ | — | ⬜ | ⬜ |
| 21 | `intended_uses` | A | existing: public SELECT + staff_manage | enable only | ⬜ | — | ⬜ | ⬜ |
| 22 | `languages` | A | existing: public SELECT + staff_manage | enable only | ⬜ | — | ⬜ | ⬜ |

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
