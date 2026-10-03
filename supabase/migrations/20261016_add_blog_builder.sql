-- Block-based educational and service articles managed by clinic staff.
create table if not exists public.blog_posts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  category text not null default 'Treatment Guide',
  service_category_id uuid references public.service_categories(id) on delete set null,
  hero_url text,
  hero_type text not null default 'image' check (hero_type in ('image','video')),
  embed_url text,
  blocks jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  featured boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blog_posts_public_idx on public.blog_posts(status, published_at desc);
alter table public.blog_posts enable row level security;
drop policy if exists "Public reads published blog posts" on public.blog_posts;
create policy "Public reads published blog posts" on public.blog_posts for select to anon, authenticated using (status = 'published');
