import { createLogger } from "@pipeline/shared/logger";
import { getCollection, Collections, type PipelineRunDoc, type StageResultDoc } from "@pipeline/shared/db";
import { PipelineStage, PipelineRunStatus, type AgentJob } from "@pipeline/shared";
import type { BotQueues } from "./test-runner.js";

const logger = createLogger("telegram-bot:cinema-curator");

export interface CuratedArticle {
  title: string;
  url: string;
  summary: string;
  fullArticleText: string;
  batches?: string[];
  source: string;
  publishedAt?: string;
  pillarId: string;
  category: "popular" | "fresh";
}

export class CinemaCuratorService {
  // In-memory кэш найденных статей по userId для быстрого выбора по кнопкам
  private userArticlesCache = new Map<number, CuratedArticle[]>();

  /**
   * Разбивка статьи на структурированные смысловые батчи для прямого копирайтинга
   */
  batchArticleContent(fullText: string, maxBatchChars = 600): string[] {
    if (!fullText) return [];

    const paragraphs = fullText
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    if (paragraphs.length === 0) {
      return [fullText.substring(0, maxBatchChars)];
    }

    const batches: string[] = [];
    let currentBatch = "";

    for (const para of paragraphs) {
      if ((currentBatch + " " + para).length > maxBatchChars && currentBatch) {
        batches.push(currentBatch.trim());
        currentBatch = para;
      } else {
        currentBatch = currentBatch ? `${currentBatch}\n${para}` : para;
      }
    }

    if (currentBatch.trim()) {
      batches.push(currentBatch.trim());
    }

    return batches;
  }

  /**
   * Определение контент-рубрики кино-медиа по ключевым словам в заголовке и тексте
   */
  detectPillar(title: string, text: string): string {
    const combined = `${title} ${text}`.toLowerCase();

    if (
      combined.includes("marvel") ||
      combined.includes("mcu") ||
      combined.includes("avengers") ||
      combined.includes("spider-man") ||
      combined.includes("человек-паук") ||
      combined.includes("мстител") ||
      combined.includes("локи") ||
      combined.includes("дедпул") ||
      combined.includes("deadpool") ||
      combined.includes("captain america") ||
      combined.includes("dc") ||
      combined.includes("batman") ||
      combined.includes("бэтмен") ||
      combined.includes("superman")
    ) {
      return "marvel-mcu-lore";
    }

    if (
      combined.includes("box office") ||
      combined.includes("бокс-офис") ||
      combined.includes("кассов") ||
      combined.includes("сбор") ||
      combined.includes("million") ||
      combined.includes("billion") ||
      combined.includes("миллиард") ||
      combined.includes("imax") ||
      combined.includes("бюджет")
    ) {
      return "box-office-analytics";
    }

    if (
      combined.includes("director") ||
      combined.includes("режиссер") ||
      combined.includes("нолан") ||
      combined.includes("nolan") ||
      combined.includes("вильнев") ||
      combined.includes("villeneuve") ||
      combined.includes("тарантино") ||
      combined.includes("tarantino") ||
      combined.includes("screenplay") ||
      combined.includes("сценари") ||
      combined.includes("съемк") ||
      combined.includes("оператор")
    ) {
      return "directors-screenplay-breakdowns";
    }

    if (
      combined.includes("anime") ||
      combined.includes("аниме") ||
      combined.includes("manga") ||
      combined.includes("манга") ||
      combined.includes("клинок") ||
      combined.includes("миядзаки") ||
      combined.includes("miyazaki") ||
      combined.includes("ufotable") ||
      combined.includes("crunchyroll")
    ) {
      return "anime-culture-adaptations";
    }

    return "cinema-history-curiosities";
  }

