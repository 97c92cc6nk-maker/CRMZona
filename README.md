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

## Supabase

Для постоянного хранения данных на Vercel:

1. В Supabase откройте SQL Editor и выполните `supabase/schema.sql`.
2. В Vercel добавьте Environment Variables:

```text
SUPABASE_URL=https://thsuhgyarzsxehjldrbf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` храните только в Vercel, не добавляйте его в `public/` и не коммитьте в GitHub.

Если нужно перенести текущие локальные данные из `data/` в Supabase, задайте `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` в локальном `.env`, затем выполните:

```powershell
npm run migrate:supabase
```

## Google Drive для чеков

Хозрасходы сохраняют фото чека на сайте. Для дополнительного архива на Google Drive задайте переменные окружения:

```text
GOOGLE_DRIVE_FOLDER_ID=your-google-drive-folder-id
GOOGLE_DRIVE_EXPENSES_FOLDER_NAME=Хозрасходы
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Папку `GOOGLE_DRIVE_FOLDER_ID` нужно расшарить на `client_email` сервисного аккаунта. Для сервисного аккаунта это должна быть папка на Shared Drive: у сервисных аккаунтов нет собственной квоты Google Drive, поэтому обычная папка в My Drive не сможет принимать загрузки. Внутри нее сайт найдет или создаст папку `Хозрасходы`; если уже есть конкретная папка расходов на Shared Drive, можно задать `GOOGLE_DRIVE_EXPENSES_FOLDER_ID`.

Если архив нужен в обычном Google Drive/My Drive, используйте OAuth вместо сервисного аккаунта:

```text
GOOGLE_DRIVE_CLIENT_ID=your-oauth-client-id
GOOGLE_DRIVE_CLIENT_SECRET=your-oauth-client-secret
GOOGLE_DRIVE_REFRESH_TOKEN=your-oauth-refresh-token
GOOGLE_DRIVE_EXPENSES_FOLDER_NAME=Хозрасходы
```

Чеки принимаются в JPG, PNG, WebP и PDF. В Google Drive они называются по схеме `Дата чека-Пользователь-Торговая точка-Уникальный номер`, чтобы сортироваться по дате. Если Google Drive не настроен или недоступен, расход и чек всё равно сохраняются на сайте, а в записи расхода будет явно указана причина.

## Проверка

```powershell
& "C:\Users\Аман\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests\run-tests.js
& "C:\Users\Аман\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" tests\smoke.js
```

Проверки покрывают валидацию регистрации, роли первого и следующих пользователей, хеширование паролей, outbox при недоступной почте, валидацию графика и полный HTTP-сценарий регистрации, входа и сохранения графика.
