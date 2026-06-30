# LinkedIn AI Content Pipeline

Модульная система генерации контента для LinkedIn на базе специализированных AI-агентов
под управлением оркестратора Open Claw. См. полное ТЗ в `docs/` (добавим на следующих шагах).

## Структура

```
shared-lib/                     общие типы, Zod-схемы, AI provider switcher, Mongo/Redis клиенты, логгер
services/openclaw/              оркестратор: пайплайн, retries, QA, Human Approval API
services/agent-trend-intelligence/
services/agent-positioning/
services/agent-content-strategy/
services/agent-writing/
services/agent-design/
services/agent-seo/
web-dashboard/                  Next.js: Human Approval UI + API routes-прокси к Open Claw
```

Каждый агент — независимый Express + BullMQ Worker процесс со своей очередью.
Open Claw кладёт задачи в очередь нужного агента и слушает общую очередь
`queue:pipeline:events`, в которую агенты публикуют результат (успех/ошибка).
На основе этого Open Claw продвигает прогон по стадиям, ретраит при ошибках
(до `MAX_RETRIES_PER_STAGE` раз) и переводит прогон в `awaiting_approval`
после прохождения всех агентов.

## Локальный запуск (без Docker)

```bash
npm install
npm run build -w shared-lib

# в отдельных терминалах:
npm run dev:openclaw
npm run dev:trend
npm run dev:positioning
npm run dev:strategy
npm run dev:writing
npm run dev:design
npm run dev:seo
npm run dev:dashboard
```

Перед запуском поднимите Redis и MongoDB локально (или см. Docker ниже),
и скопируйте `.env.example` → `.env` в каждом сервисе.

## Запуск через Docker Compose

```bash
cp .env.example .env   # заполните OPENROUTER_API_KEY / GROQ_API_KEY
docker compose up --build
```

Поднимутся: Redis, MongoDB, Open Claw (:4000), все 6 агентов (:4001–:4006),
web-dashboard (:3000).

## Проверка пайплайна end-to-end (с заглушками агентов)

```bash
curl -X POST http://localhost:4000/runs \
  -H "Content-Type: application/json" \
  -d '{"topic": {"title": "Test topic", "summary": "Test summary"}}'
```

Прогон пройдёт через все агенты (сейчас — заглушки с фиктивными данными)
и появится на http://localhost:3000 в списке ожидающих подтверждения.

## Статус MVP

Реализован каркас: структура проекта, контракты данных (Zod), очереди,
оркестрация, Human Approval UI. Бизнес-логика агентов (реальные запросы
к LLM и источникам трендов) — заглушки, помечены `TODO` в коде каждого
`services/agent-*/src/index.ts`. Это следующий шаг.
