-- R3 + R4 from docs/audits/2026-06-02-pm-flow-audit.md
--
-- Phase A audit on /admin/orders found the workflow step's "Internal" staff
-- dropdown rendered "Raminder Shah" twice plus "Raminder Test" — a leftover
-- test fixture. Both stray rows had zero step assignments and zero referential
-- weight, so safest cleanup is is_active=false (vs DELETE) to avoid breaking
-- any historical FK that might reference them.
--
-- Canonical Raminder Shah (raminder@cethos.com, id a8b2d97e-...) is the row
-- that owns 11 step assignments + 4 payables; it stays untouched.
--
-- The OrderWorkflowSection staff picker already filters `is_active=true`
-- (client/components/admin/OrderWorkflowSection.tsx:2195), so flipping these
-- to false is sufficient to remove them from every dropdown / picker.

UPDATE staff_users
SET is_active = false, updated_at = NOW()
WHERE id IN (
  'd974ee6c-0abc-4641-8797-1c31732fd10f',  -- duplicate Raminder Shah (ss.raminder@gmail.com, no activity)
  '0cff2f98-ed6f-417f-b642-790f12aebcad'   -- Raminder Test (raminder@cethoscorp.com, no activity)
);
