-- Audit trail for every file synced to Dropbox
-- Supports ISO 17100 reproducibility: SHA-256 hash + timestamp per sync
create table if not exists dropbox_file_syncs (
  id uuid primary key default gen_random_uuid(),

  -- What was synced
  source_bucket text not null,              -- e.g. 'quote-files', 'vendor-deliveries'
  source_path text not null,                -- storage path in Supabase
  dropbox_path text not null,               -- destination path in Dropbox
  sha256_hash text,                         -- SHA-256 of the file at sync time

  -- Context
  sync_trigger text not null,               -- lifecycle stage: 'client_upload', 'vendor_delivery', 'staff_delivery', 'draft_promoted', 'affidavit_generated', 'certified_final', 'vendor_evidence', 'customer_file'
  order_id uuid,                            -- FK to orders (nullable for non-order files)
  quote_id uuid,                            -- FK to quotes
  quote_file_id uuid,                       -- FK to quote_files
  step_delivery_id uuid,                    -- FK to step_deliveries
  vendor_id uuid,                           -- FK to vendors (for evidence files)
  customer_id uuid,                         -- FK to customers (for customer files)

  -- Result
  status text not null default 'pending',   -- 'pending', 'synced', 'failed', 'hash_mismatch'
  file_size_bytes bigint,
  dropbox_content_hash text,                -- Dropbox's own content hash for verification
  error_message text,
  retry_count integer not null default 0,

  -- Sharing
  shared_link_url text,                     -- if a shared link was created
  shared_with text[],                       -- emails shared with

  -- Timestamps
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists idx_dropbox_syncs_order on dropbox_file_syncs(order_id) where order_id is not null;
create index if not exists idx_dropbox_syncs_status on dropbox_file_syncs(status) where status != 'synced';
create index if not exists idx_dropbox_syncs_trigger on dropbox_file_syncs(sync_trigger);
create index if not exists idx_dropbox_syncs_source on dropbox_file_syncs(source_bucket, source_path);

-- Prevent duplicate syncs of the same file
create unique index if not exists idx_dropbox_syncs_unique_source
  on dropbox_file_syncs(source_bucket, source_path, sync_trigger)
  where status = 'synced';

-- RLS: staff only
alter table dropbox_file_syncs enable row level security;

create policy "staff_read_dropbox_syncs"
  on dropbox_file_syncs for select
  using (
    auth.uid() in (select auth_user_id from staff_users where auth_user_id is not null)
  );

create policy "staff_insert_dropbox_syncs"
  on dropbox_file_syncs for insert
  with check (
    auth.uid() in (select auth_user_id from staff_users where auth_user_id is not null)
  );

create policy "staff_update_dropbox_syncs"
  on dropbox_file_syncs for update
  using (
    auth.uid() in (select auth_user_id from staff_users where auth_user_id is not null)
  );
