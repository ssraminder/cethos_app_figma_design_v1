-- ============================================================================
-- CAT payables Phase 1: schema
-- ============================================================================
-- 1) Global default CAT grid in app_settings
-- 2) Per-vendor cat_grid override on vendors
-- 3) vendor_payable_cat_lines: per-tier breakdown for a CAT payable
--
-- Industry-standard match tiers (Trados/SDL/memoQ/XTM/Plunet/XTRF):
--   context_match  -- 101% / Perfect Match
--   repetitions    -- segment repeats inside the same doc
--   100            -- exact 100% TM match
--   95_99          -- high fuzzy
--   85_94          -- mid fuzzy
--   75_84          -- low fuzzy
--   50_74          -- below leverage threshold; usually billed full
--   no_match       -- new translation
--
-- tier_percentage is the fraction of the base per-word rate paid for that tier
-- (e.g. 0.30 means 30% of base rate for 100% TM matches). Stored as numeric
-- 0..1 so the math is straightforward server-side.
-- ============================================================================

-- ── 1) Global default CAT grid in app_settings ────────────────────────────
-- Defaults below match a typical Cethos-style agency grid. Configurable.
INSERT INTO app_settings (setting_key, setting_value, setting_type, description)
VALUES (
  'cat_grid_default',
  '{"tiers":[{"key":"context_match","label":"Context Match","percentage":0.00},{"key":"repetitions","label":"Repetitions","percentage":0.25},{"key":"100","label":"100%","percentage":0.30},{"key":"95_99","label":"95-99%","percentage":0.60},{"key":"85_94","label":"85-94%","percentage":0.80},{"key":"75_84","label":"75-84%","percentage":1.00},{"key":"50_74","label":"50-74%","percentage":1.00},{"key":"no_match","label":"No Match","percentage":1.00}]}',
  'json',
  'Default CAT analysis grid: per-tier percentage of vendor base per-word rate. Used when a vendor has no per-vendor override.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- ── 2) Per-vendor cat_grid override ───────────────────────────────────────
-- Same shape as the default. NULL = use global default.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS cat_grid jsonb;

COMMENT ON COLUMN vendors.cat_grid IS
  'Per-vendor CAT analysis grid override. Same shape as app_settings.cat_grid_default. NULL falls back to global default.';

-- ── 3) vendor_payable_cat_lines ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_payable_cat_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_id uuid NOT NULL REFERENCES vendor_payables(id) ON DELETE CASCADE,
  match_tier text NOT NULL,
  tier_label text,
  word_count numeric NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  tier_percentage numeric NOT NULL CHECK (tier_percentage >= 0 AND tier_percentage <= 5),
  base_rate numeric NOT NULL CHECK (base_rate >= 0),
  line_subtotal numeric NOT NULL CHECK (line_subtotal >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_payable_cat_lines_payable
  ON vendor_payable_cat_lines (payable_id);

-- RLS: staff read/write, service_role full. Mirrors vendor_payables policy.
ALTER TABLE vendor_payable_cat_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read cat lines"
  ON vendor_payable_cat_lines FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert cat lines"
  ON vendor_payable_cat_lines FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update cat lines"
  ON vendor_payable_cat_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated delete cat lines"
  ON vendor_payable_cat_lines FOR DELETE TO authenticated USING (true);

CREATE POLICY "Service role full cat lines"
  ON vendor_payable_cat_lines FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE vendor_payable_cat_lines IS
  'Per-tier breakdown for a CAT-analysis-based vendor payable. Parent vendor_payables.subtotal must equal SUM(line_subtotal). Deletes cascade with parent.';
