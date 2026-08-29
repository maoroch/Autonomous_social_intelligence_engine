# 📚 Документация: LinkedIn & Multi-Platform AI Content Pipeline

> **Единая база знаний архитектуры, микросервисов, AI-агентов и мультиарендных контент-стратегий.**

---

## 🗺 Навигация по документации (Sitemap)

| Раздел | Документ | Описание |
| :--- | :--- | :--- |
| **🏛 Архитектура** | [architecture.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/architecture.md) | Общая архитектура системы: микросервисы, очереди BullMQ/Redis, MongoDB/GridFS, политика LLM-моделей, порты. |
| **⚙️ Оркестратор** | [openclaw-orchestrator.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/openclaw-orchestrator.md) | OpenClaw: машина состояний, жизненный цикл прогона, ручные темы, Quality Loop и Human-in-the-Loop. |
| **🤖 Спецификация Агентов** | [agents-specification.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/agents-specification.md) | Полный справочник по всем 7 AI-агентам: входы/выходы (Zod), промпты, очереди и правила строгой изоляции. |
| **📱 Telegram Bot** | [telegram-bot-guide.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/telegram-bot-guide.md) | Telegram Bot: интерактивное согласование (альбомы слайдов, inline-кнопки), прямое редактирование и публикация. |
| **💻 Tech Portal** | [tech-pillars-spec.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/tech-pillars-spec.md) | Стратегия портала `software-development-default`: 4 IT-рубрики, стили кода, SVG-библиотека. |
| **🧪 Testo Pharma** | [testo-pharma-strategy.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/testo-pharma-strategy.md) | Стратегия `testo` (Фармацевтика): 4 рубрики (GxP, 21 CFR Part 11, GDP, разбор приборов), RAG Grounding. |
| **🏭 Testo Gas** | [testo-gas-strategy.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/testo-gas-strategy.md) | Стратегия `testo` (Газоанализаторы): 3 рубрики (котлы, ТЭЦ, печи), словарь 5 приборов, AZIA-TEST LLP. |
| **🎬 Cinema Media** | [cinema-media-strategy.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/cinema-media-strategy.md) | Стратегия портала `cinema-media`: Marvel/MCU lore, история кино, бокс-офис, ежедневные тренды. |
| **☸️ Облачный деплой** | [azure-k8s-deployment-idea.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/azure-k8s-deployment-idea.md) | Идея деплоя: Azure for Students ($100), K3s (Lightweight K8s), Scale-to-Zero и KEDA Autoscaling. |

---

## 🎯 1. Архитектура Мультиарендности (`tenantId`)

Система спроектирована как мультиарендный SaaS-движок:

```
                          ┌───────────────────────────┐
                          │   OpenClaw Orchestrator   │
                          │        (:4000)            │
                          └─────────────┬─────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│  Tech Portal         │    │  Testo Kazakhstan    │    │  Cinema Media Hub    │
│  `software-dev...`   │    │  `testo`             │    │  `cinema-media`      │
│  - Архитектура ПО    │    │  - Фармацевтика GxP  │    │  - Marvel & MCU Lore │
│  - TypeScript/NodeJS │    │  - Газоанализаторы   │    │  - История кино      │
│  - LinkedIn / Threads│    │  - AZIA-TEST LLP     │    │  - Telegram / Shorts │
└──────────────────────┘    └──────────────────────┘    └──────────────────────┘
```

---

## 🚀 2. Быстрый старт и полезные команды

```bash
# 1. Запуск всей инфраструктуры в Docker
docker compose up -d

# 2. Сидинг организаций, контентных рубрик и пользователей
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-organizations.ts
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-fact-chunks.ts
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-golden.ts
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-users.ts

# 3. Запуск ручного прогона с заданной темой
curl -X POST http://localhost:4000/runs \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "testo",
    "targetPillarId": "gas-industrial-emissions",
    "topic": {
      "title": "Сферы применения газоанализатора Testo 350: от котельных до металлургии",
      "summary": "Обзор применения Testo 350 для РНИ котлов, эко-контроля выбросов ТЭЦ, ГПУ и печей."
    }
  }'
```

---

## 🌐 Сетевые порты сервисов

* **Web Dashboard:** `http://localhost:3005` (Next.js 15 App Router)
* **OpenClaw API:** `http://localhost:4000`
* **Agent Trend Intelligence:** `http://localhost:4001`
* **Agent Positioning:** `http://localhost:4002`
* **Agent Content Strategy:** `http://localhost:4003`
* **Agent Writing:** `http://localhost:4004`
* **Agent Design:** `http://localhost:4005` (Puppeteer Browser Pool)
* **Agent SEO:** `http://localhost:4006`
* **Agent Publishing:** `http://localhost:4007`
* **Agent Evaluator:** `http://localhost:4008` (Golden Dataset Matcher)
* **MongoDB:** `localhost:27018` (внутри контейнера `27017`)
* **Redis:** `localhost:6389` (внутри контейнера `6379`)
