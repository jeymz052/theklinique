-- Adds the extra catalog level requested by the clinic:
-- Service/Package -> category -> subcategory -> item.
alter table public.services add column if not exists subcategory text;
alter table public.products add column if not exists subcategory text;

update public.services
set subcategory = 'General'
where subcategory is null or trim(subcategory) = '';

-- Existing products were stored with their subcategory in `category`.
-- Preserve that value and make Package the common top-level category.
update public.products
set subcategory = category,
    category = 'Package'
where subcategory is null or trim(subcategory) = '';

alter table public.services alter column subcategory set default 'General';
alter table public.services alter column subcategory set not null;
alter table public.products alter column subcategory set default 'General';
alter table public.products alter column subcategory set not null;

