-- §3.1.8 ongoing performance monitoring — wire the missing quality signals.
-- Today only project_completed is emitted (20260618_qms_emit_project_completed_trigger.sql);
-- qms.linguist_performance_snapshot is therefore quality-blind. This adds an
-- exception-safe AFTER UPDATE trigger on order_workflow_steps that emits:
--   * revision_finding  — when a step moves into 'revision_requested'
--   * late_delivery     — when a step first completes after its deadline
-- client_complaint / quality_issue / capa_action_* are emitted from the
-- manage-quality edge function (those entities are created there).
--
-- CRITICAL: this is a non-essential side-effect on the PM-critical step table.
-- The whole body is wrapped so a monitoring failure can NEVER block a step update.

create or replace function qms.emit_quality_signals()
returns trigger language plpgsql security definer set search_path = qms, public as $fn$
declare
  v_rq uuid;
  v_order text;
begin
  if NEW.vendor_id is null then
    return NEW;
  end if;

  -- Vendor's primary role qualification (prefer translator) — mirrors emit_project_completed.
  select r.id into v_rq from qms.role_qualifications r
    where r.vendor_id = NEW.vendor_id
    order by (r.role_type_id = 'ac148fbe-2cce-4d7b-9d69-3fc2a01f7ee5') desc
    limit 1;
  if v_rq is null then
    return NEW;
  end if;

  select order_number into v_order from public.orders where id = NEW.order_id;

  -- revision_finding: step moved into revision_requested
  if NEW.status = 'revision_requested' and (OLD.status is distinct from NEW.status) then
    insert into qms.performance_events
      (role_qualification_id, vendor_id, event_type, severity, occurred_at, recorded_at, project_reference, description, notes)
    values
      (v_rq, NEW.vendor_id, 'revision_finding',
       case when coalesce(NEW.revision_count,0) >= 3 then 'high'
            when coalesce(NEW.revision_count,0) = 2 then 'medium'
            else 'low' end,
       now(), now(), v_order,
       'Revision requested on workflow step (revision #' || coalesce(NEW.revision_count,0) || ')',
       'Auto-emitted on revision_requested (§3.1.8 monitoring).');
  end if;

  -- late_delivery: step first reaches a completion state past its deadline
  if NEW.status in ('approved','delivered','completed')
     and (OLD.status is distinct from NEW.status)
     and (OLD.status is null or OLD.status not in ('approved','delivered','completed'))
     and NEW.deadline is not null
     and coalesce(NEW.delivered_at, NEW.approved_at, now()) > NEW.deadline then
    insert into qms.performance_events
      (role_qualification_id, vendor_id, event_type, severity, occurred_at, recorded_at, project_reference, description, notes)
    values
      (v_rq, NEW.vendor_id, 'late_delivery', 'medium', now(), now(), v_order,
       'Delivered after step deadline (' || to_char(NEW.deadline,'YYYY-MM-DD') || ')',
       'Auto-emitted on late completion (§3.1.8 monitoring).');
  end if;

  return NEW;
exception when others then
  raise warning 'qms.emit_quality_signals skipped for step % (%, %): %',
    NEW.id, NEW.status, NEW.vendor_id, sqlerrm;
  return NEW;
end
$fn$;

drop trigger if exists trg_qms_emit_quality_signals on public.order_workflow_steps;
create trigger trg_qms_emit_quality_signals
  after update on public.order_workflow_steps
  for each row execute function qms.emit_quality_signals();
