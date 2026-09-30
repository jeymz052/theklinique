-- Repair appointments whose PayMongo payment succeeded before the webhook
-- status mapping was corrected from `paid` to `confirmed`.
update public.appointments as appointment
set status = 'confirmed'::appointment_status,
    updated_at = now()
from public.payments as payment
where payment.appointment_id = appointment.id
  and payment.status = 'paid'::payment_status
  and appointment.status in ('pending'::appointment_status, 'paid'::appointment_status);

create index if not exists idx_payments_appointment_status
  on public.payments (appointment_id, status);
