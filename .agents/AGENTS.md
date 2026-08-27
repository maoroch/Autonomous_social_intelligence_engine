# Инструкции по передаче контекста для ИИ (Handover & Architecture Rules)

> [!IMPORTANT]
> Проект **LinkedIn & Multi-Platform AI Content Pipeline** реализован на базе микросервисной мультиарендной архитектуры (Node.js, TypeScript, BullMQ/Redis, MongoDB/GridFS, Puppeteer, Next.js 15, Telegram Bot).
> Полная документация доступна в [docs/README.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/README.md).

---

## 🎯 Ключевой контекст для работы ИИ-агентов

### 1. Архитектура порталов и Мультиарендность (`tenantId`)
- **Tech Portal (`software-development-default`):** Контент для программистов и архитекторов (LinkedIn / Telegram / Threads). Специализированные контентные рубрики описаны в [docs/tech-pillars-spec.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/tech-pillars-spec.md).
- **Testo Portal (`testo`):** Контент для фарм-производств (GxP/21 CFR Part 11) и промышленности (газоанализаторы). Полная стратегия описана в [docs/testo-pharma-strategy.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/testo-pharma-strategy.md) и [docs/testo-gas-strategy.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/testo-gas-strategy.md).
- **Cinema Media Portal (`cinema-media`):** Поп-культурное медиа (Marvel/MCU lore, история кино, бокс-офис). Спецификация описана в [docs/cinema-media-strategy.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/cinema-media-strategy.md) и [task.md](file:///Applications/projects/linkedin_ai-agent_tool/task.md).

### 2. Ключевые паттерны и правила
- **Изоляция промптов (Strict Prompt Isolation):** При генерации контента для конкретной рубрики в промпт попадают **ТОЛЬКО** инструкции выбранной рубрики. Few-Shot примеры в `agent-writing` фильтруются строго по `{ tenantId, pillarId, platform }`.
- **Puppeteer Browser Pool (`agent-design`):** Для рендеринга каруселей используется переиспользуемый инстанс браузера `getSharedBrowser()`. Поддерживаются `<br>` для отступов и быстрый рендер без LLM.
- **Дрифт и Валидация (`agent-evaluator`):** Оценка `alignmentScore` по Golden Datasets. При `score < 85%` автоматически срабатывает Self-Correction loop.
- **RAG Grounding (`FactChunkDoc`):** Для регулируемых ниш (Testo Pharma/Gas) числа и характеристики проверяются по базе фактов `fact_chunks`.
- **Telegram Bot Workflow:** Мобильный интерфейс Human-in-the-Loop для модерации и публикации (см. [docs/telegram-bot-guide.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/telegram-bot-guide.md)).
- **Политика LLM Моделей (DEV vs PROD):**
  - **PROD (`NODE_ENV === "production"`):** Используется **`llama-3.3-70b-versatile`** (Groq) или **`openai/gpt-oss-120b`** для наивысшего качества копирайтинга.
  - **DEV (`NODE_ENV !== "production"`):** Допускаются легковесные/альтернативные модели.

---

## 🚀 Команды для быстрой проверки и сидинга

```bash
# Сидинг организаций, фактов, эталонных датасетов и пользователей
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-organizations.ts
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-fact-chunks.ts
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-golden.ts
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-users.ts
```
