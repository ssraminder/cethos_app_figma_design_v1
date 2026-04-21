-- ============================================================================
-- staff_users: add authenticated-read policy + realtime publication
-- Admin UIs sign in through supabase.auth, so authenticated JWTs can safely
-- read the staff roster. Prior state: RLS enabled but no policies, so all
-- client-side queries silently returned zero rows.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='staff_users' AND policyname='Authenticated can read active staff'
  ) THEN
    CREATE POLICY "Authenticated can read active staff"
      ON public.staff_users FOR SELECT
      TO authenticated
      USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='staff_users' AND policyname='Service role full access on staff_users'
  ) THEN
    CREATE POLICY "Service role full access on staff_users"
      ON public.staff_users FOR ALL
      TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='staff_users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_users;
  END IF;
END $$;
