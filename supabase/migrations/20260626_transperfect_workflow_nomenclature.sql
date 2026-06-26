-- TransPerfect workflow nomenclature: external-system identifier + canonical phase
-- name on workflow steps, plus a TransPerfect flag on customers to drive the
-- client-scoped integration panel on the customer profile.

alter table public.order_workflow_steps
  add column if not exists external_workflow_system text,
  add column if not exists external_phase_name text;

comment on column public.order_workflow_steps.external_workflow_system is
  'Identifier marking that this step name follows an external client system''s nomenclature (e.g. ''transperfect''). NULL = Cethos-native step.';
comment on column public.order_workflow_steps.external_phase_name is
  'Canonical external-system phase name (e.g. TransPerfect: Translation, PostEdit, Proof, QM, BackTransPE).';

create index if not exists idx_ows_external_workflow_system
  on public.order_workflow_steps (external_workflow_system)
  where external_workflow_system is not null;

alter table public.customers
  add column if not exists is_transperfect_customer boolean not null default false;

comment on column public.customers.is_transperfect_customer is
  'True for TransPerfect client records; drives TP workflow nomenclature + the customer-profile integration panel.';

-- Flag the active TransPerfect customer (Transperfect Translations Inc.)
update public.customers
  set is_transperfect_customer = true
  where id = '360e53cd-7187-4fcf-a26f-edebf4c1b1ba';
