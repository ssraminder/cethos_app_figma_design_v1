-- ============================================================================
-- STAFF AUTH LINKAGE — repair the staff_users ↔ auth.users link so the
-- staff_all RLS policies introduced in 20260514_emergency_rls_lockdown.sql
-- actually match.
--
-- Problem this fixes:
--   client/pages/admin/AdminStaffManagement.tsx:138 inserts a staff_users
--   row with only {email, full_name, role, is_active}. The auth_user_id
--   column stays NULL. When that person later signs in via OTP, an
--   auth.users row is created/found by email, but nothing links the two.
--
--   public.is_active_staff() (defined in the lockdown migration) checks
--   `auth_user_id = auth.uid()`. With auth_user_id NULL, that returns
--   false for every legacy staff member, so the staff_all policies on
--   customers / quotes / orders / quote_files / etc. silently deny the
--   admin UI's 21 direct supabase queries — every admin page would
--   return zero rows.
--
-- Three-part fix in this migration:
--   1. One-shot UPDATE to backfill auth_user_id for staff rows whose
--      email already matches an auth.users row.
--   2. Trigger on auth.users INSERT that links any matching staff_users
--      row whenever a new auth account is created. Covers the common
--      case of "admin adds staff member, staff member then signs in".
--   3. Replace public.is_active_staff() with a version that, in addition
--      to the auth.uid() match, falls back to an email match for rows
--      whose auth_user_id is still NULL. This is the safety net for
--      anyone added but not yet backfilled — security model is
--      unchanged because controlling the email account is already
--      what lets you sign in as that staff member.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Backfill auth_user_id for legacy staff_users rows.
-- ---------------------------------------------------------------------------

UPDATE public.staff_users s
   SET auth_user_id = u.id,
       updated_at   = NOW()
  FROM auth.users u
 WHERE s.auth_user_id IS NULL
   AND lower(s.email) = lower(u.email);

-- ---------------------------------------------------------------------------
-- 2. Trigger on auth.users INSERT to keep them in sync going forward.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_staff_user_on_auth_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.staff_users
     SET auth_user_id = NEW.id,
         updated_at   = NOW()
   WHERE auth_user_id IS NULL
     AND lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.link_staff_user_on_auth_signup() FROM PUBLIC;

DROP TRIGGER IF EXISTS link_staff_user_on_auth_signup ON auth.users;
CREATE TRIGGER link_staff_user_on_auth_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_staff_user_on_auth_signup();

-- ---------------------------------------------------------------------------
-- 3. Tolerant is_active_staff(): match by auth.uid() OR (legacy) by email
--    from the JWT when auth_user_id is still NULL.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_users
    WHERE is_active = true
      AND (
        auth_user_id = auth.uid()
        OR (
          auth_user_id IS NULL
          AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verification — informational, safe to leave in.
-- ---------------------------------------------------------------------------

SELECT
  COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL) AS linked,
  COUNT(*) FILTER (WHERE auth_user_id IS NULL)     AS unlinked,
  COUNT(*)                                          AS total
FROM public.staff_users
WHERE is_active = true;

COMMIT;
