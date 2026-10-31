# Маршруты лидов CRM

Состояние на 31.10.2026 (проверено по коду функций и данным Supabase `uzivivmrixstxjvzkksz`).

| Источник | Через что | Куда пишется | Продукт |
|---|---|---|---|
| Meta, форма `1657196732409379` | Прямой вебхук `meta-yba-webhook` или Make → `meta-admin-lead-ingest` | Вкладка CRM «Blogerlik leadlari bolalar» (`custom_records`, tab `d52d616c-a91f-47f4-a151-8bb9c069d06d`) + Telegram | Академия |
| Meta, форма `1116743630843921` | Make → `meta-admin-lead-ingest` | `meta_admin_leads` + Telegram («yangi_haydovchi») | Вакансия (координатор) |
| Meta, форма `1471428244799477` | Make → `meta-admin-lead-ingest` | `meta_admin_leads` | Вакансия (администратор) |
| Сайт вакансии | `vacancy-assessment` | `meta_admin_leads`, форма `zamonaviy-kasb-vakansiya` | Вакансия |
| Загрузка Excel | CRM, вкладка «Загрузка лидов через Excel» | `custom_records` | Академия |
| Mini App семейной платформы | Синхронизация | Вкладка «Детский блогинг» | Участники платформы, не лиды |

## Правила
- Академия никогда не пишется в `meta_admin_leads`.
- Новую форму академии нужно добавить в `META_YBA_FORM_IDS` (секрет функции `meta-yba-webhook`) и в маршрутизацию `meta-admin-lead-ingest`, иначе лид не попадёт во вкладку академии.
- Вкладка «Blogerlik leadlari bolalar» нужна функциям приёма лидов, удалять и переименовывать её нельзя.
- Удаление вкладки CRM каскадно удаляет все её записи.
