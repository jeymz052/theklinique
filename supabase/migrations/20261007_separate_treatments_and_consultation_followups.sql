-- Medical procedures have their own four-stage workflow. Consultation and
-- consultation follow-ups are managed separately in consultation_charts.
alter table public.treatment_cases drop constraint if exists treatment_cases_current_step_check;
-- Collapse legacy Review/Follow-up steps into the final Post-Care stage. Follow-up
-- recommendations now belong to consultation charts, not the treatment wizard.
update public.treatment_cases set current_step = 4 where current_step > 4;
alter table public.treatment_cases add constraint treatment_cases_current_step_check check (current_step between 1 and 4);

alter table public.consultation_charts
  add column if not exists follow_up_required boolean not null default false,
  add column if not exists follow_up_recommended_date date,
  add column if not exists follow_up_notes text,
  add column if not exists follow_up_appointment_id uuid references public.appointments(id) on delete set null;

alter table public.appointments
  add column if not exists parent_appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists visit_kind text not null default 'standard'
    check (visit_kind in ('standard','consultation_follow_up'));

alter table public.appointments drop constraint if exists appointments_follow_up_link_check;
alter table public.appointments add constraint appointments_follow_up_link_check check (
  (visit_kind = 'standard' and parent_appointment_id is null)
  or
  (visit_kind = 'consultation_follow_up' and parent_appointment_id is not null and parent_appointment_id <> id)
);

create unique index if not exists uq_appointments_consultation_follow_up
  on public.appointments (parent_appointment_id)
  where visit_kind = 'consultation_follow_up'
    and status not in ('cancelled'::public.appointment_status, 'no_show'::public.appointment_status);

create index if not exists idx_appointments_parent
  on public.appointments (parent_appointment_id)
  where parent_appointment_id is not null;

insert into public.services (category_id, name, slug, description, price, price_note, duration_mins, is_active, sort_order)
select id, 'Follow-up Check-up', 'follow-up-check-up',
       'Follow-up consultation with Dr. Kharyl after an initial consultation.',
       500, 'Full follow-up consultation fee', 60, true, -1
from public.service_categories
where slug = 'consultations'
on conflict (slug) do update
set price = 500,
    price_note = 'Full follow-up consultation fee',
    is_active = true;
