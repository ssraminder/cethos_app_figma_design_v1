-- Auto-qualification pipeline audit tables (ISO 17100 §3.1 gap-fill).
-- Every run + per-vendor result is recorded with full inputs, the AI
-- extraction (verbatim quotes), and the deterministic rule outcome —
-- reproducible per the project's AI-feature convention.

CREATE TABLE qms.auto_qualification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run','live')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','aborted')),
  prompt_version text NOT NULL,
  model text,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  vendor_count int,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_by uuid,
  created_by_label text NOT NULL DEFAULT 'system'
);

CREATE TABLE qms.auto_qualification_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES qms.auto_qualification_runs(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','error')),
  decision text CHECK (decision IN ('auto_qualify','escalate','chase')),
  roles text[],
  basis_code text,
  confidence numeric,
  reasons text[],
  flags text[],
  inputs jsonb,
  extraction jsonb,
  error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, vendor_id)
);

CREATE INDEX idx_aqr_run_status ON qms.auto_qualification_results(run_id, status);
CREATE INDEX idx_aqr_vendor ON qms.auto_qualification_results(vendor_id);
