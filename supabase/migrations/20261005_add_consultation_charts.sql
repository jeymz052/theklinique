create table public.consultation_charts (
  id uuid primary key default uuid_generate_v4(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  doctor_id uuid references auth.users(id) on delete set null,
  clinical_assessment text,
  subjective_notes text,
  objective_notes text,
  treatment_plan text,
  status text not null default 'ready' check (status in ('ready', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_consultation_charts_client on public.consultation_charts(client_id, created_at desc);
alter table public.consultation_charts enable row level security;
create policy "Service role manages consultation charts" on public.consultation_charts
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
