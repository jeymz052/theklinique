create table public.treatment_protocols (
  id uuid primary key default uuid_generate_v4(),
  service_id uuid not null unique references public.services(id) on delete cascade,
  consent_title text not null default 'Treatment Consent',
  consent_version text not null default '1.0',
  consent_text text,
  anesthesia_requirement text not null default 'optional' check (anesthesia_requirement in ('none','optional','required')),
  allowed_anesthesia text[] not null default array['none','topical','local'],
  procedure_fields jsonb not null default '[{"key":"treatment_area","label":"Treatment area","type":"text","required":true},{"key":"product_device","label":"Product or device","type":"text","required":false},{"key":"settings_dose","label":"Settings or dose","type":"text","required":false},{"key":"lot_number","label":"Lot / batch number","type":"text","required":false}]'::jsonb,
  postcare_instructions text,
  default_follow_up_days integer check (default_follow_up_days is null or default_follow_up_days between 0 and 365),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.treatment_cases (
  id uuid primary key default uuid_generate_v4(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  doctor_id uuid references auth.users(id) on delete set null,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  current_step smallint not null default 1 check (current_step between 1 and 6),
  consultation_chart_id uuid references public.consultation_charts(id) on delete set null,
  consultation_notes text,
  consent_given boolean not null default false,
  consent_signature_name text,
  consent_version text,
  consent_text_snapshot text,
  consented_at timestamptz,
  consent_witnessed_by uuid references auth.users(id) on delete set null,
  anesthesia_type text check (anesthesia_type is null or anesthesia_type in ('none','topical','local')),
  anesthesia_product text,
  anesthesia_amount text,
  anesthesia_applied_at timestamptz,
  anesthesia_notes text,
  procedure_details jsonb not null default '{}'::jsonb,
  procedure_notes text,
  procedure_started_at timestamptz,
  procedure_completed_at timestamptz,
  postcare_instructions text,
  postcare_given boolean not null default false,
  postcare_given_at timestamptz,
  follow_up_required boolean not null default false,
  follow_up_date date,
  follow_up_time time,
  follow_up_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_treatment_cases_client on public.treatment_cases(client_id, created_at desc);
alter table public.treatment_protocols enable row level security;
alter table public.treatment_cases enable row level security;
create policy "Service role manages treatment protocols" on public.treatment_protocols using (auth.role()='service_role') with check (auth.role()='service_role');
create policy "Service role manages treatment cases" on public.treatment_cases using (auth.role()='service_role') with check (auth.role()='service_role');

insert into public.treatment_protocols (service_id, consent_title, consent_text, postcare_instructions)
select s.id,
       s.name || ' Consent',
       'I confirm that the procedure, expected benefits, alternatives, material risks, and aftercare were explained to me. I had an opportunity to ask questions and voluntarily consent to treatment.',
       'Follow the doctor''s treatment-specific instructions. Contact The Klinique promptly for unexpected or concerning symptoms.'
from public.services s
join public.service_categories c on c.id=s.category_id
where c.slug <> 'consultations'
on conflict (service_id) do nothing;
