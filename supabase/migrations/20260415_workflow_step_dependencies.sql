-- Add approval dependency column to workflow steps and templates
-- This allows a step to require another step's approval before it can be approved itself.
-- Example: In Certified Translation, Step 1 (Translation) requires Step 2 (Customer Draft Review)
-- to be approved before the vendor delivery can be approved.

ALTER TABLE order_workflow_steps
  ADD COLUMN IF NOT EXISTS approval_depends_on_step INTEGER;

ALTER TABLE workflow_template_steps
  ADD COLUMN IF NOT EXISTS approval_depends_on_step INTEGER;

-- Update the Certified Translation template:
-- Step 1 (Translation) approval depends on Step 2 (Customer Draft Review)
UPDATE workflow_template_steps
SET approval_depends_on_step = 2
WHERE template_id = (
  SELECT id FROM workflow_templates WHERE code = 'certified_translation' LIMIT 1
)
AND step_number = 1;
