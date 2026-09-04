import { createLogger } from "@pipeline/shared/logger";
import type { TelegramApiService } from "../services/telegram-api.service.js";
import type { TestRunnerService } from "../services/test-runner.js";
import type { CinemaCuratorService } from "../services/cinema-curator.js";
import type { BotQueues } from "../types/bot.types.js";

const logger = createLogger("telegram-bot:trends-controller");

export interface TrendTopicInfo {
  title: string;
  summary: string;
  source: string;
  pillar: string;
  url: string;
  fullArticleText: string;
}

export const TREND_TOPICS: Record<string, TrendTopicInfo> = {
  spider_man_4: {
    title: "Человек-Паук 4: Съемки, каст и связь с Marvel Cinematic Universe",
    summary: "Подробности производства Spider-Man 4, участие Тома Холланда, режиссерское видение и сюжетные связи с мультивселенной MCU.",
    source: "Variety / Deadline",
    pillar: "marvel-mcu-lore",
    url: "https://variety.com/spider-man-4-mcu-update",
    fullArticleText: "Spider-Man 4 moves into active pre-production with Tom Holland returning as Peter Parker. Marvel Studios and Sony are aligning the narrative with upcoming Avengers storylines, exploring a street-level tone combined with multiverse consequences.",
  },
  harry_potter: {
    title: "Гарри Поттер: Кастинг трио HBO и новая адаптация книг Джоан Роулинг",
    summary: "HBO запускает открытый кастинг на роли Гарри, Рона и Гермионы. Формат сериала и 10-летний план по детальной экранизации каждого тома.",
    source: "The Hollywood Reporter",
    pillar: "cinema-history-analysis",
    url: "https://hollywoodreporter.com/hbo-harry-potter-casting",
    fullArticleText: "HBO has officially launched casting calls for the Harry Potter TV series adaptation, looking for fresh talent to portray the iconic golden trio. The show aims to faithfully explore books chapters omitted from the original film series across a decade-long television run.",
  },
  dune_3: {
    title: "Дюна 3: Мессия Вильнева — сюжетные акценты и финал трилогии",
    summary: "Дени Вильнев завершает сценарий 'Мессии Дюны'. Чего ожидать от финала трагической истории Пола Атрейдеса на Арракисе.",
    source: "Empire Magazine",
    pillar: "cinema-history-analysis",
    url: "https://empireonline.com/dune-messiah-denis-villeneuve-update",
    fullArticleText: "Denis Villeneuve has confirmed progress on the Dune: Messiah screenplay, closing out Paul Atreides' arc on Arrakis. The narrative examines religious fanaticism, empire politics, and the grim consequences of prophetic power.",
  },
  demon_slayer: {
    title: "Клинок, рассекающий демонов: Финал трилогии Бесконечной крепости от ufotable",
    summary: "Анонс финальной трилогии полнометражных фильмов по Demon Slayer. Передовая графика студии ufotable и ожидания мирового проката.",
    source: "Crunchyroll News",
    pillar: "box-office-culture",
    url: "https://crunchyroll.com/demon-slayer-infinity-castle-trilogy",
    fullArticleText: "Ufotable announces the Infinity Castle arc will be released as an epic cinematic trilogy. Following the monumental global success of Mugen Train, Sony Pictures and Crunchyroll are preparing for an unprecedented worldwide theatrical rollout.",
  },
  box_office_1b: {
    title: "Мировой бокс-офис: Феномен сборов $1 млрд в эпоху IMAX",
    summary: "Анализ кассовых рекордов современных блокбастеров, влияние премиальных форматов IMAX на возрождение кинотеатрального проката.",
    source: "Box Office Mojo",
    pillar: "box-office-culture",
    url: "https://boxofficemojo.com/imax-billion-dollar-era-analysis",
    fullArticleText: "The theatrical landscape in 2026 highlights the critical importance of IMAX and PLF formats. Audiences increasingly seek event-level cinema experiences, driving top-tier blockbuster releases past the elusive $1 billion milestone.",
  },
};

export class TrendsController {
  constructor(
    private telegramApi: TelegramApiService,
    private testRunner: TestRunnerService,
    private cinemaCurator: CinemaCuratorService,
    private queues: BotQueues,
    private openclawUrl: string
  ) {}

  async showTrendsMenu(chatId: number | string): Promise<void> {
    const trendsKeyboard = {
      inline_keyboard: [
        [
          { text: "🕷 Человек-Паук 4: Съемки и каст", callback_data: "trend_pick:spider_man_4" },
        ],
        [
          { text: "⚡ Гарри Поттер: Кастинг трио HBO", callback_data: "trend_pick:harry_potter" },
        ],
        [
          { text: "🏜 Дюна 3: Мессия Вильнева", callback_data: "trend_pick:dune_3" },
        ],
        [
          { text: "🌸 Клинок демонов: Финал ufotable", callback_data: "trend_pick:demon_slayer" },
        ],
        [
          { text: "📊 Бокс-офис: $1 млрд в IMAX", callback_data: "trend_pick:box_office_1b" },
        ],
        [
          { text: "🔙 Главное меню", callback_data: "cmd:main_menu" },
        ],
      ],
    };

    const trendsText =
      `🔥 *Топ горячих трендов кино сегодня:*\n\n` +
      `Нажмите на любой тренд ниже, чтобы сгенерировать по нему готовый пост и карусель, либо напишите свою тему: \`/post_cinema <Тема>\``;

    await this.telegramApi.sendMessage(chatId, trendsText, trendsKeyboard);
  }

  async handleTrendPick(
    chatId: number | string,
    userId: number,
    trendKey: string,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🚀 Запуск кино-пайплайна...");
    }

    const topic = TREND_TOPICS[trendKey];
    if (!topic) {
      await this.telegramApi.sendMessage(
        chatId,
        `⚠️ Тренд \`${trendKey}\` не найден. Пожалуйста, выберите тему из списка /trends.`
      );
      return;
    }

    logger.info({ trendKey, topicTitle: topic.title, userId }, "Launching trend pipeline");

    try {
      const runId = await this.cinemaCurator.launchGroundedPipeline(
        {
          title: topic.title,
          summary: topic.summary,
          url: topic.url,
          fullArticleText: topic.fullArticleText,
          source: topic.source,
          category: "popular",
        },
        this.openclawUrl,
        this.queues
      );

      await this.telegramApi.sendMessage(
        chatId,
        `🚀 *Запущен кино-пайплайн (KinoPeek)*: \`${runId}\`\n\n` +
        `🎬 *Тема:* ${topic.title}\n` +
        `📖 *Источник:* ${topic.source}\n` +
        `🏷 *Рубрика:* \`${topic.pillar}\`\n\n` +
        `⏳ Карточка и карусель генерируются и поступят на модерацию в этот чат.`
      );
    } catch (err) {
      logger.error({ err, trendKey }, "Failed to launch trend pipeline");
      await this.telegramApi.sendMessage(
        chatId,
        `❌ Ошибка при запуске пайплайна для темы "${topic.title}". Попробуйте еще раз.`
      );
    }
  }
}
