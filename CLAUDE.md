# Zamonaviy Kasblar — CRM и Telegram-боты

Статический сайт CRM (GitHub Pages) + Supabase (база и Edge Functions) + Telegram-боты.
Работа идёт из облачных сессий Claude Code (телефон, планшет, ноутбук), поэтому всё нужное для работы — в этом репозитории и в коннекторе Supabase.

## Где что лежит

- **Сайт CRM**: https://platform770uz-dev.github.io/zamonaviy-kasblar-crm/ — файлы в корне репозитория, GitHub Pages публикует ветку `main`.
  - `index.html` — разметка, версии файлов (`?v=polish-N`), ключ Supabase publishable (публичный по замыслу, защита — RLS).
  - `app.js` — вся логика CRM: вход, вкладки, лиды, очередь ИИ, опросы, ученики и оплаты, дашборд, скрипт.
  - `styles.css` — стили; правки добавляются слоями `/* ---------- polish-N ---------- */` в конце файла.
  - `uz-phrases.js` — перевод интерфейса с русского на узбекский (`uzPhrases` по точному тексту, `uzPatterns` для строк с числами).
  - `nav-archive.js` — боковое меню: «Архив», порядок и переименование пунктов (хранится в localStorage браузера).
  - `yba-results-panel.js`, `intellekt-lab-results.js` — панели «Bolalar tanishuvi» и «Intellekt Lab» в архиве.
  - `vakansiya/` — сайт вакансии, `maxfiylik-siyosati.html` — политика конфиденциальности.
- **Supabase** `uzivivmrixstxjvzkksz` (проект «zamonaviy-kasblar», eu-central-1): база и функции. Код функций — `supabase/functions/<slug>/`, миграции — `supabase/migrations/`.
- Второй проект Supabase `trxnsqpdekokqvtefxlt` («yba-family-platform»: семейная платформа, «Tez aytish») — его функции в этом репозитории не хранятся.
- Маршруты лидов и формы Meta — `docs/lead-routes.md`, `docs/meta-lead-setup.md`.
- Рабочие лиды — `custom_records` вкладки «Загрузка лидов через Excel». Таблицы `crm_*` (сделки, контакты, задачи старой CRM) с 2026-10-05 не пополняются; в них пишет `crm-lead`, читает `tg-bot`. Служебные `crm_maxfiy`, `crm_browser_login_tokens`, `crm_web_login` используются и сейчас.

## Связанные репозитории

Mini App ботов — отдельные репозитории аккаунта `platform770uz-dev`, каждый публикуется на GitHub Pages. Чтобы их править, подключи нужный репозиторий к сессии.

| Репозиторий | Что это | Где открывается |
|---|---|---|
| `operator-skript` | скрипт звонков и тренажёр операторов | Mini App в @eduteachuz_bot (`eduteach-bot`) |
| `yba-kvitansiya` | квитанции об оплате; API — функция `kv-admin` | Mini App в @teachnova_bot |
| `yba-public-miniapp` | тренажёр «Tez aytish» (`/tez-aytish/`) | Mini App в @zamonaviykasbuz_bot (`yba-public-parent-bot`) |
| `yosh-blogerlar-miniapp` | знакомство родителей с академией; API — `yba-parent-api` | Mini App из `tg-bot` после одобрения родителя |

Остальные репозитории аккаунта: `employee-qr-passes`, `yba-family-platform-pages`, `yba-shartnoma`, `zamonaviy-kasblar-oferta`, `zamonaviy-kasblar`.

## Боты

| Бот | Для кого | Функция | Секрет с токеном |
|---|---|---|---|
| @teachnova_bot | руководитель: CRM и «Kvitansiya» как Mini App, решения по доступу операторов | `teachnova-bot` | `TEACHNOVA_BOT_TOKEN` |
| @eduteachuz_bot | операторы колл-центра: Mini App скрипта звонков | `eduteach-bot`; уведомления операторам — `operator-notify` | `EDUTEACH_BOT_TOKEN` |
| @zamonaviykasbuz_bot | «Zamonaviy Kasblar Kids»: тренажёр «Tez aytish» | `yba-public-parent-bot` | `YBA_PUBLIC_BOT_TOKEN` |
| «1924 admin-bot» | меню ссылок, вход в CRM, подтверждение админов, новые лиды | `tg-bot` | `TELEGRAM_BOT_TOKEN` |

Вебхук каждого бота указывает на его функцию: `https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/<slug>`.
Роли и доступ к CRM — таблица `tg_chatlar` (общая для `tg-bot` и `teachnova-bot`), доступ операторов — `skript_operatorlar`.

## Функции Supabase

Версии — на 2026-11-20. `verify_jwt` при повторном деплое оставлять таким же.

