# Техническое задание: Расширение контентных рубрик (Content Pillars) для Tech-портала

## 1. Общие сведения и цель
Цель: Расширить архитектуру микросервисного пайплайна `linkedin_ai-agent_tool` поддержкой 5 новых специализированных контентных рубрик (Pillars) для LinkedIn и соцсетей.

Каждая рубрика имеет свои источники трендов, спецификацию генерации текста в `agent-writing` и уникальный визуальный шаблон карусели/карточек в `agent-design`.

---

## 2. Перечень новых рубрик и их спецификация

| ID Рубрики (`targetPillarId`) | Название | Источники данных (`agent-trend-intelligence`) | Визуальные шаблоны (`agent-design`) |
| :--- | :--- | :--- | :--- |
| `tech-battle-vs` | **Сравнение технологий (Vs)** | HackerNews, Dev.to, GitHub Search | `cover-10.html`, `card-10.html` (Две колонки / Сравнительная таблица) |
| `system-design-breakdown` | **Разбор архитектуры сервисов** | ByteByteGo, High Scalability, Dev.to | `cover-11.html`, `card-11.html` (Схема архитектуры + Bottleneck) |
| `clean-code-cheatsheets` | **Шпаргалки и Бест-практики** | GitHub Repos, Dev.to, Hashnode | `cover-12.html`, `card-12.html` (Карточки с кодом ❌ Bad vs ✅ Good) |
| `ai-tooling-agents` | **AI Инструменты и Агенты** | Telegram @github, ProductHunt, GitHub Topic (`mcp-server`, `agent`) | `cover-8.html` / `cover-9.html` (Браузерные карточки) |
| `weekly-tech-digest` | **Еженедельный дайджест** | TechCrunch RSS, HackerNews Top, Telegram @github | `cover-13.html`, `card-13.html` (Дайджест с карточками-новостями) |

---

## 3. Детализация по сервисам пайплайна

### 3.1. `agent-trend-intelligence` (Сбор и агрегация трендов)
- **Задача**: Добавить поддержку специализированных источников данных в зависимости от `targetPillarId`.
- **Новые фетчеры**:
  1. `fetchHackerNews.ts`: Сбор топовых обсуждений с HackerNews API (`https://hacker-news.firebaseio.com/v0/topstories.json`).
  2. `fetchDevTo.ts`: Сбор популярных статей по тегам (`#architecture`, `#systemdesign`, `#ai`, `#devops`).
  3. `fetchProductHunt.ts` / RSS: Трендовые AI-инструменты.
- **Логика агрегации**: В `aggregator.ts` включать соответствующие фетчеры при выборе конкретного `targetPillarId`.

### 3.2. `agent-writing` (Генерация текста поста и каруселей)
- **Задача**: Создать специализированные промпты под каждую рубрику.
- **Требования по рубрикам**:
  - `tech-battle-vs`: Формировать четкие критерии сравнения (Performance, Developer Experience, Scalability, Ecosystem) + итоговый вердикт.
  - `system-design-breakdown`: Формировать общую схему системы, проблему высокого масштаба (Bottleneck) и принятое архитектурное решение.
  - `clean-code-cheatsheets`: Наглядное сравнение антипаттерна и бест-практики с конкретными примерами кода.
  - `ai-tooling-agents`: Описание инструмента, проблема, которую решает, и способы интеграции.

### 3.3. `agent-design` (Визуальные шаблоны каруселей)
- **Задача**: Верстка HTML/CSS шаблонов и адаптация логики рендеринга Puppeteer.
- **Новые шаблоны**:
  - `cover-10.html` / `card-10.html`: Двухколоночный макет для сравнений (Сплит-дизайн: Синий vs Пурпурный акценты).
  - `cover-11.html` / `card-11.html`: Темный макет с выделенным блоком под диаграммы/схемы архитектуры.
  - `cover-12.html` / `card-12.html`: Макет с двумя блоками кода (Красный фон для Bad Practice ❌, Зеленый фон для Good Practice ✅).
- **Стилизация**: Использование единой дизайн-системы (темный режим `#0d1117`, шрифты `Inter` / `JetBrains Mono`, аккуратные градиенты и стеклянный эффект).

### 3.4. `services/openclaw` и `web-dashboard`
- **OpenClaw Orchestrator**: Проброс `targetPillarId` через все этапы пайплайна без потери контекста.
- **Web Dashboard**: Добавление выпадающего списка выбора рубрики при ручном запуске пайплайна из UI.

---

## 4. Декомпозиция задач для распределения

### 📌 Модуль A: Агрегация трендов (`agent-trend-intelligence`)
- [ ] **A1**: Создать фетчер HackerNews API (`services/agent-trend-intelligence/src/fetchers/hackerNews.ts`).
- [ ] **A2**: Создать фетчер Dev.to API по тегам (`services/agent-trend-intelligence/src/fetchers/devTo.ts`).
- [ ] **A3**: Настроить фильтрацию и сопоставление источников в `aggregator.ts` по `targetPillarId`.

### 📌 Модуль B: Копирайтинг и промпты (`agent-writing`)
- [ ] **B1**: Написать системный промпт для рубрики `tech-battle-vs` с жесткой структурой двух колонок.
- [ ] **B2**: Написать системный промпт для `system-design-breakdown` (Контекст $\rightarrow$ Проблема $\rightarrow$ Архитектура).
- [ ] **B3**: Написать системный промпт для `clean-code-cheatsheets` (Правило $\rightarrow$ ❌ Антипаттерн $\rightarrow$ ✅ Бест-практика).

### 📌 Модуль C: HTML/CSS Шаблоны & Дизайн (`agent-design`)
- [ ] **C1**: Сверстать `cover-10.html` и `card-10.html` (Сравнение Vs).
- [ ] **C2**: Сверстать `cover-11.html` и `card-11.html` (System Design).
- [ ] **C3**: Сверстать `cover-12.html` и `card-12.html` (Clean Code ❌/✅).
- [ ] **C4**: Интегрировать выбор новых шаблонов в `services/agent-design/src/index.ts`.

---

## 5. Критерии приемки (Definition of Done)
1. Каждая рубрика запускается через POST `/runs` с указанием соответствующего `targetPillarId`.
2. Генератор текста выдает строго валидированный JSON под выбранный формат.
3. Puppeteer корректно рендерит PNG карточки 1080x1350px без наслоения текста и обрезки графики.
4. Все тесты и сборка Docker-контейнеров проходят успешно (`docker compose build`).
