# Changelog

Все значимые изменения проекта за текущую сессию разработки (переход от монопользовательского
LinkedIn-инструмента к vertical-agnostic B2B SaaS с изолированными порталами для tech-ниши и
Testo SE & Co. KGaA). Записи сгруппированы по тематическим блокам, а не по датам коммитов.

Связанные документы: `docs/architecture.md`, `TZ_vertical_agnostic_b2b_saas.md`,
`TZ_v3_instagram_testo_portal.md`, `SKILL_testo_carousel_design.md`, `context_client_testo.md`.

---

## 1. Мультиарендность — фундамент (shared-lib)

### Добавлено
- `shared-lib/src/schemas/organization.ts` — Zod-схемы `Organization` и `IndustryProfile` со всеми
  вложенными сущностями: `TrendSourceConfig`, `GlossaryTerm`, `AudiencePersona`, `ContentStyleRules`,
  `BrandGuidelines`, `ComplianceConfig`, `PlatformAdaptation`, `ContentPillar`.
- `DEFAULT_SOFTWARE_DEV_INDUSTRY_PROFILE` — дефолтный профиль tech-портала для обратной совместимости
  (Coexistence Policy).
- `AuthorProfileSchema` дополнена `tenantId` (дефолт `"software-development-default"`) и
  `connectedPlatforms` (LinkedIn/Instagram per-tenant).
- `PipelineRunDoc` дополнен `tenantId`, `targetPlatform`, `contentFormat`, `contentPillarId`,
  `needsComplianceReview`.
- Новые Mongo-коллекции: `organizations`, `industry_profiles`, `users`, `fact_chunks`, `png_illustrations`.
- `services/openclaw/src/scripts/seed-organizations.ts` — заводит `Organization`/`IndustryProfile`
  для tech-портала (из дефолта) и черновой профиль для Testo (плейсхолдер-данные, требуют
  подтверждения заказчиком).

---

## 2. `agent-trend-intelligence` — динамические источники трендов

### Добавлено
- `src/adapters/sourceAdapter.ts` — интерфейс `SourceAdapter` + реализации `RssAdapter`, `ApiAdapter`,
  `ScrapeAdapter`, `YoutubeAdapter` (заглушка), `CustomAdapter` (заглушка).
- Инъекция `IndustryProfile.glossary` в промпт агрегации трендов.
- Фильтрация шума: тренды без совпадений с глоссарием отсеиваются для нишевых вертикалей.

### Изменено
- `aggregator.ts`: `aggregateRawTrends()` принимает опциональный `IndustryProfile`. Для
  `verticalName === "software-development"` (или без профиля) — поведение не изменилось
  (Hacker News/GitHub/Dev.to/Reddit/LinkedIn как раньше). Для любой другой вертикали — источники
  берутся из `IndustryProfile.trendSources` через `SourceAdapter`.
- `index.ts`: загрузка `IndustryProfile` по `tenantId`, динамическая формулировка системного промпта
  вместо жёсткого "IT/programming trends".

### Защита от галлюцинаций
- Понижена `temperature` до `0.3` для этой (фактологической) стадии.
- `filterHallucinatedSources()` — после генерации каждый заявленный источник сверяется с реальными
  URL из сырых данных; несуществующие URL отбрасываются.

---

## 3. `agent-publishing` — мультиплатформенная публикация

### Добавлено
- `src/publishers/types.ts` — контракт `PlatformPublisher`.
- `src/publishers/linkedin.ts` — вынесенная существующая LinkedIn-логика (поведение не изменено).
- `src/publishers/instagram.ts` — публикация carousel через Instagram Graph API (media container per
  slide → carousel container → poll status → `media_publish` → permalink).

### Изменено
- `index.ts`: диспетчеризация платформы по `PipelineRun.tenantId` → `Organization.publishingTargets`
  → креды из `AuthorProfile.connectedPlatforms`. Fallback на старое поведение через
  `LINKEDIN_ACCESS_TOKEN`/`LINKEDIN_OWNER_URN`, если у tenant нет данных.

