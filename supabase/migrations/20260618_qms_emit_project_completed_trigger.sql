-- §3.1.8 ongoing performance monitoring.
-- Emit a project_completed performance event when a workflow step first reaches
-- a completion state ('approved'/'delivered'), for vendors with a recorded role
-- qualification. Feeds qms.linguist_performance_snapshot (a materialized view
-- refreshed daily by the refresh-linguist-perf-snapshot cron).
create or replace function qms.emit_project_completed()
returns trigger language plpgsql security definer as $fn$
declare rq uuid;
begin
  if NEW.vendor_id is not null
     and NEW.status in ('approved','delivered')
     and (OLD.status is distinct from NEW.status)
     and (OLD.status is null or OLD.status not in ('approved','delivered')) then
    select r.id into rq from qms.role_qualifications r
      where r.vendor_id = NEW.vendor_id
      order by (r.role_type_id = 'ac148fbe-2cce-4d7b-9d69-3fc2a01f7ee5') desc
      limit 1;
    if rq is not null then
      insert into qms.performance_events
        (role_qualification_id, vendor_id, event_type, occurred_at, recorded_at, project_reference, description, notes)
      values
        (rq, NEW.vendor_id, 'project_completed', now(), now(),
         (select order_number from public.orders where id = NEW.order_id),
         'Completed workflow step ('||NEW.status||')',
         'Auto-emitted on step completion (§3.1.8 monitoring).');
    end if;
  end if;
  return NEW;
end $fn$;

drop trigger if exists trg_qms_emit_project_completed on public.order_workflow_steps;
create trigger trg_qms_emit_project_completed
  after update on public.order_workflow_steps
  for each row execute function qms.emit_project_completed();

-- Daily refresh of the snapshot materialized view (was stale → showed 0 rows).
select cron.schedule('refresh-linguist-perf-snapshot', '0 4 * * *',
  $$REFRESH MATERIALIZED VIEW qms.linguist_performance_snapshot$$);

-- NOTE: a one-time MD-approved backfill of 43 factual project_completed events
-- (from completed order_workflow_steps with a valid order) was applied via the
-- IQVIA audit-prep session; not repeated here (environment-specific data op).
