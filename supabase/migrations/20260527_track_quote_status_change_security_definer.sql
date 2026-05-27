-- track_quote_status_change is fired on every quotes UPDATE and inserts an
-- audit row into quote_status_history. The function ran as the caller
-- (INVOKER), which for the admin client means the anon role — and
-- quote_status_history's RLS only allows service_role to insert. Result:
-- "new row violates row-level security policy for table
-- quote_status_history" on every Send Quote Link / Receive Payment / inline
-- status edit from the admin UI.
--
-- Standard audit-trigger pattern: SECURITY DEFINER so the insert runs as
-- the function owner (postgres) and bypasses the RLS check. The trigger
-- still only fires on quotes UPDATE, so the gate stays at the quotes
-- table's RLS.

CREATE OR REPLACE FUNCTION public.track_quote_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO quote_status_history (
            quote_id,
            previous_status,
            new_status,
            changed_by_type,
            metadata
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            'system',
            jsonb_build_object(
                'previous_updated_at', OLD.updated_at,
                'new_updated_at', NEW.updated_at
            )
        );
    END IF;
    RETURN NEW;
END;
$function$;
