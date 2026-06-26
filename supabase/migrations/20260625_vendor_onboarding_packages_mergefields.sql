-- Store per-contractor merge fields; the package HTML is rendered from a single
-- version-controlled template in the vendor-portal serving function. The signature
-- captures the fully-rendered HTML as the immutable audit snapshot, so body_html
-- is kept nullable as an optional cache/override. Applied to prod via MCP 2026-06-25.
alter table public.vendor_onboarding_packages alter column body_html drop not null;
alter table public.vendor_onboarding_packages add column if not exists contractor_name text;
alter table public.vendor_onboarding_packages add column if not exists contractor_email text;
alter table public.vendor_onboarding_packages add column if not exists pre_incorp boolean not null default false;
comment on column public.vendor_onboarding_packages.body_html is
  'Optional cached/override HTML. Normally NULL — the package is rendered from merge fields by the onboarding template in the serving function.';

-- Data load: the 23 external-contractor merge-field rows were inserted via
-- execute_sql (see tmp/onboarding-build/sql/load_mergefields.sql + memory).
-- One current row per vendor_onboarding_packages.vendor_id.