### Важное техническое ограничение
- Instagram Graph API принимает только `image_url`, не бинарные данные. Добавлена загрузка PNG в
  GridFS с раздачей через `GET /images/:id` (openclaw). Требует новую переменную окружения
  `OPENCLAW_PUBLIC_BASE_URL` (реальный публичный домен, не localhost).

---

## 4. `agent-design` — template-set под Instagram/Testo

### Добавлено
- `template/industrial-measurement-equipment/cover.html` + `card.html` — брендированный шаблон
  (нейтральный фон, точечный акцент, `Inter` + `IBM Plex Mono`) по гайду
  `SKILL_testo_carousel_design.md`.
- `template/png-illustrations/industrial-measurement-equipment/*.png` — 5 оригинальных
  плейсхолдер-иконок (thermometer, gauge, certificate, alert-triangle, calendar), сгенерированных
  программно (`pngjs`), **не заимствованных** с сайта Testo.

### Изменено
- Хардкод `"cover-1"/"cover-2"` вынесен в `StyleConfig` + `resolveStyleConfigs(industryProfile)`.
  Для `software-development` — поведение не изменилось (рендерятся оба IT-стиля). Для нишевых
  вертикалей — один брендированный стиль с цветами из `IndustryProfile.brandGuidelines.colorPalette`.
- **Библиотеки иллюстраций строго разделены**: SVG (`svg_illustrations`, IT) и PNG
  (`png_illustrations`, нишевые вертикали, отфильтровано по `templateSetId`) — не пересекаются.
  Подбор PNG-иконки — по отраслевым ключевым словам (температура/точность/сертификат/риск/сезон).
- `seedPngIllustrations()` — сидинг PNG-библиотек из `template/png-illustrations/<templateSetId>/`.

---

## 5. `agent-positioning` / `agent-content-strategy` / `agent-writing`

### `agent-positioning`
- Динамическая формулировка домена вместо жёсткого "software engineer's professional blog".

### `agent-content-strategy`
- `pickContentPillar()` — взвешенный выбор рубрики из `IndustryProfile.contentPillars` (сезонные
  рубрики получают ×2 к весу).
- Промпт получает блок доступных `audiencePersonas` и обязательную рубрику.
- Результат пишет `targetPlatform`/`contentFormat`/`contentPillarId` обратно в `PipelineRun`.
- `StrategyOutputSchema` дополнена опциональным `content_pillar_id`.

### `agent-writing`
- `contentStyleRules.maxEmojis`, `requiredDisclaimers`, `platformAdaptation` (лимит текста,
  `ctaStyle`, `hashtagCount`) — всё читается из `IndustryProfile` и применяется к промпту.
- Инъекция `glossary`.
- **RAG-слой (см. раздел 7)**: подтягивает верифицированные факты перед генерацией.
- Понижена `temperature` до `0.3` для регулируемых ниш.
- `checkNumericGrounding()` после генерации — числа в тексте сверяются с темой/стратегией/фактами;
  при несовпадении `PipelineRun.needsComplianceReview = true`.

---

## 6. `web-dashboard` — изолированные tenant-порталы

### Добавлено
- `src/lib/tenant.ts` — резолвинг `Organization` + `IndustryProfile` по `tenantId` из URL.
- Роутинг переведён с общего `/dashboard` на `/[tenantId]/dashboard/...` — tech-портал и
  Testo-портал физически не пересекаются по URL и данным.
- `[tenantId]/layout.tsx` — 404 для несуществующей `Organization`, динамическое брендирование
  (CSS-переменная `--primary` из `brandGuidelines.colorPalette`).
- `/portal` — страница-пикер со списком всех порталов.
- `/api/tenant-info` — вертикаль/`templateSetId` портала (для ветвления UI).

