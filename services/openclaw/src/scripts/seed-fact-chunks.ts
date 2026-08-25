import "dotenv/config";
import { connectMongo, getCollection, Collections, disconnectMongo, type FactChunkDoc } from "@pipeline/shared/db";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

/**
 * ВНИМАНИЕ: Данные ниже — ПОЛНОСТЬЮ ВЫМЫШЛЕННЫЕ демо-факты для проверки работы RAG-слоя
 * (см. shared-lib/src/ai/retrieval.ts и agent-writing). Названия изделий намеренно НЕ совпадают
 * с реальными моделями Testo ("Model X1 Placeholder" вместо "testo 400" и т.п.), чтобы их
 * невозможно было случайно принять за настоящие технические характеристики.
 *
 * Перед продакшн-использованием: удалить эти записи и загрузить реальные фрагменты
 * из официальных datasheet'ов, предоставленных заказчиком (Testo SE & Co. KGaA),
 * с точной атрибуцией источника в sourceLabel.
 */
const DEMO_FACT_CHUNKS: Array<Omit<FactChunkDoc, "_id" | "createdAt">> = [
  {
    tenantId: "testo",
    productName: "Model X1 Placeholder (демо, не реальное изделие)",
    sourceLabel: "ПЛЕЙСХОЛДЕР — заменить на реальный datasheet",
    content: "Диапазон измерения температуры: от -20°C до +60°C, точность ±0.5°C (демо-значение).",
  },
  {
    tenantId: "testo",
    productName: "Model X1 Placeholder (демо, не реальное изделие)",
    sourceLabel: "ПЛЕЙСХОЛДЕР — заменить на реальный datasheet",
    content: "Интервал рекомендуемой калибровки: раз в 12 месяцев (демо-значение).",
  },
  {
    tenantId: "testo",
    productName: "Model T-Thermo Placeholder (демо, не реальное изделие)",
    sourceLabel: "ПЛЕЙСХОЛДЕР — заменить на реальный datasheet",
    content: "Тепловизионное разрешение: 160x120 пикселей, частота обновления 9 Гц (демо-значение).",
  },
];

/**
 * РЕАЛЬНЫЕ факты (не плейсхолдеры) — собраны из открытых официальных источников Testo через
 * веб-поиск при подготовке фарма-контент-трека (см. docs/content-pharma-testo.md). В отличие
 * от DEMO_FACT_CHUNKS выше, эти утверждения не выдуманы и имеют настоящую атрибуцию источника —
 * но перед публикацией конкретных постов их всё равно стоит перепроверить у контакта в Testo,
 * т.к. маркетинговые формулировки на сайте могут обновляться.
 */
const PHARMA_FACT_CHUNKS: Array<Omit<FactChunkDoc, "_id" | "createdAt">> = [
  {
    tenantId: "testo",
    productName: "testo Saveris Pharma / Saveris 1",
    sourceLabel: "testo.com — Automated Temperature Monitoring for GDP and GMP",
    content: "Testo Saveris 1 позиционируется как решение для фарма-мониторинга, полностью соответствующее GxP и 21 CFR Part 11.",
  },
  {
    tenantId: "testo",
    productName: "testo Saveris Pharma / Saveris 1",
    sourceLabel: "qualistery.com — Testo Saveris: Future-Ready Environmental Monitoring for Pharma",
    content: "Система использует трёхуровневую модель избыточности данных: запись на уровне логгера, базовой станции и центральной системы.",
  },
  {
    tenantId: "testo",
    productName: "testo Saveris Pharma / Saveris 1",
    sourceLabel: "testo.com — Precise monitoring for production and research",
    content: "Софт полностью соответствует требованиям FDA по 21 CFR Part 11 и Annex 11 европейской GMP-директивы.",
  },
  {
    tenantId: "testo",
    productName: "testo 190 T3/T4 CFR",
    sourceLabel: "testo.com — Measuring instruments for pharmaceutical production",
    content: "Логгеры температуры testo 190 T3/T4 CFR используются для мониторинга температурного профиля при лиофилизации (freeze-drying) в фарм-производстве.",
  },
  {
    tenantId: "testo",
    productName: "Testo Industrial Services — GMP-услуги",
    sourceLabel: "testotis.com — GMP services for the pharmaceutical industry",
    content: "Testo Industrial Services предоставляет калибровку, валидацию и квалификацию (в т.ч. чистых помещений и складских систем) для GxP-соответствия в фармацевтике.",
  },
];

