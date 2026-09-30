-- Production RLS hardening.
-- All sensitive reads and writes go through authenticated Next.js API routes,
-- which validate the caller and then use the server-only service role.

-- Remove the permissive policies from the original booking schema.
drop policy if exists "public_insert_clients" on public.clients;
drop policy if exists "public_insert_appointments" on public.appointments;
drop policy if exists "public_read_appointments" on public.appointments;
drop policy if exists "public_insert_appt_addons" on public.appointment_addons;
drop policy if exists "public_read_appt_addons" on public.appointment_addons;
drop policy if exists "public_insert_orders" on public.orders;
drop policy if exists "public_read_orders" on public.orders;
drop policy if exists "public_insert_order_items" on public.order_items;
drop policy if exists "public_read_order_items" on public.order_items;

-- Scheduling is exposed only through /api/booking-availability so blocked
-- dates and internal availability configuration cannot be enumerated directly.
drop policy if exists "public_read_availability" on public.availability_schedules;
drop policy if exists "public_read_blocked" on public.blocked_dates;

-- Public catalog data is intentionally readable. Only active rows are visible.
drop policy if exists "public_read_categories" on public.service_categories;
create policy "public_read_categories"
  on public.service_categories for select
  to anon, authenticated
  using (true);

drop policy if exists "public_read_services" on public.services;
create policy "public_read_services"
  on public.services for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "public_read_addons" on public.service_addons;
create policy "public_read_addons"
  on public.service_addons for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "public_read_products" on public.products;
create policy "public_read_products"
  on public.products for select
  to anon, authenticated
  using (is_active = true);

-- Defense in depth: browsers do not need direct table privileges for sensitive
-- records. The service_role retains its own grants and bypasses RLS.
revoke all on table public.clients from anon, authenticated;
revoke all on table public.appointments from anon, authenticated;
revoke all on table public.appointment_addons from anon, authenticated;
revoke all on table public.appointment_services from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.sms_logs from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.availability_schedules from anon, authenticated;
revoke all on table public.blocked_dates from anon, authenticated;
revoke all on table public.appointment_intakes from anon, authenticated;
revoke all on table public.consultation_charts from anon, authenticated;
revoke all on table public.treatment_protocols from anon, authenticated;
revoke all on table public.treatment_cases from anon, authenticated;
revoke all on table public.notification_deliveries from anon, authenticated;

-- App notifications and reschedule requests are accessed by server APIs too.
-- Remove direct browser access to keep authorization in one audited layer.
revoke all on table public.app_notifications from anon, authenticated;
revoke all on table public.appointment_reschedule_requests from anon, authenticated;

-- Keep only the minimum direct permissions required by browser role resolution
-- and self-profile editing. RLS policies on profiles still restrict the rows.
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (email, full_name) on table public.profiles to authenticated;

-- Catalog tables remain read-only to browser roles.
revoke all on table public.service_categories from anon, authenticated;
revoke all on table public.services from anon, authenticated;
revoke all on table public.service_addons from anon, authenticated;
revoke all on table public.products from anon, authenticated;
grant select on table public.service_categories to anon, authenticated;
grant select on table public.services to anon, authenticated;
grant select on table public.service_addons to anon, authenticated;
grant select on table public.products to anon, authenticated;

-- Ensure role helper/RPC execution is explicit rather than inherited from
-- PostgreSQL's default PUBLIC function privilege.
revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;
revoke all on function public.assign_staff_role(text, text) from public, anon;
grant execute on function public.assign_staff_role(text, text) to authenticated;
