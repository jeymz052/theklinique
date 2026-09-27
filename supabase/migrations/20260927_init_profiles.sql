-- ============================================================
-- The Klinique — Supabase RBAC Schema & Seed
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Create profiles table (extends auth.users)
create table if not exists public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  email       text,
  full_name   text,
  role        text not null default 'patient'
                   check (role in ('superadmin', 'doctor', 'patient')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 2. Row Level Security
alter table public.profiles enable row level security;

-- Drop existing policies if re-running
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Superadmin can read all profiles" on public.profiles;
drop policy if exists "Doctors can read all profiles" on public.profiles;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Superadmin can read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'superadmin'
    )
  );

create policy "Doctors can read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('superadmin', 'doctor')
    )
  );

-- 3. Auto-create or sync profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_app_meta_data->>'role', new.raw_user_meta_data->>'role', 'patient')
  )
  on conflict (id) do update
  set email = excluded.email,
      role = coalesce(public.profiles.role, excluded.role);
  return new;
end;
$$;

-- Trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. Seed / sync existing users with their assigned roles
insert into public.profiles (id, email, full_name, role)
values 
  ('56b9db60-a794-4eb9-b92e-f83ce0052c84', 'estebanjames67@gmail.com', 'James Esteban', 'superadmin'),
  ('30f7fc55-cabe-48b3-84d9-ac7f6f9365c4', 'thekliniqueph@gmail.com', 'Dr. Kharyl Dence', 'doctor')
on conflict (id) do update
set role = excluded.role,
    email = excluded.email;
