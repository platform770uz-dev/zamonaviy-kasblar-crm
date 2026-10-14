create table if not exists public.vacancy_submission_rate_limits (
  ip_hash text not null check (char_length(ip_hash) = 64),
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count >= 1 and request_count <= 1000),
  primary key (ip_hash, window_start)
);

alter table public.vacancy_submission_rate_limits enable row level security;
revoke all on public.vacancy_submission_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.vacancy_submission_rate_limits to service_role;

create or replace function public.vacancy_assessment_take_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_bucket timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
  v_count integer;
begin
  if p_ip_hash is null or char_length(p_ip_hash) <> 64 then
    return false;
  end if;

  insert into public.vacancy_submission_rate_limits (ip_hash, window_start, request_count)
  values (p_ip_hash, v_bucket, 1)
  on conflict (ip_hash, window_start)
  do update set request_count = public.vacancy_submission_rate_limits.request_count + 1
  returning request_count into v_count;

  delete from public.vacancy_submission_rate_limits
  where window_start < pg_catalog.now() - interval '24 hours';

  return v_count <= 8;
end;
$$;

revoke all on function public.vacancy_assessment_take_rate_limit(text) from public, anon, authenticated;
grant execute on function public.vacancy_assessment_take_rate_limit(text) to service_role;

