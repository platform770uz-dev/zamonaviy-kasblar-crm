-- Уведомления операторам колл-центра (@eduteachuz_bot) только в рабочее время. Применено 2026-11-19.
-- Владелец и админы получают новые лиды и результаты звонков сразу (meta-yba-webhook, teachnova-bot через @teachnova_bot).
-- Операторам (skript_operatorlar.holat = 'faol') те же события кладутся в очередь и доставляются функцией operator-notify
-- пн–сб 13:00–19:00 по Ташкенту; пришедшее ночью и в воскресенье уходит в 13:00 по одному сообщению.

create table if not exists public.operator_notifications (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('lead', 'call_result')),
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'skipped', 'expired', 'failed')),
  attempts integer not null default 0,
  sent_to bigint[] not null default '{}',
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
comment on table public.operator_notifications is
  'Очередь уведомлений операторам колл-центра (@eduteachuz_bot): новые лиды и результаты звонков. Доставляет функция operator-notify в рабочее время (пн–сб 13:00–19:00, Ташкент), по одному сообщению.';
create index if not exists operator_notifications_due_idx
  on public.operator_notifications (created_at, id) where status in ('pending', 'sending');
-- Доступ только у функций (service role): политик для anon/authenticated нет.
alter table public.operator_notifications enable row level security;

-- Каждую минуту пн–сб 08:00–13:59 UTC (= 13:00–18:59 Ташкент), и только если в очереди что-то ждёт.
select cron.schedule('operator-notify-deliver', '* 8-13 * * 1-6', $job$
  select net.http_post(
    url := 'https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/operator-notify?deliver=1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-crm-secret', (select qiymat from public.crm_maxfiy where kalit = 'tg_ichki')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000)
  where exists (
    select 1 from public.operator_notifications
    where status = 'pending' or (status = 'sending' and claimed_at < now() - interval '10 minutes'));
$job$);
