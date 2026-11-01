-- Когда оператор меняет «Результат последнего звонка» в Excel-вкладке лидов, база зовёт teachnova-bot:
-- бот присылает сообщение руководителю и (если задан ANTHROPIC_API_KEY) пишет ИИ-комментарий в карточку лида.
create or replace function public.notify_call_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_result text := coalesce(old.values ->> 'Результат последнего звонка', '');
  new_result text := coalesce(new.values ->> 'Результат последнего звонка', '');
begin
  if new_result <> '' and new_result is distinct from old_result then
    perform net.http_post(
      url := 'https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/teachnova-bot?call_result=1',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-crm-secret', (select qiymat from public.crm_maxfiy where kalit = 'tg_ichki')),
      body := jsonb_build_object('record_id', new.id),
      timeout_milliseconds := 30000);
  end if;
  return new;
end;
$$;

revoke all on function public.notify_call_result() from public, anon, authenticated;

drop trigger if exists lead_call_result_notify on public.custom_records;
create trigger lead_call_result_notify
  after update of values on public.custom_records
  for each row
  when (new.tab_id = '20b419be-7a75-4051-9993-6c755c4a5d68'::uuid)
  execute function public.notify_call_result();

-- ИИ-комментарий записывается отдельно, не трогая updated_at и «Последний изменивший».
create or replace function public.set_lead_ai_comment(p_record uuid, p_comment text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.custom_records
  set values = case when coalesce(p_comment, '') = ''
    then values - 'ИИ-комментарий'
    else jsonb_set(values, '{ИИ-комментарий}', to_jsonb(p_comment)) end
  where id = p_record;
$$;

revoke all on function public.set_lead_ai_comment(uuid, text) from public, anon, authenticated;
grant execute on function public.set_lead_ai_comment(uuid, text) to service_role;
