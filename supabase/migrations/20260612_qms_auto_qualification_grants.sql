-- Tables moved via SET SCHEMA don't inherit public-schema default privileges.
GRANT ALL ON public.qms_auto_qualification_runs TO service_role;
GRANT ALL ON public.qms_auto_qualification_results TO service_role;
