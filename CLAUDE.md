# Zamonaviy Kasblar — CRM и Telegram-боты

Статический сайт CRM (GitHub Pages) + Supabase (база и Edge Functions) + Telegram-боты.
Работа идёт из облачных сессий Claude Code (телефон, планшет, ноутбук), поэтому всё нужное для работы — в этом репозитории и в коннекторе Supabase.

## Где что лежит

- **Сайт CRM**: https://platform770uz-dev.github.io/zamonaviy-kasblar-crm/ — файлы в корне репозитория, GitHub Pages публикует ветку `main`.
  - `index.html` — разметка, версии файлов (`?v=polish-N`), ключ Supabase publishable (публичный по замыслу, защита — RLS).
  - `app.js` — вся логика CRM: вход, вкладки, лиды, очередь звонков, запись звонка и архив, ученики и оплаты, дашборд, скрипт.
  - `styles.css` — стили; правки добавляются слоями `/* ---------- polish-N ---------- */` в конце файла.
  - `uz-phrases.js` — перевод интерфейса с русского на узбекский (`uzPhrases` по точному тексту, `uzPatterns` для строк с числами).
  - `nav-archive.js` — боковое меню: «Архив», порядок и переименование пунктов (хранится в localStorage браузера).
  - `yba-results-panel.js`, `intellekt-lab-results.js` — панели «Bolalar tanishuvi» и «Intellekt Lab» в архиве.
  - `vakansiya/` — сайт вакансии, `maxfiylik-siyosati.html` — политика конфиденциальности.
- **Supabase** `uzivivmrixstxjvzkksz` (проект «zamonaviy-kasblar», eu-central-1): база и функции. Код функций — `supabase/functions/<slug>/`, миграции — `supabase/migrations/`.
- Второй проект Supabase `trxnsqpdekokqvtefxlt` («yba-family-platform»: семейная платформа, «Tez aytish») — его функции в этом репозитории не хранятся, кроме `tez-aytish-route` (папка `yba-family-platform/`, см. «Dars yoʻli») и `tez-aytish-api` (см. «Super Intellekt Kids»).
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
| @SuperIntellektBot | родители «Super Intellekt Kids»: пробный урок за 99 000, медвежонок Super Ayiq, баллы и монеты; у сотрудников — «Boshqaruv» | `sik-lite` | `SIK_LITE_BOT_TOKEN` (тот же токен и в проекте `trxnsqpdekokqvtefxlt` для `tez-aytish-api`) |

Вебхук каждого бота указывает на его функцию: `https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/<slug>` (у @kidscast_bot — в проекте `trxnsqpdekokqvtefxlt`).
Роли и доступ к CRM — таблица `tg_chatlar` (общая для `tg-bot` и `teachnova-bot`), доступ операторов — `skript_operatorlar`.

## Функции Supabase

Версии — на 2026-11-20. `verify_jwt` при повторном деплое оставлять таким же.

| Функция | Что делает | verify_jwt |
|---|---|---|
| `crm-web-login` | вход руководителя в CRM по PIN (`CRM_WEB_PIN`) | false |
| `crm-browser-login` | вход по одноразовой ссылке из бота (`#crm-login=<token>`, 5 минут) | false |
| `crm-telegram-login` | вход владельца из Telegram Mini App (проверка `initData`) | false |
| `meta-yba-webhook` | прямой вебхук Meta Lead Ads → вкладка лидов (академия) или «Вакансии Facebook» (вакансии) + Telegram; новую форму регистрирует сам, с названием из Meta | false |
| `meta-admin-lead-ingest` | лиды из Make → вкладка академии или HR (import map `deno.json`) | false |
| `meta-lead-reroute` | заглушка 410, разовый перенос лидов 2026-11-12; можно удалить | false |
| `crm-lead` | старый вебхук внешних лидов в таблицы `crm_*` (секрет в `crm_maxfiy`) | false |
| `lead-queue` | ежедневный список звонков операторам в Telegram — по правилам очереди, без ИИ | false |
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
| `sik-lite` | бот @SuperIntellektBot, API его Mini App и тик каждые 5 минут (см. «Super Intellekt Kids») | false |

