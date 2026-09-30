create table if not exists public.app_notifications (
  id uuid primary key default uuid_generate_v4(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  event text not null,
  title text not null,
  body text not null,
  href text not null default '/dashboard/patient',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, appointment_id, event)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default uuid_generate_v4(),
  appointment_id uuid references public.appointments(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  event text not null,
  recipient text not null,
  status text not null default 'processing' check (status in ('processing', 'sent', 'failed')),
  provider_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (appointment_id, channel, event, recipient)
);

create index if not exists idx_app_notifications_recipient_created
  on public.app_notifications (recipient_id, created_at desc);

alter table public.app_notifications enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "Users can read own notifications" on public.app_notifications
  for select using (auth.uid() = recipient_id);
create policy "Users can update own notifications" on public.app_notifications
  for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
create policy "Service role manages notifications" on public.app_notifications
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "Service role manages notification deliveries" on public.notification_deliveries
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
