-- Архив лидов: причина, доступ и возврат.
-- Решения владельца (2026-11-23): оператор не удаляет лида, а отправляет «В архив»; отказ — сразу в архив с причиной;
-- архив видят и возвращают из него все, кто работает с лидами; окончательно удалить из архива через CRM нельзя.

alter table public.deleted_custom_records
  add column if not exists reason text,        -- «Отказ: Narx», «Не дозвонились», «Неверный номер»… пусто — удалено без причины
  add column if not exists reason_note text;

-- Прямой доступ клиентов — только чтение, и только тем, кто видит записи этой вкладки (как у custom_records).
revoke all on public.deleted_custom_records from anon, authenticated;
grant select on public.deleted_custom_records to authenticated;
drop policy if exists deleted_custom_records_view on public.deleted_custom_records;
create policy deleted_custom_records_view on public.deleted_custom_records
  for select to authenticated
  using (
    public.crm_is_member() and exists (
      select 1 from public.custom_tabs t
      where t.id = deleted_custom_records.tab_id
        and (t.created_by = (select auth.uid()) or t.viewer_roles @> array[public.crm_user_role()])
    )
  );

-- Триггер из прошлой миграции: теперь ещё записывает причину, которую archive_custom_record кладёт в настройки транзакции.
create or replace function public.archive_deleted_custom_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
  v_reason text := nullif(current_setting('crm.archive_reason', true), '');
  v_note text := nullif(current_setting('crm.archive_note', true), '');
begin
  if v_uid is not null then
    select coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email) into v_name
    from auth.users u where u.id = v_uid;
  end if;
  insert into public.deleted_custom_records
    (id, tab_id, "values", created_by, created_at, updated_at, external_id, related, deleted_at, deleted_by, deleted_by_name, source, reason, reason_note)
  values (
    old.id, old.tab_id, old."values", old.created_by, old.created_at, old.updated_at, old.external_id,
    jsonb_build_object(
      'student', (select to_jsonb(s) from public.lead_students s where s.record_id = old.id),
      'payments', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.student_payments p where p.record_id = old.id), '[]'::jsonb),
      'callbacks', coalesce((select jsonb_agg(to_jsonb(c) order by c.due_at) from public.lead_callbacks c where c.record_id = old.id and c.status = 'pending'), '[]'::jsonb)
    ),
    now(), v_uid, v_name, 'delete', v_reason, v_note
  )
  on conflict (id) do update set
    tab_id = excluded.tab_id, "values" = excluded."values", created_by = excluded.created_by,
    created_at = excluded.created_at, updated_at = excluded.updated_at, external_id = excluded.external_id,
    related = excluded.related, deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by,
    deleted_by_name = excluded.deleted_by_name, source = 'delete', reason = excluded.reason, reason_note = excluded.reason_note;
  return old;
end;
$$;
revoke all on function public.archive_deleted_custom_record() from public, anon, authenticated;

