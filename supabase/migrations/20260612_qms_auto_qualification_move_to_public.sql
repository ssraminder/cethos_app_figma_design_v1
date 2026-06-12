-- PostgREST does not expose the qms schema (same constraint that forced the
-- qms_* public views on 2026-06-02). Move the pipeline audit tables to public
-- with a qms_ prefix so the edge function can use them directly.
ALTER TABLE qms.auto_qualification_runs SET SCHEMA public;
ALTER TABLE qms.auto_qualification_results SET SCHEMA public;
ALTER TABLE public.auto_qualification_runs RENAME TO qms_auto_qualification_runs;
ALTER TABLE public.auto_qualification_results RENAME TO qms_auto_qualification_results;
ALTER TABLE public.qms_auto_qualification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_auto_qualification_results ENABLE ROW LEVEL SECURITY;
-- No policies: service-role-only via the qms-auto-qualify edge function.
