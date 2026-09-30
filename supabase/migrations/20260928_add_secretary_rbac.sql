-- The Klinique role-based access control hardening.
-- Adds two secretary seats and makes authorization database-backed.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('superadmin', 'doctor', 'secretary', 'patient'));

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'patient');
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

-- Public sign-up metadata is user-controlled, so new registrations must never
-- be able to mint staff access. Staff roles are assigned only through the
-- protected assign_staff_role function below.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
          case when lower(new.email) in ('thekliniquekrew1@gmail.com', 'thekliniquekrew2@gmail.com')
               then 'secretary'
               when new.raw_app_meta_data->>'role' in ('superadmin', 'doctor', 'secretary')
               then new.raw_app_meta_data->>'role' else 'patient' end)
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);
  return new;
end;
$$;

-- The clinic requested exactly two secretary accounts. This constraint prevents
-- accidental creation of a third seat while still allowing staff turnover.
create or replace function public.enforce_secretary_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.role = 'secretary' and (tg_op = 'INSERT' or old.role is distinct from 'secretary') and
     (select count(*) from public.profiles where role = 'secretary' and id <> new.id) >= 2 then
    raise exception 'The two secretary seats are already assigned.';
  end if;
  return new;
end;
$$;

-- These are the only two secretary seats. Normalize any earlier test role
-- assignments before enforcing the limit and assigning the production crew.
update public.profiles
set role = 'patient', updated_at = now()
where role = 'secretary'
  and lower(email) not in ('thekliniquekrew1@gmail.com', 'thekliniquekrew2@gmail.com');

drop trigger if exists enforce_secretary_seat_limit on public.profiles;
create trigger enforce_secretary_seat_limit
  before insert or update of role on public.profiles
  for each row execute function public.enforce_secretary_seat_limit();

-- Assign the two designated clinic crew accounts when their profiles already
-- exist in Auth, even if an older signup did not create a profile. If they
-- register later, handle_new_user above assigns the role automatically.
insert into public.profiles (id, email, full_name, role)
select id, email, coalesce(raw_user_meta_data->>'full_name', ''), 'secretary'
from auth.users
where lower(email) in ('thekliniquekrew1@gmail.com', 'thekliniquekrew2@gmail.com')
on conflict (id) do update
set email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    role = 'secretary',
    updated_at = now();

update public.profiles
set role = 'secretary', updated_at = now()
where lower(email) in ('thekliniquekrew1@gmail.com', 'thekliniquekrew2@gmail.com');

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = public.current_user_role());

drop policy if exists "Superadmin can read all profiles" on public.profiles;
drop policy if exists "Doctors can read all profiles" on public.profiles;
drop policy if exists "Clinical leaders can read all profiles" on public.profiles;
create policy "Clinical leaders can read all profiles"
  on public.profiles for select
  using (public.current_user_role() in ('superadmin', 'doctor'));

drop policy if exists "Secretaries can read patient profiles" on public.profiles;
create policy "Secretaries can read patient profiles"
  on public.profiles for select
  using (public.current_user_role() = 'secretary' and role = 'patient');

-- A superadmin or doctor can manage staff roles without exposing direct
-- profile role updates to browsers. Secretary access remains restricted to
-- the two designated clinic crew accounts.
create or replace function public.assign_staff_role(target_email text, target_role text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public.current_user_role() not in ('superadmin', 'doctor') then
    raise exception 'Not authorized';
  end if;
  if target_role not in ('doctor', 'secretary', 'patient') then
    raise exception 'Invalid assignable role';
  end if;
  if target_role = 'secretary' and lower(trim(target_email)) not in
     ('thekliniquekrew1@gmail.com', 'thekliniquekrew2@gmail.com') then
    raise exception 'Secretary access is restricted to the two designated clinic crew accounts.';
  end if;
  if lower(trim(target_email)) in
     ('thekliniquekrew1@gmail.com', 'thekliniquekrew2@gmail.com') and target_role <> 'secretary' then
    raise exception 'The designated clinic crew accounts must keep the secretary role.';
  end if;
  update public.profiles set role = target_role, updated_at = now()
  where lower(email) = lower(trim(target_email));
  if not found then raise exception 'No profile found for that email'; end if;
end;
$$;

revoke all on function public.assign_staff_role(text, text) from public;
grant execute on function public.assign_staff_role(text, text) to authenticated;
