-- Run in the Supabase SQL editor. These are ONLY Jordan Taduran's two old tests:
-- TK-20260019 (2027-03-27, 9 PM) and TK-20260020 (2027-03-26, 8 PM).
-- The replacement TK-20260021 is NOT included. This script has not been executed.
-- Select and run the entire DO block as one statement; no temporary table is used.
do $$
declare
  target_ids uuid[];
  deleted_count integer;
begin
  select array_agg(locked.id) into target_ids
  from (
    select appointment.id
    from public.appointments appointment
    join public.clients patient on patient.id = appointment.client_id
    join public.services service on service.id = appointment.service_id
    where appointment.id in (
      '8681390e-31f7-4371-ad2e-7a0b510be370'::uuid,
      '42825c3a-7a93-4bbf-90fd-f86a5da96a1a'::uuid
    )
      and patient.id = 'd8e71d25-9af1-4d95-899b-df9864c07915'::uuid
      and lower(trim(patient.full_name)) = 'jordan taduran'
      and appointment.consultation_mode = 'online'
      and service.slug = 'online-consultation'
    for update of appointment
  ) locked;

  if target_ids is null then
    raise notice 'No matching old test bookings remain.';
    return;
  end if;

  perform 1 from public.payments where appointment_id = any(target_ids) for update;
  if exists (select 1 from public.appointments where id = any(target_ids) and status::text not in ('pending','cancelled'))
    or exists (select 1 from public.payments where appointment_id = any(target_ids) and (status::text not in ('pending','awaiting_payment','failed') or paid_at is not null))
    or exists (select 1 from public.medical_documents where appointment_id = any(target_ids))
    or exists (select 1 from public.consultation_charts where appointment_id = any(target_ids))
    or exists (select 1 from public.treatment_cases where appointment_id = any(target_ids))
    or exists (select 1 from public.appointments where parent_appointment_id = any(target_ids) or source_consultation_appointment_id = any(target_ids))
  then raise exception 'Stopped: a target has payment, clinical, or linked-visit history. Review it before deleting.';
  end if;

  delete from public.payments where appointment_id = any(target_ids);
  delete from public.appointments where id = any(target_ids);
  get diagnostics deleted_count = row_count;
  raise notice 'Deleted % old online test booking(s). TK-20260021 is unchanged.', deleted_count;
end $$;
