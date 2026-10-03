create table if not exists public.booking_intake_questions (
  id uuid primary key default uuid_generate_v4(),
  system_key text unique,
  label text not null,
  placeholder text not null default '',
  input_type text not null default 'text' check (input_type in ('text','textarea','yes_no')),
  applies_to text not null default 'both' check (applies_to in ('both','consultation','treatment')),
  required boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.booking_intake_questions (system_key,label,placeholder,input_type,applies_to,required,sort_order) values
 ('chief_concern','Main concern','What would you like the doctor to assess?','textarea','both',true,10),
 ('treatment_goals','Goals or expected outcome','','textarea','both',false,20),
 ('allergies','Allergies','Enter None if none known','text','treatment',true,30),
 ('current_medications','Current medications','Enter None if none','text','treatment',true,40),
 ('medical_history','Relevant medical conditions','Enter None if none','textarea','treatment',true,50),
 ('pregnancy_status','Pregnancy / breastfeeding','','yes_no','treatment',false,60),
 ('previous_reactions','Previous treatment reactions','Enter None if none','text','treatment',false,70),
 ('recent_procedures','Recent procedures or treatments','Include approximate dates, if any','text','treatment',false,80)
on conflict (system_key) do nothing;

alter table public.appointment_intakes add column if not exists custom_answers jsonb not null default '{}'::jsonb;
alter table public.booking_intake_questions enable row level security;
drop policy if exists "Public reads active intake questions" on public.booking_intake_questions;
create policy "Public reads active intake questions" on public.booking_intake_questions for select to anon, authenticated using (active = true);
