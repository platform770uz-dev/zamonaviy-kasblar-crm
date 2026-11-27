-- Super Intellekt Kids v2: one bot with access levels. Children with their bear, daily DZ, points (ball),
-- coins (tanga, only from B2B orders, referrals and prizes), referrals and the administrator's family invites.
-- All tables are service-role only (RLS on, no policies): only the function sik-lite reads and writes them.

create table if not exists public.sik_children (
  id uuid primary key default gen_random_uuid(),
  parent_id bigint not null references public.sik_parents (telegram_id) on delete cascade,
  name text not null,
  age integer not null check (age between 3 and 18),
  bear_name text not null default 'Super Ayiq',
  status text not null default 'new' check (status in ('new', 'trial', 'student', 'left')),
  access_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sik_children_parent_idx on public.sik_children (parent_id);
comment on table public.sik_children is 'Super Intellekt Kids: a child of a parent in the bot, with the bear''s name. status new (signed up) → trial (paid Lite, open until access_until = lesson end + 48 h) → student (main course, always open) / left. Service-role only.';

alter table public.sik_parents add column if not exists ref_code text unique;
alter table public.sik_parents add column if not exists referred_by bigint;
alter table public.sik_bookings add column if not exists child_id uuid references public.sik_children (id) on delete set null;

create table if not exists public.sik_dz (
  child_id uuid not null references public.sik_children (id) on delete cascade,
  day date not null,
  twister_id integer,
  stars integer not null default 0 check (stars between 0 and 3),
  points integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (child_id, day)
);
comment on table public.sik_dz is 'Super Intellekt Kids: the one daily DZ (one tongue twister with the voice check), one row per child and Tashkent day. Written by sik-lite when tez-aytish-api reports a lite check. Service-role only.';

create table if not exists public.sik_points (
  id bigserial primary key,
  child_id uuid not null references public.sik_children (id) on delete cascade,
  kind text not null check (kind in ('welcome', 'dz', 'streak', 'attend', 'report', 'order', 'bonus')),
  points integer not null,
  note text,
  ref text not null,
  created_by bigint,
  created_at timestamptz not null default now(),
  unique (child_id, ref)
);
create index if not exists sik_points_time_idx on public.sik_points (created_at);
comment on table public.sik_points is 'Super Intellekt Kids: the points ledger (ball). Points grow the bear (levels), make the rating and open B2B orders; they are never money. ref makes every award idempotent. Service-role only.';

create table if not exists public.sik_coins (
  id bigserial primary key,
  child_id uuid not null references public.sik_children (id) on delete cascade,
  kind text not null check (kind in ('order', 'referral', 'prize', 'payout', 'discount', 'shop', 'adjust')),
  amount integer not null,
  note text,
  ref text not null unique,
  created_by bigint,
  created_at timestamptz not null default now()
);
create index if not exists sik_coins_child_idx on public.sik_coins (child_id);
comment on table public.sik_coins is 'Super Intellekt Kids: the coins ledger (tanga, 1 tanga = 100 so''m). Credits only from B2B orders, referrals and prizes; debits are a cash payout the owner made, a course discount (max 10% of a month) or the shop. The academy never holds money. Service-role only.';

create table if not exists public.sik_referrals (
  invitee bigint primary key references public.sik_parents (telegram_id) on delete cascade,
  inviter bigint not null references public.sik_parents (telegram_id) on delete cascade,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  rewarded_at timestamptz
);
comment on table public.sik_referrals is 'Super Intellekt Kids: who invited whom (one level only). The inviter gets 500 tanga once the friend''s first booking is paid. Service-role only.';

create table if not exists public.sik_invites (
  code text primary key,
  parent_name text,
  phone text,
  children jsonb not null default '[]'::jsonb,
  paid boolean not null default false,
  lesson_id uuid references public.sik_lessons (id),
  note text,
  created_by bigint,
  created_at timestamptz not null default now(),
  used_by bigint,
  used_at timestamptz
);
comment on table public.sik_invites is 'Super Intellekt Kids: a family the administrator entered at a meeting. The parent joins by scanning the QR of t.me/<bot>?start=f_<code>, by the link sent in Telegram, or by typing the code to the bot. Service-role only.';

create table if not exists public.sik_child_sent (
  child_id uuid not null references public.sik_children (id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (child_id, kind)
);
comment on table public.sik_child_sent is 'Super Intellekt Kids: per-child messages already sent (evening DZ reminder per day, Monday summary per week), so the tick sends each once. Service-role only.';

alter table public.sik_staff drop constraint if exists sik_staff_role_check;
alter table public.sik_staff add constraint sik_staff_role_check check (role in ('teacher', 'admin'));

alter table public.sik_children enable row level security;
alter table public.sik_dz enable row level security;
alter table public.sik_points enable row level security;
alter table public.sik_coins enable row level security;
alter table public.sik_referrals enable row level security;
alter table public.sik_invites enable row level security;
alter table public.sik_child_sent enable row level security;

update public.custom_tabs set name = 'Super Intellekt Kids' where id = 'a7c4e2f1-5b3d-4c8e-9f21-6d0b8e3a4c57';
