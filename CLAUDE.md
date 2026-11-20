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
- Второй проект Supabase `trxnsqpdekokqvtefxlt` («yba-family-platform»: семейная платформа, «Tez aytish») — его функции в этом репозитории не хранятся, кроме `tez-aytish-route` (папка `yba-family-platform/`, см. «Dars yoʻli»).
- `dars-yoli/` — страница «Dars yoʻli» (маршрут урока для учителей Tez aytish) и листы уроков `dars-yoli/varaqalar/`; генератор листов — `tools/varaqa/gen.js`.
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
| @zamonaviykasbuz_bot | «Zamonaviy Kasblar Kids»: тренажёр «Tez aytish»; у учителей и админов кнопка меню «Dars yoʻli» | `yba-public-parent-bot` | `YBA_PUBLIC_BOT_TOKEN` |
| «1924 admin-bot» | меню ссылок, вход в CRM, подтверждение админов, новые лиды | `tg-bot` | `TELEGRAM_BOT_TOKEN` |
| @kidscast_bot | родители учеников Tez aytish: «Keldi», итоги урока, домашка, профиль ребёнка | `kidscast-bot` (проект `trxnsqpdekokqvtefxlt`) | `KIDSCAST_BOT_TOKEN` (там же) |

Вебхук каждого бота указывает на его функцию: `https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/<slug>` (у @kidscast_bot — в проекте `trxnsqpdekokqvtefxlt`).
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

**Модели ИИ задаются секретами** (с 2026-11-20, пробный период):
- `TEACHNOVA_AI_MODEL` = `claude-haiku-5-5` — сводка и совет после звонка в `teachnova-bot`;
- `LEAD_QUEUE_AI_MODEL` = `claude-sonnet-5-5` — очередь звонков в `lead-queue` (модель каждой очереди пишется в `lead_call_batches.model`).

Без секретов функции берут модели из кода: Sonnet 5.5 и Opus 5.5. В `teachnova-bot` запасная модель жёстко задана как Haiku, поэтому, пока основная тоже Haiku, запасной нет: при сбое сводка не появится, а владельцу придёт уведомление (ошибки — в `meta_webhook_debug`, `stage = 'ai_error'`).

## Как выкладывать

1. **Сайт.** Коммит и push в `main` — GitHub Pages обновит сайт за 1–2 минуты.
   Если менялись `styles.css`, `app.js` или `uz-phrases.js`, подними версию `?v=polish-N` в `index.html` (у `styles.css` и `app.js`) и в импорте `uz-phrases.js` в начале `app.js`, иначе у операторов останется старый файл из кэша.
   Проверить, что сайт обновился: `curl -s https://platform770uz-dev.github.io/zamonaviy-kasblar-crm/ | grep -o 'app.js?v=[^"]*'`.
2. **Функции.** Деплой из файлов репозитория через Supabase CLI (см. «Доступ к Supabase из облака» ниже) — код уходит ровно таким, как в репозитории. Коннектор (`deploy_edge_function`) — запасной путь: код приходится передавать текстом, в больших файлах легко ошибиться.
   `verify_jwt` оставляй как в таблице: почти у всех `false`, значит в команде нужен `--no-verify-jwt`, иначе вебхуки Telegram и Meta перестанут проходить.
   Копии в репозитории могут отставать от развёрнутых: перед деплоем из репозитория сверь код с `get_edge_function`. После деплоя закоммить тот же код.
   `meta-admin-lead-ingest`: в репозитории хеш токена Make читается из секрета `MAKE_TOKEN_SHA256` — перед деплоем из репозитория проверь, что секрет задан, иначе все запросы Make получат 401. Развёрнутую версию этой функции в репозиторий не копируй: в ней хеш записан как значение по умолчанию.
3. **База.** Схема меняется миграцией: `apply_migration` через коннектор и тот же SQL в `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`.

## Доступ к Supabase из облака

В облачном окружении сохранён токен Supabase (network secret для `api.supabase.com`, с 2026-11-20). Права: только проект `zamonaviy-kasblar`, Edge Functions и Edge Function Secrets — чтение и запись; к базе, оплате и организации доступа нет. Прокси сам подставляет токен в запросы, переменной окружения нет: CLI нужен фиктивный токен нужного формата, настоящий подставится.

```bash
npm i --prefix /tmp/sb supabase                      # Supabase CLI, без Docker (проверено: v3.2.0)
export SUPABASE_ACCESS_TOKEN="sbp_$(printf '0%.0s' {1..40})"   # фиктивный, прокси заменит
SB=/tmp/sb/node_modules/.bin/supabase
$SB functions list --remote uzivivmrixstxjvzkksz     # проверено: работает
$SB functions download <slug> --remote uzivivmrixstxjvzkksz --use-api --workdir "$(mktemp -d)"   # развёрнутый код в пустую папку, для сверки с репозиторием
$SB functions deploy <slug> --remote uzivivmrixstxjvzkksz --use-api --no-verify-jwt --yes   # для verify_jwt=false; --yes только после подтверждения владельца
$SB secrets list --remote uzivivmrixstxjvzkksz       # имена и SHA-256 значений, не сами значения
```

