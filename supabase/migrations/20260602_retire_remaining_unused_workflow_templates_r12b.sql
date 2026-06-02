-- R12 followup: soft-retire the two remaining low-usage templates.
-- mtpe_review        — 0 uses since seeding; R8+R24 universalization still applies in DB
--                      structure so re-activation just flips is_active back to true.
-- harmonization_review — 1 historical use, no plan attached.
-- Reversible.
UPDATE workflow_templates
   SET is_active = false
 WHERE code IN ('mtpe_review', 'harmonization_review')
   AND is_active = true;
