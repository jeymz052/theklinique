-- Editable clinic identity and policies used by the doctor/superadmin settings page.
create table if not exists public.clinic_settings (
  id smallint primary key default 1 check (id = 1),
  clinic_name text not null default 'The Klinique',
  doctor_name text not null default 'Dr. Kharyl Dence',
  contact_email text not null default 'thekliniqueinfo@gmail.com',
  contact_phone text not null default '+63 956 003 1916',
  address text not null default '',
  city text not null default 'Cagayan de Oro City',
  province text not null default 'Misamis Oriental',
  postal_code text not null default '9000',
  accepts_walk_ins boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.clinic_settings (id) values (1) on conflict (id) do nothing;
alter table public.clinic_settings enable row level security;

create policy "Public reads clinic settings"
  on public.clinic_settings for select using (true);

create policy "Service role manages clinic settings"
  on public.clinic_settings using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