`yba-public-intro-submit` лежит в репозитории, но не развёрнута.

**Модель ИИ задаётся секретом** `TEACHNOVA_AI_MODEL` — подсказка после звонка в `teachnova-bot`. Нужное значение — `claude-sonnet-5-5` (без секрета функция берёт ту же Sonnet 5.5 из кода). Запасная модель записана в коде — Haiku 5.5: она отвечает, если Sonnet не сработал. Какая модель работает сейчас, показывает проба: `?ai_lab=1` возвращает `live_model`.

Решение владельца (2026-11-23): подсказки пишет Sonnet. На 10 реальных записях Sonnet написал все подсказки без ошибок, Haiku ошибся в 3 (подтвердил встречу, время которой прошло; вставил в фразу для родителя кусок инструкции; сказал «bugun» про запись месячной давности). Цена — около 0,4 и 0,04 цента за звонок. Основной моделью Haiku не ставь. Ошибки ИИ пишутся в `meta_webhook_debug` (`stage = 'ai_error'`), владельцу приходит уведомление.

Секрет `LEAD_QUEUE_AI_MODEL` больше не используется: с 2026-11-23 очередь звонков строится по правилам, без ИИ.

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

## Super Intellekt Kids — бот родителей и медвежонок (с 2026-11-28)

Ребрендинг академии: родитель покупает пробный пакет за 99 000 (офлайн-урок в центре + Mini App до конца урока + 48 часов). 99 000 засчитываются в первый месяц, если курс куплен за эти 48 часов. В Mini App живёт медвежонок «Super Ayiq»: он растёт от **баллов** (ДЗ — одна скороговорка в день, посещение, оценки учителя). **Монеты** (tanga, 1 = 100 сум) дают только B2B-заказы, рефералы и призы. Академия деньги детей не хранит: выплату делает владелец и отмечает её в «Boshqaruv».

- **Функция** `sik-lite` (исходник `supabase/functions/sik-lite/index.ts`): вебхук бота, `/api/<action>` для Mini App (проверка `initData`), `?dz=1` для `tez-aytish-api` (заголовок `x-sik-dz` = sha256(`sik-dz:` + токен бота)), `?tick=1` (cron `sik-lite-tick`, каждые 5 минут, только когда в `sik_parents` есть строки), `?setup=1|0` (вебхук, команды, кнопка меню). `tick` и `setup` требуют `x-crm-secret` = `crm_maxfiy.tg_ichki`.
- **Тесты без отправки**: `x-crm-secret` + `x-selftest-dry: 1` возвращает исходящие вызовы Telegram в `out` вместо отправки (CRM, очередь операторов и баллы не пишутся). `x-selftest-as: <telegram id>` выполняет API от имени этого пользователя. Вызовы — через `net.http_post` из базы, чтобы секрет не попадал в чат. Тестовые строки (вымышленный id, например 1000000001) после проверки удалять.
- **Таблицы** `sik_*` (только service role): `sik_parents`, `sik_children`, `sik_lessons`, `sik_bookings`, `sik_dz`, `sik_points`, `sik_coins`, `sik_referrals`, `sik_invites`, `sik_staff`, `sik_settings`, `sik_sent`, `sik_child_sent`. Суммы и рейтинг считают `sik_totals` и `sik_rating`: PostgREST отдаёт не больше 1000 строк, поэтому строки не суммируют на стороне функции. Записи пробных уроков — во вкладке CRM «Super Intellekt Kids» (`sik_crm_put`).
- **Как задеплоено**: коннектором задеплоена обёртка, которая импортирует файл из этого репозитория по `raw.githubusercontent.com` на конкретном коммите. Поэтому в Supabase попадает ровно файл из репозитория, без ручного переноса текста. Чтобы обновить: закоммитить, затем задеплоить обёртку с новым SHA. Деплой CLI из папки тоже подходит, с `--no-verify-jwt`.
- **Первый вызов REST** только что запущенного экземпляра иногда получает 401 (PGRST303), поэтому в клиенте базы есть один повтор: отклонённый запрос не выполнялся.
- **Mini App** — `yba-public-miniapp/sik-lite/` (кнопка меню бота). Проверка без Telegram: `?mock`, `?mock=guest|expired|student|staff|teacher`.
- **ДЗ** открывает тренажёр `../tez-aytish/?lite=1&c=<ребёнок>`. `tez-aytish-api` по `SIK_LITE_BOT_TOKEN` узнаёт этого бота, спрашивает `sik-lite`, открыт ли ребёнок, выбирает «скороговорку дня» и отправляет звёзды в `sik-lite`. За день: 5 баллов + звёзды, максимум 8; каждые 7 дней подряд +20.
- **`tez-aytish-api`** теперь лежит здесь: `yba-family-platform/functions/tez-aytish-api/index.ts`, деплой такой же обёрткой с коммитом. Хеша тестового токена `/selftest` в публичном файле нет. Его передаёт файл обёртки `selftest-hash.ts` (только в развёрнутой версии, через `globalThis.__TEZ_SELFTEST_SHA256`) или секрет `TEZ_AYTISH_SELFTEST_SHA256`. При деплое обёртки этот файл не терять.

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

