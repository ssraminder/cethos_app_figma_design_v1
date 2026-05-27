INSERT INTO languages (code, name, native_name, tier, tier_id, multiplier, price_multiplier, is_source_available, is_target_available, is_active, sort_order)
VALUES ('kmr-badini', 'Kurdish (Badini)', 'Kurdî (Badînî)', 4, 'fc603fe8-b291-45b0-a497-871b8c5ee17c', 0.90, 0.90, true, true, true, 5)
ON CONFLICT (code) DO NOTHING;
