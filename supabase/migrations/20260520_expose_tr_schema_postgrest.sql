-- Expose tr schema via PostgREST + grant authenticated access.
-- Without this the admin UI's supabase.schema('tr').from(...) returns PGRST106
-- so the Translation Review pages (/admin/tr/jobs, AdminReviewJobNew, etc.)
-- can't read anything. RLS via tr.is_staff() remains the actual security gate.

-- Add tr to the postgres + authenticator role's exposed-schemas list.
DO $$
DECLARE
  current_schemas text;
  new_schemas text;
BEGIN
  SELECT setting INTO current_schemas
  FROM pg_settings
  WHERE name = 'pgrst.db_schemas';

  IF current_schemas IS NULL OR current_schemas = '' THEN
    new_schemas := 'public, graphql_public, tr';
  ELSIF current_schemas ~ '(^|,\s*)tr(\s*,|$)' THEN
    new_schemas := current_schemas;
  ELSE
    new_schemas := current_schemas || ', tr';
  END IF;

  EXECUTE format('ALTER ROLE postgres SET pgrst.db_schemas TO %L', new_schemas);
  EXECUTE format('ALTER ROLE authenticator SET pgrst.db_schemas TO %L', new_schemas);
END$$;

-- Grant authenticated access. Anon stays out (no USAGE grant). RLS on every
-- tr.* table enforces row-level visibility through tr.is_staff().
GRANT USAGE ON SCHEMA tr TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tr TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tr TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA tr GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA tr GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
