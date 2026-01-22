-- ============================================================================
-- CETHOS: Required Database Objects for Step 4 & Step 5
-- Run this in Supabase SQL Editor BEFORE using the updated UI
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Same-Day Eligibility Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS same_day_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_language VARCHAR(10) NOT NULL,
  target_language VARCHAR(10) NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  intended_use VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  additional_fee DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(source_language, target_language, document_type, intended_use)
);

-- Seed some common same-day eligible combinations
INSERT INTO same_day_eligibility (source_language, target_language, document_type, intended_use)
VALUES 
  ('es', 'en', 'birth_certificate', 'ircc'),
  ('es', 'en', 'marriage_certificate', 'ircc'),
  ('es', 'en', 'passport', 'ircc'),
  ('fr', 'en', 'birth_certificate', 'ircc'),
  ('fr', 'en', 'marriage_certificate', 'ircc'),
  ('pt', 'en', 'birth_certificate', 'ircc'),
  ('de', 'en', 'birth_certificate', 'ircc'),
  ('zh', 'en', 'birth_certificate', 'ircc')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Pickup Locations Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pickup_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  province VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  country VARCHAR(100) DEFAULT 'Canada',
  phone VARCHAR(50),
  hours TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pickup location
INSERT INTO pickup_locations (name, address_line1, city, province, postal_code, phone, hours, sort_order)
VALUES (
  'Cethos Calgary Office',
  '123 Main Street',
  'Calgary',
  'Alberta',
  'T2P 1A1',
  '(403) 555-0123',
  'Monday to Friday 9:00 AM - 5:00 PM MST',
  1
)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Update Delivery Options Table
-- ----------------------------------------------------------------------------

-- Add missing columns if they don't exist
ALTER TABLE delivery_options ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(20) DEFAULT 'digital';
ALTER TABLE delivery_options ADD COLUMN IF NOT EXISTS delivery_group VARCHAR(20) DEFAULT 'digital';
ALTER TABLE delivery_options ADD COLUMN IF NOT EXISTS is_always_selected BOOLEAN DEFAULT FALSE;
ALTER TABLE delivery_options ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'delivery';
ALTER TABLE delivery_options ADD COLUMN IF NOT EXISTS multiplier DECIMAL(4,2) DEFAULT 1.00;
ALTER TABLE delivery_options ADD COLUMN IF NOT EXISTS days_reduction INTEGER DEFAULT 0;
ALTER TABLE delivery_options ADD COLUMN IF NOT EXISTS is_rush BOOLEAN DEFAULT FALSE;

-- Update existing delivery options with proper categorization
UPDATE delivery_options SET
  delivery_group = 'digital',
  delivery_type = 'online',
  is_always_selected = TRUE
WHERE code = 'email' OR code = 'online_portal';

UPDATE delivery_options SET
  delivery_group = 'physical',
  delivery_type = 'ship',
  requires_address = TRUE
WHERE code IN ('regular_mail', 'priority_mail', 'express_courier', 'international_courier');

-- Insert pickup option if not exists
INSERT INTO delivery_options (code, name, description, price, estimated_days, is_physical, requires_address, delivery_group, delivery_type, sort_order)
VALUES ('pickup', 'Pickup from Office', 'Pickup from our Calgary location (FREE)', 0.00, 0, TRUE, FALSE, 'physical', 'pickup', 10)
ON CONFLICT (code) DO NOTHING;

-- Insert/Update turnaround options
INSERT INTO delivery_options (code, name, description, price, is_physical, requires_address, category, multiplier, days_reduction, is_rush, sort_order, is_active)
VALUES 
  ('standard', 'Standard Delivery', 'Standard turnaround based on document length', 0.00, FALSE, FALSE, 'turnaround', 1.00, 0, FALSE, 1, TRUE),
  ('rush', 'Rush Delivery', '1 business day faster (+30%)', 0.00, FALSE, FALSE, 'turnaround', 1.30, 1, TRUE, 2, TRUE),
  ('same_day', 'Same-Day Delivery', 'Ready today (+100%)', 0.00, FALSE, FALSE, 'turnaround', 2.00, 0, TRUE, 3, TRUE)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  multiplier = EXCLUDED.multiplier,
  days_reduction = EXCLUDED.days_reduction,
  is_rush = EXCLUDED.is_rush,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active;