Команды, которые меняют проект (например, `functions deploy`), в сессии агента без `--yes` останавливаются с `HostedMutationConsentRequiredError` и ничего не меняют. `--yes` добавляй только после того, как владелец в чате прямо подтвердил именно это изменение. `functions download` без `--workdir` перезапишет файлы в `supabase/functions/` репозитория.

Хост проекта `uzivivmrixstxjvzkksz.supabase.co` из облачной сессии закрыт, вызвать функцию напрямую нельзя. Проверить функцию после деплоя можно по логам: `query_logs`, источник `function_edge_logs`, строки вида `POST | 200 | …/functions/v1/<slug>`. Для бота попроси владельца отправить ему `/start`.

Секреты через API задавай только с несекретными значениями (например, модель ИИ). Токены и ключи вводит владелец сам — в панели Supabase или в форме коннектора, никогда не в чат.
После смены секретов Supabase перезапускает функции: номер версии растёт на 1, а код (`ezbr_sha256`, `updated_at`) прежний — это не деплой.

## Dars yoʻli — маршрут урока для учителя (Tez aytish)

Урок у группы идёт 90 минут (сб/вс), платформа ведёт учителя по 5 этапам и открывает следующий только после выполнения условия:
1. **Darsni boshlash** (5 мин) — выбран урок курса на сегодня, выбран модуль недели, хотя бы один «Keldi».
2. **Tez aytish** (25) — все отмеченные дети прошли 4 скороговорки урока в тренажёре.
3. **Mavzu darsi** (30) — урок курса по печатному листу, всем пришедшим поставлен балл 0–5.
4. **Kamera oldida** (20) — все пришедшие сняли видео на 30 секунд.
5. **Yakun** (10) — «Barakalla», домашка; «Darsni yakunlash» отправляет отчёт владельцу.

Этапы 2–4 после планового времени можно пройти, указав причину (она попадает в отчёт).

- **Страница** `dars-yoli/index.html` — Mini App на GitHub Pages; открывается кнопкой меню «Dars yoʻli» в @zamonaviykasbuz_bot, которая есть только у активных учителей (`tez_aytish_teachers.status = 'active'`) и админов (`admins.active`). Отметки «Keldi», модуль недели и «Barakalla» страница пишет через `tez-aytish-teacher`, этапы — через `tez-aytish-route`. Проверка без Telegram: `?mock` (выдуманные данные; `&override`, `&notday` — варианты).
- **Функция** `tez-aytish-route` в проекте `trxnsqpdekokqvtefxlt`, исходник — `yba-family-platform/functions/tez-aytish-route/index.ts`. Деплой — коннектором `deploy_edge_function` с `verify_jwt: false` (CLI-токен этого проекта не покрывает). Проверка типов: `deno check`.
- **Таблицы** (там же): `tez_aytish_course_lessons` — уроки курса (`id` = `dNN`, `num`, `title`, `kind` blogging/matematika, `sheet_url`, `plan` = `[{min, text}]` для этапа 3, `homework`); `tez_aytish_lesson_runs` — прохождение урока группой за день; `tez_aytish_route_alerts`, `tez_aytish_menu_buttons`. У групп — `lesson_time` (уведомления только при нём) и `taught_before` (уроки курса, пройденные до платформы).
- **Планировщик**: cron `tez-aytish-route-tick` каждые 5 минут → `public.tez_aytish_route_tick()` → `/tick` с `x-cron-secret` из `tez_aytish_settings.cron_secret`. Делает: напоминание учителю за 15 минут; через 10 минут без начала — сигнал владельцу и учителю; этап дольше плана на 10 минут — сигнал владельцу; отчёт через 150 минут, если урок не завершён; в воскресенье с 20:00 — итог недели; ставит и снимает кнопку меню. Сообщения идут через бот тренажёра.
- **Новый урок**: добавь урок в `LESSONS` в `tools/varaqa/gen.js` (история Murodjon, правила, 5 заданий «Misol → Savol», «Nega bizga … kerak?») и собери PDF: `NODE_PATH=$(npm root -g) node tools/varaqa/gen.js 6` → `dars-yoli/varaqalar/6-dars.pdf` (одна страница A4). Затем строка в `tez_aytish_course_lessons` с `sheet_url` = `https://platform770uz-dev.github.io/zamonaviy-kasblar-crm/dars-yoli/varaqalar/6-dars.pdf`, `plan` и `homework`.
- **Тест**: `/tick` с `x-selftest-token` — сухой прогон (`{"now": "…"}` задаёт время), ничего не отправляет и не меняет; остальные действия с `x-selftest-as` = Telegram ID. Хеш токена — секрет `TEZ_AYTISH_SELFTEST_SHA256`; в развёрнутой версии в `SELFTEST_SHA256` записан ещё хеш тестового токена команды тренажёра (как в `tez-aytish-teacher`), в репозитории его нет — хеши в публичный код не кладём. Временный хеш добавляй только в развёрнутую версию и убирай после проверки. Хост проекта из сессии закрыт: запросы шли через `net.http_post` из базы.

## Правила

- `mcp__Supabase__execute_sql` и `mcp__Supabase__apply_migration` разрешены без подтверждения (решение владельца, 2026-11-20): запросы и миграции, которые меняют или удаляют данные, делай только по прямой просьбе и с копией затрагиваемых строк. Разрешения из `.claude/settings.json` действуют только в сессии с одним репозиторием — второй репозиторий подключай, только если без него нельзя.
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