## Запись звонка и архив (с 2026-11-23)

Решения владельца: на карточке лида одна кнопка «Записать звонок» вместо ряда статусов, «Опроса» и «Итога звонка»; оператор лидов не удаляет.

- **Запись звонка** — `openCallDialog` в `app.js`. Шаг 1: результат (`callResults`: не ответил, перезвонить, думает, записался, оплатил, отказался, неверный номер; у записанных на консультацию ещё «пришёл / не пришёл»). Шаг 2: только нужное по результату — время перезвона, дата консультации, причина отказа, необязательная заметка.
- **Что пишется в лид**: «Результат последнего звонка» (`composeCallNote`: по-узбекски, с метками строк `Kelishuv`, `E’tiroz`, `Keyingi qo‘ng‘iroq`, `Izoh` — запись читают ИИ и Telegram), «Статус консультации» (`callOutcome`), «Время повторной связи» + напоминание в `lead_callbacks`, журнал «Звонки» (до 30 последних). В «Опрос» обновляются `outcome`, `nextCallAt`, `meetingAt` — по времени перезвона и по `meetingAt` очередь звонков решает, кому звонить; прежние ответы анкет (ребёнок, цель) не стираются.
- **«Не ответил»** сам ставит перезвон (`autoCallbackTime`: через 3 часа, во второй раз — завтра; только пн–сб 13:30–18:30), после третьей попытки подряд предлагает архив. Время перезвона стоит не только у статуса «Перезвонить»: правило «пора перезвонить» (`leadQueueItem`) смотрит на поле времени, а не на статус.
- **Архив**: отказ, неверный номер, три недозвона и «⋯ → В архив» вызывают `archive_custom_record(p_record, p_reason, p_note, p_values)` — запись звонка и удаление идут одной транзакцией. Триггер `custom_records_archive_before_delete` копирует в `deleted_custom_records` любую удалённую запись вместе с карточкой ученика, оплатами и ожидающими напоминаниями (`related`), причину берёт из настроек транзакции `crm.archive_reason`. `source`: `delete` — полная копия; `recovered` — восстановлено по следам, данные неполные; `lost` — известно только, что лид был (49 лидов, удалённых 20–23 ноября до появления архива: 21 и 28).
- **Возврат**: фильтр «Архив» в списке лидов → «Вернуть в список» → `restore_archived_record(p_record)` — запись возвращается с тем же id, с оплатами и будущими напоминаниями. Читать архив и возвращать могут все, кто работает с вкладкой лидов; прямой записи в таблицу у клиентов нет.
- **Бот**: `teachnova-bot` ищет лид сначала в `custom_records`, потом в архиве — итог звонка уходит руководителю и по лиду, ушедшему в архив (строка «📦 Arxivga o‘tkazildi»). Недозвон и неверный номер ИИ не разбирает: итог прошлого разговора на карточке остаётся.
- **Очередь звонков** (с 2026-11-23 — по правилам, без ИИ; решение владельца) считается прямо на странице: `leadQueueItem` и `leadQueueOrder` в `app.js`. Группы по порядку: подошло время перезвона (сначала сегодняшние по времени, за ними просроченные — самые недавние первыми) → новая или повторная заявка → консультация сегодня (одно напоминание) → время консультации прошло больше часа назад, а приход не отмечен → был на консультации, но ещё не ученик → разговор был, а следующего шага нет (внутри — по оценке ИИ: горячие, тёплые, холодные). Лид с перезвоном или консультацией на потом в очередь не попадает, пока время не подошло. На экране один лид: записал звонок — открывается следующий; «Пропустить» уводит лида в конец.
- Блок правил между `// <queue-rules>` и `// </queue-rules>` стоит слово в слово в `app.js` и в `supabase/functions/lead-queue/index.ts` (там у параметров дописан тип `any`) — меняй обе стороны вместе. `lead-queue` раз в день (cron `lead-queue-daily`, 12:55 по Ташкенту) собирает по этим правилам первые 20 лидов в одно сообщение операторам (`operator_notifications`, `kind = 'queue'`); проверка без записи — `{"dry":true}`. Таблицы `lead_call_batches` и `lead_call_queue` остались от ИИ-очереди и больше не используются.
- **Подсказка ИИ** после звонка (`teachnova-bot`, поле «ИИ-комментарий») — 3 строки: `Xulosa` (итог звонка), `Ayting` (готовая фраза, с которой оператор начинает следующий разговор с этим родителем; в очереди показана как «Что сказать») и `Holat` (issiq / iliq / sovuq). Подсказки прежнего вида (4 строки с `Keyingi qadam` и `So‘rang`) считаются неполными: `?ai_backfill=1` пишет их заново. Новую формулировку промпта сначала проверяй пробой `?ai_lab=1` (`{model, ids, live_ids, samples, system}` с `x-crm-secret`): она ничего не сохраняет и не шлёт в Telegram, в ответе — текст подсказки и расход токенов. Не больше ~13 записей за вызов: 26 одновременных запросов упёрлись в лимит аккаунта Anthropic (429).