| Функция | Что делает | verify_jwt |
|---|---|---|
| `crm-web-login` | вход руководителя в CRM по PIN (`CRM_WEB_PIN`) | false |
| `crm-browser-login` | вход по одноразовой ссылке из бота (`#crm-login=<token>`, 5 минут) | false |
| `crm-telegram-login` | вход владельца из Telegram Mini App (проверка `initData`) | false |
| `meta-yba-webhook` | прямой вебхук Meta Lead Ads → вкладка лидов + Telegram | false |
| `meta-admin-lead-ingest` | лиды из Make → вкладка академии или HR (import map `deno.json`) | false |
| `meta-lead-reroute` | заглушка 410, разовый перенос лидов 2026-11-12; можно удалить | false |
| `crm-lead` | старый вебхук внешних лидов в таблицы `crm_*` (секрет в `crm_maxfiy`) | false |
| `lead-queue` | ИИ-очередь звонков «ИИ maslahat» | false |
| `operator-notify` | очередь уведомлений операторам (пн–сб 13:00–19:00, Ташкент) | false |
| `teachnova-bot`, `eduteach-bot`, `yba-public-parent-bot`, `tg-bot` | боты (см. выше) | false |
| `order-link` | ссылка подписи заказа: загрузить и подписать | false |
| `contract-web` | страница договоров «Zamonaviy Kasblar Duo» — **код только в Supabase**, см. ниже | false |
| `yba-contract-start` | публичное начало договора | false |
| `yba-parent-api` | API Mini App для родителей «Yosh blogerlar» | false |
| `yba-subscription-payment` | оплата подписки и квитанции | **true** |
| `kv-admin` | админ-API квитанций по PIN (`KV_ADMIN_PIN`, import map `deno.json`) | false |
| `vacancy-assessment` | приём анкет с сайта вакансии | false |
| `intellekt-lab-submit` | результаты «Intellekt Lab» | false |

`yba-public-intro-submit` лежит в репозитории, но не развёрнута.

## Как выкладывать

1. **Сайт.** Коммит и push в `main` — GitHub Pages обновит сайт за 1–2 минуты.
   Если менялись `styles.css`, `app.js` или `uz-phrases.js`, подними версию `?v=polish-N` в `index.html` (у `styles.css` и `app.js`) и в импорте `uz-phrases.js` в начале `app.js`, иначе у операторов останется старый файл из кэша.
   Проверить, что сайт обновился: `curl -s https://platform770uz-dev.github.io/zamonaviy-kasblar-crm/ | grep -o 'app.js?v=[^"]*'`.
2. **Функции.** Деплой через коннектор Supabase (`deploy_edge_function`, проект `uzivivmrixstxjvzkksz`) с тем же `verify_jwt` и import map, что в таблице.
   Копии в репозитории могут отставать от развёрнутых: перед деплоем из репозитория сверь код с `get_edge_function`. После деплоя закоммить тот же код.
   `meta-admin-lead-ingest`: в репозитории хеш токена Make читается из секрета `MAKE_TOKEN_SHA256` — перед деплоем из репозитория проверь, что секрет задан, иначе все запросы Make получат 401. Развёрнутую версию этой функции в репозиторий не копируй: в ней хеш записан как значение по умолчанию.
3. **База.** Схема меняется миграцией: `apply_migration` через коннектор и тот же SQL в `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`.

## Правила

- **Репозиторий публичный.** Токены ботов, service_role, PIN, хеши токенов, адреса вебхуков Make — только в секретах Supabase (Edge Functions → Secrets) или в таблице `crm_maxfiy`; в коде — `Deno.env.get("ИМЯ")`. Перед каждым коммитом ищи в изменениях токены (`123456789:AA…`), JWT (`eyJ…`), `sb_secret_`, пароли и PIN.
- **Персональные данные не коммитить**: реквизиты, ПИНФЛ, паспортные данные, телефоны клиентов, выгрузки лидов. Для скриншотов и проверок — выдуманные данные.
- Вкладку «Загрузка лидов через Excel» в базе **не переименовывать**: по этому имени её находят `meta-yba-webhook` и `app.js`. В интерфейсе она показывается как «Лиды» (`tabDisplayName` в `app.js`).
- Вкладку «Blogerlik leadlari bolalar» не удалять и не переименовывать. Удаление вкладки CRM каскадно удаляет все её записи.
- Удаление лида в CRM необратимо: корзины нет. Записи в базе не удаляй и не меняй массово без прямой просьбы; перед такой правкой сохрани копию затрагиваемых строк.
- Тексты интерфейса пишутся по-русски, но язык по умолчанию у операторов — узбекский. Каждую новую видимую строку добавляй в `uzPhrases` в `uz-phrases.js`, строки с числами — в `uzPatterns`.
- Операторы работают с телефона: проверяй вёрстку на ширине 390px и на узбекском (тексты длиннее). Мобильные правила — `@media(max-width:760px)` и `640px`.

## Как посмотреть интерфейс из облачной сессии

Сайт открывается из сессии (хост разрешён в окружении), но без входа виден только экран входа — PIN и Telegram-вход здесь недоступны.
Чтобы проверить экраны CRM: Playwright (предустановлен) открывает файлы репозитория, а запросы к `https://uzivivmrixstxjvzkksz.supabase.co/**` перехватываются `page.route` и получают выдуманные данные.
Сессию задаёт ключ localStorage `sb-uzivivmrixstxjvzkksz-auth-token`, язык — `crm-language` (`ru` или `uz`), открытый раздел — `crm.lastView.v1` (например, `{"type":"page","page":"dashboard"}`).
RPC `crm_is_manager` → `true`, `crm_user_role` → `"owner"` дают права руководителя.

## Что не в репозитории

- `contract-web`: в HTML страницы записаны реквизиты исполнителя (персональные данные), поэтому код хранится только в Supabase. Чтобы положить функцию в репозиторий, сначала вынеси реквизиты из кода (секрет или таблица) и задеплой.
- Сценарии Make.com, значения секретов Supabase.