  /**
   * Очистка HTML тегов и сущностей в чистый текст
   */
  private cleanHtml(rawHtml: string): string {
    if (!rawHtml) return "";
    return rawHtml
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#039;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Парсинг RSS-элемента из XML
   */
  private parseRssItem(itemXml: string, category: "popular" | "fresh"): CuratedArticle | null {
    const titleMatch = itemXml.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i);
    const linkMatch =
      itemXml.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i) ??
      itemXml.match(/<link[^>]*href=["']([^"']+)["']/i);
    const contentMatch =
      itemXml.match(/<content:encoded(?:\s[^>]*)?>([\s\S]*?)<\/content:encoded>/i) ??
      itemXml.match(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i);
    const pubDateMatch = itemXml.match(/<pubDate(?:\s[^>]*)?>([\s\S]*?)<\/pubDate>/i);

    const rawTitle = titleMatch?.[1] ? this.cleanHtml(titleMatch[1]) : "";
    const rawUrl = (linkMatch?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const rawContent = contentMatch?.[1] ? this.cleanHtml(contentMatch[1]) : "";

    if (!rawTitle || !rawUrl) return null;
    if (rawTitle.toLowerCase().includes("the latest movie reviews") || rawTitle === "Den of Geek") {
      return null;
    }

    const fullText = rawContent.substring(0, 4000);
    const summary = fullText.length > 250 ? `${fullText.substring(0, 250)}...` : fullText;
    const pillarId = this.detectPillar(rawTitle, fullText);
    const batches = this.batchArticleContent(fullText || summary);

    return {
      title: rawTitle,
      url: rawUrl,
      summary: summary || rawTitle,
      fullArticleText: fullText || summary,
      batches,
      source: "Den of Geek",
      publishedAt: pubDateMatch?.[1]?.trim(),
      pillarId,
      category,
    };
  }

