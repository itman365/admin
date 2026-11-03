# Эдриан — личный Telegram-бот

Бесплатная MVP-версия на Cloudflare Workers. GitHub хранит исходники; Cloudflare запускает код 24/7 без отдельного VPS. Сайт в корне репозитория не затронут.

**Это отдельный ИИ-помощник с ролью Эдриана, а не подключение этого чата GPT-6 и его памяти.** ChatGPT Plus не включает оплату OpenAI API.

## Возможности

- Беседа по-русски через Cloudflare Workers AI / GLM-4.7-Flash.
- Голосовые (Whisper-large-v3-turbo, размер до 4 МБ).
- Задачи в Todoist: команды /task и «Задача: ...».
- Закрытый доступ по Telegram ID и секретному webhook.
- Необязательная короткая память беседы через Cloudflare KV (10 сообщений, 14 дней).

## 1. Создать бота в Telegram

Открой @BotFather в Telegram, отправь /newbot, укажи имя «Эдриан» и свободное имя пользователя, заканчивающееся на bot. BotFather выдаст TELEGRAM_BOT_TOKEN. **Не отправляй токен в чат и не выкладывай в GitHub.**

## 2. Подключить Cloudflare

1. Открой https://dash.cloudflare.com/ и создай бесплатный аккаунт.
2. Workers & Pages → Create application → GitHub (Import a repository).
3. Подключи репозиторий itman365/admin.
4. Укажи **Root directory: adrian-telegram-bot**. Это важно: в корне другого сайта нет конфигурации воркера.
5. Build command оставь пустым; Deploy command: npx wrangler deploy; Worker name: adrian-telegram-bot.
6. Deploy. Получишь адрес вида https://adrian-telegram-bot.<subdomain>.workers.dev
7. Проверь GET https://адрес-воркера/health — ответ должен содержать ok:true.

Альтернатива из локального терминала внутри папки: npm install; npx wrangler login; npm run deploy.

## 3. Задать секреты

В Cloudflare: Worker → Settings → Variables and Secrets (Runtime):

| Имя | Содержимое | Тип |
|---|---|---|
| TELEGRAM_BOT_TOKEN | Токен от @BotFather | Secret |
| TELEGRAM_WEBHOOK_SECRET | Случайная строка 32–64 символа A–Z, a–z, 0–9, _ или - | Secret |
| OWNER_TELEGRAM_ID | Твой цифровой Telegram ID | Secret или Text |
| TODOIST_API_TOKEN | Todoist Settings → Integrations → Developer → API token | Secret |
| TODOIST_PROJECT_ID | ID личного проекта «Эдриан» | Text |

OWNER_TELEGRAM_ID можно установить после /id в пункте 5. Для обычного общения Todoist-переменные не обязательны.

**Никаких токенов и секретов в GitHub. Репозиторий публичный.**

## 4. Зарегистрировать Telegram webhook

После добавления обязательных Telegram-секретов открой PowerShell на своём компьютере и выполни:

~~~powershell
$worker = (Read-Host "Полный URL воркера, без / в конце").TrimEnd('/')
$secret = Read-Host "Значение TELEGRAM_WEBHOOK_SECRET"
Invoke-RestMethod -Method Post -Uri "$worker/setup" -Headers @{ Authorization = "Bearer $secret" }
~~~

Успех: JSON с ok:true и адресом /webhook. Секрет не вводится в браузерную строку и не записывается в исходники. POST /setup принимает только значение секретного Authorization header; обычный GET не выполнит настройку.

## 5. Узнать Telegram ID

Открой нового бота в Telegram и отправь /id. Он ответит числом. Добавь это число в Cloudflare как OWNER_TELEGRAM_ID. Затем напиши /start. Все другие пользователи будут заблокированы.

## 6. Todoist

Укажи TODOIST_API_TOKEN из личного Todoist, а TODOIST_PROJECT_ID — ID существующего проекта «Эдриан». Если ID проекта не задан, задача попадёт во «Входящие».

Примеры:

- /task Проверить рекламные кампании
- /task завтра в 10:00 | Позвонить Андрею
- задача: подготовить смету
- Голосовое «Задача: проверить остатки по складу».

Формат срока: сначала срок, затем символ |, затем название задачи. В голосовых с датами этот разделитель может распознаваться неточно; текст надёжнее.

## 7. Необязательная память

Без KV бот отвечает на каждое сообщение независимо. Чтобы включить память последних сообщений:

1. В Cloudflare Workers KV создай namespace ADRIAN_HISTORY и скопируй его ID.
2. В wrangler.toml сними комментарии с блока kv_namespaces и поставь ID вместо REPLACE_WITH_YOUR_KV_NAMESPACE_ID.
3. Закоммить изменение в GitHub; Worker автоматически обновится.

В этом KV хранится только короткая история из Telegram; к памяти ChatGPT она не подключается. /reset сбрасывает её. KV дополнительно помогает отсекать повторную доставку сообщений Telegram, но не предоставляет строгую транзакционную гарантию.

## Проверка и ограничения

- /health означает, что код развернут, но не подтверждает Telegram, AI или Todoist.
- Бот не отвечает на /id: проверь выполнение /setup, токены и Cloudflare Worker logs.
- 403 на /setup: неправильный секрет webhook.
- Ошибки модели: проверь AI binding, лимит бесплатных Neurons и logs.
- Todoist 401: неверный API токен. Todoist 400: срок или проект.
- Бесплатная квота AI ограничена; 24/7 относится к доступности инфраструктуры, а не гарантии бесперебойности.
- Нет автономных напоминаний, мониторинга и синхронизации с этим чатом.
- Вход в Cloudflare из России может зависеть от сети и региональных правил.

Тесты: npm test. Для локального деплоя: npm run deploy.

Документация:
- https://core.telegram.org/bots/api
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers-ai/
- https://developer.todoist.com/api/v1/


## Если Cloudflare Retry build использует старый KV ID

Retry build может повторно запускать предыдущую версию репозитория. Проверь, что **новая сборка** использует последний коммит GitHub, а в ее логе в разделе Bindings указан существующий KV namespace. Нажимать Retry на старом ошибочном запуске не нужно. Последняя проверенная конфигурация находится в `wrangler.toml`.

