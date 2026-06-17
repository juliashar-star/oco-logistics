# OCO Logistics

Веб-кабинет для российских D2C-брендов: сравнение доставки через APIShip, создание отправлений, Carrier Score.

Документация продукта — в папке [`docs/`](./docs/).

## Что уже есть

- Monorepo: `apps/web` (Next.js), `packages/core`, `packages/db`, `packages/shared`, `packages/integrations/apiship`
- PostgreSQL 16 в Docker Compose
- Схема Prisma (см. `packages/db/prisma/schema.prisma`)
- Пустая главная страница и проверка подключения к базе: `GET /api/health`

## Быстрый старт (локально)

### 1. Зависимости

```bash
npm install
```

### 2. Переменные окружения

Скопируйте шаблон и при необходимости поправьте значения:

```bash
# Windows
copy infra\.env.example .env

# Linux / macOS
cp infra/.env.example .env
```

Файл `.env` **не попадает в git** — секреты храните только там.

### 3. База данных

```bash
npm run docker:up
npm run db:generate
npm run db:push
```

### 4. Запуск сайта

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

Проверка базы: [http://localhost:3000/api/health](http://localhost:3000/api/health) — должно быть `{"status":"ok","database":"connected"}`.

### Остановка базы

```bash
npm run docker:down
```

## Структура проекта

См. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Git (контроль версий)

Если git ещё не установлен — установите [Git for Windows](https://git-scm.com/download/win), затем:

```bash
git init
git add .
git commit -m "Initial project skeleton"
```

**Как сохранять версии:** после логически завершённого шага — `git add .` и `git commit -m "краткое описание"`.

**Как откатиться**, если что-то сломалось:

```bash
git log --oneline          # найти нужный коммит
git checkout <hash>        # посмотреть старую версию (отсоединённый режим)
git checkout main          # вернуться к текущей ветке
git restore .              # отменить несохранённые изменения в файлах
```

## Лицензия

Proprietary — OCO Logistics.
