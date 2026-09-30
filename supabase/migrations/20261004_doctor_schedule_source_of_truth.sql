-- Doctor-managed weekly hours and leave dates are the canonical booking calendar.
-- This project currently has one bookable doctor, so the existing clinic-wide rows
-- represent that doctor's calendar without introducing an unused doctor foreign key.

alter table public.availability_schedules
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.blocked_dates
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.availability_schedules
  drop constraint if exists availability_schedules_valid_hours;

alter table public.availability_schedules
  add constraint availability_schedules_valid_hours check (open_time < close_time);

-- Protect availability even if an appointment is written somewhere other than the
-- Next.js booking endpoint. Cancelled/no-show history is intentionally exempt.
create or replace function public.enforce_appointment_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  schedule_row public.availability_schedules%rowtype;
begin
  if new.status in ('cancelled'::public.appointment_status, 'no_show'::public.appointment_status) then
    return new;
  end if;

  -- A later leave block must not prevent staff from completing or confirming an
  -- appointment that was already valid when it was booked.
  if tg_op = 'UPDATE'
    and old.status not in ('cancelled'::public.appointment_status, 'no_show'::public.appointment_status)
    and new.appointment_date = old.appointment_date
    and new.appointment_time = old.appointment_time then
    return new;
  end if;

  select * into schedule_row
  from public.availability_schedules
  where day_of_week = extract(dow from new.appointment_date)::smallint
    and is_active = true;

  if not found or new.appointment_time < schedule_row.open_time or new.appointment_time >= schedule_row.close_time then
    raise exception using
      errcode = '23514',
      message = 'Appointment time is outside the doctor schedule.';
  end if;

  if exists (
    select 1 from public.blocked_dates
    where blocked_date = new.appointment_date
  ) then
    raise exception using
      errcode = '23514',
      message = 'Appointment date is blocked by the doctor.';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_enforce_doctor_schedule on public.appointments;
create trigger appointments_enforce_doctor_schedule
  before insert or update of appointment_date, appointment_time, status
  on public.appointments
  for each row execute function public.enforce_appointment_schedule();

create index if not exists idx_blocked_dates_upcoming
  on public.blocked_dates (blocked_date);
