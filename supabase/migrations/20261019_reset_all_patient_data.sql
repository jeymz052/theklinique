-- ONE-TIME DESTRUCTIVE RESET
-- Removes all patient accounts and all patient/booking/clinical transaction data.
-- Preserves superadmin, doctor, and secretary Auth users and profiles.
-- Also preserves catalog, schedules, website content, blogs, and clinic settings.

do $$
declare
  staff_count integer;
  deleted_auth_users integer;
begin
  create temporary table reset_staff_users (id uuid primary key) on commit drop;

  insert into reset_staff_users (id)
  select distinct user_id
  from (
    select p.id as user_id
    from public.profiles p
    where p.role in ('superadmin', 'doctor', 'secretary')

    union

    select u.id as user_id
    from auth.users u
    where coalesce(u.raw_app_meta_data ->> 'role', '') in ('superadmin', 'doctor', 'secretary')
       or lower(coalesce(u.email, '')) in ('estebanjames67@gmail.com', 'thekliniqueph@gmail.com')
  ) staff;

  select count(*) into staff_count from reset_staff_users;
  if staff_count = 0 then
    raise exception 'Patient reset aborted: no staff Auth users were identified.';
  end if;

  create temporary table reset_patient_users (id uuid primary key) on commit drop;
  insert into reset_patient_users (id)
  select u.id
  from auth.users u
  where not exists (select 1 from reset_staff_users staff where staff.id = u.id);

  -- Payments restrict appointment deletion, so remove them first.
  delete from public.payments;

  -- These records either reference appointments directly or hold patient transactions.
  delete from public.notification_deliveries;
  delete from public.sms_logs;
  delete from public.orders;

  -- Appointment children use cascade/set-null rules. This clears intakes,
  -- consultation charts, treatment cases, add-ons, treatment carts,
  -- reschedule requests, and appointment-linked notifications/deliveries.
  delete from public.appointments;

  -- With appointment and order references gone, all patient charts can be removed.
  delete from public.clients;

  -- Remove any remaining notifications owned by patient Auth users.
  delete from public.app_notifications notification
  where exists (select 1 from reset_patient_users patient where patient.id = notification.recipient_id);

  -- Deleting Auth users cascades their patient profiles and remaining user-owned rows.
  delete from auth.users auth_user
  where exists (select 1 from reset_patient_users patient where patient.id = auth_user.id);
  get diagnostics deleted_auth_users = row_count;

  -- Fail closed if a staff account was unexpectedly removed.
  if exists (
    select 1 from reset_staff_users staff
    where not exists (select 1 from auth.users auth_user where auth_user.id = staff.id)
  ) then
    raise exception 'Patient reset rolled back: a protected staff Auth user was removed.';
  end if;

  raise notice 'Patient reset complete. Preserved % staff Auth users; deleted % patient Auth users.', staff_count, deleted_auth_users;
end;
$$;
