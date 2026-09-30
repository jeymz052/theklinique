-- Multiple procedures performed during one appointment.
-- The primary procedure remains appointments.service_id; additional procedures
-- selected through the booking cart are stored here.

create table if not exists public.appointment_services (
  id uuid primary key default uuid_generate_v4(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  price_snapshot numeric(10, 2) not null,
  duration_snapshot int,
  created_at timestamptz not null default now(),
  unique (appointment_id, service_id)
);

create index if not exists idx_appointment_services_appointment_id on public.appointment_services(appointment_id);
create index if not exists idx_appointment_services_service_id on public.appointment_services(service_id);

alter table public.appointment_services enable row level security;

drop policy if exists "service_role_appointment_services" on public.appointment_services;
create policy "service_role_appointment_services"
  on public.appointment_services
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Consultations are assessment-only. Retire any legacy consultation add-ons so
-- they cannot reappear through another catalog consumer.
update public.service_addons addon
set is_active = false
from public.services service, public.service_categories category
where addon.service_id = service.id
  and service.category_id = category.id
  and category.slug = 'consultations';

-- The online checkbox records permission to proceed with booking only. Formal
-- informed consent is still reviewed and signed in person at the clinic.
alter table public.appointments
  add column if not exists previsit_consent_acknowledged_at timestamptz,
  add column if not exists clinic_consent_signed_at timestamptz,
  add column if not exists aftercare_provided_at timestamptz;
