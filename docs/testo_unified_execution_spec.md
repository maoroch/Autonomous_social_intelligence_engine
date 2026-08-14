# 🚀 Единое ТЗ и План Исполнения для ИИ-Агента: Расширение контента Testo, B2B-Фокус и Рубрика `testo-device-breakdown`

Данный документ содержит **полный, готовый к автономному исполнению код**, инструкции по редактированию файлов, промпты и эталонный датасет для внедрения B2B-сценариев использования приборов **Testo** и новой рубрики **`testo-device-breakdown`** («Прибор в деталях»).

---

## 📂 Файлы, подлежащие изменению

| № | Путь к файлу | Назначение |
|---|---|---|
| 1 | `golden_datasets/golden_testo_pharma.json` | Добавление эталонных датасетов для новой рубрики и B2B сценариев |
| 2 | `docs/testo-pharma-strategy.md` | Обновление стратегии контента и добавление описание 4-й рубрики |
| 3 | `services/openclaw/src/scripts/seed-organizations.ts` | Добавление `testo-device-breakdown` в список `contentPillars` и правила |
| 4 | `services/agent-content-strategy/src/index.ts` | Добавление поддержки новой рубрики в выборке стратегий |
| 5 | `services/agent-writing/src/index.ts` | Обновление системного промпта и инструкции под B2B & разбор прибора |
| 6 | `services/openclaw/src/scripts/seed-golden.ts` | Повторный сидинг датасета в MongoDB |

---

## 📝 1. Изменения в `golden_datasets/golden_testo_pharma.json`

Добавить в массив `golden_testo_pharma.json` следующие записи:

```json
[
  {
    "pillarId": "testo-device-breakdown",
    "platform": "telegram",
    "topic": "Разбор стационарной системы Testo Saveris Pharma для автоматизации 21 CFR Part 11",
    "hook": "📌 Прибор в деталях: Testo Saveris Pharma — непрерывный контроль GxP-среды без ручных журналов",
    "text": "📌 Прибор в деталях: Testo Saveris Pharma — непрерывный контроль GxP-среды без ручных журналов\n\nДля фарм-складов и чистых помещений ручной сбор данных о температуре и влажности — это постоянный риск человеческого фактора и замечаний на аудитах FDA/EMA.\n\nСистема стационарного мониторинга Testo Saveris Pharma решает эту задачу на уровне B2B-инфраструктуры:\n\n1. Трёхуровневая избыточность: данные сохраняются в памяти самого радиозонда, дублируются на базовой станции и передаются на защищенный сервер. Потеря связи или отключение питания не приведёт к утере записей.\n2. Соответствие 21 CFR Part 11 & ALCOA+: неизменяемый Audit Trail, разделение прав доступа и электронные подписи.\n3. Мгновенные оповещения: тревожные уведомления по SMS/Email при выходе за пределы 2..8°C до того, как пострадает партия препаратов.\n\nЗаказывайте оригинальную систему Testo Saveris Pharma у официального дистрибьютора с поверкой и полной валидационной документацией (IQ/OQ).\n\n#testo #testosaveris #pharma #GxP #21CFRPart11 #качество #фармпроизводство"
  },
  {
    "pillarId": "testo-device-breakdown",
    "platform": "threads",
    "topic": "Портативный мини-логгер Testo 174T для контроля холодовой цепи в термоконтейнерах",
    "hook": "⚡ Компактный логгер Testo 174T: 16 000 измерений температуры в металлическом корпусе.",
    "text": "⚡ Компактный логгер Testo 174T: 16 000 измерений температуры в металлическом корпусе.\n\nКомпактный мини-логгер для валидации транспортных термоконтейнеров и фарм-холодильников. Запись данных от -30 до +70 °C, защита IP65 и выгрузка отчетов на ПК за секунды.\n\nИсключает споры с логистами при приемке термолабильных лекарств.\n\n#testo #холодоваяцепь #GDP #фармацевтика #testo174t"
  },
  {
    "pillarId": "testo-device-breakdown",
    "platform": "instagram",
    "topic": "Тепловизор Testo 883 для превентивной защиты электрощитовых фармзавода",
    "hook": "Как перегрев одного контактора может остановить цех розлива на 12 миллионов рублей?",
    "caption": "Профилактическое обслуживание фармацевтического оборудования требует регулярного термографического контроля. Тепловизор Testo 883 с разрешением 320x240 пикселей выявляет локальные перегревы контакторов, вентиляторов и климатических установок до того, как произойдет аварийный останов.\n\nСпециальный софт Testo IRSoft автоматически формирует отчеты для службы главного инженера и аудиторов.\n\nСохраните пост — пригодится при планировании ППР.\n\nТехнические характеристики уточняйте в актуальной документации производителя.\n\n#testo #тепловизор #testo883 #главныйинженер #энергоаудит #фармацевтика",
    "disclaimer": "Технические характеристики уточняйте в актуальной документации производителя."
  }
]
```

