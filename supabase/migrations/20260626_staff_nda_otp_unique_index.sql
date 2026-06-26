-- Add 'staff_nda' to the channel CHECK constraint
ALTER TABLE public.secure_upload_otps
  DROP CONSTRAINT IF EXISTS secure_upload_otps_channel_check,
  ADD CONSTRAINT secure_upload_otps_channel_check
    CHECK (channel = ANY (ARRAY['email'::text, 'phone'::text, 'staff_nda'::text]));

-- Partial unique index so the delete+insert pattern in staff-nda-otp-send is safe.
-- A full unique index can't be added due to a pre-existing phone duplicate row.
CREATE UNIQUE INDEX IF NOT EXISTS secure_upload_otps_contact_channel_unique
ON public.secure_upload_otps(contact, channel)
WHERE channel = 'staff_nda';
