-- Patient demographics live on clients; answers reviewed for a specific visit
-- are preserved as an immutable appointment intake snapshot.
create table public.appointment_intakes (
  id uuid primary key default uuid_generate_v4(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  booking_type text not null check (booking_type in ('consultation','treatment')),
  chief_concern text,
  treatment_goals text,
  allergies_snapshot text,
  medications_snapshot text,
  medical_history_snapshot text,
  pregnancy_status text check (pregnancy_status is null or pregnancy_status in ('not_applicable','no','yes','unsure','prefer_not_to_say')),
  previous_reactions text,
  recent_procedures text,
  information_confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_appointment_intakes_client
  on public.appointment_intakes (client_id, created_at desc);

alter table public.appointment_intakes enable row level security;
create policy "Service role manages appointment intakes"
  on public.appointment_intakes
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
