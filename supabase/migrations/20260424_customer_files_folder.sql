-- Optional user-supplied folder/group label for customer_files.
-- Mirrors public_submissions.file_paths[].folder so customer + admin
-- uploads can preserve the same grouping the customer chose at upload time.

ALTER TABLE public.customer_files
  ADD COLUMN IF NOT EXISTS folder text;

CREATE INDEX IF NOT EXISTS idx_customer_files_customer_folder
  ON public.customer_files (customer_id, folder)
  WHERE folder IS NOT NULL;

COMMENT ON COLUMN public.customer_files.folder IS
  'Optional user-supplied folder/group label for the file (e.g. "Project 1"). Mirrors public_submissions.file_paths[].folder.';
