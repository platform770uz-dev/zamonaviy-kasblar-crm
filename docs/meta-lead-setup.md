# Подключение Meta Lead Ads к CRM (прямой вебхук академии)

Чек-лист для владельца аккаунта Meta. Порядок и названия разделов Meta могут меняться, сверяйтесь с актуальной документацией Meta for Developers (Webhooks → Page → leadgen, Lead Ads Retrieval).

## Что уже есть
- Функция `meta-yba-webhook` в Supabase `uzivivmrixstxjvzkksz`:
  `https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/meta-yba-webhook`
- Страница Facebook `1239005935955148`, форма академии `1657196732409379`.
- Лид пишется во вкладку CRM «Blogerlik leadlari bolalar», в Telegram уходит уведомление.

## Шаги в Meta
1. **Подтвердить аккаунт разработчика** на developers.facebook.com (сейчас доступ заблокирован до подтверждения).
2. Создать приложение типа Business (или восстановить прежнее), привязать к вашему Business Portfolio.
3. Добавить продукт **Webhooks**. Объект **Page**, callback URL — адрес функции выше, Verify Token — придуманная вами строка (та же, что в секрете `META_WEBHOOK_VERIFY_TOKEN`). Подписаться на поле **`leadgen`**.
4. Подписать страницу на приложение (`POST /{page-id}/subscribed_apps` с `subscribed_fields=leadgen`, либо в Graph API Explorer). Без этого события не придут.
5. Выдать приложению доступ к лидам: Business Settings → Integrations → **Leads Access** (назначить приложение / CRM для страницы).
6. Токен: лучше **System User** в Business Settings с назначенными страницей и приложением и правами на лиды (`leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`; при необходимости `ads_read`/`pages_manage_ads` по подсказке Meta). Токен системного пользователя не истекает, токен страницы может.
7. Перевести приложение в режим **Live**: в режиме разработки приходят события только для ролей приложения и тестовых лидов.

## Секреты Supabase (Edge Functions → Secrets)
Значения вносите вы в панели Supabase, в переписку и в код их не помещаем.

| Имя | Что это |
|---|---|
| `META_WEBHOOK_VERIFY_TOKEN` | Ваша строка проверки вебхука |
| `META_APP_SECRET` | Секрет приложения Meta (проверка подписи) |
| `META_PAGE_ACCESS_TOKEN` | Токен для чтения лида из Graph API |
| `META_GRAPH_API_VERSION` | Версия Graph API, например `21.0` (проверьте актуальную) |
| `META_YBA_FORM_IDS` | ID форм академии через запятую (по умолчанию `1657196732409379`) |

## Проверка без рекламы и бюджета
1. Откройте Lead Ads Testing Tool (developers.facebook.com/tools/lead-ads-testing).
2. Выберите страницу и форму академии, нажмите «Create lead».
3. Во вкладке «Blogerlik leadlari bolalar» должна появиться запись со статусом «Yangi», в Telegram придёт уведомление.
4. Повторите отправку того же лида: дубля быть не должно, статус не сбрасывается.

## Если не работает
| Симптом | Что проверить |
|---|---|
| Вебхук не проходит проверку в Meta | Verify Token в Meta и в секрете совпадают, функция отвечает на GET |
| События не приходят | Страница подписана на приложение (шаг 4), приложение Live (шаг 7) |
| В журнале «Meta lead retrieval failed» с кодом 190 | Токен недействителен или просрочен |
| Код 200 / 10 | Нет прав на лиды: проверить шаги 5 и 6 |
| Записи нет, но 200 OK | ID формы не входит в `META_YBA_FORM_IDS` |
