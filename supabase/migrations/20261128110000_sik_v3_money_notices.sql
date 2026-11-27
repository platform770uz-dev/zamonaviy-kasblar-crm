-- Super Intellekt Kids v3 (owner's decisions of 2026-11-28): the parent's so'm balance as a prepayment for the
-- studies, card payments with a check photo sent from the Mini App, the bell (in-app notices) and official receipts
-- in the academy's Kvitansiya book. All tables are service-role only (RLS on, no policies).

-- A card transfer the parent reported with a check photo (from the Mini App or the bot chat), waiting for the owner.
create table if not exists public.sik_payments (
  id uuid primary key default gen_random_uuid(),
  parent_id bigint not null references public.sik_parents (telegram_id) on delete cascade,
  purpose text not null check (purpose in ('trial', 'course')),
  amount bigint not null check (amount > 0),
  booking_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  source text not null default 'app' check (source in ('app', 'chat')),
  file_path text,
  file_id text,
  file_kind text,
  messages jsonb not null default '[]'::jsonb,
  decided_by bigint,
  decided_at timestamptz,
  receipt_id uuid references public.kv_receipts (id),
  created_at timestamptz not null default now()
);
create index if not exists sik_payments_status_idx on public.sik_payments (status, created_at);
create index if not exists sik_payments_parent_idx on public.sik_payments (parent_id);
comment on table public.sik_payments is 'Super Intellekt Kids: a card transfer reported with a check photo (purpose trial = the 99 000 of booked trial lessons, course = a prepayment for the studies). The owner confirms it in the bot or in Boshqaruv; then sik_money gets the credit and kv_receipts the receipt. Service-role only.';

-- The family's so'm balance: + payments (card, cash, coins turned into so'm), - the trial lesson (when the course was
-- not bought within 48 h after it), the months of the course, refunds. Sum of amount = the balance.
create table if not exists public.sik_money (
  id bigserial primary key,
  parent_id bigint not null references public.sik_parents (telegram_id) on delete cascade,
  child_id uuid references public.sik_children (id) on delete set null,
  kind text not null check (kind in ('payment', 'cash', 'trial', 'month', 'coins', 'refund', 'adjust')),
  amount bigint not null check (amount <> 0),
  note text,
  ref text not null unique,
  payment_id uuid references public.sik_payments (id) on delete set null,
  receipt_id uuid references public.kv_receipts (id),
  created_by bigint,
  created_at timestamptz not null default now()
);
create index if not exists sik_money_parent_idx on public.sik_money (parent_id, created_at);
comment on table public.sik_money is 'Super Intellekt Kids: the so''m ledger of a family (prepayment for the studies). ref makes every line idempotent. Service-role only.';

-- The bell: what the parent was told, readable again in the Mini App.
create table if not exists public.sik_notices (
  id bigserial primary key,
  parent_id bigint not null references public.sik_parents (telegram_id) on delete cascade,
  child_id uuid references public.sik_children (id) on delete set null,
  kind text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sik_notices_parent_idx on public.sik_notices (parent_id, created_at desc);
comment on table public.sik_notices is 'Super Intellekt Kids: in-app notices of a parent (payments with receipts, lessons, points, coins, reports). Service-role only.';

alter table public.sik_bookings add column if not exists paid_amount bigint;
alter table public.sik_bookings add column if not exists payment_id uuid references public.sik_payments (id) on delete set null;

alter table public.sik_payments enable row level security;
alter table public.sik_money enable row level security;
alter table public.sik_notices enable row level security;

-- Check photos uploaded from the Mini App (private; staff see them through short signed links).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sik-checks', 'sik-checks', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- A receipt in the academy's Kvitansiya book, numbered and coded exactly like kv_create_receipt does (that one needs a
-- signed-in Kvitansiya admin; the bot confirms payments on the owner's word, so the author is the first admin, as in
-- kv_create_receipt's own fallback).
create or replace function public.sik_kv_receipt(
  p_payer_name text, p_child_name text, p_phone text, p_purpose text, p_purpose_other text,
  p_amount bigint, p_method text, p_paid_at timestamptz
)
returns table (receipt_id uuid, receipt_number integer, receipt_code text)
language plpgsql
set search_path = public, extensions
as $$
declare
  v_number integer; v_code text; v_id uuid; v_i integer; v_actor uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select a.user_id into v_actor from public.kv_admins a order by a.created_at, a.user_id limit 1;
  if v_actor is null then raise exception 'kv_admin_missing'; end if;
  update public.kv_receipt_counter set last_number = last_number + 1 where singleton = true returning last_number into v_number;
  if v_number is null then raise exception 'kv_counter_missing'; end if;
  loop
    v_code := '';
    for v_i in 1..10 loop
      v_code := v_code || substr(v_alphabet, (get_byte(extensions.gen_random_bytes(1), 0) % length(v_alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.kv_receipts r where r.code = v_code);
  end loop;
  insert into public.kv_receipts (number, code, paid_at, payer_name, child_name, phone, purpose, purpose_other, amount, method, created_by)
  values (v_number, v_code, least(coalesce(p_paid_at, now()), now()), left(btrim(p_payer_name), 160), left(btrim(p_child_name), 160),
          nullif(btrim(coalesce(p_phone, '')), ''), p_purpose,
          case when p_purpose = 'Boshqa' then left(btrim(p_purpose_other), 160) else null end, p_amount, p_method, v_actor)
  returning id into v_id;
  return query select v_id, v_number, v_code;
end;
$$;

-- The family's so'm balance.
create or replace function public.sik_money_balance(p_parent bigint)
returns bigint
language sql
stable
set search_path = public
as $$
  select coalesce(sum(amount), 0)::bigint from public.sik_money where parent_id = p_parent;
$$;

-- The parent turns a child's coins into so'm on the family balance: at most p_cap so'm per child in a month (from
-- p_month_start), never more coins than the child has. One transaction; the child's row is locked against double taps.
create or replace function public.sik_coins_to_money(
  p_parent bigint, p_child uuid, p_coins integer, p_rate integer, p_cap bigint, p_month_start timestamptz
)
returns bigint
language plpgsql
set search_path = public
as $$
declare v_have bigint; v_used bigint; v_ref text := 'c2m:' || gen_random_uuid()::text;
begin
  if p_coins is null or p_coins <= 0 then raise exception 'amount'; end if;
  perform 1 from public.sik_children where id = p_child and parent_id = p_parent for update;
  if not found then raise exception 'child'; end if;
  select coalesce(sum(amount), 0) into v_have from public.sik_coins where child_id = p_child;
  if v_have < p_coins then raise exception 'balance'; end if;
  select coalesce(sum(amount), 0) into v_used from public.sik_money
   where parent_id = p_parent and child_id = p_child and kind = 'coins' and created_at >= p_month_start;
  if v_used + p_coins::bigint * p_rate > p_cap then raise exception 'cap'; end if;
  insert into public.sik_coins (child_id, kind, amount, note, ref) values (p_child, 'discount', -p_coins, 'Balansga o‘tkazildi', v_ref);
  insert into public.sik_money (parent_id, child_id, kind, amount, note, ref) values (p_parent, p_child, 'coins', p_coins::bigint * p_rate, 'Tangalardan', v_ref);
  return (select coalesce(sum(amount), 0) from public.sik_money where parent_id = p_parent);
end;
$$;

revoke all on function public.sik_kv_receipt(text, text, text, text, text, bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.sik_money_balance(bigint) from public, anon, authenticated;
revoke all on function public.sik_coins_to_money(bigint, uuid, integer, integer, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.sik_kv_receipt(text, text, text, text, text, bigint, text, timestamptz) to service_role;
grant execute on function public.sik_money_balance(bigint) to service_role;
grant execute on function public.sik_coins_to_money(bigint, uuid, integer, integer, bigint, timestamptz) to service_role;
