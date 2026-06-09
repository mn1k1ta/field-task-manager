# Field Task Manager

Веб-система управління польовими завданнями: **адміністратор** створює завдання з локацією на мапі та призначає виконавців, а **виконавці** бачать свої завдання, змінюють статус і додають коментарі.

Проєкт побудовано AI-агентами за методологією **BMAD** (Analyst → PM → Architect → UX → Dev → Review). Артефакти планування лежать у [`_bmad-output/planning-artifacts/`](_bmad-output/planning-artifacts/): product brief, PRD, **architecture.md** (повний контракт API), UX-спека, epics & stories.

---

## Можливості

- **Аутентифікація** (реєстрація / логін, JWT). Адмін створюється **автоматично при першому запуску**; усі, хто реєструється самостійно, отримують роль **Worker**.
- **Ролі:**
  - *Admin* — створює/редагує завдання, призначає виконавців, бачить **усі** завдання на мапі, підтверджує закриття (Verify) або повертає в роботу (Reopen).
  - *Worker* — бачить **лише свої** завдання, змінює статус, додає коментарі.
- **Завдання:** назва, опис, локація на мапі, виконавець, дедлайн.
- **Мапа** (Leaflet + OpenStreetMap, без API-ключа): маркери, **колір яких залежить від статусу**; локацію можна задати кліком і **скоригувати перетягуванням маркера**.
- **Робочий процес статусів:** `Created → In Progress → Done → Verified`. Verify/Reopen — лише Admin. Усі переходи **валідуються на сервері** (матриця переходів).
- **Коментарі** з автором і часом, включно з авто-коментарями про зміну статусу (audit trail).
- **Фільтрація** за статусом і **пошук** за назвою/описом.
- **База даних** SQLite (файлова, без окремого сервера). Міграції та сід адміна виконуються **автоматично при старті**.

## Технології

| Шар | Стек |
|---|---|
| Backend | ASP.NET Core (.NET 10) Web API, EF Core + **SQLite**, JWT Bearer, BCrypt |
| Frontend | **Angular 20** (standalone), **Leaflet** + OpenStreetMap |
| Запуск | `dotnet run` — MSBuild-таргет сам збирає Angular у `wwwroot`, бекенд роздає SPA + API **на одному порту** |

> Docker не потрібен: SQLite — файлова БД, зовнішніх сервісів немає, ручних кроків немає.

## Передумови

- **.NET SDK 10** (перевірено на 10.0.300)
- **Node.js 22.12+** та npm (потрібні для збірки Angular під час `dotnet run`)

## Запуск (одна команда)

```bash
git clone <repo-url>
cd field-task-manager/server
dotnet run
```

Перший запуск **автоматично**: встановить npm-залежності (`npm ci`), збере Angular у `server/wwwroot`, створить і змігрує SQLite-БД, засідить адміна.

Потім відкрийте у браузері: **http://localhost:5080**

> Альтернативно з кореня репозиторію: `dotnet run --project server`

## Облікові дані за замовчуванням

- **Admin:** `admin` / `Admin#12345` *(налаштовується в `server/appsettings.json` → секція `SeedAdmin`)*
- Виконавців створюйте через сторінку реєстрації — вони автоматично отримують роль Worker.

## Як користуватися

1. Увійдіть як **Admin** → дашборд із мапою та списком завдань.
2. **New Task** → введіть назву/опис, оберіть виконавця й дедлайн, **клікніть на мапі**, щоб поставити маркер (перетягуванням — скоригувати), збережіть.
3. Клік на завдання → деталі: коментарі (автор + час), дії статусу, **Verify/Reopen** (Admin), **Edit/Delete**.
4. Увійдіть як **Worker** → бачите лише свої завдання; кнопки **Start** / **Mark Done**; коментарі. Адмінських дій немає (і сервер їх відхиляє).
5. На дашборді — **пошук** і **фільтр за статусом**.

### Легенда статусів
| Статус | Колір |
|---|---|
| Created | сірий `#9e9e9e` |
| In Progress | синій `#1e88e5` |
| Done | бурштиновий `#fb8c00` |
| Verified | зелений `#43a047` |

## API (стисло)

```
POST   /api/auth/register      POST /api/auth/login      GET /api/auth/me
GET    /api/tasks              POST /api/tasks
GET    /api/tasks/{id}         PUT  /api/tasks/{id}      DELETE /api/tasks/{id}
PATCH  /api/tasks/{id}/status  PATCH /api/tasks/{id}/location  PATCH /api/tasks/{id}/assignee
GET    /api/tasks/{id}/comments   POST /api/tasks/{id}/comments
GET    /api/users              (Admin)
```

У режимі Development OpenAPI-схема доступна за `/openapi/v1.json`. Повний контракт із кодами відповідей — у [`architecture.md`](_bmad-output/planning-artifacts/architecture.md).

## Структура проєкту

```
field-task-manager/
├── server/                     # ASP.NET Core API (.NET 10); Angular збирається у server/wwwroot
│   ├── Domain/ Data/ Contracts/ Services/ Controllers/ Security/ Common/
│   ├── Migrations/             # EF Core міграції (закомічені)
│   └── FieldTaskManager.Api.csproj   # містить MSBuild-таргет збірки Angular
├── client/                     # Angular 20 SPA (джерело)
│   └── src/app/{core,features,shared}
├── _bmad-output/planning-artifacts/  # BMAD: brief, PRD, architecture, ux-spec, epics
├── FieldTaskManager.slnx
└── README.md
```

## Розробка фронтенду (опційно, з hot-reload)

Запустіть бекенд (`dotnet run`) і окремо в `client/`:

```bash
npm start        # ng serve на http://localhost:4200, проксі /api → :5080
```

## Конфігурація

`server/appsettings.json`: рядок підключення SQLite, налаштування JWT (Issuer/Audience/**SigningKey**/час життя токена 480 хв), `SeedAdmin`, порт `5080`.

> ⚠️ Перед будь-яким реальним розгортанням замініть `Jwt:SigningKey` на власний довгий випадковий секрет.

## Скидання бази даних

Видаліть `server/fieldtasks.db*` і перезапустіть — БД і адмін створяться заново.

## Публікація в GitLab

```bash
git init
git add .
git commit -m "Field Task Manager"
git remote add origin <your-gitlab-repo-url>
git branch -M main
git push -u origin main
```

`.gitignore` уже виключає `bin/`, `obj/`, `node_modules/`, `server/wwwroot/`, `*.db`.
