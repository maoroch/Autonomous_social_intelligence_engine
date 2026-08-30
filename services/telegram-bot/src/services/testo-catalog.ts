/**
 * Dynamic Testo Catalog & Grounding Engine
 * 
 * Предоставляет верифицированные технические характеристики, диапазоны измерений,
 * погрешности и нормативные требования для оборудования Testo (Gas, Pharma, HVAC, Metrology)
 * от официального дистрибьютора ТОО «AZIA-TEST» / Testo.
 */

export interface TestoDeviceSpec {
  model: string;
  category: "gas" | "pharma" | "hvac" | "thermal";
  title: string;
  summary: string;
  url: string;
  source: string;
  measurementParameters: {
    parameter: string;
    range: string;
    accuracy?: string;
  }[];
  keyFeatures: string[];
  certifications: string[];
  officialDistributorCta: string;
}

export const TESTO_OFFICIAL_CATALOG: Record<string, TestoDeviceSpec> = {
  "350": {
    model: "Testo 350",
    category: "gas",
    title: "Промышленный портативный газоанализатор Testo 350 для ТЭЦ, металлургии и котлов",
    summary: "Измерение O2, CO, NO, NO2, SO2, H2S, CxHy, CO2 при экстремальных температурах до +1800°C с блоком осушки Пельтье.",
    url: "https://azia-test.com/catalog/gas/testo-350",
    source: "Testo Industrial Engineering (AZIA-TEST)",
    measurementParameters: [
      { parameter: "CO (угарный газ)", range: "0 ... 10 000 ppm (до 40 000 ppm с разбавлением x4)", accuracy: "±5% от изм. знач." },
      { parameter: "NO (оксид азота)", range: "0 ... 3 000 ppm (до 12 000 ppm с разбавлением)", accuracy: "±5% от изм. знач." },
      { parameter: "NO2 (диоксид азота)", range: "0 ... 500 ppm", accuracy: "±5% от изм. знач." },
      { parameter: "SO2 (диоксид серы)", range: "0 ... 5 000 ppm", accuracy: "±5% от изм. знач." },
      { parameter: "O2 (кислород)", range: "0 ... 25 об. %", accuracy: "±0.2 об. %" },
      { parameter: "Температура дымовых газов", range: "-40 ... +1800 °C", accuracy: "±0.5% от изм. знач." },
    ],
    keyFeatures: [
      "Запатентованный блок подготовки пробы с элементом Пельтье охлаждает дымовой газ строго до +3°C, предотвращая потерю водорастворимых NO2 и SO2.",
      "Разбавление пробы в 40 раз расширяет диапазон измерения CO до 40 000 ppm при наладке мощных промышленных горелок.",
      "Раздельная архитектура: блок анализатора устанавливается у точки отбора, а блок управления находится у оператора на расстоянии до 100 м.",
      "Встроенная память на 250 000 измерений и экспорт данных через интерфейс Bluetooth / USB.",
    ],
    certifications: [
      "Внесен в Государственный реестр средств измерений (ГСИ РК)",
      "Сертификат соответствия ГОСТ Р / ТР ТС",
      "Методика поверки МП-2023",
    ],
    officialDistributorCta: "Заказывайте оригинальный Testo 350 с поверкой в Госреестре у официального дистрибьютора ТОО «AZIA-TEST».",
  },
  "300": {
    model: "Testo 300 Longlife",
    category: "gas",
    title: "Смарт-газоанализатор Testo 300 для наладки котельного оборудования и расчета КПД",
    summary: "Сенсорный HD-дисплей, сенсоры Longlife до 6 лет службы, расчет коэффициента избытка воздуха (Lambda) и потерь тепла qA.",
    url: "https://azia-test.com/catalog/gas/testo-300",
    source: "Testo Boiler Metrology (AZIA-TEST)",
    measurementParameters: [
      { parameter: "O2", range: "0 ... 21 об. %", accuracy: "±0.2 об. %" },
      { parameter: "CO (с H2-компенсацией)", range: "0 ... 8 000 ppm (до 30 000 ppm с защитой сенсора)", accuracy: "±10 ppm" },
      { parameter: "NO", range: "0 ... 3 000 ppm", accuracy: "±5 ppm" },
      { parameter: "Тяга в дымоходе", range: "-9.99 ... +40 гПа", accuracy: "±0.02 гПа" },
      { parameter: "КПД котла (Eta)", range: "0 ... 120 %", accuracy: "Расчетный" },
    ],
    keyFeatures: [
      "5-дюймовый сенсорный дисплей Smart-Touch со структурированными интуитивными меню для всех видов измерений дымовых газов.",
      "Сенсоры Longlife с увеличенным ресурсом до 6 лет экономят до 40% бюджета сервисного обслуживания.",
      "Мгновенное формирование отчетов на объекте с подписью заказчика и отправкой по Wi-Fi / Email.",
    ],
    certifications: [
      "Внесен в Госреестр СИ РК",
      "Сертификат TÜV по стандарту EN 50379-1, EN 50379-2",
    ],
    officialDistributorCta: "Официальный дистрибьютор Testo в Казахстане ТОО «AZIA-TEST» предоставляет 100% гарантию, обучение и первичную поверку.",
  },
  "310": {
    model: "Testo 310 II",
    category: "gas",
    title: "Компактный анализатор дымовых газов Testo 310 II для сервиса бытовых и коммерческих котлов",
    summary: "Простое управление, надежные электрохимические сенсоры O2 и CO, встроенный конденсатосборник и магнитное крепление.",
    url: "https://azia-test.com/catalog/gas/testo-310-2",
    source: "Testo Heating Service (AZIA-TEST)",
    measurementParameters: [
      { parameter: "O2", range: "0 ... 21 об. %", accuracy: "±0.2 об. %" },
      { parameter: "CO", range: "0 ... 4 000 ppm", accuracy: "±20 ppm" },
      { parameter: "Температура", range: "0 ... +400 °C", accuracy: "±1 °C" },
      { parameter: "Тяга", range: "-20 ... +20 гПа", accuracy: "±0.03 гПа" },
    ],
    keyFeatures: [
      "Прочный защитный чехол с мощными магнитами для фиксации на корпусе котла.",
      "Двойной дисплей и одновременное отображение всех параметров горения (O2, CO, температура, КПД).",
      "Интеграция с мобильным приложением Testo Smart App по Bluetooth.",
    ],
    certifications: ["Сертифицирован по стандарту EN 50379-3", "Госреестр СИ"],
    officialDistributorCta: "Приобретайте сертифицированные приборы Testo 310 II у официального партнера ТОО «AZIA-TEST».",
  },
  "340": {
    model: "Testo 340",
    category: "gas",
    title: "4-сенсорный промышленный анализатор дымовых газов Testo 340",
    summary: "Оснащение до 4 сенсоров (O2, CO, NO, NO2, SO2), автоматическое расширение диапазона измерений при пиковых нагрузках.",
    url: "https://azia-test.com/catalog/gas/testo-340",
    source: "Testo Industrial Monitoring (AZIA-TEST)",
    measurementParameters: [
      { parameter: "CO / COlow", range: "0 ... 10 000 ppm", accuracy: "±5% от изм. знач." },
      { parameter: "NO / NOlow", range: "0 ... 4 000 ppm", accuracy: "±5% от изм. знач." },
      { parameter: "SO2", range: "0 ... 5 000 ppm", accuracy: "±5% от изм. знач." },
    ],
    keyFeatures: [
      "Сменные предкалиброванные сенсоры 'Plug & Play' заменяются оператором прямо на объекте без возврата в сервис.",
      "Встроенный насос с автоматической регулировкой расхода газа.",
    ],
    certifications: ["Внесен в Госреестр СИ РК", "TÜV / EN 50379-2"],
    officialDistributorCta: "ТОО «AZIA-TEST» — официальные поставки и сервис промышленных систем Testo 340.",
  },
  "316": {
    model: "Testo 316-EX / 316-1",
    category: "gas",
    title: "Взрывозащищенный течеискатель горючих газов Testo 316-EX (ATEX)",
    summary: "Локализация утечек метана (CH4), пропана (C3H8) и водорода (H2) от 1 ppm во взрывоопасных зонах ATEX 2G/2D.",
    url: "https://azia-test.com/catalog/gas/testo-316-ex",
    source: "Testo Gas Safety (AZIA-TEST)",
    measurementParameters: [
      { parameter: "Метан (CH4)", range: "1 ppm ... 4.0 об. % (100% LEL)", accuracy: "Порог 1 ppm" },
      { parameter: "Пропан (C3H8)", range: "1 ppm ... 2.0 об. % (100% LEL)", accuracy: "Порог 1 ppm" },
      { parameter: "Водород (H2)", range: "1 ppm ... 4.0 об. % (100% LEL)", accuracy: "Порог 1 ppm" },
    ],
    keyFeatures: [
      "Сертификат взрывобезопасности ATEX II 2G Ex ib IIC T1 Gb для работы в опасных зонах классов 1 и 2.",
      "Гибкий измерительный зонд для труднодоступных фланцев и газопроводов.",
      "Световая шкала и звуковая сигнализация с нарастанием частоты при приближении к эпицентру утечки.",
    ],
    certifications: ["ATEX Directive 2014/34/EU", "Сертификат ТР ТС 012/2011 (Взрывобезопасность)"],
    officialDistributorCta: "Заказывайте взрывозащищенные течеискатели Testo у официального дистрибьютора ТОО «AZIA-TEST».",
  },
  "saveris": {
    model: "Testo Saveris Pharma",
    category: "pharma",
    title: "Автоматизированная система непрерывного мониторинга микроклимата Testo Saveris Pharma (GxP / 21 CFR Part 11)",
    summary: "Централизованный сбор температуры, влажности и перепада давления с защищенным Audit Trail, ERES и валидацией IQ/OQ.",
    url: "https://azia-test.com/catalog/pharma/testo-saveris",
    source: "Testo Pharma Compliance (AZIA-TEST)",
    measurementParameters: [
      { parameter: "Температура чистых помещений", range: "-200 ... +600 °C (в зависимости от зонда Pt100/NTC)", accuracy: "до ±0.1 °C" },
      { parameter: "Относительная влажность", range: "0 ... 100 % RH", accuracy: "±1.0 % RH" },
      { parameter: "Дифференциальное давление", range: "-50 ... +50 Па / -500 ... +500 Па", accuracy: "±0.5 Па" },
    ],
    keyFeatures: [
      "100% соответствие требованиям FDA 21 CFR Part 11 и GMP Annex 11: неизменяемый журнал событий Audit Trail, электронные подписи, разграничение прав доступа ERES.",
      "Тройное резервирование данных: память в каждом датчике + память базовой станции + база данных SQL Cockpit.",
      "Мгновенное SMS и Email-оповещение ответственных лиц при выходе параметров за критические фармакопейные пределы.",
      "Сертифицированные пакеты валидационных документов IQ/OQ и проведение квалификации на объекте инженерами AZIA-TEST.",
    ],
    certifications: [
      "FDA 21 CFR Part 11",
      "GMP Annex 11 / GxP / GDP",
      "ISO 14644 (Чистые помещения)",
      "Госреестр СИ РК",
    ],
    officialDistributorCta: "ТОО «AZIA-TEST» выполняет проектирование, валидацию IQ/OQ и монтаж систем Testo Saveris Pharma под ключ.",
  },
  "190": {
    model: "Testo 190 CFR",
    category: "pharma",
    title: "Беспроводные логгеры температуры и давления Testo 190 для валидации автоклавов и стерилизаторов",
    summary: "Высокотемпературные логгеры из нержавеющей стали (IP68) для квалификации процессов стерилизации, лиофилизации и расчета F0-value.",
    url: "https://azia-test.com/catalog/pharma/testo-190",
    source: "Testo Pharma Validation (AZIA-TEST)",
    measurementParameters: [
      { parameter: "Температура стерилизации", range: "-50 ... +140 °C", accuracy: "±0.1 °C" },
      { parameter: "Абсолютное давление", range: "1 мбар ... 4 бар", accuracy: "±20 мбар" },
    ],
    keyFeatures: [
      "Герметичный корпус из нержавеющей стали AISI 316L с классом защиты IP68 выдерживает пар и избыточное давление в автоклавах.",
      "Автоматический расчет стерилизующего эффекта F0 и A0 в соответствии с фармакопейными статьями.",
      "Программирование и считывание до 8 логгеров одновременно в одном программном кейсе USB.",
    ],
    certifications: ["FDA 21 CFR Part 11", "DIN EN ISO 17665 (Стерилизация паром)", "Госреестр СИ РК"],
    officialDistributorCta: "Приобретайте логгеры валидации Testo 190 с сертификатами калибровки у официального дистрибьютора ТОО «AZIA-TEST».",
  },
  "174": {
    model: "Testo 174T / 174H",
    category: "pharma",
    title: "Мини-логгеры данных температуры Testo 174T для контроля холодовой цепи медикаментов (GDP)",
    summary: "Компактный логгер для термоконтейнеров и фармхолодильников (+2...+8°C) с памятью на 16 000 значений и водонепроницаемостью IP65.",
    url: "https://azia-test.com/catalog/pharma/testo-174t",
    source: "Testo Cold Chain (AZIA-TEST)",
    measurementParameters: [
      { parameter: "Температура", range: "-30 ... +70 °C", accuracy: "±0.5 °C" },
      { parameter: "Память", range: "16 000 значений", accuracy: "Энергонезависимая" },
    ],
    keyFeatures: [
      "Класс защиты IP65 и компактные габариты для размещения непосредственно внутри фармацевтической упаковки.",
      "Выгрузка данных через стандартный USB-интерфейс с формированием отчетов в формате PDF/Excel.",
      "Соответствие стандарту EN 12830 для транспортировки и хранения термолабильных лекарств.",
    ],
    certifications: ["EN 12830 (Холодовая цепь)", "Внесен в Госреестр СИ РК", "Сертификат калибровки"],
    officialDistributorCta: "ТОО «AZIA-TEST» — прямые поставки поверенных логгеров Testo 174T для фармдистрибьюторов Казахстана.",
  },
  "883": {
    model: "Testo 883",
    category: "thermal",
    title: "Профессиональный тепловизор Testo 883 для энергоаудита и теплового контроля чистых помещений",
    summary: "ИК-разрешение 320x240 (с SuperResolution 640x480), температурная чувствительность NETD < 40 мК и ручной фокус.",
    url: "https://azia-test.com/catalog/thermal/testo-883",
    source: "Testo Thermal Audit (AZIA-TEST)",
    measurementParameters: [
      { parameter: "Температурный диапазон", range: "-30 ... +650 °C", accuracy: "±2 °C / ±2% от изм. знач." },
      { parameter: "Тепловая чувствительность (NETD)", range: "< 40 мК (0.04 °C)", accuracy: "Высокая резкость" },
      { parameter: "ИК-матрица", range: "320 x 240 пикселей (SuperResolution: 640 x 480)", accuracy: "76 800 точек" },
    ],
    keyFeatures: [
      "Технология testo SiteRecognition автоматически распознает точку замера по QR-коду и сохраняет термограмму в нужный объект.",
      "Сменные объективы (стандартный и телеобъектив) для съемки как вблизи, так и на высоковольтных опорах.",
      "Беспроводное подключение к токоизмерительным клещам Testo 770-3 для интеграции электрических параметров в термограмму.",
    ],
    certifications: ["Госреестр СИ РК", "Сертификат соответствия ТР ТС"],
    officialDistributorCta: "Заказывайте тепловизор Testo 883 с официальной гарантией и госповеркой в ТОО «AZIA-TEST».",
  },
};

