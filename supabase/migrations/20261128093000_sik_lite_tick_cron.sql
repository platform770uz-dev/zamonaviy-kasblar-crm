-- Super Intellekt Kids: the sik-lite tick every 5 minutes (unpaid holds, lesson reminders, offers, the evening DZ
-- nudge at 19:00 and the Monday summary at 09:00 Tashkent, referral rewards, the monthly rating for the owner).
-- It runs only once the bot has at least one parent.
select cron.unschedule(jobid) from cron.job where jobname = 'sik-lite-tick';
select cron.schedule('sik-lite-tick', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/sik-lite?tick=1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-crm-secret', (select qiymat from public.crm_maxfiy where kalit = 'tg_ichki')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000)
  where exists (select 1 from public.sik_parents);
$$);
