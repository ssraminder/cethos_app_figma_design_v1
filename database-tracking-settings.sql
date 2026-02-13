-- ============================================================
-- Tracking & Analytics Settings Migration
-- Adds Google Analytics / GTM configuration to app_settings
-- ============================================================

-- Google Analytics 4 Measurement ID (e.g., G-XXXXXXXXXX)
INSERT INTO app_settings (setting_key, setting_value, setting_type, description)
VALUES (
  'google_analytics_id',
  '',
  'string',
  'Google Analytics 4 Measurement ID (e.g., G-XXXXXXXXXX). Leave empty to disable GA4.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Google Tag Manager Container ID (e.g., GTM-XXXXXXX)
INSERT INTO app_settings (setting_key, setting_value, setting_type, description)
VALUES (
  'google_tag_manager_id',
  '',
  'string',
  'Google Tag Manager Container ID (e.g., GTM-XXXXXXX). Leave empty to disable GTM.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Global tracking enabled flag
INSERT INTO app_settings (setting_key, setting_value, setting_type, description)
VALUES (
  'tracking_enabled',
  'false',
  'boolean',
  'Master switch for all tracking/analytics scripts. Must be true for any tags to load.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Custom head scripts (JSON array of script objects for future tag support)
INSERT INTO app_settings (setting_key, setting_value, setting_type, description)
VALUES (
  'custom_head_scripts',
  '[]',
  'json',
  'JSON array of custom script objects to inject in <head>. Format: [{"id":"name","src":"url","inline":"code"}]'
)
ON CONFLICT (setting_key) DO NOTHING;