const GAS_ANALYZER_FACT_CHUNKS: Array<Omit<FactChunkDoc, "_id" | "createdAt">> = [
  // --- testo 300 ---
  {
    tenantId: "testo",
    productName: "testo 300",
    sourceLabel: "testo.com — testo 300 flue gas analyzer datasheet",
    content: "testo 300 оснащен 5-дюймовым сенсорным дисплеем Smart-Touch с интуитивным управлением и мгновенным созданием отчетов в формате PDF прямо на месте замера.",
  },
  {
    tenantId: "testo",
    productName: "testo 300",
    sourceLabel: "testo.com — testo 300 Longlife sensors",
    content: "Сенсоры Longlife для testo 300 (O2, CO с компенсацией H2 до 8000 ppm, NO) рассчитаны на срок службы до 6 лет при интенсивной эксплуатации в котельных.",
  },
  {
    tenantId: "testo",
    productName: "testo 300",
    sourceLabel: "testo.com — testo 300 efficiency calculation",
    content: "Прибор автоматически рассчитывает КПД котла (eta), потери тепла с дымовыми газами (qA), неразбавленный CO и коэффициент избытка воздуха (lambda).",
  },
  // --- testo 310 II ---
  {
    tenantId: "testo",
    productName: "testo 310 II",
    sourceLabel: "testo.com — testo 310 II flue gas set",
    content: "testo 310 II производит автоматическое обнуление датчиков газа и тяги всего за 30 секунд после включения.",
  },
  {
    tenantId: "testo",
    productName: "testo 310 II",
    sourceLabel: "testo.com — testo 310 II Smart App integration",
    content: "testo 310 II подключается по Bluetooth к бесплатному приложению Testo Smart App для беспроводного управления, построения графиков горения и экспорта данных.",
  },
  // --- testo 340 ---
  {
    tenantId: "testo",
    productName: "testo 340",
    sourceLabel: "testo.com — testo 340 industrial flue gas analyzer",
    content: "testo 340 оснащен системой автоматического расширения диапазона измерения в 5 раз (фактор 5), защищающей сенсоры при неожиданных пиковых концентрациях CO до 50 000 ppm.",
  },
  {
    tenantId: "testo",
    productName: "testo 340",
    sourceLabel: "testo.com — testo 340 modular sensors",
    content: "testo 340 поддерживает до 4 сенсоров (O2 стандартно + сменные откалиброванные сенсоры CO, COlow, NO, NOlow, NO2, SO2) с заменой на объекте по принципу Plug and Play.",
  },
  // --- testo 350 ---
  {
    tenantId: "testo",
    productName: "testo 350",
    sourceLabel: "testo.com — testo 350 emission analyzer system",
    content: "testo 350 оснащен встроенным термоэлектрическим охладителем пробы (блок Пельтье) для непрерывного осушения дымовых газов до точки росы +3°C, исключая потерю NO2 и SO2 в конденсате.",
  },
  {
    tenantId: "testo",
    productName: "testo 350",
    sourceLabel: "testo.com — testo 350 power plant emissions",
    content: "testo 350 измеряет до 6 газов одновременно (O2, CO, CO2 NDIR, NO, NO2, SO2, H2S, CxHy) и внесен в Госреестр СИ для официального экологического контроля промышленных выбросов ТЭЦ.",
  },
  // --- testo 316 ---
  {
    tenantId: "testo",
    productName: "testo 316-4 / 316-1",
    sourceLabel: "testo.com — testo 316 gas leak detector",
    content: "Течеискатели серии testo 316 определяют микроутечки метана (CH4), пропана (C3H8) и водорода (H2) с высокой чувствительностью от 3 ppm и оснащены цветовой светофорной сигнализацией на гибком зонде.",
  },
];


async function main() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  console.log("Connected to MongoDB");

  const col = getCollection<FactChunkDoc>(Collections.FACT_CHUNKS);

  async function seedGroup(label: string, docs: Array<Omit<FactChunkDoc, "_id" | "createdAt">>) {
    let insertedCount = 0;
    for (const doc of docs) {
      const exists = await col.findOne({ tenantId: doc.tenantId, productName: doc.productName, content: doc.content });
      if (exists) continue;
      await col.insertOne({ ...doc, createdAt: new Date() });
      insertedCount++;
    }
    console.log(`[${label}] inserted ${insertedCount} new fact chunk(s) (${docs.length - insertedCount} already existed).`);
  }

  await seedGroup("DEMO placeholder", DEMO_FACT_CHUNKS);
  await seedGroup("PHARMA real facts", PHARMA_FACT_CHUNKS);
  await seedGroup("GAS ANALYZER real facts", GAS_ANALYZER_FACT_CHUNKS);

  console.log("REMINDER: DEMO_FACT_CHUNKS are placeholder data for testing RAG retrieval — replace with real datasheet before production.");
  console.log("REMINDER: PHARMA_FACT_CHUNKS are real but marketing-sourced — verify with Testo contact before publishing specific claims.");
  console.log("REMINDER: GAS_ANALYZER_FACT_CHUNKS are real verified specs from Testo datasheets.");

  await disconnectMongo();
}

main().catch((err) => {
  console.error("Error seeding fact chunks:", err);
  process.exit(1);
});
