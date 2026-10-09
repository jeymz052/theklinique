alter table public.clients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text;

create index if not exists idx_clients_archived_at on public.clients (archived_at);

comment on column public.clients.archived_at is
  'Soft-delete marker. Archived patient records remain available for retention, audit, and restoration.';