/**
 * Динамический определитель модели и RAG-обогатитель для оборудования Testo.
 */
export function resolveTestoDeviceGrounding(queryOrModel: string): TestoDeviceSpec {
  const cleanQuery = queryOrModel.toLowerCase();

  for (const [key, spec] of Object.entries(TESTO_OFFICIAL_CATALOG)) {
    if (cleanQuery.includes(key) || cleanQuery.includes(spec.model.toLowerCase())) {
      return spec;
    }
  }

  // Поиск по ключевым словам ниши
  if (cleanQuery.includes("saveris") || cleanQuery.includes("audit trail") || cleanQuery.includes("21 cfr")) {
    return TESTO_OFFICIAL_CATALOG["saveris"]!;
  }
  if (cleanQuery.includes("автоклав") || cleanQuery.includes("стерилиз") || cleanQuery.includes("190")) {
    return TESTO_OFFICIAL_CATALOG["190"]!;
  }
  if (cleanQuery.includes("холодов") || cleanQuery.includes("174") || cleanQuery.includes("gdp")) {
    return TESTO_OFFICIAL_CATALOG["174"]!;
  }
  if (cleanQuery.includes("котел") || cleanQuery.includes("горелк") || cleanQuery.includes("lambda") || cleanQuery.includes("300")) {
    return TESTO_OFFICIAL_CATALOG["300"]!;
  }
  if (cleanQuery.includes("течеискател") || cleanQuery.includes("утечк") || cleanQuery.includes("316") || cleanQuery.includes("atex")) {
    return TESTO_OFFICIAL_CATALOG["316"]!;
  }
  if (cleanQuery.includes("тепловизор") || cleanQuery.includes("883") || cleanQuery.includes("термограмм")) {
    return TESTO_OFFICIAL_CATALOG["883"]!;
  }

  // Дефолтный флагман для промышленных выбросов/газа
  return TESTO_OFFICIAL_CATALOG["350"]!;
}

/**
 * Формирует готовые RAG-батчи для LLM агента копирайтинга
 */
export function formatTestoDeviceBatches(spec: TestoDeviceSpec): string[] {
  const paramsText = spec.measurementParameters
    .map((p) => `${p.parameter}: ${p.range}${p.accuracy ? ` (погрешность ${p.accuracy})` : ""}`)
    .join("; ");

  return [
    `Модель прибора: ${spec.model}. Назначение: ${spec.summary}`,
    `Метрологические параметры: ${paramsText}`,
    `Ключевые инженерные преимущества: ${spec.keyFeatures.join(" ")}`,
    `Сертификация и соответствие: ${spec.certifications.join(", ")}. ${spec.officialDistributorCta}`,
  ];
}
