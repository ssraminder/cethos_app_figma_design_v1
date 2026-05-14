-- Normalize vendor emails to lowercase and prevent future regressions.
--
-- Backstory: vendor-portal login (and several edge functions, e.g.
-- vendor-auth-otp-send) lowercase the typed email before doing
-- .eq("email", normalized) on the vendors table. 13 active vendor rows
-- had mixed-case emails stored verbatim (e.g. "Hammadamin97@gmail.com",
-- "MAGDI882003@YAHOO.COM"), so those vendors could not log in or receive
-- OTPs. No collisions arise from lowercasing — verified before migration.

-- 1. Backfill: lowercase the email column where it differs.
UPDATE public.vendors
SET email = LOWER(email)
WHERE email IS NOT NULL
  AND email <> LOWER(email);

-- 2. Backfill: lowercase entries inside additional_emails (defensive — no
--    rows match today but the column accepts mixed-case writes).
UPDATE public.vendors
SET additional_emails = (
  SELECT ARRAY_AGG(LOWER(ae))
  FROM unnest(additional_emails) ae
)
WHERE additional_emails IS NOT NULL
  AND EXISTS (SELECT 1 FROM unnest(additional_emails) ae WHERE ae <> LOWER(ae));

-- 3. Trigger function: normalize email + additional_emails on every write.
CREATE OR REPLACE FUNCTION public.vendors_normalize_email()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := LOWER(TRIM(NEW.email));
  END IF;

  IF NEW.additional_emails IS NOT NULL THEN
    NEW.additional_emails := (
      SELECT ARRAY_AGG(LOWER(TRIM(ae)))
      FROM unnest(NEW.additional_emails) ae
      WHERE ae IS NOT NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Trigger: fires on INSERT and on UPDATE of the email columns.
DROP TRIGGER IF EXISTS vendors_normalize_email_trg ON public.vendors;

CREATE TRIGGER vendors_normalize_email_trg
BEFORE INSERT OR UPDATE OF email, additional_emails
ON public.vendors
FOR EACH ROW
EXECUTE FUNCTION public.vendors_normalize_email();
