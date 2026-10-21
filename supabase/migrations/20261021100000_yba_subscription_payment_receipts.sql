-- Payment confirmations for the standalone 30-day YBA Mini App theory subscription.
-- Writes are server-side only; CRM managers can read the receipt register.
create table if not exists public.yba_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  result_id uuid not null references public.yba_public_intro_results(id) on delete restrict,
  telegram_user_id bigint not null,
  child_name text not null check (char_length(child_name) between 1 and 24),
  amount_sum integer not null default 99000 check (amount_sum = 99000),
  payment_method text not null check (payment_method in ('cash', 'card')),
  payment_status text not null default 'confirmed' check (payment_status in ('confirmed')),
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  access_starts_at timestamptz not null,
  access_ends_at timestamptz not null,
  receipt_number text not null unique,
  telegram_status text not null default 'pending' check (telegram_status in ('pending', 'sent', 'failed')),
  telegram_error text check (telegram_error is null or char_length(telegram_error) <= 80),
  created_at timestamptz not null default now(),
  check (access_ends_at > access_starts_at),
  check (access_ends_at - access_starts_at = interval '30 days')
);

create index if not exists yba_subscription_payments_result_created_idx
  on public.yba_subscription_payments(result_id, created_at desc);

alter table public.yba_subscription_payments enable row level security;
revoke all on public.yba_subscription_payments from anon, authenticated;
grant select on public.yba_subscription_payments to authenticated;
grant select, insert, update on public.yba_subscription_payments to service_role;

drop policy if exists yba_subscription_payments_manager_read on public.yba_subscription_payments;
create policy yba_subscription_payments_manager_read
  on public.yba_subscription_payments for select to authenticated
  using (public.crm_is_manager());

