alter table public.appointments add column if not exists payment_expires_at timestamptz;

update public.appointments set payment_expires_at = created_at + interval '15 minutes'
where status = 'pending'::public.appointment_status and payment_expires_at is null;

comment on column public.appointments.payment_expires_at is
  'Deadline for a patient reservation payment. Null for staff-created/confirmed appointments.';

create index if not exists idx_appointments_pending_payment_expiry
  on public.appointments (payment_expires_at)
  where status = 'pending'::public.appointment_status;

create or replace function public.release_expired_appointment_holds()
returns integer language plpgsql security definer set search_path = public as $$
declare released integer;
begin
  update public.appointments as appointment
  set status = 'cancelled'::public.appointment_status,
      cancellation_reason = 'Reservation payment deadline expired',
      cancelled_at = coalesce(appointment.cancelled_at, now()), updated_at = now()
  where appointment.status = 'pending'::public.appointment_status
    and appointment.payment_expires_at is not null and appointment.payment_expires_at <= now()
    and not exists (select 1 from public.payments as payment
      where payment.appointment_id = appointment.id and payment.status = 'paid'::public.payment_status);
  get diagnostics released = row_count;
  return released;
end;
$$;

revoke all on function public.release_expired_appointment_holds() from public, anon, authenticated;
grant execute on function public.release_expired_appointment_holds() to service_role;
