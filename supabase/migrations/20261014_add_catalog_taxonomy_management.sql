-- Managed category/subcategory definitions for the Pricing catalog.
create table if not exists public.service_subcategories (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references public.service_categories(id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, name),
  unique (category_id, slug)
);

create table if not exists public.package_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  slug text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.package_subcategories (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references public.package_categories(id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, name),
  unique (category_id, slug)
);

insert into public.service_subcategories (category_id, name, slug, sort_order)
select distinct s.category_id, s.subcategory,
  trim(both '-' from regexp_replace(lower(s.subcategory), '[^a-z0-9]+', '-', 'g')),
  row_number() over (partition by s.category_id order by s.subcategory)
from public.services s
where trim(coalesce(s.subcategory, '')) <> ''
on conflict (category_id, name) do nothing;

insert into public.package_categories (name, slug, sort_order)
select distinct p.category,
  trim(both '-' from regexp_replace(lower(p.category), '[^a-z0-9]+', '-', 'g')),
  row_number() over (order by p.category)
from public.products p
where trim(coalesce(p.category, '')) <> ''
on conflict (name) do nothing;

insert into public.package_subcategories (category_id, name, slug, sort_order)
select distinct pc.id, p.subcategory,
  trim(both '-' from regexp_replace(lower(p.subcategory), '[^a-z0-9]+', '-', 'g')),
  row_number() over (partition by pc.id order by p.subcategory)
from public.products p
join public.package_categories pc on pc.name = p.category
where trim(coalesce(p.subcategory, '')) <> ''
on conflict (category_id, name) do nothing;

alter table public.service_subcategories enable row level security;
alter table public.package_categories enable row level security;
alter table public.package_subcategories enable row level security;

drop policy if exists "service_role_service_subcategories" on public.service_subcategories;
create policy "service_role_service_subcategories" on public.service_subcategories using (auth.role() = 'service_role');
drop policy if exists "service_role_package_categories" on public.package_categories;
create policy "service_role_package_categories" on public.package_categories using (auth.role() = 'service_role');
drop policy if exists "service_role_package_subcategories" on public.package_subcategories;
create policy "service_role_package_subcategories" on public.package_subcategories using (auth.role() = 'service_role');
