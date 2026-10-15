alter table public.appointments
  add column if not exists source_consultation_appointment_id uuid
    references public.appointments(id) on delete set null;

alter table public.appointments
  add column if not exists selected_package_product_id uuid
    references public.products(id) on delete set null;

create unique index if not exists uq_appointments_source_consultation
  on public.appointments (source_consultation_appointment_id)
  where source_consultation_appointment_id is not null;

comment on column public.appointments.source_consultation_appointment_id is
  'Consultation after which this same-day procedure was added by the clinician.';

-- Completed visits are historical and must not prevent a new same-day procedure
-- from taking over the consultation slot.
drop index if exists public.uq_appointments_active_date_time;
create unique index uq_appointments_active_date_time
  on public.appointments (appointment_date, appointment_time)
  where status not in (
    'completed'::appointment_status,
    'cancelled'::appointment_status,
    'no_show'::appointment_status
  );