### Изоляция данных
- `/api/profiles`, `/api/runs/list` (через `openclaw` `/approval/runs`) фильтруют по `tenantId` —
  без него отдают пустой список, а не всё подряд.
- `openclaw`: `assertTenantOwnership()` — единая проверка, что запрошенный `run` принадлежит
  tenant, от имени которого пришёл запрос (404, а не 403 — не подтверждаем даже факт существования
  чужого прогона). Применена к `GET /runs/:runId`, `approve`, `reject`, `edit`, `reprocess`.
- **Исправлен баг**: `reject/route.ts` делал `redirect` на устаревший путь `/dashboard/runs/:runId`,
  переставший существовать после перехода на tenant-scoped роутинг.

### Базовая авторизация
- `shared-lib`: `UserDoc` (tenantId + email + passwordHash + role), коллекция `users`.
- `src/lib/auth.ts` — сессии на JWT (`jose`, HS256, 7 дней).
- `/api/auth/login` — bcrypt-сверка пароля строго в рамках `tenantId`.
- `src/middleware.ts` — сессия валидна только для того `tenantId`, для которого выдана; редирект на
  `/${tenantId}/login` при отсутствии/несовпадении. Также прикрывает `/api/runs/*`, `/api/profiles/*`,
  `/api/fact-chunks/*`.
- Страница логина `/[tenantId]/login`, компонент `LogoutButton`.
- `services/openclaw/src/scripts/seed-users.ts` — по одному admin на портал.

### PNG-библиотека для Testo (UI)
- `/[tenantId]/dashboard/illustrations` — ветвление: SVG-редактор (tech, без изменений) или
  PNG-галерея с загрузкой файлов (нишевые порталы), определяется через `/api/tenant-info`.
- `/api/illustrations/png` — CRUD PNG-иконок, изолированный по `templateSetId`.

### RAG / база фактов (UI)
- `/[tenantId]/dashboard/facts` — управление `FactChunkDoc` (добавление/удаление фактов с
  атрибуцией источника).
- `/api/fact-chunks`, `/api/fact-chunks/[id]` — CRUD, строго по `tenantId`.
- Баннер `needsComplianceReview` на странице деталей прогона — апрувер видит предупреждение о
  непроверенных числовых утверждениях перед публикацией.

---

## 7. RAG-слой для фактологической точности (защита от галлюцинаций)

### Добавлено
- `shared-lib/src/ai/grounding.ts` — детерминированные (не-LLM) проверки:
  `filterHallucinatedSources()`, `checkNumericGrounding()`.
- `shared-lib/src/ai/retrieval.ts` — keyword-based retrieval (без векторной БД):
  `retrieveRelevantChunks()` (Jaccard-подобный скор по токенам), `formatFactsForPrompt()`.
- `FactChunkDoc` + коллекция `fact_chunks` — фрагменты проверенных фактов (спецификации приборов)
  per-tenant.
- `services/openclaw/src/scripts/seed-fact-chunks.ts` — демо-данные с **намеренно вымышленными**
  названиями изделий ("Model X1 Placeholder"), чтобы их нельзя было спутать с реальными
  характеристиками продукции Testo. Требуют замены на реальные datasheet перед продакшеном.

### Как это работает
1. Retrieval — top-3 релевантных факта по запросу (тема + core_idea) из `fact_chunks` для tenant.
2. Grounded prompt — "VERIFIED FACTS" блок в промпте `agent-writing`, `temperature` снижена до `0.3`.
3. Post-check — `checkNumericGrounding()` сверяет числа в готовом тексте с темой + фактами.
4. Human-in-the-loop — при несовпадении `needsComplianceReview = true`, апрувер видит баннер.

---

## 8. Фарма-контент-трек для Testo-портала

### Добавлено
- `docs/content-pharma-testo.md` — исследование реальных предложений Testo в фармацевтике
  (testo Saveris Pharma, 21 CFR Part 11 / GxP-соответствие, testo 190 T3/T4 CFR для лиофилизации,
  услуги валидации/квалификации, кейс с холодовой цепью) + готовые примеры постов (carousel,
  reel-script) с хуками, покадровыми сценариями и подписями под лимиты Instagram.
