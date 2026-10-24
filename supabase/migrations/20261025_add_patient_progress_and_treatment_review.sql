-- Clinical photos are private and are accessed through the doctor-only API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-clinical-media', 'patient-clinical-media', false, 3145728, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.patient_photos (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  kind text not null check (kind in ('profile','before','after','progress')),
  taken_on date not null,
  area text not null default '' check (length(area) <= 150),
  description text not null default '' check (length(description) <= 2000),
  storage_path text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index patient_profile_photo on public.patient_photos(client_id) where kind = 'profile';
create index patient_photo_history on public.patient_photos(client_id, taken_on desc);
create table public.patient_progress_notes (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  visit_date date not null,
  description text not null check (length(trim(description)) between 1 and 10000),
  follow_up_date date check (follow_up_date is null or follow_up_date >= visit_date),
  follow_up_notes text not null default '' check (length(follow_up_notes) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index patient_progress_history on public.patient_progress_notes(client_id, visit_date desc);
alter table public.patient_photos enable row level security;
alter table public.patient_progress_notes enable row level security;
revoke all on public.patient_photos, public.patient_progress_notes from anon, authenticated;
grant all on public.patient_photos, public.patient_progress_notes to service_role;

-- Retain the existing clinical stages and add an explicit Finalize review.
alter table public.treatment_cases add column if not exists performed_on date;
alter table public.treatment_cases drop constraint if exists treatment_cases_current_step_check;
update public.treatment_cases set current_step = 5 where status = 'completed';
update public.treatment_cases set current_step = 4 where current_step > 5;
alter table public.treatment_cases add constraint treatment_cases_current_step_check check (current_step between 1 and 5);

-- A treatment chart and its appointment complete together; completed charts stay read-only.
create function public.save_treatment_chart(p_appointment_id uuid, p_doctor_id uuid, p_record jsonb, p_complete boolean)
returns public.treatment_cases language plpgsql set search_path = public as $$
declare visit public.appointments; previous public.treatment_cases; result public.treatment_cases; incoming public.treatment_cases;
begin
  select * into visit from public.appointments where id = p_appointment_id for update;
  if not found or visit.status not in ('confirmed','completed') then raise exception 'Only confirmed treatment visits can be charted'; end if;
  select * into previous from public.treatment_cases where appointment_id = visit.id for update;
  if visit.status = 'completed' or previous.status = 'completed' then raise exception 'Completed treatments are available for review only'; end if;
  incoming := jsonb_populate_record(null::public.treatment_cases, p_record);
  if incoming.current_step > 1 and (not coalesce(incoming.consent_given,false) or coalesce(trim(incoming.consent_signature_name),'') = '') then raise exception 'Patient acknowledgment and signature name are required'; end if;
  if p_complete and (not coalesce(incoming.postcare_given,false) or not coalesce(incoming.consent_given,false)) then raise exception 'Consent and post-care confirmation are required'; end if;
  insert into public.treatment_cases (appointment_id,client_id,service_id,doctor_id,status,current_step,
    consent_given,consent_signature_name,consent_version,consent_text_snapshot,consented_at,consent_witnessed_by,
    anesthesia_type,anesthesia_product,anesthesia_amount,anesthesia_applied_at,anesthesia_notes,
    procedure_details,procedure_notes,performed_on,procedure_started_at,procedure_completed_at,
    postcare_instructions,postcare_given,postcare_given_at,follow_up_required,follow_up_date,follow_up_notes,completed_at,updated_at)
  values (visit.id,visit.client_id,visit.service_id,p_doctor_id,case when p_complete then 'completed' else 'in_progress' end,
    case when p_complete then 5 else incoming.current_step end,
    incoming.consent_given,incoming.consent_signature_name,incoming.consent_version,incoming.consent_text_snapshot,
    case when incoming.consent_given then coalesce(previous.consented_at,now()) end,case when incoming.consent_given then coalesce(previous.consent_witnessed_by,p_doctor_id) end,
    incoming.anesthesia_type,incoming.anesthesia_product,incoming.anesthesia_amount,
    case when incoming.anesthesia_type <> 'none' then coalesce(previous.anesthesia_applied_at,now()) end,incoming.anesthesia_notes,
    coalesce(incoming.procedure_details,'{}'::jsonb),incoming.procedure_notes,incoming.performed_on,
    case when incoming.current_step >= 3 then coalesce(previous.procedure_started_at,now()) end,
    case when incoming.current_step >= 4 then coalesce(previous.procedure_completed_at,now()) end,
    incoming.postcare_instructions,incoming.postcare_given,case when incoming.postcare_given then coalesce(previous.postcare_given_at,now()) end,
    incoming.follow_up_required,incoming.follow_up_date,incoming.follow_up_notes,case when p_complete then now() end,now())
  on conflict (appointment_id) do update set status=excluded.status,current_step=excluded.current_step,
    consent_given=excluded.consent_given,consent_signature_name=excluded.consent_signature_name,consent_version=excluded.consent_version,consent_text_snapshot=excluded.consent_text_snapshot,
    consented_at=excluded.consented_at,consent_witnessed_by=excluded.consent_witnessed_by,
    anesthesia_type=excluded.anesthesia_type,anesthesia_product=excluded.anesthesia_product,anesthesia_amount=excluded.anesthesia_amount,anesthesia_applied_at=excluded.anesthesia_applied_at,anesthesia_notes=excluded.anesthesia_notes,
    procedure_details=excluded.procedure_details,procedure_notes=excluded.procedure_notes,performed_on=excluded.performed_on,procedure_started_at=excluded.procedure_started_at,procedure_completed_at=excluded.procedure_completed_at,
    postcare_instructions=excluded.postcare_instructions,postcare_given=excluded.postcare_given,postcare_given_at=excluded.postcare_given_at,
    follow_up_required=excluded.follow_up_required,follow_up_date=excluded.follow_up_date,follow_up_notes=excluded.follow_up_notes,completed_at=excluded.completed_at,updated_at=excluded.updated_at
  returning * into result;
  if p_complete then update public.appointments set status='completed',completed_at=coalesce(completed_at,now()) where id=visit.id; end if;
  return result;
end $$;
revoke all on function public.save_treatment_chart(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_treatment_chart(uuid,uuid,jsonb,boolean) to service_role;