-- ----------------------------------------------------------------------------
-- 4. Add Required App Settings
-- ----------------------------------------------------------------------------

-- Same-day settings
INSERT INTO app_settings (setting_key, setting_value, setting_type, description)
VALUES 
  ('same_day_multiplier', '2.00', 'number', 'Same-day delivery multiplier (+100%)'),
  ('same_day_cutoff_hour', '14', 'number', 'Same-day cutoff hour (MST, 24h format)'),
  ('same_day_cutoff_minute', '0', 'number', 'Same-day cutoff minute'),
  ('rush_cutoff_minute', '30', 'number', 'Rush cutoff minute'),
  ('turnaround_base_days', '2', 'number', 'Base turnaround days for standard'),
  ('turnaround_pages_per_day', '2', 'number', 'Pages per additional day')
ON CONFLICT (setting_key) DO NOTHING;

-- Update rush_cutoff_hour if it exists with wrong value
UPDATE app_settings 
SET setting_value = '16' 
WHERE setting_key = 'rush_cutoff_hour';

-- ----------------------------------------------------------------------------
-- 5. Add columns to quotes table if not exists
-- ----------------------------------------------------------------------------
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS shipping_address JSONB;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS selected_pickup_location_id UUID REFERENCES pickup_locations(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS turnaround_type VARCHAR(20) DEFAULT 'standard';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS physical_delivery_option_id UUID REFERENCES delivery_options(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS digital_delivery_options UUID[] DEFAULT ARRAY[]::UUID[];

-- ----------------------------------------------------------------------------
-- 6. RLS Policies for new tables
-- ----------------------------------------------------------------------------

-- pickup_locations - public read
ALTER TABLE pickup_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read pickup_locations" ON pickup_locations;
CREATE POLICY "Allow public read pickup_locations" ON pickup_locations
  FOR SELECT TO authenticated, anon
  USING (is_active = true);

-- same_day_eligibility - public read  
ALTER TABLE same_day_eligibility ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read same_day_eligibility" ON same_day_eligibility;
CREATE POLICY "Allow public read same_day_eligibility" ON same_day_eligibility
  FOR SELECT TO authenticated, anon
  USING (is_active = true);

-- ----------------------------------------------------------------------------
-- 7. Create holidays table if not exists
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read holidays" ON holidays;
CREATE POLICY "Allow public read holidays" ON holidays
  FOR SELECT TO authenticated, anon
  USING (is_active = true);

-- Add some Canadian statutory holidays for 2025
INSERT INTO holidays (holiday_date, name) VALUES
  ('2025-01-01', 'New Year''s Day'),
  ('2025-02-17', 'Family Day'),
  ('2025-04-18', 'Good Friday'),
  ('2025-05-19', 'Victoria Day'),
  ('2025-07-01', 'Canada Day'),
  ('2025-08-04', 'Heritage Day'),
  ('2025-09-01', 'Labour Day'),
  ('2025-10-13', 'Thanksgiving Day'),
  ('2025-11-11', 'Remembrance Day'),
  ('2025-12-25', 'Christmas Day'),
  ('2025-12-26', 'Boxing Day')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 8. Verify setup
-- ----------------------------------------------------------------------------
SELECT 'same_day_eligibility' as table_name, COUNT(*) as row_count FROM same_day_eligibility
UNION ALL
SELECT 'pickup_locations', COUNT(*) FROM pickup_locations
UNION ALL
SELECT 'delivery_options (turnaround)', COUNT(*) FROM delivery_options WHERE category = 'turnaround'
UNION ALL
SELECT 'delivery_options (physical)', COUNT(*) FROM delivery_options WHERE delivery_group = 'physical'
UNION ALL
SELECT 'holidays', COUNT(*) FROM holidays;