- `seed-organizations.ts`: в `IndustryProfile` Testo добавлены (не заменяют существующие HVAC-данные,
  а дополняют их):
  - 3 персоны: `qa-pharma-manager`, `validation-specialist`, `cold-chain-logistics`;
  - 5 терминов глоссария: `21 CFR Part 11`, `GxP`, "холодовая цепь", "лиофилизация" и др.;
  - 4 рубрики: `pharma-compliance-explained`, `pharma-cold-chain-story`, `pharma-audit-ready`,
    `pharma-case-story`.
- `seed-fact-chunks.ts`: новый блок `PHARMA_FACT_CHUNKS` — **реальные** факты (не выдуманные, в
  отличие от `DEMO_FACT_CHUNKS`) с настоящей атрибуцией источников (testo.com, qualistery.com,
  testotis.com), собранные через веб-поиск. Логика сидинга переведена на идемпотентную вставку
  по группам (`seedGroup()`), чтобы повторный запуск добавлял новые факты, не блокируясь на
  проверке "уже что-то есть для этого tenant".

### Важная оговорка
- Факты в `PHARMA_FACT_CHUNKS` взяты с открытых маркетинговых страниц Testo, а не из официального
  пресс-кита — перед публикацией конкретных постов сверить формулировки (особенно про архитектуру
  "трёхуровневой избыточности данных") с контактом в Testo.
- Фарма-рубрики сейчас живут в том же `IndustryProfile`/`tenantId` ("testo"), что и HVAC-контент —
  чередуются по весам через существующий `pickContentPillar()`. Если фарма-направление вырастет в
  самостоятельный продуктовый трек, в документе явно отмечена рекомендация вынести его в отдельный
  `tenantId` (например `testo-pharma`) по той же модели, что и разделение tech/Testo порталов.

---

## Известные ограничения / TODO (честно зафиксировано, не доделано в этой сессии)

- **Роли `admin`/`creator`** заведены в схеме `UserDoc`, но не различаются в UI/API — любой
  залогиненный видит и делает всё в своём портале.
- **Нет смены пароля / приглашения пользователей через UI** — только сид-скрипт с фиксированными
  dev-паролями (`changeme-tech-2026`, `changeme-testo-2026`) — сменить перед продакшеном.
- **`checkNumericGrounding` — эвристика по подстроке**, не семантическая проверка. Может пропустить
  перефразированные факты и ложно сработать на случайных совпадениях коротких чисел.
- **Retrieval — keyword-based, не embeddings.** Рабочее решение для десятков-сотен фактов на
  клиента; при росте корпуса или потребности в семантическом поиске нужно заменить `scoreChunk()`
  в `retrieval.ts` на embeddings-based подход.
- **`getIllustrationName` для IT-вертикали** и **PNG-подбор для нишевых** — оба построены на
  keyword-матчинге, не на семантике.
- **`YoutubeAdapter`/`CustomAdapter`** в `agent-trend-intelligence` — заглушки без реализации.
- **`agent-seo`** не тронут в этой сессии — не адаптирован под мультиязычность/нишевые ключевые
  слова.
- **`runs/[runId]`** — доступ по `runId` (nanoid, непредсказуем), но без строгой проверки владения
  tenant на уровне отображения (только на уровне мутирующих действий через `assertTenantOwnership`).
- **PNG-библиотека Testo** — нет `DELETE`-эндпоинта в API (только просмотр + загрузка).
- **Полноценный `agent-compliance`** как отдельный блокирующий микросервис (из `TZ_v2`) не
  реализован — сейчас его роль частично выполняет связка RAG + post-check + human approval.
- Цветовая палитра Testo (`#EE8432` и т.д.) — из открытых источников (Brandfetch), **не официальный
  брендбук клиента**. Заменить перед продакшеном.
