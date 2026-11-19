-- Напоминания «Qayta aloqa» операторам колл-центра тоже идут через очередь operator_notifications (kind = 'callback').
-- Кладёт teachnova-bot (?remind=1) в момент срока; operator-notify доставляет в рабочее время и перед отправкой сверяет
-- «Время повторной связи» в карточке лида — перенесённые и отменённые напоминания не уходят. Применено 2026-11-19.
alter table public.operator_notifications drop constraint if exists operator_notifications_kind_check;
alter table public.operator_notifications add constraint operator_notifications_kind_check
  check (kind in ('lead', 'call_result', 'callback'));