---

## 📝 2. Изменения в `services/openclaw/src/scripts/seed-organizations.ts`

В массив `contentPillars` в объекте `testoOrg` добавить рубрику `testo-device-breakdown`:

```typescript
// Вставить в contentPillars внутри seed-organizations.ts:
{ 
  id: "testo-device-breakdown", 
  label: "Разбор прибора Testo", 
  description: "Детальный разбор конкретной модели оборудования Testo, технических параметров и окупаемости для B2B-предприятий", 
  weight: 0.6, 
  preferredFormat: "carousel" 
},
```

А также дополнить `mandatoryTerms`:
```typescript
mandatoryTerms: {
  "pharma-compliance-explained": ["21 CFR Part 11", "Audit Trail", "ERES"],
  "pharma-cold-chain-story": ["холодовая цепь", "GDP", "контроль"],
  "pharma-audit-ready": ["аудит", "инспекция", "чек-лист"],
  "testo-device-breakdown": ["Testo", "точность", "характеристики", "B2B"],
},
```

---

## 📝 3. Изменения в `services/agent-writing/src/index.ts`

Добавить логику ветвления для генерации текста рубрики `testo-device-breakdown`:

```typescript
// Внутри processWritingJob в services/agent-writing/src/index.ts:
} else if (contentPillarId === "testo-device-breakdown") {
  rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Разбор прибора Testo / Equipment Breakdown"):
- Structure this post as an in-depth B2B device spotlight analyzing a specific Testo instrument (e.g. Testo Saveris Pharma, Testo 174T, Testo 883, Testo 440).
- Highlight key physical specs: measurement range, accuracy tolerances, IP protection class, battery/power specs, and memory capacity.
- Explain the precise B2B business problem solved: eliminating human paper log errors, automated alarm dispatch via SMS/Email, passing FDA/EMA audits without findings.
- Use relevant device hashtags ONLY (e.g., #testo #testosaveris #testo174t #testo883 #измерительныеприборы #gxp). Do NOT use tech/GitHub hashtags.`;
}
```

Обновить системные инструкции в `app.post("/adapt")` для подстановки `golden_testo_pharma` и предотвращения утечек IT-тегов:
```typescript
if (isTesto) {
  fullText = fullText.replace(/#(?:github|backend|softwareengineering|frontend|devops|typescript|python|code|repository|petprojects)\b/gi, "").replace(/\s{2,}/g, " ").trim();
}
```

---

## 📝 4. Изменения в `docs/testo-pharma-strategy.md`

Добавить раздел описания рубрики в файл документации:

```markdown
### 4. Рубрика «Прибор в деталях» (`testo-device-breakdown`)
- **Назначение:** Практический B2B-разбор конкретной модели Testo (*Testo Saveris Pharma*, *Testo 174T*, *Testo 883*, *Testo 440*).
- **Сценарий:** Детальная разборка решения конкретной производственной проблемы (риск списания партии, прохождение инспекции, защита чистых помещений).
- **Ключевые слова:** *Testo Saveris*, *Audit Trail*, *ALCOA+*, *диапазон измерений*, *поверка СИ*, *валидация*.
```

---

## ⚙️ 5. Пошаговые команды запуска и проверки (Terminal Commands)

Исполняющему агенту выполнить следующие терминальные команды для установки обновлений и проверки сборки:

```bash
# 1. Проверка типов в проекте
npx tsc --noEmit -p services/agent-writing/tsconfig.json
npx tsc --noEmit -p services/agent-content-strategy/tsconfig.json

# 2. Выполнение сидинга организаций и эталонных данных в MongoDB
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-organizations.ts
docker compose exec openclaw npx tsx services/openclaw/src/scripts/seed-golden.ts

# 3. Пересборка и запуск контейнеров в фоновом режиме
docker compose build agent-writing agent-content-strategy openclaw web-dashboard
docker compose up -d agent-writing agent-content-strategy openclaw web-dashboard
```

---

## ✅ Критерии Готовности (Definition of Done)
1. Рубрика `testo-device-breakdown` успешно доступна в генераторе стратегии и отображается в дашборде.
2. Текст постов новой рубрики содержит глубокое описание приборов Testo и их B2B-применения.
3. В постах Testo полностью отсутствуют IT/GitHub хэштеги.
4. Скрипт `seed-golden.ts` выполняется с выводом `Successfully seeded Golden Dataset for Testo Pharma`.
