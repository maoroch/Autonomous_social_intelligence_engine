# LinkedIn & Multi-Platform AI Content Pipeline

Модульная распределенная система генерации контента для **LinkedIn**, **Instagram**, **Telegram** и **Threads** на базе специализированных ИИ-агентов под управлением оркестратора **Open Claw** с поддержкой мультиарендности (Multi-Tenancy) и интерактивным дашбордом для утверждения публикаций (Human-in-the-Loop).

---

## 🏗 Архитектура системы

Система представляет собой монорепозиторий микросервисов, связанных через Redis (BullMQ), MongoDB и единый AI-клиент с автоматическим лимитированием и фолбэком (Gemini $\rightarrow$ OpenRouter $\rightarrow$ Groq):

```
├── shared-lib/                         # Общие типы, Zod-схемы, клиенты БД (MongoDB, Redis), AI-клиент, RAG-слой
├── services/
│   ├── openclaw/                       # Оркестратор: управляет стадиями, QA-петлей качества и Human Approval API
│   ├── agent-trend-intelligence/       # Агент трендов: сбор инфоповодов (HN, GitHub, Dev.to, RSS, Jina Reader)
│   ├── agent-positioning/              # Агент позиционирования: фильтрация трендов по профилю автора и нишевому глоссарию
│   ├── agent-content-strategy/         # Агент контент-стратегии: выбор формата (карусель, reels, story) и рубрики
│   ├── agent-writing/                  # Агент копирайтинга: пишет посты с изоляцией промптов и RAG-валидацией фактов
│   ├── agent-design/                   # Агент визуализации: рендеринг PNG-каруселей через Puppeteer Browser Pool
│   ├── agent-seo/                      # Агент SEO-аудита: проверка читаемости, структурных элементов и лимитов
│   ├── agent-publishing/               # Агент автопубликации: публикация в LinkedIn API и Instagram Graph API
│   └── agent-evaluator/                # Агент оценки качества: валидация дрифта от Golden Datasets и комплаенса
├── web-dashboard/                      # Frontend-дашборд (Next.js 15, Tailwind, Vanilla CSS) для управления прогонами
├── golden_datasets/                    # Эталонные датасеты постов по рубрикам и платформам
└── docs/                               # Спецификации, стратегии (Tech-портал, Testo Pharma) и техническая документация
```

---

## 🏢 Мультиарендность (Multi-Tenancy Portals)

Система поддерживает изоляцию контента и настроек между различными порталами (`tenantId`):

1. **Tech Portal (`software-development-default`):**
   * **Платформа:** LinkedIn / Telegram / Threads.
   * **Рубрики:** Сравнение технологий (Vs), Разбор архитектуры, Clean Code шпаргалки, GitHub Trending репозитории, Pet-проекты, AI инструменты.
2. **Testo Portal (`testo` / `industrial-measurement-equipment`):**
   * **Платформы:** Instagram, Telegram, Threads.
   * **Рубрики (Фармацевтика & GxP):**
     * `pharma-compliance-explained` — GxP & 21 CFR Part 11 Compliance (стандарты FDA/EMA, Audit Trail).
     * `pharma-cold-chain-story` — Cold Chain Integrity & GDP Logistics (контроль температуры при перевозках).
     * `pharma-audit-ready` — Pharma Audit-Ready Checklist & Myths (чек-листы инспекций и мифы).

---

## ⚡ Технические решения и надежность пайплайна

1. **Строгая изоляция промптов по рубрикам (Prompt Isolation):**
   * При генерации контента под конкретную рубрику системный промпт LLM содержит **только** правила выбранной рубрики без смешивания контекста.
   * Выборка Few-Shot примеров из `golden_testo_pharma` делается строго по фильтру `{ pillarId, platform }`.
2. **Puppeteer Browser Pool (`agent-design`):**
   * Единый переиспользуемый инстанс браузера `getSharedBrowser()` предотвращает спайки CPU/RAM при генерации PNG-слайдов.
3. **Защита от Race Condition при Human-in-the-Loop:**
   * При редактировании слайдов в UI status прогона переходит в `RUNNING`, а кнопка `Approve` возвращает `HTTP 409` до окончания рендринга.
4. **Exponential Backoff с Jitter:**
   * Автоматический ретрай упавших задач с задержкой $2^n \times 2000\text{ms} + \text{jitter}$ в BullMQ.
5. **Валидация дрифта (`agent-evaluator`) & Self-Correction Feedback Loop:**
   * Автоматическая оценка `alignmentScore` по эталонам Golden Datasets. При `score < 85%` запускается 1-pass перегенерация с отчетом об ошибках.
6. **Идемпотентность публикаций (`agent-publishing`):**
   * Защита от дублирования постов при повторах очередей.

---

## 🚀 Быстрый старт через Docker Compose

1. Скопируйте файл переменных окружения:
   ```bash
   cp .env.example .env
   ```
2. Укажите ваши API-ключи (`OPENROUTER_API_KEY`, `GEMINI_API_KEY` и т.д.) в `.env`.
3. Запустите сборку и запуск контейнеров:
   ```bash
   export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
   docker compose down
   docker compose up --build -d
   ```
4. Выполните скрипты сидинга базы данных:
   ```bash
   docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-organizations.ts
   docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-fact-chunks.ts
   docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-golden.ts
   ```
5. Сервисы будут доступны по адресам:
   * **Next.js Web Dashboard:** [http://localhost:3000](http://localhost:3000)
   * **Open Claw Orchestrator API:** [http://localhost:4000](http://localhost:4000)

---

## 🧪 Тестирование прогонов через API

### Запуск Tech-портала (LinkedIn / GitHub Trending):
```bash
curl -X POST http://localhost:4000/runs \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "software-development-default", "targetPillarId": "github-trending-repos", "topic": {"title": "Trending GitHub Repos", "summary": "Top productivity tools"}}'
```

### Запуск Testo Pharma (Instagram / 21 CFR Part 11):
```bash
curl -X POST http://localhost:4000/runs \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "testo", "targetPillarId": "pharma-compliance-explained", "topic": {"title": "21 CFR Part 11 Audit Trail", "summary": "GxP Environmental Monitoring"}}'
```
