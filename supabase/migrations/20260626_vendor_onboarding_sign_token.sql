-- Per-contractor signing token so the onboarding package can be signed via an
-- emailed link (clickwrap), no portal login required. Applied to prod via MCP 2026-06-26.
alter table public.vendor_onboarding_packages add column if not exists sign_token text;
alter table public.vendor_onboarding_packages add column if not exists sign_token_created_at timestamptz;

update public.vendor_onboarding_packages
   set sign_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
       sign_token_created_at = now()
 where is_current = true and sign_token is null;

create unique index if not exists uniq_vendor_onb_pkg_sign_token
  on public.vendor_onboarding_packages(sign_token) where sign_token is not null;

comment on column public.vendor_onboarding_packages.sign_token is
  'Unguessable token for the emailed signing link (/onboarding-sign/:token). Possession (link delivered to the contractor email) is the identity anchor for the clickwrap signature.';
