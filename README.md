# Умный график работ

Самодостаточный сайт для регистрации сотрудников и ведения графиков работ по торговым точкам:

- `МОСКВА_6231`
- `КРАСНОГОРСК_466`

## Запуск

```powershell
.\start.ps1
```

Откройте сайт: http://localhost:8080

## GitHub и онлайн-размещение

Проект готов для размещения как Node.js web service. В репозиторий нужно отправлять код, но не рабочие данные:

- `data/` не отправляется в GitHub;
- `.env` не отправляется в GitHub;
- для онлайн-хранилища используйте переменную `DATA_DIR`;
- для Render добавлен `render.yaml`, который использует постоянный диск `/var/data`.

После установки Git:

```powershell
cd "C:\Users\Аман\Documents\Умный график работ"
git init
git branch -M main
git remote add origin https://github.com/97c92cc6nk-maker/raschetsam.git
git add .
git commit -m "Deploy smart work schedule"
git push -u origin main
```

Если репозиторий уже содержит файлы, сначала выполните:

```powershell
git pull origin main --allow-unrelated-histories
```

### Vercel + Supabase

Для публичного онлайн-доступа используйте Vercel как хостинг и Supabase как постоянную базу данных.

1. Создайте проект в Supabase.
2. Откройте SQL Editor и выполните скрипт `supabase/schema.sql`.
3. В Vercel создайте проект из GitHub-репозитория.
4. В Vercel Project Settings -> Environment Variables добавьте:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mailbox@example.com
SMTP_PASS=mail-password
SMTP_FROM=mailbox@example.com
```

`SUPABASE_SERVICE_ROLE_KEY` должен быть только на сервере Vercel. Не добавляйте его в `public/` и не коммитьте в GitHub.

Vercel использует `vercel.json`: статические файлы берутся из `public/`, а `/api/*` и `/health` обрабатываются serverless-функцией `api/index.js`.

Если нужно перенести локальные данные из `data/` в Supabase, после настройки `.env` выполните:

```powershell
npm run migrate:supabase
```

Для размещения на Render также оставлен `render.yaml`. Команда запуска: `npm start`. Health check: `/health`.

Проект не требует npm-зависимостей. Скрипт запуска использует обычный `node`, а если он недоступен, пробует bundled Node из Codex Runtime.

Если сайт запущен из in-app browser/Codex-сессии и Windows запрещает процессу запись в папку проекта, приложение переключится на резервное дисковое хранилище `%TEMP%\smart-schedule-data`, а письма попадут в `%TEMP%\smart-schedule-data\outbox`. Для хранения строго в папке проекта запускайте `.\start.ps1` в обычном PowerShell-окне.

## Первый вход

1. Зарегистрируйте первого пользователя через форму регистрации.
2. Первый пользователь автоматически получает тип доступа `Владелец`.
3. Пароль генерируется сервером и отправляется на email.
4. Если SMTP не настроен или почтовый источник недоступен, письмо явно сохраняется в `data/outbox/*.eml`, а сайт сообщает путь к файлу.

Все следующие публичные регистрации получают тип доступа `Сотрудники`. Владелец может менять роли в личном кабинете.

## Настройка почты

Скопируйте `.env.example` в `.env` или задайте переменные окружения перед запуском:

```powershell
$env:SMTP_HOST="smtp.example.com"
$env:SMTP_PORT="465"
$env:SMTP_SECURE="true"
$env:SMTP_USER="mailbox@example.com"
$env:SMTP_PASS="пароль"
$env:SMTP_FROM="mailbox@example.com"
.\start.ps1
```

Рекомендуется SMTP over SSL на порту `465`. Если `SMTP_HOST`/`SMTP_PORT` отсутствуют или SMTP возвращает ошибку, письмо с паролем сохраняется в локальный outbox.

## Данные и логи

- Пользователи: `data/users.json`
- Сессии: `data/sessions.json`
- Графики: `data/schedules.json`
- Audit-log важных действий: `data/audit.log`
- Локальная очередь писем: `data/outbox/`

Пароли не хранятся в открытом виде. В файле пользователей хранится PBKDF2-хеш с солью.

## Проверка

```powershell
& "C:\Users\Аман\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests\run-tests.js
& "C:\Users\Аман\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" tests\smoke.js
```

Проверки покрывают валидацию регистрации, роли первого и следующих пользователей, хеширование паролей, outbox при недоступной почте, валидацию графика и полный HTTP-сценарий регистрации, входа и сохранения графика.
