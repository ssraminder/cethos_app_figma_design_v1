-- R12: soft-retire two workflow templates that have ZERO production orders
-- since seeding 8+ weeks ago and no current evangelize plan:
--   - software_localization (Localization)  — placeholder, no DTP/LQA staffing
--   - subtitling                              — placeholder
-- Both retained in DB (FK references preserved); is_active=false hides them
-- from the picker in admin order creation. Reversible: flip is_active=true.
-- mtpe_review and harmonization_review left active pending business decision
-- (audit doc 2026-06-02 §R12) — mtpe_review was just touched by R8+R24.

UPDATE workflow_templates
   SET is_active = false
 WHERE code IN ('software_localization', 'subtitling')
   AND is_active = true;
