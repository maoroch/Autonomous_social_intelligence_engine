# Инструкции по передаче контекста для ИИ (Handover & Architecture Rules)

> [!IMPORTANT]
> Привет! Проект **LinkedIn & Multi-Platform AI Content Pipeline** реализован на базе микросервисной мультиарендной архитектуры (Node.js, TypeScript, BullMQ/Redis, MongoDB, Puppeteer, Next.js 15).

---

## 🎯 Ключевой контекст для работы ИИ-агента

### 1. Архитектура порталов и Мультиарендность (`tenantId`)
- **Tech Portal (`software-development-default`):** Контент для программистов и архитекторов (LinkedIn / Telegram / Threads). Специализированные контентные рубрики описаны в [docs/tech-pillars-spec.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/tech-pillars-spec.md).
- **Testo Portal (`testo`):** Контент для фарм-производств и логистики (Instagram / Telegram / Threads). Полная стратегия и 3 фармацевтические рубрики (`pharma-compliance-explained`, `pharma-cold-chain-story`, `pharma-audit-ready`) описаны в [docs/testo-pharma-strategy.md](file:///Applications/projects/linkedin_ai-agent_tool/docs/testo-pharma-strategy.md).

### 2. Ключевые паттерны и правила
- **Изоляция промптов (Strict Prompt Isolation):** При генерации контента для конкретной рубрики в промпт попадают **ТОЛЬКО** инструкции выбранной рубрики. Примерная Few-Shot выборка в `agent-writing` выполняется исключительно по совпадению `{ pillarId, platform }` без cross-rubric подмешивания.
- **Puppeteer Browser Pool (`agent-design`):** Для рендеринга каруселей используется единый переиспользуемый инстанс браузера `getSharedBrowser()`.
- **Дрифт и Валидация (`agent-evaluator`):** Оценка `alignmentScore` по Golden Datasets. При `score < 85%` автоматически срабатывает Self-Correction loop.
- **RAG Grounding (`FactChunkDoc`):** Для регулируемых ниш (Testo Pharma) числа и характеристики проверяются по базе фактов `fact_chunks`.

---

## 🚀 Команды для быстрой проверки и сидинга

```bash
# Сидинг организаций, фактов и эталонных датасетов
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-organizations.ts
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-fact-chunks.ts
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-golden.ts
```
