-- Add impersonation columns to customer_sessions, mirroring vendor_sessions.
-- Lets staff mint a short-lived "View as customer" session via the
-- admin-impersonate-customer edge function (parallel to admin-impersonate-vendor).
-- Applied to prod 2026-05-21 via MCP.

ALTER TABLE public.customer_sessions
  ADD COLUMN IF NOT EXISTS is_impersonation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS impersonator_staff_id UUID
    REFERENCES public.staff_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_sessions_impersonation
  ON public.customer_sessions(impersonator_staff_id)
  WHERE is_impersonation = TRUE;

COMMENT ON COLUMN public.customer_sessions.is_impersonation IS
  'TRUE when this session was minted by admin-impersonate-customer (staff "View as customer"). Mirrors vendor_sessions.is_impersonation.';
COMMENT ON COLUMN public.customer_sessions.impersonator_staff_id IS
  'Staff member who started the impersonation session. Used for audit + the red banner in the customer portal.';
