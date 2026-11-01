-- «O'quvchi bo'ldi»: карточка ученика (цена курса) и платежи по ней.
create table if not exists public.lead_students (
  record_id uuid primary key references public.custom_records(id) on delete cascade,
  tab_id uuid not null references public.custom_tabs(id) on delete cascade,
  price bigint not null default 0 check (price >= 0 and price <= 1000000000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_payments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.custom_records(id) on delete cascade,
  tab_id uuid not null references public.custom_tabs(id) on delete cascade,
  amount bigint not null check (amount > 0 and amount <= 1000000000),
  paid_at timestamptz not null default now(),
  note text check (char_length(note) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index if not exists student_payments_record_idx on public.student_payments (record_id);
create index if not exists lead_students_tab_idx on public.lead_students (tab_id);

alter table public.lead_students enable row level security;
alter table public.student_payments enable row level security;
revoke all on public.lead_students from anon;
revoke all on public.student_payments from anon;
grant select, insert, update on public.lead_students to authenticated;
grant select, insert, update on public.student_payments to authenticated;

-- Права те же, что у записей вкладки: смотреть — viewer, менять — editor.
create policy lead_students_select on public.lead_students for select to authenticated
  using (public.crm_is_member() and exists (select 1 from public.custom_tabs t where t.id = lead_students.tab_id
    and (t.created_by = auth.uid() or t.viewer_roles @> array[public.crm_user_role()])));
create policy lead_students_insert on public.lead_students for insert to authenticated
  with check (public.crm_is_member() and created_by = auth.uid() and exists (select 1 from public.custom_tabs t where t.id = lead_students.tab_id
    and (t.created_by = auth.uid() or t.editor_roles @> array[public.crm_user_role()])));
create policy lead_students_update on public.lead_students for update to authenticated
  using (public.crm_is_member() and exists (select 1 from public.custom_tabs t where t.id = lead_students.tab_id
    and (t.created_by = auth.uid() or t.editor_roles @> array[public.crm_user_role()])))
  with check (public.crm_is_member());

create policy student_payments_select on public.student_payments for select to authenticated
  using (public.crm_is_member() and exists (select 1 from public.custom_tabs t where t.id = student_payments.tab_id
    and (t.created_by = auth.uid() or t.viewer_roles @> array[public.crm_user_role()])));
create policy student_payments_insert on public.student_payments for insert to authenticated
  with check (public.crm_is_member() and created_by = auth.uid() and cancelled_at is null and exists (select 1 from public.custom_tabs t where t.id = student_payments.tab_id
    and (t.created_by = auth.uid() or t.editor_roles @> array[public.crm_user_role()])));
create policy student_payments_update on public.student_payments for update to authenticated
  using (public.crm_is_member() and exists (select 1 from public.custom_tabs t where t.id = student_payments.tab_id
    and (t.created_by = auth.uid() or t.editor_roles @> array[public.crm_user_role()])))
  with check (public.crm_is_member());
-- Платежи не удаляются: ошибочный платёж отменяется (cancelled_at), история остаётся.
