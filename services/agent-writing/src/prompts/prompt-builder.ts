import type { IndustryProfile } from "@pipeline/shared/schemas";
import { formatFactsForPrompt, type RetrievableChunk } from "@pipeline/shared/ai";
import { getRubricWritingInstruction } from "./rubric-instructions.js";

export interface PromptBuilderParams {
  topic: { title: string; summary: string; url?: string; fullArticleText?: string; batches?: string[] };
  strategy: Record<string, any>;
  authorProfile: {
    topics: string[];
    forbidden_words: string[];
    cta_style: string;
    use_emoji: boolean;
    tone: string;
  };
  industryProfile?: IndustryProfile;
  tenantId: string;
  contentPillarId: string;
  retrievedFacts: RetrievableChunk[];
  verifiedSourcesBlock: string;
  fewShotText: string;
  extraInstructions?: string;
  isGithubShowcase: boolean;
}

export function buildWritingPrompts(params: PromptBuilderParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const {
    topic,
    strategy,
    authorProfile,
    industryProfile,
    tenantId,
    contentPillarId,
    retrievedFacts,
    verifiedSourcesBlock,
    fewShotText,
    extraInstructions,
    isGithubShowcase,
  } = params;

  const isNicheVertical = !!industryProfile && industryProfile.verticalName !== "software-development";
  const isTestoTenant = tenantId === "testo" || contentPillarId.startsWith("pharma-") || contentPillarId.startsWith("gas-");
  const isRussianTenant = isTestoTenant || tenantId === "cinema-media" || (industryProfile?.language?.includes("ru") ?? false);
  const isGasAnalyzerTopic =
    contentPillarId.startsWith("gas-") ||
    (!contentPillarId.startsWith("pharma-") &&
      /газоанализатор|выброс|пелтье|testo\s*350|testo\s*300|testo\s*340|testo\s*310|котельн|горелк/i.test(
        `${topic.title} ${topic.summary}`
      ));

  let styleRulesBlock = "";
  let complianceBlock = "";
  let glossaryBlock = "";
  let platformBlock = "";
  let platformLabel = "LinkedIn";
  let ctaInstruction = authorProfile.cta_style;
  let emojiInstruction = authorProfile.use_emoji
    ? "Use relevant emojis sparingly to make the text lively."
    : "Do NOT use emojis.";

  if (isNicheVertical && industryProfile) {
    const rules = industryProfile.contentStyleRules;
    const adaptation = industryProfile.platformAdaptation[0];
    platformLabel = adaptation?.platform === "instagram" ? "Instagram" : adaptation?.platform ?? "Instagram";

    emojiInstruction =
      rules.maxEmojis === 0
        ? "Do NOT use emojis. This is a strict formal B2B industry — emojis undermine credibility."
        : `Use at most ${rules.maxEmojis} emoji(s) total, and only where it adds genuine clarity, not decoration.`;

    ctaInstruction =
      rules.hashtagStrategy === "none"
        ? "Do not add hashtags."
        : `Add approximately ${adaptation?.hashtagCount ?? 8} relevant hashtags at the end, mixing broad industry tags and specific niche tags.`;

    const ctaStyleInstruction =
      adaptation?.ctaStyle === "soft"
        ? 'Use a SOFT call to action (e.g. "Save this post", "More in bio") — never pushy sales language like "Buy now".'
        : "Use a direct call to action.";

    styleRulesBlock = `\nFormality level: ${rules.formalityLevel}. ${ctaStyleInstruction}
${rules.forbiddenPhrases.length > 0 ? `Additionally forbidden phrases (marketing clichés for this brand): ${rules.forbiddenPhrases.join(", ")}.` : ""}\n`;

    if (rules.requiredDisclaimers.length > 0) {
      complianceBlock = `\nMANDATORY DISCLAIMER(S): You MUST include the following disclaimer text verbatim somewhere in the post (naturally integrated, not just appended): ${rules.requiredDisclaimers.join(" ")}\n`;
    }

    if (industryProfile.complianceConfig.factCheckRequired) {
      if (retrievedFacts.length > 0) {
        complianceBlock += `\nCRITICAL FACTUAL ACCURACY REQUIREMENT: This is a regulated industry. Below are VERIFIED FACTS retrieved from the official spec database. If you state any numeric technical characteristic (measurement range, accuracy, certification, etc.), it MUST come from this list, cited close to verbatim. If a needed number is not in this list, write about the concept qualitatively instead of inventing a figure.

VERIFIED FACTS:
${formatFactsForPrompt(retrievedFacts)}
`;
      } else {
        complianceBlock += `\nCRITICAL FACTUAL ACCURACY REQUIREMENT: This is a regulated industry, and no verified fact sheet was found for this topic. NEVER invent, guess, or approximate specific numeric technical characteristics (measurement ranges, accuracy percentages, certification numbers, etc.). Write about the concept qualitatively instead of inventing any figure.\n`;
      }
    }

    if (industryProfile.glossary.length > 0) {
      let filteredGlossary = industryProfile.glossary;
      if (isGasAnalyzerTopic) {
        filteredGlossary = industryProfile.glossary.filter((g) => !/21\s*CFR|GxP|холодов|лиофилиз/i.test(g.term));
      } else if (contentPillarId.startsWith("pharma-")) {
        filteredGlossary = industryProfile.glossary.filter((g) => !/избытка\s*воздуха|Пельтье|qA|расширение\s*диапазона/i.test(g.term));
      }
      glossaryBlock = `\nINDUSTRY GLOSSARY (use these terms precisely):
${filteredGlossary.map((g) => `- "${g.term}"${g.definition ? `: ${g.definition}` : ""}`).join("\n")}\n`;
    }

    if (adaptation) {
      platformBlock = `\nPlatform: ${platformLabel}. Maximum caption length: ~${adaptation.maxCaptionLength} characters — be concise, this is NOT a long-form LinkedIn article. Visual emphasis is ${adaptation.visualEmphasis} — the image/carousel carries most of the information, the caption should hook and complement it, not repeat it in full.\n`;
    }
  }

  let writerDomain = "";
  if (tenantId === "cinema-media") {
    writerDomain = "Ты — главный редактор и ведущий кинообозреватель медиа-портала KinoPeek Media. Ты создаешь захватывающий, подробный, вирусный и кинематографичный контент для русскоязычной аудитории (Telegram, Threads, VK).";
  } else if (isTestoTenant) {
    writerDomain = "Ты — профессиональный технический копирайтер и эксперт по промышленному оборудованию Testo. Ты пишешь экспертные технические статьи и посты на русском языке.";
  } else if (isNicheVertical) {
    writerDomain = `You are a professional social media copywriter specializing in B2B content for the "${industryProfile!.verticalName}" industry, writing for ${platformLabel}.`;
  } else {
    writerDomain = "You are a professional LinkedIn content writer specializing in tech/programming topics.";
  }

  const rubricWritingInstruction = getRubricWritingInstruction(contentPillarId);

  let languageInstruction = "";
  if (isTestoTenant) {
    let productValueProp = "In every post, you MUST explicitly demonstrate how Testo measurement equipment solves industry challenges.";
    if (contentPillarId.startsWith("pharma-")) {
      productValueProp =
        "In every post, you MUST explicitly demonstrate how Testo measurement equipment (Testo Saveris Pharma, Testo 190 T3/T4 CFR, Testo 174T, thermal imagers, data loggers) solves pharmaceutical compliance challenges (automating 21 CFR Part 11, preventing batch loss in cold chain, audit readiness).\nSTRICT PILLAR ISOLATION: Do NOT mention boilers, burner tuning, flue gases, NOx, CO, SO2, or boiler analyzers (Testo 300, Testo 350)!";
    } else if (isGasAnalyzerTopic) {
      productValueProp =
        "In every post, you MUST explicitly demonstrate how Testo Gas Analyzers (Testo 350, Testo 300, Testo 340, Testo 310 II, Testo 316) solve industrial emissions monitoring, boiler/burner tuning, Peltier gas sample preparation (+3°C), and gas safety in Kazakhstan.\nSTRICT PILLAR ISOLATION: Do NOT mention pharmaceuticals, biosensors, cleanroom GMP, or FDA 21 CFR Part 11!";
    } else {
      productValueProp =
        "In every post, you MUST explicitly demonstrate how Testo measurement equipment solves industry challenges. Do NOT mix boiler flue gas into pharmaceutical cleanrooms.";
    }
    languageInstruction = `\nCRITICAL LANGUAGE & TESTO BRAND REQUIREMENTS:
1. Language: The target audience for this portal (${tenantId}) is EXCLUSIVELY RUSSIAN-SPEAKING. You MUST write ALL fields ("text", "hook", "cta", and "ru_post") STRICTLY IN HIGH-QUALITY RUSSIAN. Do NOT write any English text.
2. Product Value Proposition: ${productValueProp}
3. STRICT TITLE & HOOK ACCURACY (NO HYBRID CHIMERAS):
- NEVER generate hybrid compound titles that pair an unrelated instrument with an unrelated standard (e.g. NEVER write "Testo 350: NFPA 70E...").
- The instrument in the hook, title, and body MUST strictly match the assigned pillar:
  * For gas leak detection: use Testo 316 (NOT Testo 350!).
  * For boiler tuning: use Testo 300 (NOT Testo 350!).
  * For industrial emissions: use Testo 350 or Testo 340.
  * For pharma cleanrooms: use Testo Saveris Pharma, Testo 190, or Testo 174T.`;
  } else if (tenantId === "cinema-media") {
    languageInstruction = `\nCRITICAL LANGUAGE & KINOPEEK BRAND REQUIREMENTS:
1. Language: The target audience for KinoPeek is Russian-speaking cinema, comic, MCU, and pop-culture fans. You MUST write ALL fields ("text", "hook", "cta", and "ru_post") STRICTLY IN HIGH-QUALITY RUSSIAN.
2. Niche Focus: You are writing pure entertainment and film media content (Marvel/MCU lore, easter eggs, box office records, director backstage, casting news, anime). NEVER mention industrial equipment, sensors, Testo, pharmaceutical compliance, or software code repositories!`;
  } else if (isRussianTenant) {
    languageInstruction = `\nLanguage: The target audience is Russian-speaking. You MUST write ALL fields ("text", "hook", "cta", and "ru_post") in natural, engaging Russian.`;
  } else {
    languageInstruction = `\nLanguage: Write "text" in English for LinkedIn, and provide "ru_post" in Russian.`;
  }

  let systemPrompt = "";
  if (isGithubShowcase) {
    systemPrompt = `You are a professional tech copywriter specializing in high-converting GitHub repository collections for software engineers.
Your task is to write a concise, highly engaging LinkedIn post featuring 3-4 trending open-source GitHub repositories.

STRICT FORMAT & LENGTH RULES:
1. Cover Title & Sub-caption (Slide 1):
   - Hook Title MUST follow a proven formula:
     * Productivity: "5 GitHub Repos That Will Save You 10+ Hours This Week"
     * Senior/Architecture: "7 Production-Ready Repos Senior Engineers Keep Quiet About"
     * Hidden Gems: "5 Underrated GitHub Repos You'll Wish You Found Sooner"
   - Sub-caption: Maximum 1 short sentence (under 90 characters, STRICTLY MAXIMUM 3 VISUAL LINES).
2. Repository Cards (Slides 2..N):
   - Title: MUST be strictly the Repository Name ONLY (e.g., "sqlfluff", "airllm", "bonsai").
   - Description: MUST be a rich, detailed 2 to 3 sentence paragraph (MUST BE 45 to 60 words, ~260-320 characters, EXACTLY 4 TO 5 VISUAL LINES). Explain: 1) What the project is, 2) Core capabilities & architecture, 3) Real developer productivity impact.
   - Do NOT use bullet arrows (→). Do NOT write multi-paragraph text blocks.
3. Tone & Words: Tone: ${authorProfile.tone}. Forbidden words: ${authorProfile.forbidden_words.join(", ")}.
${styleRulesBlock}${platformBlock}${verifiedSourcesBlock}${languageInstruction}
You must return a single, valid JSON object containing:
- "text": The complete text of the post.
- "hook": The first line (Hook) of the post.
- "cta": The final Call to Action string.

Output format:
{
  "text": "Full text of the post...",
  "hook": "Catchy first line...",
  "cta": "Engaging question at the end..."
}

Return ONLY valid raw JSON. Do NOT include markdown code blocks or conversational text.`;
  } else {
    const isTestoGas = isTestoTenant && (contentPillarId.startsWith("gas-") || isGasAnalyzerTopic);

    const exampleHook =
      tenantId === "cinema-media"
        ? "Том Холланд и «Spider-Man: Brand New Day» на обложке юбилейного выпуска"
        : isTestoTenant
          ? isTestoGas
            ? "⚡ Газоанализатор Testo 350: мониторинг выбросов и РНИ котлов"
            : "⚡ Требования GxP на фармпроизводстве: автоматизация 21 CFR Part 11"
          : "⚡ Архитектура очередей: BullMQ vs RabbitMQ в high-load Node.js";

    const exampleText =
      tenantId === "cinema-media"
        ? "Том Холланд и «Spider-Man: Brand New Day» на обложке юбилейного выпуска Den of Geek к SDCC\\n\\nИздание подготовило специальный 10-й печатный номер, приуроченный к главному гик-событию года — San Diego Comic-Con.\\n\\nЧто ждёт читателей внутри:\\n• Эксклюзив по новому фильму: Первые детали «Spider-Man: Brand New Day» от Тома Холланда и режиссёра Дестина Дэниела Креттона («Шан-Чи»).\\n\\n• Интервью с кастом: Комментарии Зендаи и Джона Бернтала, который возвращается к роли Карателя.\\n\\n• Коллекционный мерч: Лимитированная обложка Gold Edition (тираж строго 100 копий) и голографическая версия Holo Edition для подписчиков.\\n\\n«Мы специально взяли паузу после „Нет пути домой“, чтобы персонажи повзрослели вместе с нами», — поделился Холланд.\\n\\nДжон Бернтал добавил, что зрителей ждёт более приземлённая и мрачная история о поиске себя в новом мире.\\n\\nКакой вариант обложки выбрали бы для коллекции — строгий золотой или голографический? И чего больше всего ждёте от возвращения Паучка? Делитесь в комментариях! 👇"
        : isTestoTenant
          ? isTestoGas
            ? "⚡ Газоанализатор Testo 350: мониторинг выбросов и наладка котлов\\n\\nПри проведении режимно-наладочных испытаний (РНИ) и экологического контроля на ТЭЦ и котельных ключевой задачей является измерение NOx, CO, SO2 с высокой точностью.\\n\\nЧто обеспечивает надежность Testo 350:\\n• Подготовка пробы с элементом Пельтье: Охлаждает дымовые газы до +3°C, предотвращая потерю водорастворимого NO2 и SO2.\\n\\n• 40-кратное разбавление пробы: Позволяет измерять пиковые концентрации CO до 40 000 ppm без риска отравления сенсоров.\\n\\n• Беспроводной управляющий блок: Передает данные на расстояние до 100 метров, защищая инженера от высоких температур.\\n\\nОфициальный дистрибьютор Testo в Казахстане — ТОО «AZIA-TEST» обеспечивает первичную государственную поверку и сервисное обслуживание.\\n\\nКакие задачи по контролю выбросов или наладке горелок стоят на вашем объекте в этом сезоне? Задавайте вопросы в комментариях! 👇"
            : "⚡ Требования GxP на фармпроизводстве: автоматизация 21 CFR Part 11\\n\\nКонтроль микроклимата и температуры на фармацевтических складах и в чистых помещениях напрямую влияет на сохранность дорогостоящих препаратов.\\n\\nКлючевые преимущества системы Testo Saveris Pharma:\\n• Непрерывный мониторинг и Audit Trail: Автоматическая фиксация температуры и влажности без возможности ручной правки данных.\\n\\n• Соответствие 21 CFR Part 11 и GxP: Электронные подписи, разграничение прав доступа и мгновенные SMS/Email тревоги при выходе параметров из диапазона.\\n\\n• Валидационный пакет IQ/OQ: Квалификация системы инженерами официального дистрибьютора ТОО «AZIA-TEST».\\n\\n«Автоматизация валидации снижает риск брака серий вакцин и термолабильных лекарств на 99%».\\n\\nКак у вас организован аудит микроклимата в чистых зонах? Делитесь в комментариях! 👇"
          : "⚡ Архитектура очередей: BullMQ vs RabbitMQ в high-load Node.js\\n\\nПри проектировании микросервисов с асинхронной фоновой обработкой инженеры часто выбирают между связкой Redis+BullMQ и брокером RabbitMQ.\\n\\nКлючевые инженерные выводы и бенчмарки:\\n• Задержка и пропускная способность: BullMQ на базе Redis обрабатывает до 25 000 job/sec на одном инстансе с задержкой < 2ms, идеально подходя для распределенных пайплайнов с частыми переходами состояний.\\n\\n• Event-Driven Autoscaling (KEDA): Очереди BullMQ бесшовно интегрируются с Kubernetes KEDA, позволяя масштабировать воркеры в 0 (Scale-to-Zero) при отсутствии нагрузки.\\n\\n• Персистентность и надежность: RabbitMQ выигрывает при сложных топологиях маршрутизации (Exchange, Topic routing), тогда как BullMQ превосходит в простоте интеграции с TypeScript-экосистемой.\\n\\n«Главное преимущество BullMQ — возможность контролировать ретраи, задержки (delay) и прогресс джобы прямо из Node.js кода без поднятия тяжелой инфраструктуры».\\n\\nКакой стек очередей задач вы используете в своих продакшн-проектах? Делитесь опытом в комментариях! 👇";

    const exampleHashtags =
      tenantId === "cinema-media"
        ? '["#Marvel", "#MCU", "#SpiderMan", "#TomHolland", "#DenOfGeek", "#SDCC", "#Кино"]'
        : isTestoTenant
          ? isTestoGas
            ? '["#Testo350", "#газоанализаторы", "#котлы", "#ТЭЦ", "#экология", "#AZIATEST", "#Казахстан"]'
            : '["#TestoSaveris", "#GxP", "#21CFRPart11", "#фармацевтика", "#валидация", "#чистыепомещения"]'
          : '["#TypeScript", "#NodeJS", "#Architecture", "#SystemDesign", "#BullMQ", "#Redis", "#Backend"]';

    systemPrompt = `${writerDomain}
Твоя задача — написать полноценный, глубокий, увлекательный и длинный пост для социальных сетей (Telegram / Threads / VK) на основе предоставленной статьи и стратегии.

КРИТИЧЕСКИЕ ТРЕБОВАНИЯ К ПОСТУ:
1. ЯЗЫК: 100% СТРОГО НА РУССКОМ ЯЗЫКЕ. Ни одного предложения на английском!
2. ОБЪЕМ И СТРУКТУРА: Пост должен быть ПОЛНОЦЕННЫМ и ДЛИННЫМ (150-250 слов, 1000-1500 символов).
   СТРОГО СЛЕДУЙ ЭТОМУ ШАБЛОНУ:
   - Заголовок (Hook) без лишних кавычек в первой строке.
   - Вводный лид (1-2 предложения с контекстом новости).
   - Структурированный блок ключевых деталей статьи с буллетами (• Пункт 1: подробности... • Пункт 2: подробности...).
   - Прямая речь / цитаты персонажей, актеров или создателей, а также интересные подробности из статьи.
   - Вовлекающий интерактивный вопрос читателям (Call to Action) со смайликом 👇.
   - Хэштеги в конце.
3. ТОН: ${authorProfile.tone}.
4. ЗАПРЕЩЕННЫЕ СЛОВА: ${authorProfile.forbidden_words.length > 0 ? authorProfile.forbidden_words.join(", ") : "нет"}.
${styleRulesBlock}${complianceBlock}${glossaryBlock}${platformBlock}${rubricWritingInstruction}${verifiedSourcesBlock}${fewShotText}${languageInstruction}

Ты обязан вернуть один валидный JSON объект:
{
  "text": "Полный текст поста строго на русском языке по указанной выше структуре...",
  "hook": "Главный заголовок поста...",
  "cta": "Вовлекающий вопрос в конце поста...",
  "ru_post": {
    "hook": "${exampleHook}",
    "text": "${exampleText}",
    "hashtags": ${exampleHashtags}
  }
}

Верни ТОЛЬКО валидный JSON без markdown-оберток и комментариев.`;
  }

  let batchesBlock = "";
  if (Array.isArray(topic.batches) && topic.batches.length > 0) {
    batchesBlock = `\n[ДЕТАЛИ И ФАКТЫ ИЗ СТАТЬИ / FACT CHUNKS]:\n${topic.batches.map((b: string, i: number) => `• [Факт ${i + 1}]: ${b}`).join("\n\n")}\n\nВАЖНО: Опирайся строго на факты из статьи выше. Раскрой всех упомянутых героев, фильмы, даты и цитаты подробно на русском языке!\n`;
  } else if (topic.fullArticleText) {
    batchesBlock = `\n[ПОЛНЫЙ ТЕКСТ СТАТЬИ]:\n${topic.fullArticleText}\n\nВАЖНО: Опирайся строго на текст статьи выше. Раскрой все детали подробно на русском языке!\n`;
  }

  let userPrompt = "";
  if (isRussianTenant) {
    userPrompt = `Входные данные для написания полноценного поста:

---
Заголовок темы / статьи: "${topic.title}"
Краткое описание: "${topic.summary}"
${topic.url ? `Источник: "${topic.url}"` : ""}${batchesBlock}

Формат: "${strategy.format || "analytical-deep-dive"}"
Целевая аудитория: "${strategy.target_audience || (tenantId === "cinema-media" ? "Любители кино, фанаты поп-культуры и сериалов" : "Специалисты отрасли")}"
Основная идея: "${strategy.core_idea || topic.summary}"
---

${extraInstructions ? `Указания редактора: ${extraInstructions}` : ""}

ЗАДАЧА: Напиши ПОЛНЫЙ, ДЛИННЫЙ, РАЗВЕРНУТЫЙ пост (150-250 слов) строго на русском языке по структуре (Заголовок -> Лид -> Буллеты с подробностями -> Цитаты/детали -> Вопрос в конце -> Хэштеги). Верни JSON:`;
  } else {
    userPrompt = `Here are the inputs for the post:

---
Topic:
Title: "${topic.title}"
Summary: "${topic.summary}"
${topic.url ? `Source URL: "${topic.url}"` : ""}${batchesBlock}

Strategy:
Format: "${strategy.format || "analytical-deep-dive"}"
Target Audience: "${strategy.target_audience || "Industry professionals"}"
Core Idea: "${strategy.core_idea || topic.summary}"
---

${extraInstructions ? `Additional guidance from Editor: ${extraInstructions}` : ""}

Please write the post and return the JSON.`;
  }

  return { systemPrompt, userPrompt };
}
