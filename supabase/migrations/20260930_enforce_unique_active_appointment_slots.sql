-- A doctor can only have one active appointment in a date/time slot.
-- Cancelled and no-show records remain in history without blocking a rebooking.
create unique index if not exists uq_appointments_active_date_time
  on public.appointments (appointment_date, appointment_time)
  where status not in ('cancelled'::appointment_status, 'no_show'::appointment_status);

