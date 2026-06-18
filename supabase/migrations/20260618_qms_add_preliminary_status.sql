-- Phase 2 fix — the ready-for-approval gate (20260618_qms_ready_for_approval_gate.sql)
-- sets role_qualifications.status = 'preliminary', but the qualification_status enum
-- never had that label. The CREATE OR REPLACE FUNCTION succeeded (plpgsql defers the
-- enum cast to runtime), so the gap was latent — it would only throw the first time a
-- vendor's qual auto-assembled. Add the value (ordered just before 'qualified').
-- Applied to prod via MCP 2026-06-18.
ALTER TYPE qms.qualification_status ADD VALUE IF NOT EXISTS 'preliminary' BEFORE 'qualified';
