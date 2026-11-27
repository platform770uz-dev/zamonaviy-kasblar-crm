-- Super Intellekt Kids Lite: the trial bot and its Mini App (function sik-lite).
-- 99 000 so'm buys an offline open trial lesson in the center plus the Lite Mini App, open from the payment until
-- 48 hours after the lesson. The 99 000 counts towards the first month if the main course is bought in those 48 hours.
-- All tables are service-role only (RLS on, no policies): only the edge function reads and writes them.

create table if not exists public.sik_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by bigint
);
comment on table public.sik_settings is 'Super Intellekt Kids Lite: owner settings as key/value (card for transfers, center address, prices, season discounts, bot username). Service-role only.';

create table if not exists public.sik_staff (
  telegram_id bigint primary key,
  role text not null default 'teacher' check (role in ('teacher')),
  name text,
  username text,
  status text not null default 'pending' check (status in ('pending', 'active', 'removed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by bigint
);
comment on table public.sik_staff is 'Super Intellekt Kids Lite: teachers who mark attendance and write reports (/ustoz request, approved by the owner). Owners come from tg_chatlar (rol owner). Service-role only.';

create table if not exists public.sik_lessons (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  duration_min integer not null default 45 check (duration_min between 15 and 240),
  seats integer not null default 15 check (seats between 1 and 200),
  title text not null default 'Ochiq sinov darsi',
  teacher_id bigint,
  status text not null default 'open' check (status in ('open', 'cancelled')),
  created_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sik_lessons_starts_idx on public.sik_lessons (starts_at);
comment on table public.sik_lessons is 'Super Intellekt Kids Lite: offline open trial lessons the owner creates (date, time, seats); parents book a seat in the bot. Service-role only.';

create table if not exists public.sik_parents (
  telegram_id bigint primary key,
  tg_name text,
  username text,
  parent_name text,
  phone text,
  phone_key text,
  source text,
  state text,
  state_data jsonb not null default '{}'::jsonb,
  abandon_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sik_parents_phone_idx on public.sik_parents (phone_key);
comment on table public.sik_parents is 'Super Intellekt Kids Lite: parents in the bot (Telegram id, name, phone, ad source from /start, the step of the sign-up dialog). Service-role only.';

create table if not exists public.sik_bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  parent_id bigint not null references public.sik_parents (telegram_id) on delete cascade,
  child_name text not null,
  child_age integer not null check (child_age between 3 and 18),
  lesson_id uuid references public.sik_lessons (id),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'check_sent', 'paid', 'attended', 'no_show', 'converted', 'expired', 'cancelled')),
  hold_until timestamptz,
  check_id uuid,
  check_file_id text,
  check_kind text,
  check_sent_at timestamptz,
  check_messages jsonb not null default '[]'::jsonb,
  paid_at timestamptz,
  confirmed_by bigint,
  rejected_count integer not null default 0,
  access_until timestamptz,
  credit_until timestamptz,
  reschedules integer not null default 0,
  attended_at timestamptz,
  marked_by bigint,
  report jsonb,
  progress jsonb not null default '{}'::jsonb,
  want_main_at timestamptz,
  converted_at timestamptz,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sik_bookings_parent_idx on public.sik_bookings (parent_id);
create index if not exists sik_bookings_lesson_idx on public.sik_bookings (lesson_id);
create index if not exists sik_bookings_status_idx on public.sik_bookings (status);
create index if not exists sik_bookings_check_idx on public.sik_bookings (check_id);
comment on table public.sik_bookings is 'Super Intellekt Kids Lite: one trial booking per child (seat in a lesson, card payment checked by the owner, Lite access and the 99 000 credit until the lesson end + 48 h, teacher report, task progress). Service-role only.';

create table if not exists public.sik_sent (
  booking_id uuid not null references public.sik_bookings (id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (booking_id, kind)
);
comment on table public.sik_sent is 'Super Intellekt Kids Lite: messages already sent per booking (reminders, offers), so the 5-minute tick sends each once. Service-role only.';

alter table public.sik_settings enable row level security;
alter table public.sik_staff enable row level security;
alter table public.sik_lessons enable row level security;
alter table public.sik_parents enable row level security;
alter table public.sik_bookings enable row level security;
alter table public.sik_sent enable row level security;

insert into public.sik_settings (key, value) values
  ('prices', '{"price": 99000, "course_price": 600000}'::jsonb),
  ('discounts', '[{"until": "2026-12-01T00:00:00+05:00", "pct": 20, "name": "Qorbo‘ron"}, {"until": "2027-03-01T00:00:00+05:00", "pct": 20, "name": "Uyg‘onish"}]'::jsonb),
  ('center', '{"address": "", "landmark": "", "map_url": ""}'::jsonb),
  ('card', '{"number": "", "holder": ""}'::jsonb)
on conflict (key) do nothing;

-- The CRM tab «Super Intellekt Kids Lite»: one record per booking (external_id sik:<booking id>) plus parents who
-- shared a phone but have not booked yet (external_id sikp:<telegram id>). Written only by sik-lite.
insert into public.custom_tabs (id, name, icon, fields, viewer_roles, editor_roles, created_by)
select 'a7c4e2f1-5b3d-4c8e-9f21-6d0b8e3a4c57', 'Super Intellekt Kids Lite', '⭐',
  '[{"name": "Ota-ona ismi", "type": "text"}, {"name": "Telefon", "type": "phone"}, {"name": "Farzand", "type": "text"},
    {"name": "Yoshi", "type": "text"}, {"name": "Dars", "type": "text"}, {"name": "Holat", "type": "status"},
    {"name": "To‘lov", "type": "text"}, {"name": "Manba", "type": "text"}, {"name": "Natija", "type": "text"},
    {"name": "Kod", "type": "text"}, {"name": "Telegram", "type": "text"}]'::jsonb,
  array['owner', 'manager', 'admin'], array['owner', 'manager', 'admin'], t.created_by
from public.custom_tabs t
where t.id = '20b419be-7a75-4051-9993-6c755c4a5d68'
on conflict (id) do nothing;
