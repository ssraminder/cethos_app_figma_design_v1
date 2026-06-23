-- IQVIA audit hardening — confine regulated/COA services to the clinically
-- qualified panel. Applied to prod via MCP, then committed (repo mirrors prod).
--
-- The eligibility gate checked role + language pair + NDA, but NOT clinical
-- subject-matter competence — so even in block mode any qualified reviser could
-- take COA work. This adds an optional per-service subject-matter requirement.
-- Behavior-neutral until a service row sets required_subject_matter_id.
--
-- The clinical umbrella is subject_matter 'life_sciences' (Life Sciences /
-- Medical); COA panel members hold either it or a child (Clinical Trials,
-- Cognitive Debriefing), so requiring 'life_sciences OR a child of it' covers
-- the panel.

ALTER TABLE qms.service_iso_requirements
  ADD COLUMN IF NOT EXISTS required_subject_matter_id uuid REFERENCES qms.subject_matters(id);
COMMENT ON COLUMN qms.service_iso_requirements.required_subject_matter_id IS
  'When set, the vendor must also hold a subject_matter_qualification for this area (or a child of it) under a qualified role to be eligible. Confines COA/regulated services to the clinically-qualified panel. NULL = no subject-matter requirement.';

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
  v_has_subject boolean;
  v_required_subject uuid;
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

  -- Subject-matter (e.g. clinical/COA) competence requirement, when the service
  -- declares one. Vendor must hold a subject_matter_qualification for the
  -- required area OR a direct child of it, under a qualified role.
  select required_subject_matter_id into v_required_subject
  from qms.service_iso_requirements where service_id = p_service_id;

  if v_required_subject is not null then
    select exists (
      select 1 from qms.subject_matter_qualifications smq
      join qms.role_qualifications rq on rq.id = smq.role_qualification_id
      join qms.role_types rt on rt.id = rq.role_type_id
      join qms.subject_matters sm on sm.id = smq.subject_matter_id
      where rq.vendor_id = p_vendor_id and rt.code = v_required_role
        and rq.status = 'qualified'
        and (smq.subject_matter_id = v_required_subject or sm.parent_id = v_required_subject)
    ) into v_has_subject;

    if not v_has_subject then
      return query select false,
                          'vendor lacks the required subject-matter qualification for this service'::text,
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
