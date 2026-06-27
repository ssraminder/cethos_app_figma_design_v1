-- Auto-stamp the source version onto every test submission at insert time,
-- from the library row's current_version_id. Robust to any code path that
-- creates submissions (no edge-function change needed).
-- Applied to prod 2026-06-26 via MCP; committed here to mirror prod.

create or replace function public.cvp_stamp_test_version()
returns trigger language plpgsql as $$
begin
  if new.test_version_id is null and new.test_id is not null then
    select current_version_id into new.test_version_id
      from public.cvp_test_library where id = new.test_id;
  end if;
  return new;
end $$;

drop trigger if exists cvp_test_submissions_stamp_version on public.cvp_test_submissions;
create trigger cvp_test_submissions_stamp_version
  before insert on public.cvp_test_submissions
  for each row execute function public.cvp_stamp_test_version();