-- «В архив» из CRM. p_values — итог звонка, который нужно записать перед архивом (отказ, неверный номер):
-- запись и архив идут одной транзакцией, а уведомление о результате звонка уходит обычным триггером.
create or replace function public.archive_custom_record(p_record uuid, p_reason text, p_note text default null, p_values jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab uuid;
begin
  select tab_id into v_tab from public.custom_records where id = p_record for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not (public.crm_is_member() and exists (
    select 1 from public.custom_tabs t
    where t.id = v_tab and (t.created_by = (select auth.uid()) or t.editor_roles @> array[public.crm_user_role()])
  )) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_values is not null then
    if jsonb_typeof(p_values) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_values'); end if;
    update public.custom_records set "values" = p_values, updated_at = now() where id = p_record;
  end if;
  perform set_config('crm.archive_reason', left(coalesce(p_reason, ''), 120), true);
  perform set_config('crm.archive_note', left(coalesce(p_note, ''), 600), true);
  delete from public.custom_records where id = p_record;
  perform set_config('crm.archive_reason', '', true);
  perform set_config('crm.archive_note', '', true);
  return jsonb_build_object('ok', true);
end;
$$;

-- «Вернуть в список»: запись возвращается с тем же id, вместе с карточкой ученика, оплатами и будущими напоминаниями.
create or replace function public.restore_archived_record(p_record uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.deleted_custom_records;
  v_uid uuid := (select auth.uid());
  v_phone text;
  v_duplicate boolean := false;
begin
  select * into a from public.deleted_custom_records where id = p_record for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not exists (select 1 from public.custom_tabs t where t.id = a.tab_id) then
    return jsonb_build_object('ok', false, 'error', 'tab_gone');
  end if;
  if not (public.crm_is_member() and exists (
    select 1 from public.custom_tabs t
    where t.id = a.tab_id and (t.created_by = v_uid or t.editor_roles @> array[public.crm_user_role()])
  )) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if a.source = 'lost' then return jsonb_build_object('ok', false, 'error', 'no_data'); end if;
  if exists (select 1 from public.custom_records r where r.id = a.id) then
    delete from public.deleted_custom_records where id = a.id;
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  -- Тот же телефон уже есть среди действующих записей вкладки (например, человек оставил новую заявку) — сообщаем.
  v_phone := right(regexp_replace(coalesce(a."values"->>'Телефон', ''), '\D', '', 'g'), 9);
  if length(v_phone) = 9 then
    v_duplicate := exists (
      select 1 from public.custom_records r
      where r.tab_id = a.tab_id and right(regexp_replace(coalesce(r."values"->>'Телефон', ''), '\D', '', 'g'), 9) = v_phone
    );
  end if;
  begin
    insert into public.custom_records (id, tab_id, "values", created_by, created_at, updated_at, external_id)
    values (a.id, a.tab_id, a."values", coalesce(a.created_by, v_uid), coalesce(a.created_at, a.deleted_at, now()), now(), a.external_id);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end;
  if jsonb_typeof(a.related->'student') = 'object' then
    insert into public.lead_students select * from jsonb_populate_record(null::public.lead_students, a.related->'student')
    on conflict do nothing;
  end if;
  if jsonb_typeof(a.related->'payments') = 'array' then
    insert into public.student_payments select * from jsonb_populate_recordset(null::public.student_payments, a.related->'payments')
    on conflict do nothing;
  end if;
  if jsonb_typeof(a.related->'callbacks') = 'array' then
    insert into public.lead_callbacks
    select * from jsonb_populate_recordset(null::public.lead_callbacks, a.related->'callbacks') c
    where c.status = 'pending' and c.due_at > now()
    on conflict do nothing;
  end if;
  delete from public.deleted_custom_records where id = a.id;
  return jsonb_build_object('ok', true, 'duplicate_phone', v_duplicate);
end;
$$;

revoke all on function public.archive_custom_record(uuid, text, text, jsonb) from public, anon;
revoke all on function public.restore_archived_record(uuid) from public, anon;
grant execute on function public.archive_custom_record(uuid, text, text, jsonb) to authenticated;
grant execute on function public.restore_archived_record(uuid) to authenticated;

-- ИИ-итог звонка приходит через несколько секунд после записи. Если лид за это время ушёл в архив (отказ),
-- итог дописывается в архивную копию: в архиве видно, чем закончился последний разговор.
create or replace function public.set_lead_ai_comment(p_record uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.custom_records
  set "values" = case when coalesce(p_comment, '') = ''
    then "values" - 'ИИ-комментарий'
    else jsonb_set("values", '{ИИ-комментарий}', to_jsonb(p_comment)) end
  where id = p_record;
  if not found then
    update public.deleted_custom_records
    set "values" = case when coalesce(p_comment, '') = ''
      then "values" - 'ИИ-комментарий'
      else jsonb_set("values", '{ИИ-комментарий}', to_jsonb(p_comment)) end
    where id = p_record;
  end if;
end;
$$;
