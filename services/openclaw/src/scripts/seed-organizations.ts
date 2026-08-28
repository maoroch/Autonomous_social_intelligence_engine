import "dotenv/config";
import {
  connectMongo,
  getCollection,
  Collections,
  disconnectMongo,
  type OrganizationDoc,
  type IndustryProfileDoc,
} from "@pipeline/shared/db";
import {
  OrganizationSchema,
  IndustryProfileSchema,
  DEFAULT_SOFTWARE_DEV_INDUSTRY_PROFILE,
} from "@pipeline/shared/schemas";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

/**
 * Заводит две Organization + два IndustryProfile:
 * 1. software-development-default — обратная совместимость с существующим tech-порталом
 *    (Coexistence Policy, TZ_vertical_agnostic_b2b_saas.md).
 * 2. testo — черновой профиль для Testo SE & Co. KGaA (Instagram-портал, TZ_v3_instagram_testo_portal.md).
 *    Значения trendSources/glossary/brandGuidelines здесь ПЛЕЙСХОЛДЕРЫ — требуют подтверждения
 *    заказчиком (см. раздел "Открытые вопросы" в TZ v3) перед продакшн-использованием.
 */
async function main() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  console.log("Connected to MongoDB");

  const orgsCol = getCollection<OrganizationDoc>(Collections.ORGANIZATIONS);
  const profilesCol = getCollection<IndustryProfileDoc>(Collections.INDUSTRY_PROFILES);

  // ---------- 1. Tech-портал (software-development-default) ----------

  const techOrg = OrganizationSchema.parse({
    tenantId: "software-development-default",
    name: "Tech Portal (Default)",
    publishingTargets: ["linkedin"],
  });

  const techProfile = IndustryProfileSchema.parse(DEFAULT_SOFTWARE_DEV_INDUSTRY_PROFILE);

  await orgsCol.updateOne(
    { tenantId: techOrg.tenantId },
    { $set: techOrg },
    { upsert: true },
  );
  await profilesCol.updateOne(
    { tenantId: techProfile.tenantId },
    { $set: techProfile },
    { upsert: true },
  );
  console.log(`Upserted Organization + IndustryProfile: ${techOrg.tenantId}`);

  // ---------- 2. Testo-портал (черновик, требует уточнения у заказчика) ----------

  const testoOrg = OrganizationSchema.parse({
    tenantId: "testo",
    name: "Testo SE & Co. KGaA (Distributor Portal)",
    publishingTargets: ["instagram"],
  });

  const testoProfile = IndustryProfileSchema.parse({
    tenantId: "testo",
    verticalName: "industrial-measurement-equipment",
    // Язык портала: исключительно русский для Testo.
    language: ["ru"],

    // Плейсхолдер: список требует подтверждения (TZ v2, раздел "Вопросы к заказчику", п.1).
    trendSources: [
      { type: "rss", url: "https://www.testo.com/en-US/company/news", label: "Testo Newsroom", weight: 0.9 },
      { type: "custom", url: "https://www.chillventa.de", label: "Chillventa (отраслевая выставка)", weight: 0.5 },
    ],

    glossary: [
      {
        term: "calibration certificate",
        definition: "Документ, подтверждающий соответствие прибора эталонным значениям измерения",
        synonyms: ["калибровочный сертификат"],
        doNotConfuseWith: ["warranty certificate"],
      },
      {
        term: "thermal imaging",
        definition: "Тепловизионная съёмка для выявления утечек тепла/аномалий температуры",
        synonyms: ["термография", "тепловизор"],
        doNotConfuseWith: [],
      },
      // ---------- Фарма-трек (см. docs/content-pharma-testo.md) ----------
      {
        term: "21 CFR Part 11",
        definition: "Регламент FDA (США) к электронным записям и электронным подписям в регулируемых отраслях",
        synonyms: ["Part 11 compliance", "часть 11"],
        doNotConfuseWith: ["ISO 17025", "обычная сертификация приборов"],
      },
      {
        term: "GxP",
        definition: "Совокупность стандартов качества (GMP, GDP, GLP и др.) для фарм- и биотех-отрасли",
        synonyms: ["Good Practice standards"],
        doNotConfuseWith: [],
      },
      {
        term: "холодовая цепь",
        definition: "Непрерывный контроль температуры при хранении и перевозке фармпродукции",
        synonyms: ["cold chain", "GDP"],
        doNotConfuseWith: [],
      },
      {
        term: "лиофилизация",
        definition: "Процесс заморозки-сушки лекарств, требующий точного профиля температуры",
        synonyms: ["freeze-drying"],
        doNotConfuseWith: [],
      },
      // ---------- Газоаналитический трек (см. docs/testo-gas-strategy.md) ----------
      {
        term: "коэффициент избытка воздуха (lambda)",
        definition: "Отношение действительного количества воздуха к теоретически необходимому для полного сгорания топлива",
        synonyms: ["лямбда", "air ratio"],
        doNotConfuseWith: ["КПД котла"],
      },
      {
        term: "потери тепла qA",
        definition: "Потери тепла с уходящими дымовыми газами в атмосферу",
        synonyms: ["потери с уходящими газами", "qA loss"],
        doNotConfuseWith: ["потери на излучение"],
      },
      {
        term: "блок осушки Пельтье",
        definition: "Термоэлектрический охладитель для осушения газовой пробы до постоянной точки росы (+3°C), исключающий растворение NO2 и SO2",
        synonyms: ["газоохладитель Пельтье", "Peltier gas cooler"],
        doNotConfuseWith: ["обычный механический фильтр конденсата"],
      },
      {
        term: "автоматическое расширение диапазона (х5)",
        definition: "Разбавление пробы чистым воздухом для защиты сенсора CO/NO при пиковых концентрациях без остановки измерений",
        synonyms: ["разбавление пробы", "range extension"],
        doNotConfuseWith: [],
      },
    ],

    terminologyRules: {
      mandatoryTerms: {
        "pharma-compliance-explained": ["21 CFR Part 11", "Audit Trail", "ERES"],
        "pharma-cold-chain-story": ["холодовая цепь", "GDP", "контроль"],
        "pharma-audit-ready": ["аудит", "инспекция", "чек-лист"],
        "testo-device-breakdown": ["Testo", "точность", "характеристики", "B2B"],
        "gas-boiler-efficiency": ["КПД", "lambda", "testo", "настройка горения"],
        "gas-industrial-emissions": ["выбросы", "ПДВ", "ТЭЦ", "сенсоры"],
        "gas-safety-leak-detection": ["утечка", "метан", "течеискатель", "безопасность"],
      },
      forbiddenTerms: ["обычный градусник", "файл excel", "ручной журнал", "примерная температура", "кустарный замер"],
      preferredReplacements: {
        "история записей": "Audit Trail",
        "обычное хранение": "GDP комплаенс",
        "на глаз": "режимная наладка",
      },
    },

    audiencePersonas: [
      {
        id: "hvac-engineer",
        label: "Инженер по эксплуатации HVAC/R",
        description: "Обслуживает системы отопления, вентиляции и кондиционирования",
        painPoints: ["простои оборудования", "неточные измерения", "сложность калибровки в полевых условиях"],
        toneOfVoice: "formal",
      },
      {
        id: "quality-manager",
        label: "QA/Food Safety менеджер",
        description: "Отвечает за контроль качества и пищевую безопасность (HACCP)",
        painPoints: ["риск порчи продукции", "соответствие регуляторным требованиям"],
        toneOfVoice: "formal",
      },
      // ---------- Фарма-трек (см. docs/content-pharma-testo.md) ----------
      {
        id: "qa-pharma-manager",
        label: "QA-менеджер фарм-производства",
        description: "Отвечает за соответствие GxP/GMP и прохождение регуляторных аудитов (FDA/EMA)",
        painPoints: ["риск отклонения условий хранения", "потеря партии продукции", "ручной сбор данных перед аудитом"],
        toneOfVoice: "formal",
      },
      {
        id: "validation-specialist",
        label: "Специалист по валидации/квалификации",
        description: "Валидирует системы мониторинга и производственное оборудование под 21 CFR Part 11",
        painPoints: ["сложность документирования", "давление сроков перед инспекцией", "человеческий фактор в записях"],
        toneOfVoice: "formal",
      },
      {
        id: "cold-chain-logistics",
        label: "Логист холодовой цепи (GDP)",
        description: "Обеспечивает непрерывный температурный контроль при перевозке фармпродукции",
        painPoints: ["потеря видимости температуры в пути", "штрафы за нарушение GDP", "претензии от фармклиента"],
        toneOfVoice: "formal",
      },
      // ---------- Газоаналитический трек (см. docs/testo-gas-strategy.md) ----------
      {
        id: "boiler-service-engineer",
        label: "Инженер по наладке и сервису котельных",
        description: "Проводит режимно-наладочные испытания и сервис бытовых/промышленных газовых котлов",
        painPoints: ["повышенный расход газа", "сложность составления отчетов на объекте", "перегрузка сенсоров по CO"],
        toneOfVoice: "formal",
      },
      {
        id: "industrial-energy-manager",
        label: "Главный энергетик / Наладчик ТЭЦ",
        description: "Отвечает за энергоэффективность технологических печей, турбин и котлов большой мощности",
        painPoints: ["отравление сенсоров высокими концентрациями", "потери топлива", "экологические штрафы"],
        toneOfVoice: "formal",
      },
      {
        id: "environmental-inspector",
        label: "Эколог промышленного предприятия",
        description: "Контролирует соблюдение нормативов предельно допустимых выбросов (ПДВ) в атмосферу",
        painPoints: ["погрешность замеров из-за конденсата", "требования инспекций к Госреестру СИ"],
        toneOfVoice: "formal",
      },
    ],

    trendSources: [
      { type: "rss", url: "https://www.plantengineering.com/feed/", label: "Plant Engineering (Industrial & Emissions)", weight: 1.0 },
      { type: "rss", url: "https://www.pharmaceutical-technology.com/feed/", label: "Pharmaceutical Technology (GxP & Compliance)", weight: 1.0 },
      { type: "rss", url: "https://www.worldpharmanews.com/index.php?format=feed&type=rss", label: "World Pharma News (Cold Chain & Quality)", weight: 0.9 },
      { type: "rss", url: "https://www.processindustryforum.com/feed", label: "Process Industry Forum (Sensors & Measurement)", weight: 0.9 },
    ],

    contentStyleRules: {
      maxEmojis: 0,
      hashtagStrategy: "moderate",
      formalityLevel: "strict",
      forbiddenPhrases: ["купите сейчас", "лучший на рынке"],
      requiredDisclaimers: ["Технические характеристики уточняйте в актуальной документации производителя."],
    },

    brandGuidelines: {
      // Плейсхолдер-цвет из открытых источников — заменить на официальный брендбук клиента.
      colorPalette: ["#EE8432", "#14171A", "#FAF9F6"],
      templateSetId: "industrial-measurement-equipment",
    },

    complianceConfig: {
      factCheckRequired: true,
      factSourceType: "s3-specsheets",
      regulatedIndustry: true,
    },

    platformAdaptation: [
      {
        platform: "instagram",
        maxCaptionLength: 400,
        preferredFormats: ["carousel", "reel-script", "story"],
        visualEmphasis: "visual-heavy",
        hashtagCount: 10,
        ctaStyle: "soft",
      },
    ],

    contentPillars: [
      { id: "product-in-action", label: "Прибор в действии", description: "Демонстрация работы прибора в реальных условиях", weight: 0.9, preferredFormat: "reel-script" },
      { id: "before-after", label: "До / После", description: "Визуальный контраст термограмм/показателей", weight: 0.8, preferredFormat: "carousel" },
      { id: "mini-tutorial", label: "Мини-туториал", description: "Частая ошибка + быстрое правильное решение", weight: 0.8, preferredFormat: "reel-script" },
      { id: "behind-the-scenes", label: "Behind-the-scenes", description: "Техник с прибором на реальном объекте", weight: 0.5, preferredFormat: "single-image" },
      { id: "infographic-carousel", label: "Карусель-инфографика", description: "Экспертный контент, укороченный текст на слайд", weight: 0.7, preferredFormat: "carousel" },
      { id: "quick-stories", label: "Быстрый контент в Stories", description: "Опросы, быстрые факты, анонсы", weight: 0.4, preferredFormat: "story" },
      { id: "myths", label: "Мифы отрасли", description: "Развенчание распространённых заблуждений", weight: 0.7, preferredFormat: "carousel" },
      { id: "seasonal", label: "Сезонный/регуляторный контент", description: "Привязка к отраслевым циклам", weight: 0.6, seasonalTrigger: "autumn-hvac-prep", preferredFormat: "carousel" },
      // ---------- Фарма-трек (см. docs/content-pharma-testo.md) ----------
      { id: "pharma-compliance-explained", label: "GxP на пальцах", description: "Объяснение регуляторных требований простым языком (21 CFR Part 11, Audit Trail)", weight: 0.6, preferredFormat: "carousel" },
      { id: "pharma-cold-chain-story", label: "Холодовая цепь без слепых зон", description: "Визуализация пути партии лекарства и точек риска потери контроля температуры", weight: 0.5, preferredFormat: "reel-script" },
      { id: "pharma-audit-ready", label: "Готовы к инспекции?", description: "Чек-лист/мифы про подготовку к аудиту FDA/EMA", weight: 0.5, preferredFormat: "carousel" },
      { id: "pharma-case-story", label: "Кейс из фарм-индустрии", description: "Обезличенный кейс-стори по мотивам реальных внедрений (без брендов клиентов без разрешения)", weight: 0.4, preferredFormat: "carousel" },
      { id: "testo-device-breakdown", label: "Разбор прибора Testo", description: "Детальный разбор конкретной модели оборудования Testo, технических параметров и окупаемости для B2B-предприятий", weight: 0.6, preferredFormat: "carousel" },
      // ---------- Газоаналитический трек (см. docs/testo-gas-strategy.md) ----------
      { id: "gas-boiler-efficiency", label: "🔥 Наладка и КПД котельных", description: "Настройка соотношения газ/воздух (lambda), снижение расхода топлива и расчет потерь тепла qA (testo 300 / testo 310 II)", weight: 0.7, preferredFormat: "carousel" },
      { id: "gas-industrial-emissions", label: "🏭 Промышленный эко-контроль и ТЭЦ", description: "Экологический мониторинг промышленных выбросов NOx, SO2, CO, защита сенсоров и блок Пельтье (testo 340 / testo 350)", weight: 0.7, preferredFormat: "carousel" },
      { id: "gas-safety-leak-detection", label: "🛡️ Безопасность и поиск утечек газа", description: "Локализация микроутечек метана, пропана и водорода на газопроводах и арматуре (testo 316 / testo 310 II)", weight: 0.6, preferredFormat: "carousel" },
    ],
  });

  await orgsCol.updateOne(
    { tenantId: testoOrg.tenantId },
    { $set: testoOrg },
    { upsert: true },
  );
  await profilesCol.updateOne(
    { tenantId: testoProfile.tenantId },
    { $set: testoProfile },
    { upsert: true },
  );
  console.log(`Upserted Organization + IndustryProfile: ${testoOrg.tenantId} (ЧЕРНОВИК — требует подтверждения заказчиком)`);

  // ---------- 3. Кино и Marvel Медиа (cinema-media) ----------

  const cinemaOrg = OrganizationSchema.parse({
    tenantId: "cinema-media",
    name: "Кино и Marvel Медиа",
    publishingTargets: ["telegram"],
  });

  const cinemaProfile = IndustryProfileSchema.parse({
    tenantId: "cinema-media",
    verticalName: "cinema-media",
    language: ["ru"],

    trendSources: [
      { type: "rss", url: "https://www.denofgeek.com/feed/", label: "Den of Geek (All)", weight: 1.0 },
      { type: "rss", url: "https://www.denofgeek.com/movies/feed/", label: "Den of Geek (Movies)", weight: 1.0 },
      { type: "rss", url: "https://www.denofgeek.com/tv/feed/", label: "Den of Geek (TV & Shows)", weight: 0.9 },
      { type: "rss", url: "https://www.denofgeek.com/culture/feed/", label: "Den of Geek (Culture & Lore)", weight: 0.9 },
    ],

    glossary: [
      {
        term: "MCU",
        definition: "Киновселенная Marvel (Marvel Cinematic Universe)",
        synonyms: ["Marvel Cinematic Universe", "киновселенная Марвел"],
        doNotConfuseWith: ["DCEU"],
      },
      {
        term: "камео",
        definition: "Короткое эпизодическое появление известного персонажа или актера",
        synonyms: ["cameo"],
        doNotConfuseWith: ["главная роль"],
      },
      {
        term: "посткредиты",
        definition: "Сцена после титров фильма, тизерящая будущие проекты",
        synonyms: ["post-credits scene", "сцена после титров"],
        doNotConfuseWith: [],
      },
      {
        term: "бокс-офис",
        definition: "Кассовые сборы фильма в прокате",
        synonyms: ["box office", "касса фильма"],
        doNotConfuseWith: ["бюджет производства"],
      },
      {
        term: "пасхалка",
        definition: "Скрытая деталь, отсылка к комиксам или прошлым фильмам",
        synonyms: ["easter egg"],
        doNotConfuseWith: [],
      },
      {
        term: "шоураннер",
        definition: "Ключевой продюсер и сценарист сериала",
        synonyms: ["showrunner"],
        doNotConfuseWith: ["режиссер одного эпизода"],
      },
    ],

    terminologyRules: {
      mandatoryTerms: {
        "marvel-mcu-lore": ["MCU", "Marvel", "комикс"],
        "cinema-history-backstage": ["съемки", "кадр", "режиссер"],
        "box-office-analytics": ["бокс-офис", "сборы", "бюджет"],
        "daily-quick-recap": ["премьера", "анонс", "трейлер"],
      },
      forbiddenTerms: ["скучный фильм", "купите билет сейчас"],
      preferredReplacements: {
        "сцена после фильма": "посткредиты",
        "кассовая выручка": "бокс-офис",
      },
    },

    audiencePersonas: [
      {
        id: "marvel-fan",
        label: "Фанат Marvel и комиксов",
        description: "Смотрит все фильмы MCU, ищет пасхалки и теории",
        painPoints: ["спойлеры", "задержки релизов", "недостоверные слухи"],
        toneOfVoice: "casual",
      },
      {
        id: "cinema-enthusiast",
        label: "Киноман и любитель закулисья",
        description: "Интересуется историей кино, операторской работой и VFX",
        painPoints: ["поверхностные обзоры", "отсутствие глубокого анализа"],
        toneOfVoice: "casual",
      },
      {
        id: "industry-analyst",
        label: "Аналитик киноиндустрии",
        description: "Следит за кассовыми сборами, бюджетами и стримингами",
        painPoints: ["неактуальная статистика сборов"],
        toneOfVoice: "semi-formal",
      },
    ],

    contentStyleRules: {
      maxEmojis: 5,
      hashtagStrategy: "moderate",
      formalityLevel: "relaxed",
      forbiddenPhrases: ["купите билет", "подпишитесь немедленно"],
      requiredDisclaimers: [],
    },

    brandGuidelines: {
      colorPalette: ["#08090C", "#FFB800", "#FFFFFF", "#1E152A"],
      templateSetId: "cinema-media",
    },

    complianceConfig: {
      factCheckRequired: false,
      factSourceType: "none",
      regulatedIndustry: false,
    },

    platformAdaptation: [
      {
        platform: "telegram",
        maxCaptionLength: 1000,
        preferredFormats: ["carousel", "single-image"],
        visualEmphasis: "visual-heavy",
        hashtagCount: 5,
        ctaStyle: "direct",
      },
    ],

    contentPillars: [
      {
        id: "marvel-mcu-lore",
        label: "Marvel & Geek Lore",
        description: "Разборы трейлеров по кадрам, скрытые пасхалки, теории фанатов, сравнение «Фильм vs Комикс», хронологии событий киновселенной.",
        weight: 0.9,
        preferredFormat: "carousel",
      },
      {
        id: "cinema-history-backstage",
        label: "История кино и Закулисье",
        description: "«Как это снято»: культовые сцены без дублёров, революционные спецэффекты (VFX), актерские импровизации, режиссерские приёмы и конфликты на площадках.",
        weight: 0.8,
        preferredFormat: "carousel",
      },
      {
        id: "box-office-analytics",
        label: "Индустрия и Кассовые сборы",
        description: "Аналитика сборов уикенда, рекорды и провалы, бюджеты блокбастеров, стратегии стримингов (Netflix, HBO Max, Disney+).",
        weight: 0.7,
        preferredFormat: "carousel",
      },
      {
        id: "daily-quick-recap",
        label: "Дайджест и Новости дня",
        description: "Молнии, кастинги, анонсы дат премьер, свежие постеры и трейлеры дня (экспресс-дайджест за 60 секунд).",
        weight: 0.8,
        preferredFormat: "carousel",
      },
      {
        id: "anime-kawaii-hub",
        label: "Аниме-культура и Релизы",
        description: "Разборы главных аниме-сезонов, анимация Ufotable/Mappa, полнометражные трилогии, премьеры и рекорды японского проката.",
        weight: 0.8,
        preferredFormat: "carousel",
      },
    ],
  });

  await orgsCol.updateOne(
    { tenantId: cinemaOrg.tenantId },
    { $set: cinemaOrg },
    { upsert: true },
  );
  await profilesCol.updateOne(
    { tenantId: cinemaProfile.tenantId },
    { $set: cinemaProfile },
    { upsert: true },
  );
  console.log(`Upserted Organization + IndustryProfile: ${cinemaOrg.tenantId}`);

  await disconnectMongo();
}

main().catch((err) => {
  console.error("Error seeding organizations:", err);
  process.exit(1);
});
