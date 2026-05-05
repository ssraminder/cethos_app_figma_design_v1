-- ============================================================================
-- Internal projects: Cethos-generated project numbers (PRJ-YYYY-NNNNN) that
-- group related quotes/orders for the same client. Used in vendor-facing
-- communication so vendors recognize continuation work without exposing the
-- client-supplied client_project_number (which may carry client identifiers).
--
-- Scope: every quote and every order links to exactly one internal_project.
--   * Business customers: project scoped to companies.id (multiple buyer
--     contacts at the same company roll up to one project).
--   * Retail/certified customers: project scoped to customers.id.
--
-- Lifecycle: on quote/order creation the find_or_create_internal_project()
-- function looks for an existing project with the same (company_id|customer_id,
-- client_project_number) tuple. If found, the order is linked to it; if not, a
-- new project is created with a fresh PRJ-YYYY-NNNNN number.
--
-- Concurrency: per-year advisory lock prevents duplicate numbers under
-- simultaneous inserts. UNIQUE(project_number) is the final guard.
-- ============================================================================

-- ── Table ──
CREATE TABLE IF NOT EXISTS internal_projects (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number           text NOT NULL UNIQUE,
  customer_id              uuid NOT NULL REFERENCES customers(id),
  company_id               uuid REFERENCES companies(id),
  client_project_number    text,
  name                     text,
  vendor_notes             text,
  glossary_storage_path    text,
  style_guide_storage_path text,
  preferred_vendor_ids     uuid[] DEFAULT '{}'::uuid[],
  is_active                boolean DEFAULT true,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  created_by_staff_id      uuid REFERENCES staff_users(id)
);

CREATE INDEX IF NOT EXISTS internal_projects_company_id_idx
  ON internal_projects(company_id);
CREATE INDEX IF NOT EXISTS internal_projects_customer_id_idx
  ON internal_projects(customer_id);

-- One project per (company, client_project_number) when both present,
-- so repeated client labels under the same company collapse into one project.
CREATE UNIQUE INDEX IF NOT EXISTS internal_projects_company_client_uniq
  ON internal_projects(company_id, lower(trim(client_project_number)))
  WHERE company_id IS NOT NULL AND client_project_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS internal_projects_customer_client_uniq
  ON internal_projects(customer_id, lower(trim(client_project_number)))
  WHERE company_id IS NULL AND client_project_number IS NOT NULL;

-- ── Foreign keys on quotes / orders ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='quotes' AND column_name='internal_project_id'
  ) THEN
    ALTER TABLE quotes ADD COLUMN internal_project_id uuid REFERENCES internal_projects(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='orders' AND column_name='internal_project_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN internal_project_id uuid REFERENCES internal_projects(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS quotes_internal_project_id_idx
  ON quotes(internal_project_id);
CREATE INDEX IF NOT EXISTS orders_internal_project_id_idx
  ON orders(internal_project_id);

-- ── Project number generator (per-year advisory lock for concurrency) ──
CREATE OR REPLACE FUNCTION generate_internal_project_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_num     int;
  current_year text;
BEGIN
  current_year := to_char(now(), 'YYYY');
  PERFORM pg_advisory_xact_lock(hashtext('internal_project_number_' || current_year));
  SELECT COALESCE(MAX(NULLIF(split_part(project_number, '-', 3), '')::int), 0) + 1
    INTO next_num
    FROM internal_projects
   WHERE project_number LIKE 'PRJ-' || current_year || '-%';
  RETURN 'PRJ-' || current_year || '-' || lpad(next_num::text, 5, '0');
END;
$$;

-- ── Find-or-create RPC: single call from edge functions ──
CREATE OR REPLACE FUNCTION find_or_create_internal_project(
  p_customer_id           uuid,
  p_company_id            uuid,
  p_client_project_number text,
  p_created_by_staff_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  found_id      uuid;
  new_number    text;
  trimmed_label text;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id is required';
  END IF;

  trimmed_label := NULLIF(trim(coalesce(p_client_project_number, '')), '');

  IF trimmed_label IS NOT NULL THEN
    IF p_company_id IS NOT NULL THEN
      SELECT id INTO found_id
        FROM internal_projects
       WHERE company_id = p_company_id
         AND lower(trim(client_project_number)) = lower(trimmed_label)
       LIMIT 1;
    ELSE
      SELECT id INTO found_id
        FROM internal_projects
       WHERE customer_id = p_customer_id
         AND company_id IS NULL
         AND lower(trim(client_project_number)) = lower(trimmed_label)
       LIMIT 1;
    END IF;

    IF found_id IS NOT NULL THEN
      RETURN found_id;
    END IF;
  END IF;

  new_number := generate_internal_project_number();
  INSERT INTO internal_projects (
    project_number, customer_id, company_id,
    client_project_number, created_by_staff_id
  ) VALUES (
    new_number, p_customer_id, p_company_id,
    trimmed_label, p_created_by_staff_id
  )
  RETURNING id INTO found_id;

  RETURN found_id;
END;
$$;

-- ── RLS ──
ALTER TABLE internal_projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='internal_projects' AND policyname='Authenticated can read internal_projects') THEN
    CREATE POLICY "Authenticated can read internal_projects" ON internal_projects
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='internal_projects' AND policyname='Authenticated can insert internal_projects') THEN
    CREATE POLICY "Authenticated can insert internal_projects" ON internal_projects
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='internal_projects' AND policyname='Authenticated can update internal_projects') THEN
    CREATE POLICY "Authenticated can update internal_projects" ON internal_projects
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='internal_projects' AND policyname='Service role full access on internal_projects') THEN
    CREATE POLICY "Service role full access on internal_projects" ON internal_projects
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION generate_internal_project_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION find_or_create_internal_project(uuid, uuid, text, uuid) TO authenticated, service_role;
