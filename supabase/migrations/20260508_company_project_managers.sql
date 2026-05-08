-- ============================================================================
-- Migration: company_project_managers directory + client_pm_id on tasks
-- Date: 2026-05-08
-- Applied directly to prod via MCP apply_migration; this file is committed
-- so future environments stay in sync.
-- ============================================================================

CREATE TABLE IF NOT EXISTS company_project_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_staff_id uuid REFERENCES staff_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS company_project_managers_unique_email_per_company
  ON company_project_managers (company_id, lower(email));
CREATE INDEX IF NOT EXISTS company_project_managers_company_idx
  ON company_project_managers (company_id, is_active, full_name);
CREATE INDEX IF NOT EXISTS company_project_managers_email_idx
  ON company_project_managers (lower(email));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS client_pm_id uuid REFERENCES company_project_managers(id);
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS client_pm_id uuid REFERENCES company_project_managers(id);

CREATE INDEX IF NOT EXISTS orders_client_pm_id_idx
  ON orders (client_pm_id) WHERE client_pm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quotes_client_pm_id_idx
  ON quotes (client_pm_id) WHERE client_pm_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_company_project_managers_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS company_project_managers_set_updated_at ON company_project_managers;
CREATE TRIGGER company_project_managers_set_updated_at
  BEFORE UPDATE ON company_project_managers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_company_project_managers_updated_at();

ALTER TABLE company_project_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON company_project_managers;
CREATE POLICY "Service role full access" ON company_project_managers
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Anon read for staff portal" ON company_project_managers;
CREATE POLICY "Anon read for staff portal" ON company_project_managers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anon insert for staff portal" ON company_project_managers;
CREATE POLICY "Anon insert for staff portal" ON company_project_managers
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anon update for staff portal" ON company_project_managers;
CREATE POLICY "Anon update for staff portal" ON company_project_managers
  FOR UPDATE USING (true) WITH CHECK (true);

COMMENT ON TABLE company_project_managers IS
  'Customer-side project managers per company. Each task (order/quote) attaches to one via client_pm_id.';
