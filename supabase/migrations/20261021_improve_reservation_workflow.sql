  alter type public.payment_status add value if not exists 'waived';

  alter table public.appointments
    add column if not exists reservation_fee_waived_at timestamptz,
    add column if not exists reservation_fee_waived_by uuid references auth.users(id) on delete set null,
    add column if not exists reservation_fee_waiver_reason text;

  comment on column public.appointments.reservation_fee_waiver_reason is
    'Staff-entered reason for confirming an appointment without the online reservation fee.';

