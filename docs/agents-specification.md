# 🤖 Спецификация AI-Агентов (Agents Specification)

> **Назначение:** Полный технический справочник по всем 7 специализированным AI-агентам пайплайна: контракты Zod, входы/выходы, промпты, поведение и правила строгой изоляции.

---

## 1. `agent-trend-intelligence` (Поиск и парсинг трендов)

* **Порт:** `4001` | **Очередь:** `queue-agent-trend`
* **Назначение:** Автоматический сбор и ранжирование актуальных тем и инфоповодов.
* **Источники данных:**
  * *Tech:* Hacker News (Firebase API), GitHub Trending, Dev.to RSS, Reddit (`r/node`, `r/typescript`, `r/webdev`).
  * *Cinema:* Reddit (`r/marvelstudios`, `r/movies`, `r/boxoffice`), RSS (Variety, Deadline, The Hollywood Reporter).
  * *B2B / Промышленность:* Фиксированные сценарии и база отраслевых фактов `fact_chunks`.
* **Выходной контракт (Zod):**
  ```typescript
  {
    items: Array<{
      title: string;
      summary: string;
      source: string;
      url?: string;
      score: number;
      tags: string[];
    }>;
  }
  ```

---

## 2. `agent-positioning` (Фильтрация и соответствие бренду)

* **Порт:** `4002` | **Очередь:** `queue-agent-positioning`
* **Назначение:** Оценка соответствия найденного инфоповода профилю автора/бренда (`industryProfile`), исключение оффтопа и кликбейта.
* **Выходной контракт (Zod):**
  ```typescript
  {
    accepted: boolean;
    relevance_score: number; // 0..100
    reason: string;
    target_audience: string;
  }
  ```

---

## 3. `agent-content-strategy` (Формат и угол подачи)

* **Порт:** `4003` | **Очередь:** `queue-agent-strategy`
* **Назначение:** Выбор формата публикации, определение целевой аудитории, формулирование ключевой идеи и логической структуры.
* **Выходной контракт (Zod):**
  ```typescript
  {
    format: "carousel" | "single_post" | "case_study" | "breakdown" | "story";
    core_idea: string;
    target_audience: string;
    content_pillar_id: string;
    structure_outline: string[];
  }
  ```

---

## 4. `agent-writing` (Генерация текста и копирайтинг)

* **Порт:** `4004` | **Очередь:** `queue-agent-writing`
* **Назначение:** Создание текста публикации, завлекающего хука (первые 2 строки до кнопки «еще»), структурированного тела поста и эффективного Call to Action (CTA).
* **Ключевые правила:**
  * **Strict Few-Shot Isolation:** Примеры выбираются строго по совпадению `{ tenantId, pillarId, platform }`.
  * **RAG Grounding:** Проверка всех характеристик, названий и цифр по базе `fact_chunks`.
  * **Self-Correction Loop:** При оценке `alignmentScore < 85%` от `agent-evaluator` агент выполняет 1 корректирующий проход.
* **Выходной контракт (Zod):**
  ```typescript
  {
    hook: string;
    text: string;
    cta: string;
    hashtags: string[];
  }
  ```

---

## 5. `agent-design` (Рендеринг каруселей и карточек)

* **Порт:** `4005` | **Очередь:** `queue-agent-design`
* **Назначение:** Генерация визуального оформления (каруселей слайдов 1080x1350) через Puppeteer. Генерация нейросетевых картинок не используется — только строгий, выверенный CSS/HTML дизайн.
* **Ключевые особенности:**
  * **Browser Pool:** Единый инстанс Chromium (`getSharedBrowser()`).
  * **Поддержка переносов `<br>`:** Специальный парсер сохраняет теги `<br>` для аккуратных отступов.
  * **Хранилище GridFS:** Готовые PNG и ZIP-архивы сохраняются в MongoDB GridFS.
  * **Inline Edit Mode:** При правках текста перезапускается рендеринг без вызова LLM за ~6-10 секунд.
* **Выходной контракт (Zod):**
  ```typescript
  {
    template_name: string;
    template_type: "html";
    card_count: number;
    accent_color: string;
    imageId: string; // GridFS ZIP ID
    rendered_styles: Record<string, { previewId: string; zipId: string }>;
    render_data: Record<string, {
      key: string;
      badge: string;
      title: string;
      bullets: string[];
      footer: string;
      illustration?: string;
    }>;
  }
  ```

---

## 6. `agent-seo` (Аудит качества и вовлеченности)

* **Порт:** `4006` | **Очередь:** `queue-agent-seo`
* **Назначение:** Проверка читаемости, виральности, структуры, плотности ключевых слов и кликабельности хука.
* **Выходной контракт (Zod):**
  ```typescript
  {
    score: number; // 0..100
    recommendations: string[];
    readability_score: number;
    hook_strength: number;
  }
  ```

---

## 7. `agent-evaluator` (Оценка дрифта и Golden Datasets)

* **Порт:** `4008` | **API:** `POST /evaluate`
* **Назначение:** Сравнение сгенерированного поста с эталонным датасетом `golden_datasets`.
* **Метрики:**
  * `alignmentScore`: Соответствие Tone of Voice и регуляторным/инженерным требованиям (0–100%).
  * `driftReport`: Список пройденных и проваленных правил (длина предложений, отсутствие запрещенных терминов, формат CTA).
  * `isGoldenMatch`: Флаг высокого качества ($\ge 85\%$).