## Правила

- `mcp__Supabase__execute_sql` и `mcp__Supabase__apply_migration` разрешены без подтверждения (решение владельца, 2026-11-20): запросы и миграции, которые меняют или удаляют данные, делай только по прямой просьбе и с копией затрагиваемых строк. Разрешения из `.claude/settings.json` действуют только в сессии с одним репозиторием — второй репозиторий подключай, только если без него нельзя.
- **Репозиторий публичный.** Токены ботов, service_role, PIN, хеши токенов, адреса вебхуков Make — только в секретах Supabase (Edge Functions → Secrets) или в таблице `crm_maxfiy`; в коде — `Deno.env.get("ИМЯ")`. Перед каждым коммитом ищи в изменениях токены (`123456789:AA…`), JWT (`eyJ…`), `sb_secret_`, пароли и PIN.
- **Персональные данные не коммитить**: реквизиты, ПИНФЛ, паспортные данные, телефоны клиентов, выгрузки лидов. Для скриншотов и проверок — выдуманные данные.
- Вкладку «Загрузка лидов через Excel» в базе **не переименовывать**: по этому имени её находят `meta-yba-webhook` и `app.js`. В интерфейсе она показывается как «Лиды» (`tabDisplayName` в `app.js`).
- Вкладку «Blogerlik leadlari bolalar» не удалять и не переименовывать. Удаление вкладки CRM каскадно удаляет все её записи.
- Вкладку «Вакансии Facebook» (`5631f830-18bd-41dd-9fac-dc7c21baff7b`) не удалять: в неё пишет `meta-yba-webhook`. В меню её нет — кандидатов показывает раздел «Вакансии» (бывшие «HR-лиды»): папка на каждую вакансию по названию формы, внутри полки по этапам. Подробно — `docs/lead-routes.md`.
- Лиды из CRM не удаляются, а уходят в архив (см. «Запись звонка и архив»): любую удалённую запись `custom_records` триггер сначала копирует в `deleted_custom_records`. Удалить из архива через CRM нельзя. Записи в базе не удаляй и не меняй массово без прямой просьбы; перед такой правкой сохрани копию затрагиваемых строк.
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
