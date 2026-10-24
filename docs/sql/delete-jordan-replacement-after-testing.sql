-- Run only AFTER testing is finished. This script has not been executed.
-- Deletes ONLY TK-20260021, January 4, 2027, 10 AM PHT.
-- Jordan's patient account and other bookings are retained.
begin;
do $$
declare test_id uuid := '138f8549-2038-4d8f-a9f8-49cb7c814fb3';
begin
  perform 1 from public.appointments appointment join public.clients patient on patient.id = appointment.client_id
  where appointment.id = test_id and appointment.reference_no = 'TK-20260021'
    and patient.id = 'd8e71d25-9af1-4d95-899b-df9864c07915'::uuid
    and lower(trim(patient.full_name)) = 'jordan taduran'
    and appointment.consultation_mode = 'online'
    and appointment.staff_notes like '[TEST-ONLINE-JORDAN-2027]%'
    and appointment.reservation_fee_waived_at is not null
  for update of appointment;
  if not found then raise exception 'Test booking not found or test safeguards did not match.'; end if;
  perform 1 from public.payments where appointment_id = test_id for update;
  if exists (select 1 from public.payments where appointment_id = test_id and (status::text <> 'waived' or paid_at is not null))
    or exists (select 1 from public.medical_documents where appointment_id = test_id)
    or exists (select 1 from public.appointments where parent_appointment_id = test_id or source_consultation_appointment_id = test_id)
  then raise exception 'Stopped: the test now has payment, issued-document, or linked-visit history. Review it first.'; end if;
  delete from public.payments where appointment_id = test_id;
  delete from public.appointments where id = test_id;
end $$;
commit;
