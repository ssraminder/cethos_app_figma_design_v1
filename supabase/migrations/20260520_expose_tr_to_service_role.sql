-- Edge functions (tr-create-job, tr-link-existing-file, etc.) use service_role
-- to read/write tr.*. Without pgrst.db_schemas + USAGE/SELECT grants on the
-- service_role, PostgREST returns 404 on every tr.* lookup → tr-create-job
-- 404s with "methodology_template not found" because the template row is
-- invisible to the function's service-role client.
--
-- The earlier 20260520_expose_tr_schema_postgrest.sql migration handled
-- postgres + authenticator (used by the UI's authenticated calls) but not
-- service_role. This migration closes the gap.

ALTER ROLE service_role SET pgrst.db_schemas TO 'public, graphql_public, tr';

GRANT USAGE ON SCHEMA tr TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tr TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tr TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tr GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tr GRANT USAGE, SELECT ON SEQUENCES TO service_role;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
