-- Staff-selectable calendar colors for each major service category.
alter table public.service_categories
  add column if not exists calendar_color text not null default '#c65373'
  check (calendar_color ~ '^#[0-9A-Fa-f]{6}$');

update public.service_categories
set calendar_color = case slug
  when 'consultations' then '#8b5cf6'
  when 'botox' then '#e11d48'
  when 'fillers' then '#db2777'
  when 'skin-boosters' then '#0891b2'
  when 'lasers' then '#f59e0b'
  else calendar_color
end
where calendar_color = '#c65373';
