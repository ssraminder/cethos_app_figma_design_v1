-- IQVIA audit hardening — scoped COA assignment gating (mechanism only).
-- Applied to prod via MCP, then committed (repo mirrors prod).
--
-- Problem: qms.config.assignment_gating_mode is global and every service in
-- qms.service_iso_requirements requires ISO qualification, so flipping the
-- global mode to 'block' would block almost all vendor assignment company-wide
-- (only ~37 translators / 9 revisers / 0 interpreters are qualified).
--
-- Fix: a per-service override of the global mode so the regulated/COA services
-- can enforce 'block' while general work stays 'warn'. Behavior-neutral until a
-- service row's gating_mode is set (all NULL on apply).
--
-- Enforcement already exists at every assignment call site (find-matching-vendors
-- drops should_block vendors; update-workflow-step / admin-respond-counter-offer
-- return 403). The only reason nothing blocked before was global mode = 'warn'.

ALTER TABLE qms.service_iso_requirements ADD COLUMN IF NOT EXISTS gating_mode text;
ALTER TABLE qms.service_iso_requirements DROP CONSTRAINT IF EXISTS service_iso_requirements_gating_mode_chk;
ALTER TABLE qms.service_iso_requirements ADD CONSTRAINT service_iso_requirements_gating_mode_chk
  CHECK (gating_mode IS NULL OR gating_mode IN ('off','warn','block'));
COMMENT ON COLUMN qms.service_iso_requirements.gating_mode IS
  'Per-service override of qms.config.assignment_gating_mode. NULL = use global. Lets regulated/COA services enforce block while general work stays warn.';

CREATE OR REPLACE FUNCTION qms.is_vendor_eligible(p_vendor_id uuid, p_service_id uuid, p_source_language_id uuid DEFAULT NULL::uuid, p_target_language_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(eligible boolean, reason text, requires_iso boolean, required_role text, gating_mode text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'qms', 'public'
AS $function$
declare
  v_eligible boolean;
  v_reason text;
  v_requires_iso boolean;
  v_required_role text;
  v_has_qual boolean;
  v_has_pair boolean;
  v_has_nda boolean;
  v_mode text;
begin
  -- Per-service override of the global gating mode: a regulated/COA service can
  -- enforce 'block' while general work stays 'warn'. NULL -> global -> 'warn'.
  v_mode := coalesce(
    (select sir.gating_mode from qms.service_iso_requirements sir where sir.service_id = p_service_id),
    (select c.value #>> '{}' from qms.config c where c.key = 'assignment_gating_mode'),
    'warn'
  );

  v_requires_iso := qms.requires_iso_qualification(p_service_id);

  if not v_requires_iso then
    return query select true, 'service does not require ISO qualification'::text,
                        false, null::text, v_mode;
    return;
  end if;

  select required_role_type_code into v_required_role
  from qms.service_iso_requirements where service_id = p_service_id;

  if v_required_role is null then
    return query select false,
                        'service requires ISO qualification but no role mapping defined'::text,
                        true, null::text, v_mode;
    return;
  end if;

  select exists (
    select 1 from qms.role_qualifications rq
    join qms.role_types rt on rt.id = rq.role_type_id
    where rq.vendor_id = p_vendor_id and rt.code = v_required_role
      and rq.status = 'qualified'
      and (rq.re_qualification_due is null or rq.re_qualification_due >= now())
  ) into v_has_qual;

  if not v_has_qual then
    return query select false,
                        format('vendor lacks an active qualified %s role qualification', v_required_role)::text,
                        true, v_required_role, v_mode;
    return;
  end if;

  if p_source_language_id is not null and p_target_language_id is not null then
    select exists (
      select 1 from qms.language_pair_qualifications lpq
      join qms.role_qualifications rq on rq.id = lpq.role_qualification_id
      join qms.role_types rt on rt.id = rq.role_type_id
      where rq.vendor_id = p_vendor_id and rt.code = v_required_role
        and rq.status = 'qualified'
        and (
          (lpq.source_language_id = p_source_language_id and lpq.target_language_id = p_target_language_id)
          or (lpq.direction = 'both_directions'
              and lpq.source_language_id = p_target_language_id
              and lpq.target_language_id = p_source_language_id)
        )
    ) into v_has_pair;

    if not v_has_pair then
      return query select false,
                          format('vendor not qualified for the requested language pair as %s', v_required_role)::text,
                          true, v_required_role, v_mode;
      return;
    end if;
  end if;

  select exists (
    select 1 from qms.nda_agreements
    where vendor_id = p_vendor_id and status = 'active'
      and (expiry_date is null or expiry_date >= current_date)
  ) into v_has_nda;

  if not v_has_nda then
    return query select false,
                        'vendor has no active, non-expired NDA on file'::text,
                        true, v_required_role, v_mode;
    return;
  end if;

  return query select true, 'vendor is qualified and NDA is active'::text,
                      true, v_required_role, v_mode;
end;
$function$;
