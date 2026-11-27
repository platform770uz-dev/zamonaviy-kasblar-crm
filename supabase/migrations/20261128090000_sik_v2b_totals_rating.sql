-- Super Intellekt Kids v2b: ledger sums and the rating are computed in the database (PostgREST returns at most
-- 1000 rows per request, so sik-lite must not add up ledgers row by row), plus a daily limit on wrong family-invite
-- codes typed to the bot.

alter table public.sik_parents add column if not exists code_fails integer not null default 0;
alter table public.sik_parents add column if not exists code_fail_day date;

create index if not exists sik_points_child_time_idx on public.sik_points (child_id, created_at);

-- Points of all time, points since p_since (this month: B2B access) and the coin balance of the given children.
create or replace function public.sik_totals(p_ids uuid[], p_since timestamptz)
returns table (child_id uuid, points bigint, period_points bigint, coins bigint)
language sql
stable
set search_path = public
as $$
  select c.id,
         coalesce((select sum(p.points) from public.sik_points p where p.child_id = c.id), 0)::bigint,
         coalesce((select sum(p.points) from public.sik_points p where p.child_id = c.id and p.created_at >= p_since), 0)::bigint,
         coalesce((select sum(k.amount) from public.sik_coins k where k.child_id = c.id), 0)::bigint
    from public.sik_children c
   where c.id = any (p_ids);
$$;

-- The rating for points earned in [p_since, p_until): students (status student), or trial children whose Lite was
-- open in the last 7 days. Returns places 1..p_top plus the place of p_child.
create or replace function public.sik_rating(
  p_student boolean,
  p_since timestamptz,
  p_until timestamptz default null,
  p_child uuid default null,
  p_top integer default 10
)
returns table (place bigint, child_id uuid, name text, points bigint)
language sql
stable
set search_path = public
as $$
  with board as (
    select c.id, c.name, c.created_at, coalesce(sum(p.points), 0)::bigint as points
      from public.sik_children c
      left join public.sik_points p
        on p.child_id = c.id and p.created_at >= p_since and (p_until is null or p.created_at < p_until)
     where case when p_student then c.status = 'student'
                else c.status = 'trial' and c.access_until > now() - interval '7 days' end
     group by c.id
  ), ranked as (
    select row_number() over (order by b.points desc, b.created_at) as place, b.id, b.name, b.points
      from board b
  )
  select r.place, r.id, r.name, r.points
    from ranked r
   where r.place <= p_top or r.id = p_child
   order by r.place;
$$;

revoke all on function public.sik_totals(uuid[], timestamptz) from public, anon, authenticated;
revoke all on function public.sik_rating(boolean, timestamptz, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.sik_totals(uuid[], timestamptz) to service_role;
grant execute on function public.sik_rating(boolean, timestamptz, timestamptz, uuid, integer) to service_role;
