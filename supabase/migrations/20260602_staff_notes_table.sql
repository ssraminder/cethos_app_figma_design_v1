-- staff_notes — internal-only notes on a quote or order, visible to other
-- staff members. NOT visible to customers or vendors. Polymorphic via
-- entity_type + entity_id so we don't duplicate the schema per entity.

CREATE TABLE IF NOT EXISTS public.staff_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('quote','order')),
  entity_id uuid NOT NULL,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_by uuid REFERENCES public.staff_users(id),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_staff_notes_entity ON public.staff_notes (entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_notes_created_at ON public.staff_notes (created_at DESC) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.touch_staff_notes_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_staff_notes_touch ON public.staff_notes;
CREATE TRIGGER trg_staff_notes_touch
  BEFORE UPDATE ON public.staff_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_staff_notes_updated_at();

-- RLS: deny everything by default. Edge functions use service_role and read/write.
ALTER TABLE public.staff_notes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.staff_notes IS
  'Internal staff-only notes on quotes/orders. Never surfaced to customers or vendors. Polymorphic on (entity_type, entity_id).';
