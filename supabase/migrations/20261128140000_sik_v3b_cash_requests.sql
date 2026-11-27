-- Super Intellekt Kids v3b (owner, 2026-11-28): a parent can top up the so'm balance in cash too. The Mini App sends a
-- cash request (no check photo); an administrator or the owner confirms it once the money is taken at the center, and
-- only then it is credited, with a Kvitansiya receipt (method Naqd).
alter table public.sik_payments add column if not exists method text not null default 'card';
alter table public.sik_payments drop constraint if exists sik_payments_method_check;
alter table public.sik_payments add constraint sik_payments_method_check check (method in ('card', 'cash'));
comment on column public.sik_payments.method is 'card = a transfer with a check photo, confirmed by the owner; cash = a request to pay at the center, confirmed by an administrator or the owner when the money is taken.';
