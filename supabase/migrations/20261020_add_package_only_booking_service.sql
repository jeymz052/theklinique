-- Internal appointment anchor for package-only Glow Plan bookings.
-- This service is hidden from the medical-treatment catalog by the app.
insert into public.service_categories (name, slug, sort_order)
values ('Package Bookings', 'package-bookings', 999)
on conflict (slug) do update set name = excluded.name;

insert into public.services (
  category_id,
  name,
  slug,
  description,
  price,
  price_note,
  duration_mins,
  is_package,
  is_active,
  sort_order,
  subcategory
)
select
  id,
  'Glow Plans (Packages)',
  'glow-plans-package-booking',
  'Package-only clinic booking',
  0,
  'Package price is calculated from the selected Glow Plans.',
  60,
  true,
  true,
  999,
  'Package Booking'
from public.service_categories
where slug = 'package-bookings'
on conflict (slug) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  price_note = excluded.price_note,
  duration_mins = excluded.duration_mins,
  is_package = excluded.is_package,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  subcategory = excluded.subcategory;