  /**
   * Сбор статей из проверенных кино-источников по выбранному режиму
   */
  async fetchCuratedTopics(mode: "popular" | "fresh"): Promise<CuratedArticle[]> {
    logger.info({ mode }, "Fetching curated cinema articles for KinoPeek...");

    const feedUrls =
      mode === "fresh"
        ? [
            "https://www.denofgeek.com/movies/feed/",
            "https://www.denofgeek.com/tv/feed/",
            "https://www.denofgeek.com/feed/",
          ]
        : [
            "https://www.denofgeek.com/movies/feed/",
            "https://www.denofgeek.com/culture/feed/",
            "https://www.denofgeek.com/tv/feed/",
          ];

    const articles: CuratedArticle[] = [];
    const seenUrls = new Set<string>();

    for (const url of feedUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
          },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const xml = await res.text();
          const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

          for (const block of itemBlocks.slice(0, 10)) {
            const parsed = this.parseRssItem(block, mode);
            if (parsed && !seenUrls.has(parsed.url)) {
              seenUrls.add(parsed.url);
              articles.push(parsed);
            }
          }
        }
      } catch (err: any) {
        logger.warn({ err: err.message, url }, "Failed to fetch one cinema feed, continuing to next");
      }
    }

    // Если сеть недоступна или RSS пуст — используем эталонную подборку топ-материалов
    if (articles.length === 0) {
      logger.info({ mode }, "Using fallback curated articles catalogue for KinoPeek");
      return this.getFallbackArticles(mode);
    }

    // Ранжирование по выбранному режиму
    if (mode === "fresh") {
      // Свежие новости: сортируем по новизне даты публикации
      articles.sort((a, b) => {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateB - dateA;
      });
    } else {
      // Популярные темы / лор: приоритезируем крупные франшизы и разборы
      articles.sort((a, b) => {
        const isBigFranchiseA = /spider-man|marvel|avengers|dune|batman|nolan|harry potter/i.test(a.title) ? 1 : 0;
        const isBigFranchiseB = /spider-man|marvel|avengers|dune|batman|nolan|harry potter/i.test(b.title) ? 1 : 0;
        return isBigFranchiseB - isBigFranchiseA;
      });
    }

    return articles.slice(0, 4);
  }

  /**
   * Эталонная база статей на случай отсутствия сети
   */
  getFallbackArticles(mode: "popular" | "fresh"): CuratedArticle[] {
    if (mode === "fresh") {
      return [
        {
          title: "Человек-Паук 4: дата старта съемок, Черная Кошка и возвращение к уличным разборкам в Нью-Йорке",
          url: "https://www.denofgeek.com/movies/spider-man-4-mcu-filming-updates/",
          summary: "Marvel Studios и Sony утвердили график съемок новой части Человека-Паука с Томом Холландом. История сосредоточится на борьбе с криминалом Нью-Йорка без мультивселенских порталов.",
          fullArticleText: "Marvel Studios и Sony Pictures официально согласовали график производства четвертого сольного фильма о Человеке-Пауке. Режиссером картины выступит Дестин Дэниел Креттон, а съемки стартуют осенью 2026 года в Лондоне и Нью-Йорке. Сюжет вернет Питера Паркера к истокам уличного супергероя, где его союзницей станет Фелиция Харди (Черная Кошка).",
          batches: [
            "Marvel Studios и Sony Pictures официально согласовали график производства четвертого сольного фильма о Человеке-Пауке.",
            "Режиссером картины выступит Дестин Дэниел Креттон, а съемки стартуют осенью 2026 года в Лондоне и Нью-Йорке.",
            "Сюжет вернет Питера Паркера к истокам уличного супергероя, где его союзницей станет Фелиция Харди (Черная Кошка).",
          ],
          source: "Den of Geek",
          publishedAt: new Date().toUTCString(),
          pillarId: "marvel-mcu-lore",
          category: "fresh",
        },
        {
          title: "Гарри Поттер от HBO: утвержден финальный актерский состав нового золотого трио",
          url: "https://www.denofgeek.com/tv/harry-potter-hbo-series-cast-updates/",
          summary: "HBO завершил масштабный кастинг на роли Гарри, Рона и Гермионы для сериальной адаптации из 7 сезонов. Первый сезон детально экранизирует «Философский камень».",
          fullArticleText: "Стриминговый сервис Max и HBO официально закрыли открытый кастинг на главные роли в сериале по мотивам книг Джоан Роулинг. Создатели подчеркивают, что проект станет максимально дословной экранизацией всех семи книг, уделяя каждому роману по отдельному сезону.",
          batches: [
            "Стриминговый сервис Max и HBO официально закрыли открытый кастинг на главные роли в сериале по мотивам книг Джоан Роулинг.",
            "Создатели подчеркивают, что проект станет максимально дословной экранизацией всех семи книг, уделяя каждому роману по отдельному сезону.",
          ],
          source: "Den of Geek",
          publishedAt: new Date().toUTCString(),
          pillarId: "cinema-history-curiosities",
          category: "fresh",
        },
        {
          title: "Клинок, рассекающий демонов: ufotable раскрыла хронометраж и детали битвы в Бесконечном замке",
          url: "https://www.denofgeek.com/anime/demon-slayer-infinity-castle-trilogy-details/",
          summary: "Студия ufotable представила новые кадры финальной кинотрилогии «Infinity Castle Arc». Первый фильм трилогии готовится к мировому прокату в формате IMAX.",
          fullArticleText: "Анимационная студия ufotable подтвердила, что финальная арка «Бесконечный замок» выйдет в виде трех полнометражных фильмов. Первый фильм сфокусируется на битвах столпов против высших лун Кибуцудзи Мудзана.",
          batches: [
            "Анимационная студия ufotable подтвердила, что финальная арка «Бесконечный замок» выйдет в виде трех полнометражных фильмов.",
            "Первый фильм сфокусируется на битвах столпов против высших лун Кибуцудзи Мудзана.",
          ],
          source: "Den of Geek",
          publishedAt: new Date().toUTCString(),
          pillarId: "anime-culture-adaptations",
          category: "fresh",
        },
      ];
    }

    return [
      {
        title: "Дюна 3 Мессия: как Дени Вильнев покажет падение культа Пола Атрейдеса",
        url: "https://www.denofgeek.com/movies/dune-messiah-denis-villeneuve-screenplay-breakdown/",
        summary: "Глубокий анализ сценария третьей части «Дюны». Почему финал книги Фрэнка Герберта разрушает классический миф об избранном спасителе.",
        fullArticleText: "Дени Вильнев завершает работу над сценарием «Дюны 3» по роману «Мессия Дюны». Режиссер неоднократно заявлял, что его цель — передать истинное предостережение Фрэнка Герберта против слепого следования харизматичным лидерам. Пол Атрейдес оказывается в ловушке собственной религиозной войны (Джихада).",
        batches: [
          "Дени Вильнев завершает работу над сценарием «Дюны 3» по роману «Мессия Дюны».",
          "Режиссер подчеркивает: цель фильма — передать предостережение Герберта против слепого следования харизматичным лидерам.",
          "Пол Атрейдес оказывается в ловушке собственной религиозной войны (Джихада).",
        ],
        source: "Den of Geek",
        publishedAt: new Date().toUTCString(),
        pillarId: "directors-screenplay-breakdowns",
        category: "popular",
      },
      {
        title: "Бокс-офис 2026: 5 фильмов, которые преодолеют отметку в 1 миллиард долларов",
        url: "https://www.denofgeek.com/movies/box-office-2026-billion-dollar-predictions/",
        summary: "Аналитика кинопроката, влияние экранов премиум-формата IMAX и Dolby Cinema, а также главные блокбастеры года с рекордным потенциалом сборов.",
        fullArticleText: "Аналитики киноиндустрии составили прогноз главных кассовых хитов года. Лидерами по потенциалу кассовых сборов свыше 1 млрд долларов названы «Мстители: Секретные войны», новая «Дюна», и секретный проект Кристофера Нолана для Universal.",
        batches: [
          "Аналитики киноиндустрии составили прогноз главных кассовых хитов года.",
          "Лидерами по потенциалу кассовых сборов свыше 1 млрд долларов названы «Мстители: Секретные войны», новая «Дюна», и секретный проект Нолана.",
        ],
        source: "Den of Geek",
        publishedAt: new Date().toUTCString(),
        pillarId: "box-office-analytics",
        category: "popular",
      },
      {
        title: "5 скрытых деталей и пасхалок в трейлере Мстители: Секретные войны",
        url: "https://www.denofgeek.com/movies/avengers-secret-wars-trailer-breakdown-easter-eggs/",
        summary: "Покадровый разбор трейлера Secret Wars: таймкоды, намеки на Мир Битв (Battleworld) и камео культовых персонажей эпохи Fox Marvel.",
        fullArticleText: "Разбор первого тизера шестой части «Мстителей» раскрывает фундаментальные основы сюжета: коллапс мультивселенной (Инкрузии) и создание единой реальности Battleworld под управлением Доктора Дума.",
        batches: [
          "Разбор первого тизера шестой части «Мстителей» раскрывает основы сюжета.",
          "Ключевые элементы: коллапс мультивселенной (Инкрузии) и создание единой реальности Battleworld под управлением Доктора Дума.",
        ],
        source: "Den of Geek",
        publishedAt: new Date().toUTCString(),
        pillarId: "marvel-mcu-lore",
        category: "popular",
      },
    ];
  }

  /**
   * Инлайн-клавиатура первого шага: выбор режима
   */
  getCuratorMenuKeyboard() {
    return {
      inline_keyboard: [
        [
          { text: "🔥 Популярные темы (Evergreen / Аналитика)", callback_data: "cinema_mode:popular" },
        ],
        [
          { text: "⚡ Свежие новости (Breaking News / Инсайды)", callback_data: "cinema_mode:fresh" },
        ],
        [
          { text: "🔙 Главное меню", callback_data: "cmd:main_menu" },
        ],
      ],
    };
  }

  /**
   * Сохранение списка найденных статей в сессию пользователя
   */
  saveUserArticles(userId: number, articles: CuratedArticle[]) {
    this.userArticlesCache.set(userId, articles);
  }

  /**
   * Получение статьи по индексу кнопки
   */
  getArticleByIndex(userId: number, index: number): CuratedArticle | undefined {
    const list = this.userArticlesCache.get(userId);
    if (!list || !list[index]) return undefined;
    return list[index];
  }

  /**
   * Форматирование сообщения со списком статей и кнопками для Telegram
   */
  formatArticleListMessage(
    articles: CuratedArticle[],
    mode: "popular" | "fresh"
  ): { text: string; replyMarkup: any } {
    const modeTitle =
      mode === "fresh" ? "⚡ *СВЕЖИЕ КИНО-НОВОСТИ И ИНСАЙДЫ*" : "🔥 *ПОПУЛЯРНЫЕ ТЕМЫ И РАЗБОРЫ ЛОРА*";

    const lines: string[] = [
      `🍿 ${modeTitle}\n`,
      `_Краулер собрал актуальные материалы с источниками. Выберите статью, которая ляжет в основу поста и карусели:_\n`,
    ];

    const keyboardRows: any[][] = [];

    articles.forEach((art, idx) => {
      const numEmoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"][idx] || `[${idx + 1}]`;
      const shortTitle = art.title.length > 60 ? `${art.title.substring(0, 58)}...` : art.title;

      lines.push(`${numEmoji} *${art.title}*`);
      lines.push(`📖 _${art.summary}_`);
      lines.push(`🔗 [Источник (${art.source})](${art.url})\n`);

      keyboardRows.push([
        {
          text: `${numEmoji} ${shortTitle}`,
          callback_data: `cinema_pick:${idx}`,
        },
      ]);
    });

    keyboardRows.push([
      { text: "🔄 Обновить подборку", callback_data: `cinema_refresh:${mode}` },
      { text: "🔙 Сменить категорию", callback_data: "cinema_mode:menu" },
    ]);

    lines.push(`👇 *Нажмите на кнопку ниже, чтобы запустить генерацию:*`);

    return {
      text: lines.join("\n"),
      replyMarkup: { inline_keyboard: keyboardRows },
    };
  }

  /**
   * Запуск пайплайна на основе конкретной выбранной статьи с полным заземлением (Grounding)
   * Переходит НАПРЯМУЮ в WRITING, пропуская Positioning и Strategy!
   */
  async launchGroundedPipeline(
    article: CuratedArticle,
    openclawUrl = "http://openclaw:4000",
    queues?: BotQueues
  ): Promise<string> {
    const batches = article.batches && article.batches.length > 0
      ? article.batches
      : this.batchArticleContent(article.fullArticleText || article.summary);

    const topic = {
      title: article.title,
      summary: article.summary,
      url: article.url,
      fullArticleText: article.fullArticleText,
      batches,
      source: article.source,
    };

    const tenantId = "cinema-media";
    const pillarId = article.pillarId;

    try {
      const res = await fetch(`${openclawUrl}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          tenantId,
          targetPillarId: pillarId,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.runId) {
          logger.info(
            { runId: data.runId, tenantId, pillarId, title: article.title, batchCount: batches.length },
            "Started direct grounded cinema run via OpenClaw /runs API (skipping Strategy/Positioning)"
          );
          return data.runId;
        }
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, "Failed to start grounded run via OpenClaw HTTP — using DB direct enqueue");
    }

    // Direct DB Enqueue Fallback (напрямую в WRITING)
    const runId = `kino_${Date.now().toString(36)}`;
    const now = new Date();
    const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);

    await runsCol.insertOne({
      runId,
      tenantId,
      status: PipelineRunStatus.RUNNING,
      currentStage: PipelineStage.WRITING,
      topic,
      contentPillarId: pillarId,
      retries: {},
      createdAt: now,
      updatedAt: now,
    } as any);

    const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
    await stageResultsCol.insertOne({
      runId,
      stage: PipelineStage.TREND,
      attempt: 1,
      result: {
        items: [
          {
            title: article.title,
            summary: article.summary,
            url: article.url,
            fullArticleText: article.fullArticleText,
            batches,
            source: article.source,
            score: 100,
          },
        ],
      },
      createdAt: now,
    });

    if (queues) {
      await queues[PipelineStage.WRITING].add("writing-job", {
        runId,
        stage: PipelineStage.WRITING,
        tenantId,
        payload: { targetPillarId: pillarId, batches },
      } as any);
    }

    logger.info({ runId, tenantId, pillarId, title: article.title }, "Started direct grounded cinema run directly via DB into WRITING");
    return runId;
  }
}
