-- Fix: quality_event_log hash functions call digest() (pgcrypto), which lives in
-- the `extensions` schema. These functions run inside SECURITY DEFINER callers
-- whose search_path is pinned to (qms, public), so unqualified digest() is not
-- found. Schema-qualify as extensions.digest() (search_path-independent).

create or replace function qms.quality_log_hash_chain()
returns trigger language plpgsql as $fn$
declare v_prev text; v_canon text;
begin
  select row_hash into v_prev from qms.quality_event_log order by id desc limit 1;
  new.prev_hash := coalesce(v_prev, repeat('0', 64));
  v_canon := concat_ws('|',
    new.prev_hash, new.entity_type, new.entity_id::text, new.action,
    coalesce(new.prior_status,''), coalesce(new.new_status,''),
    coalesce(new.vendor_id::text,''), coalesce(new.payload::text,''),
    coalesce(new.performed_by::text,''), new.performed_at::text,
    coalesce(new.ip_address::text,''), coalesce(new.user_agent,''));
  new.row_hash := encode(extensions.digest(v_canon, 'sha256'), 'hex');
  return new;
end $fn$;

create or replace function qms.verify_quality_log_integrity()
returns table (ok boolean, rows_checked bigint, first_bad_id bigint, message text)
language plpgsql stable security definer set search_path = qms, public as $fn$
declare
  r record; v_expected_prev text; v_canon text; v_recomputed text;
  v_count bigint := 0;
begin
  v_expected_prev := repeat('0', 64);
  for r in select * from qms.quality_event_log order by id asc loop
    v_count := v_count + 1;
    if r.prev_hash is distinct from v_expected_prev then
      return query select false, v_count, r.id, format('Row %s prev_hash mismatch', r.id);
      return;
    end if;
    v_canon := concat_ws('|',
      r.prev_hash, r.entity_type, r.entity_id::text, r.action,
      coalesce(r.prior_status,''), coalesce(r.new_status,''),
      coalesce(r.vendor_id::text,''), coalesce(r.payload::text,''),
      coalesce(r.performed_by::text,''), r.performed_at::text,
      coalesce(r.ip_address::text,''), coalesce(r.user_agent,''));
    v_recomputed := encode(extensions.digest(v_canon, 'sha256'), 'hex');
    if r.row_hash <> v_recomputed then
      return query select false, v_count, r.id, format('Row %s row_hash mismatch', r.id);
      return;
    end if;
    v_expected_prev := r.row_hash;
  end loop;
  return query select true, v_count, null::bigint, format('OK — %s rows verified.', v_count);
end $fn$;
