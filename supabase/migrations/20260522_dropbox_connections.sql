-- Dropbox OAuth connections (org-wide, single row)
create table if not exists dropbox_connections (
  id uuid primary key default gen_random_uuid(),
  access_token text not null,
  refresh_token text not null,
  account_id text,           -- Dropbox account ID
  account_email text,        -- Dropbox account email for display
  token_expires_at timestamptz,
  connected_by uuid references staff_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one active connection at a time
create unique index if not exists dropbox_connections_singleton
  on dropbox_connections ((true));

-- RLS: staff only
alter table dropbox_connections enable row level security;

create policy "staff_read_dropbox_connections"
  on dropbox_connections for select
  using (
    auth.uid() in (select auth_user_id from staff_users where auth_user_id is not null)
  );

create policy "staff_insert_dropbox_connections"
  on dropbox_connections for insert
  with check (
    auth.uid() in (select auth_user_id from staff_users where auth_user_id is not null)
  );

create policy "staff_update_dropbox_connections"
  on dropbox_connections for update
  using (
    auth.uid() in (select auth_user_id from staff_users where auth_user_id is not null)
  );

create policy "staff_delete_dropbox_connections"
  on dropbox_connections for delete
  using (
    auth.uid() in (select auth_user_id from staff_users where auth_user_id is not null)
  );
