-- Allow authenticated staff users to read & update public_submissions and
-- customer_files. Anonymous users still have no access; clients without a
-- staff JWT go through edge functions (service role).

CREATE POLICY "Staff can read public_submissions"
  ON public.public_submissions
  FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can update public_submissions"
  ON public.public_submissions
  FOR UPDATE
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff can read customer_files"
  ON public.customer_files
  FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff can update customer_files"
  ON public.customer_files
  FOR UPDATE
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());
