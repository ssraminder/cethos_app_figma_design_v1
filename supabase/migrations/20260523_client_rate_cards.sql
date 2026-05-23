-- ============================================================================
-- client_rate_cards: per-customer (or global default) rate cards
-- ============================================================================
-- A rate card row defines a rate for a (service, source_lang, target_lang,
-- domain, unit) combination. When customer_id IS NULL the row is a global
-- default; when set it is a per-customer override.
--
-- Lookup priority: per-customer row wins over global default.
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_rate_cards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid REFERENCES customers(id) ON DELETE CASCADE,
  -- NULL = global default; non-NULL = per-customer override

  service_id    uuid NOT NULL REFERENCES services(id),
  source_language_id uuid NOT NULL REFERENCES languages(id),
  target_language_id uuid NOT NULL REFERENCES languages(id),
  domain        text,                   -- NULL = any domain
  unit_of_measure text NOT NULL DEFAULT 'per_word'
    CHECK (unit_of_measure IN ('per_word','per_page','per_hour','per_minute','flat')),

  rate_per_unit numeric(12,4) NOT NULL CHECK (rate_per_unit >= 0),
  currency      text NOT NULL DEFAULT 'CAD',
  notes         text,

  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES staff_users(id)
);

-- Unique: one active rate per (customer, service, source, target, domain, unit).
-- NULLS NOT DISTINCT so that two global defaults (customer_id IS NULL) with
-- the same combo also conflict.
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_rate_cards_combo
  ON client_rate_cards (customer_id, service_id, source_language_id, target_language_id, domain, unit_of_measure)
  NULLS NOT DISTINCT
  WHERE is_active = true;

-- Fast lookup by customer
CREATE INDEX IF NOT EXISTS idx_client_rate_cards_customer
  ON client_rate_cards (customer_id) WHERE is_active = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_client_rate_cards_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_rate_cards_updated_at
  BEFORE UPDATE ON client_rate_cards
  FOR EACH ROW EXECUTE FUNCTION update_client_rate_cards_updated_at();

-- RLS: authenticated staff can CRUD, service_role full access
ALTER TABLE client_rate_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read rate cards"
  ON client_rate_cards FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert rate cards"
  ON client_rate_cards FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update rate cards"
  ON client_rate_cards FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete rate cards"
  ON client_rate_cards FOR DELETE TO authenticated USING (true);

CREATE POLICY "Service role full access on rate cards"
  ON client_rate_cards FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Lookup function: returns the best-match rate for a customer + combo.
-- Per-customer row wins over global default. Returns NULL if no match.
CREATE OR REPLACE FUNCTION lookup_client_rate(
  p_customer_id uuid,
  p_service_id uuid,
  p_source_language_id uuid,
  p_target_language_id uuid,
  p_unit_of_measure text DEFAULT 'per_word',
  p_domain text DEFAULT NULL
)
RETURNS TABLE(
  rate_card_id uuid,
  rate_per_unit numeric,
  currency text,
  unit_of_measure text,
  is_global boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.id,
    rc.rate_per_unit,
    rc.currency,
    rc.unit_of_measure,
    (rc.customer_id IS NULL) AS is_global
  FROM client_rate_cards rc
  WHERE rc.is_active = true
    AND rc.service_id = p_service_id
    AND rc.source_language_id = p_source_language_id
    AND rc.target_language_id = p_target_language_id
    AND rc.unit_of_measure = p_unit_of_measure
    AND (
      (p_domain IS NOT NULL AND rc.domain = p_domain)
      OR rc.domain IS NULL
    )
    AND (rc.customer_id = p_customer_id OR rc.customer_id IS NULL)
  ORDER BY
    -- Per-customer wins over global
    CASE WHEN rc.customer_id IS NOT NULL THEN 0 ELSE 1 END,
    -- Domain-specific wins over domain=NULL
    CASE WHEN rc.domain IS NOT NULL THEN 0 ELSE 1 END
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;
