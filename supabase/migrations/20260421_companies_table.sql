-- ============================================================================
-- Companies: shared defaults across employees of the same business.
-- Individual customers keep their own currency/tax settings; business
-- customers inherit from their parent company row.
-- Applied to prod 2026-04-21. 15 companies created, 16 customers linked.
-- ============================================================================

CREATE TABLE IF NOT EXISTS companies (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                           text NOT NULL,
  normalized_name                text GENERATED ALWAYS AS (lower(trim(name))) STORED,
  currency                       text NOT NULL DEFAULT 'CAD',
  default_tax_rate_id            uuid REFERENCES tax_rates(id),
  invoicing_branch_id            integer REFERENCES branches(id),
  payment_terms                  varchar(20) DEFAULT 'net_30',
  is_ar_customer                 boolean DEFAULT false,
  credit_limit                   numeric DEFAULT 0,
  requires_po                    boolean DEFAULT false,
  requires_client_project_number boolean DEFAULT false,
  notes                          text,
  created_at                     timestamptz DEFAULT now(),
  updated_at                     timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_normalized_name_key
  ON companies(normalized_name);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='customers' AND column_name='company_id'
  ) THEN
    ALTER TABLE customers ADD COLUMN company_id uuid REFERENCES companies(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_company_id ON customers(company_id);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='companies' AND policyname='Authenticated can read companies') THEN
    CREATE POLICY "Authenticated can read companies" ON companies
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='companies' AND policyname='Authenticated can insert companies') THEN
    CREATE POLICY "Authenticated can insert companies" ON companies
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='companies' AND policyname='Authenticated can update companies') THEN
    CREATE POLICY "Authenticated can update companies" ON companies
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='companies' AND policyname='Service role full access on companies') THEN
    CREATE POLICY "Service role full access on companies" ON companies
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO companies (name, currency, default_tax_rate_id, invoicing_branch_id,
                       payment_terms, is_ar_customer, credit_limit,
                       requires_po, requires_client_project_number)
SELECT DISTINCT ON (lower(trim(c.company_name)))
       c.company_name,
       COALESCE(c.currency, 'CAD'),
       c.default_tax_rate_id,
       c.invoicing_branch_id,
       COALESCE(c.payment_terms, 'net_30'),
       COALESCE(c.is_ar_customer, false),
       COALESCE(c.credit_limit, 0),
       COALESCE(c.requires_po, false),
       COALESCE(c.requires_client_project_number, false)
  FROM customers c
 WHERE c.company_name IS NOT NULL
   AND trim(c.company_name) <> ''
 ORDER BY lower(trim(c.company_name)), c.updated_at DESC NULLS LAST
ON CONFLICT (normalized_name) DO NOTHING;

UPDATE customers cu
   SET company_id = co.id
  FROM companies co
 WHERE cu.company_id IS NULL
   AND cu.company_name IS NOT NULL
   AND lower(trim(cu.company_name)) = co.normalized_name;
