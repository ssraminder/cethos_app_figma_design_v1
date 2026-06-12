-- Versioned SOP registry for the admin portal (ISO 17100 §3.1.1 documented processes).
-- Versions are immutable once they leave draft; writes go through the
-- manage-sops edge function (service role) — no client write policies.

CREATE TABLE public.sops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  sop_number text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  iso_clause_reference text,
  current_version_id uuid,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.staff_users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sop_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id uuid NOT NULL REFERENCES public.sops(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  content_md text NOT NULL,
  change_summary text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','superseded','retired')),
  effective_date date,
  approved_by uuid REFERENCES public.staff_users(id),
  approved_by_name text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.staff_users(id),
  created_by_name text,
  UNIQUE (sop_id, version_number)
);

CREATE INDEX idx_sop_versions_sop ON public.sop_versions(sop_id);

ALTER TABLE public.sops
  ADD CONSTRAINT sops_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.sop_versions(id);

-- Immutability guard: once a version leaves draft, its content and number are frozen.
CREATE OR REPLACE FUNCTION public.sop_versions_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.content_md IS DISTINCT FROM OLD.content_md THEN
      RAISE EXCEPTION 'SOP version content is immutable after approval (status=%)', OLD.status
        USING ERRCODE = '42501';
    END IF;
    IF NEW.version_number IS DISTINCT FROM OLD.version_number THEN
      RAISE EXCEPTION 'SOP version number is immutable' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sop_versions_immutable
  BEFORE UPDATE ON public.sop_versions
  FOR EACH ROW EXECUTE FUNCTION public.sop_versions_immutable();

ALTER TABLE public.sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_versions ENABLE ROW LEVEL SECURITY;
-- No policies: service-role-only access via manage-sops edge function.
