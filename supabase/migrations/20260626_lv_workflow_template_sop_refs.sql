-- 20260626_lv_workflow_template_sop_refs.sql
-- The 8 standalone LV workflow templates (lv_adaptation, lv_reconciliation,
-- lv_back_translation, lv_bt_review, lv_harmonization, lv_interview,
-- lv_proofreading, lv_finalization) described themselves as "(per SOP-LV-001)" —
-- a SOP number that never existed in the controlled portal registry (a dangling
-- reference an auditor would flag). The LV master SOP is now published to the
-- portal as SOP-029; repoint the reference so the workflow engine cites a real,
-- active controlled document.
UPDATE public.workflow_templates
SET description = replace(description, '(per SOP-LV-001)', '(per SOP-029)'),
    updated_at = now()
WHERE description LIKE '%(per SOP-LV-001)%';
