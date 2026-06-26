-- External-contractor onboarding & compliance package (7-doc), signed online via clickwrap.
-- Per-contractor content (not a global template), so it lives in its own table; the signature
-- reuses vendor_nda_signatures with a new agreement_type='onboarding'.
-- Applied to prod via MCP 2026-06-25.

create table if not exists public.vendor_onboarding_packages (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  version integer not null default 1,
  title text not null default 'External Contractor Onboarding & Compliance Package',
  reference_code text,
  language_pair_display text,
  engagement_effective_date date,
  body_html text not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  notes text
);

create unique index if not exists uniq_vendor_onb_pkg_current
  on public.vendor_onboarding_packages(vendor_id) where is_current;
create index if not exists idx_vendor_onb_pkg_vendor
  on public.vendor_onboarding_packages(vendor_id);

alter table public.vendor_onboarding_packages enable row level security;

drop policy if exists onb_pkg_staff_all on public.vendor_onboarding_packages;
create policy onb_pkg_staff_all on public.vendor_onboarding_packages
  for all to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

alter table public.vendor_nda_signatures alter column nda_template_id drop not null;
alter table public.vendor_nda_signatures
  add column if not exists onboarding_package_id uuid references public.vendor_onboarding_packages(id);

alter table public.vendor_nda_signatures drop constraint if exists vendor_nda_signatures_agreement_type_check;
alter table public.vendor_nda_signatures
  add constraint vendor_nda_signatures_agreement_type_check
  check (agreement_type in ('nda','gvsa','roster_terms','onboarding'));

alter table public.vendor_nda_signatures drop constraint if exists vendor_nda_sig_reference_chk;
alter table public.vendor_nda_signatures
  add constraint vendor_nda_sig_reference_chk
  check (
    (agreement_type = 'onboarding' and onboarding_package_id is not null)
    or (agreement_type <> 'onboarding' and nda_template_id is not null)
  );

alter table public.vendors add column if not exists onboarding_signed_at timestamptz;

comment on table public.vendor_onboarding_packages is
  'Per-contractor onboarding & compliance package (7-doc), rendered to portal HTML and signed online via clickwrap. One current row per vendor.';
comment on column public.vendor_nda_signatures.onboarding_package_id is
  'Set when agreement_type=onboarding; references the signed vendor_onboarding_packages row (nda_template_id is null for onboarding).';
