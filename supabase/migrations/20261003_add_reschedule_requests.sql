create type public.reschedule_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

alter table public.appointments
  add column if not exists cancellation_reason text;

create table public.appointment_reschedule_requests (
  id uuid primary key default uuid_generate_v4(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  requested_date date not null,
  requested_time time not null,
  reason text,
  status public.reschedule_request_status not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_pending_reschedule_per_appointment
  on public.appointment_reschedule_requests (appointment_id)
  where status = 'pending'::public.reschedule_request_status;

create index idx_reschedule_requests_status_created
  on public.appointment_reschedule_requests (status, created_at desc);

alter table public.appointment_reschedule_requests enable row level security;

create policy "Patients read own reschedule requests"
  on public.appointment_reschedule_requests for select
  using (auth.uid() = requested_by);

create policy "Service role manages reschedule requests"
  on public.appointment_reschedule_requests
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
