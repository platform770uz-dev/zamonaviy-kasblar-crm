-- Архив удалённых записей CRM — страховка от потери данных.
-- Любая запись, удалённая из custom_records (кнопкой в CRM, запросом или каскадом при удалении вкладки),
-- перед удалением копируется сюда вместе с данными ученика, оплатами и ожидающими напоминаниями:
-- дочерние строки удаляются каскадом сразу после записи, поэтому снимок делается в триггере BEFORE DELETE.
-- Таблица закрыта RLS без политик: приложение читает архив и возвращает записи только через функции
-- (отдельная миграция), напрямую она доступна лишь сервисной роли.

create table if not exists public.deleted_custom_records (
  id uuid primary key,                          -- тот же id, что был у записи в custom_records
  tab_id uuid not null,                         -- без внешнего ключа: вкладка тоже может быть удалена
  "values" jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  external_id text,
  related jsonb not null default '{}'::jsonb,   -- {student, payments, callbacks} на момент удаления
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  deleted_by_name text,
  -- delete — удалено в CRM (полная копия); recovered — восстановлено по следам, данные неполные;
  -- lost — известно только, что запись была (id и статус), данных не осталось
  source text not null default 'delete' check (source in ('delete', 'recovered', 'lost'))
);
comment on table public.deleted_custom_records is 'Архив удалённых записей custom_records: копия делается триггером перед удалением';
create index if not exists deleted_custom_records_tab_idx on public.deleted_custom_records (tab_id, deleted_at desc);
alter table public.deleted_custom_records enable row level security;

create or replace function public.archive_deleted_custom_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
begin
  -- Имя удалившего — из профиля входа; у сервисных запросов (функции, SQL) его нет.
  if v_uid is not null then
    select coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email) into v_name
    from auth.users u where u.id = v_uid;
  end if;
  insert into public.deleted_custom_records
    (id, tab_id, "values", created_by, created_at, updated_at, external_id, related, deleted_at, deleted_by, deleted_by_name, source)
  values (
    old.id, old.tab_id, old."values", old.created_by, old.created_at, old.updated_at, old.external_id,
    jsonb_build_object(
      'student', (select to_jsonb(s) from public.lead_students s where s.record_id = old.id),
      'payments', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.student_payments p where p.record_id = old.id), '[]'::jsonb),
      'callbacks', coalesce((select jsonb_agg(to_jsonb(c) order by c.due_at) from public.lead_callbacks c where c.record_id = old.id and c.status = 'pending'), '[]'::jsonb)
    ),
    now(), v_uid, v_name, 'delete'
  )
  on conflict (id) do update set
    tab_id = excluded.tab_id, "values" = excluded."values", created_by = excluded.created_by,
    created_at = excluded.created_at, updated_at = excluded.updated_at, external_id = excluded.external_id,
    related = excluded.related, deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by,
    deleted_by_name = excluded.deleted_by_name, source = 'delete';
  return old;
end;
$$;
revoke all on function public.archive_deleted_custom_record() from public, anon, authenticated;

drop trigger if exists custom_records_archive_before_delete on public.custom_records;
create trigger custom_records_archive_before_delete
  before delete on public.custom_records
  for each row execute function public.archive_deleted_custom_record();
