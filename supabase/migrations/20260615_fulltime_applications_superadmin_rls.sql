-- Super-admin-only read access to full-time ("Careers") staff applications, so
-- the PM portal (portal.cethos.com) "Employment Applications" view can list them
-- and download CVs.
--
-- Background: public.fulltime_applications + the private `careers-applications`
-- bucket were created by the main_web repo (migration 011). Capture is the public
-- Careers form on join.cethos.com (anon INSERT only); there is intentionally no
-- public SELECT. These policies add read access for super_admin staff only.
--
-- has_staff_role('super_admin') resolves to EXACTLY super_admin (top of the staff
-- role hierarchy) and checks staff_users by auth.uid() -- the same basis as the
-- existing cvp_applications staff RLS.

drop policy if exists "fulltime_applications super_admin read"
  on public.fulltime_applications;
create policy "fulltime_applications super_admin read"
  on public.fulltime_applications
  for select
  to authenticated
  using (public.has_staff_role('super_admin'));

-- Let super-admin staff read (and sign URLs for) CVs in the private bucket.
-- Upload stays public (the form); no other read access.
drop policy if exists "careers cv super_admin read" on storage.objects;
create policy "careers cv super_admin read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'careers-applications'
    and public.has_staff_role('super_admin')
  );
