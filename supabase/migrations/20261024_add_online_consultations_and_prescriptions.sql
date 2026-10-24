-- Online visits share appointments, availability, blocked dates and slot uniqueness.
alter table public.appointments add column if not exists consultation_mode text not null default 'clinic'
  check (consultation_mode in ('clinic', 'online'));

insert into public.services (category_id, subcategory, name, slug, description, price, price_note, duration_mins, is_active, sort_order)
select id, 'Consultations', 'Online Consultation with Dr. Kharyl', 'online-consultation',
  'A video consultation with Dr. Kharyl via Google Meet or Zoom, with a digital prescription when needed.',
  600, 'Full online consultation fee · QR Ph via PayMongo', 60, true, 2
from public.service_categories where slug = 'consultations'
on conflict (slug) do update set price = 600, price_note = excluded.price_note;

insert into public.service_subcategories (category_id, name, slug, sort_order)
select id, 'Consultations', 'consultations', 0 from public.service_categories where slug = 'consultations'
on conflict (category_id, name) do nothing;
alter table public.services add constraint online_consultation_price check (slug <> 'online-consultation' or price = 600);

-- Keep signatures and the reusable meeting room out of the public clinic settings.
create table public.consultation_settings (
  id smallint primary key default 1 check (id = 1),
  meeting_url text not null default '',
  signature_data_url text not null default '',
  prc_number text not null default '',
  specialty text not null default 'Medical & Aesthetic Doctor',
  prescription_heading text not null default 'Electronic Prescription',
  prescription_footer text not null default '',
  accent_color text not null default '#c0385f',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.consultation_settings (id) values (1);

alter table public.consultation_charts
  add column if not exists prescription_draft jsonb,
  add column if not exists no_prescription_required boolean not null default false;

create table public.prescription_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null check (length(name) between 1 and 120),
  prescription jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.medical_documents (
  id uuid primary key default uuid_generate_v4(),
  reference_no text not null unique,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  doctor_id uuid references auth.users(id) on delete set null,
  document_type text not null check (document_type in ('prescription','certificate','lab_request','referral','consent','aftercare')),
  title text not null,
  content jsonb not null,
  released_to_patient boolean not null default true,
  issued_at timestamptz not null default now()
);
create index idx_medical_documents_patient on public.medical_documents (client_id, issued_at desc);
create unique index uq_visit_prescription on public.medical_documents (appointment_id) where document_type = 'prescription';

alter table public.consultation_settings enable row level security;
alter table public.prescription_templates enable row level security;
alter table public.medical_documents enable row level security;
revoke all on public.consultation_settings, public.prescription_templates, public.medical_documents from anon, authenticated;
grant all on public.consultation_settings, public.prescription_templates, public.medical_documents to service_role;

-- Saving a chart and completing its appointment must succeed together.
create or replace function public.save_consultation_chart(p_appointment_id uuid, p_doctor_id uuid, p_chart jsonb, p_status text)
returns public.consultation_charts language plpgsql set search_path = public as $$
declare visit public.appointments; result public.consultation_charts; issued public.medical_documents;
begin
  select * into visit from public.appointments where id = p_appointment_id for update;
  if not found or visit.status not in ('confirmed','completed') then raise exception 'Only confirmed visits can be charted'; end if;
  if p_status not in ('ready','in_progress','completed') then raise exception 'Invalid chart status'; end if;
  if visit.status = 'completed' and p_status <> 'completed' then raise exception 'A completed visit cannot be returned to draft'; end if;
  select * into issued from public.medical_documents where appointment_id = visit.id and document_type = 'prescription';
  if found and ((p_chart->'prescription_draft') is distinct from (issued.content->'prescription')
    or coalesce((p_chart->>'no_prescription_required')::boolean,false)) then
    raise exception 'The issued prescription cannot be changed';
  end if;
  if p_status = 'completed' then
    if coalesce(trim(p_chart->>'clinical_assessment'), '') = '' or coalesce(trim(p_chart->>'treatment_plan'), '') = '' then
      raise exception 'Clinical assessment and treatment plan are required before finalizing';
    end if;
    if visit.consultation_mode = 'online' and not coalesce((p_chart->>'no_prescription_required')::boolean, false)
      and not exists(select 1 from public.medical_documents where appointment_id = visit.id and document_type = 'prescription') then
      raise exception 'Issue the prescription or confirm that no prescription is required';
    end if;
  end if;
  insert into public.consultation_charts (appointment_id, client_id, doctor_id, clinical_assessment, subjective_notes, objective_notes, treatment_plan,
    follow_up_required, follow_up_recommended_date, follow_up_notes, prescription_draft, no_prescription_required, status, started_at, completed_at)
  values (visit.id, visit.client_id, p_doctor_id, nullif(p_chart->>'clinical_assessment',''), nullif(p_chart->>'subjective_notes',''),
    nullif(p_chart->>'objective_notes',''), nullif(p_chart->>'treatment_plan',''), coalesce((p_chart->>'follow_up_required')::boolean,false),
    nullif(p_chart->>'follow_up_recommended_date','')::date, nullif(p_chart->>'follow_up_notes',''), nullif(p_chart->'prescription_draft','null'::jsonb),
    coalesce((p_chart->>'no_prescription_required')::boolean,false), p_status, case when p_status <> 'ready' then now() end, case when p_status = 'completed' then now() end)
  on conflict (appointment_id) do update set clinical_assessment = excluded.clinical_assessment, subjective_notes = excluded.subjective_notes,
    objective_notes = excluded.objective_notes, treatment_plan = excluded.treatment_plan, follow_up_required = excluded.follow_up_required,
    follow_up_recommended_date = excluded.follow_up_recommended_date, follow_up_notes = excluded.follow_up_notes,
    prescription_draft = excluded.prescription_draft, no_prescription_required = excluded.no_prescription_required,
    status = excluded.status, started_at = coalesce(consultation_charts.started_at, excluded.started_at),
    completed_at = coalesce(consultation_charts.completed_at, excluded.completed_at), updated_at = now()
  returning * into result;
  if p_status = 'completed' then update public.appointments set status = 'completed', completed_at = coalesce(completed_at,now()) where id = visit.id; end if;
  return result;
end $$;
revoke all on function public.save_consultation_chart(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.save_consultation_chart(uuid,uuid,jsonb,text) to service_role;

create function public.issue_consultation_prescription(p_appointment_id uuid, p_doctor_id uuid, p_id uuid, p_content jsonb)
returns public.medical_documents language plpgsql set search_path = public as $$
declare visit public.appointments; chart public.consultation_charts; result public.medical_documents;
begin
  select * into visit from public.appointments where id = p_appointment_id for update;
  if not found or visit.consultation_mode <> 'online' or visit.status not in ('confirmed','completed') then
    raise exception 'Only confirmed online consultations can have a digital prescription';
  end if;
  select * into result from public.medical_documents where appointment_id = visit.id and document_type = 'prescription';
  if found then return result; end if;
  select * into chart from public.consultation_charts where appointment_id = visit.id for update;
  if not found or coalesce(trim(chart.clinical_assessment),'') = '' or chart.no_prescription_required then
    raise exception 'Save the assessment and prescription before issuing';
  end if;
  if chart.prescription_draft is distinct from (p_content->'prescription') then
    raise exception 'The prescription draft changed. Reload and review it again';
  end if;
  if jsonb_array_length(coalesce(chart.prescription_draft->'medicines','[]'::jsonb)) = 0 then raise exception 'Add at least one medicine'; end if;
  insert into public.medical_documents (id, reference_no, appointment_id, client_id, doctor_id, document_type, title, content, released_to_patient)
  values (p_id, 'RX-' || upper(substr(replace(p_id::text,'-',''),1,12)), visit.id, visit.client_id, p_doctor_id,
    'prescription', 'Prescription', p_content, coalesce((chart.prescription_draft->>'releaseToPatient')::boolean,true)) returning * into result;
  return result;
end $$;
revoke all on function public.issue_consultation_prescription(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.issue_consultation_prescription(uuid,uuid,uuid,jsonb) to service_role;

-- Issued documents retain the exact patient, prescription and prescriber snapshot.
create function public.protect_issued_medical_document() returns trigger language plpgsql as $$
begin
  if new.content is distinct from old.content or new.reference_no is distinct from old.reference_no
    or new.client_id is distinct from old.client_id or new.appointment_id is distinct from old.appointment_id
    or new.document_type is distinct from old.document_type or new.issued_at is distinct from old.issued_at then
    raise exception 'Issued medical documents cannot be rewritten';
  end if;
  return new;
end $$;
create trigger protect_issued_document before update on public.medical_documents for each row execute function public.protect_issued_medical_document();
