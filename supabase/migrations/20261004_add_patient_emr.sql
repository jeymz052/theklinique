-- Patient directory and EMR identity fields. Authentication accounts and
-- clinic-only/manual patients share the same public.clients record.

alter table public.clients
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists patient_no text unique default ('TKP-' || upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 8))),
  add column if not exists sex text check (sex is null or sex in ('female', 'male', 'other', 'prefer_not_to_say')),
  add column if not exists address text,
  add column if not exists civil_status text,
  add column if not exists blood_type text,
  add column if not exists allergies text,
  add column if not exists medical_history text,
  add column if not exists current_medications text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists record_source text not null default 'booking'
    check (record_source in ('signup', 'booking', 'manual'));

update public.clients
set patient_no = 'TKP-' || upper(substr(replace(id::text, '-', ''), 1, 8))
where patient_no is null;

create index if not exists idx_clients_auth_user_id on public.clients(auth_user_id);
create index if not exists idx_clients_full_name on public.clients(lower(full_name));

create or replace function public.sync_patient_profile_to_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'patient' and new.email is not null then
    insert into public.clients (auth_user_id, full_name, email, phone, record_source)
    values (
      new.id,
      coalesce(nullif(trim(new.full_name), ''), split_part(new.email, '@', 1)),
      lower(new.email),
      '',
      'signup'
    )
    on conflict (email) do update
      set auth_user_id = excluded.auth_user_id,
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists sync_patient_profile_to_client on public.profiles;
create trigger sync_patient_profile_to_client
  after insert or update of email, full_name, role on public.profiles
  for each row execute function public.sync_patient_profile_to_client();

insert into public.clients (auth_user_id, full_name, email, phone, record_source)
select p.id,
       coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)),
       lower(p.email),
       '',
       'signup'
from public.profiles p
where p.role = 'patient' and p.email is not null
on conflict (email) do update
  set auth_user_id = excluded.auth_user_id,
      updated_at = now();
