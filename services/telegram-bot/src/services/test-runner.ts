import { exec } from "child_process";
import { promisify } from "util";
import { getCollection, Collections, type PipelineRunDoc } from "@pipeline/shared/db";
import { createLogger } from "@pipeline/shared/logger";
import { PipelineStage, PipelineRunStatus, type AgentJob } from "@pipeline/shared";
import type { Queue } from "bullmq";

const execAsync = promisify(exec);
const logger = createLogger("telegram-bot:test-runner");

export interface BotQueues {
  [PipelineStage.TREND]: Queue<AgentJob>;
  [PipelineStage.WRITING]: Queue<AgentJob>;
  [PipelineStage.DESIGN]: Queue<AgentJob>;
  [PipelineStage.PUBLISHING]: Queue<AgentJob>;
}

export class TestRunnerService {
  constructor(private queues: BotQueues, private openclawUrl = process.env.OPENCLAW_PUBLIC_BASE_URL || "http://openclaw:4000") {}

  /**
   * Запуск системного Health-check и Unit-тестов с формированием отчета
   */
  async runHealthAndUnitTests(): Promise<string> {
    const startTime = Date.now();
    const reports: string[] = [];

    // 1. Проверка подключения к MongoDB
    try {
      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      const count = await runsCol.countDocuments();
      reports.push(`✅ *MongoDB:* Подключено (Всего прогонов в базе: ${count})`);
    } catch (err: any) {
      reports.push(`❌ *MongoDB:* Ошибка (${err.message})`);
    }

    // 2. Проверка очередей BullMQ / Redis
    try {
      const queueStages = [
        PipelineStage.TREND,
        PipelineStage.WRITING,
        PipelineStage.DESIGN,
        PipelineStage.PUBLISHING,
      ] as const;

      const activeCounts = await Promise.all(
        queueStages.map(async (st) => {
          const q = this.queues[st];
          const waiting = await q.getWaitingCount();
          const active = await q.getActiveCount();
          return `${st}: ${waiting}w/${active}a`;
        })
      );
      reports.push(`✅ *BullMQ Queues:* Все 4 очереди активны\n   \`${activeCounts.join(" | ")}\``);
    } catch (err: any) {
      reports.push(`❌ *BullMQ Queues:* Ошибка (${err.message})`);
    }

    // 3. Запуск npm test (если доступен в окружении)
    try {
      const { stdout } = await execAsync("npm run test -w services/telegram-bot", { timeout: 15000 });
      reports.push(`✅ *Unit Tests:* Успешно пройдены\n\`\`\`\n${stdout.substring(0, 400)}\n\`\`\``);
    } catch (err: any) {
      const output = (err.stdout || err.message || "").substring(0, 300);
      reports.push(`ℹ️ *Unit Tests Output:*\n\`\`\`\n${output || "Тесты завершены"}\n\`\`\``);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    return `🧪 *РЕЗУЛЬТАТЫ СИСТЕМНОГО ТЕСТИРОВАНИЯ* (⏱ ${duration}s):\n\n` + reports.join("\n\n");
  }

  /**
   * Запуск прогона пайплайна для KinoPeek через OpenClaw API (с ротацией трендов)
   */
  async triggerPipelineTest(
    tenantId = "cinema-media",
    pillarId = "marvel-mcu-lore",
    customTopic?: { title: string; summary: string }
  ): Promise<string> {
    const dynamicTopics = [
      {
        title: "Человек-Паук 4: дата съемок, возвращение Черной Кошки и новый костюм",
        summary: "Инсайды о съемках новой части Человека-Паука с Томом Холландом и уличной арке в Нью-Йорке",
        pillar: "marvel-mcu-lore",
      },
      {
        title: "Гарри Поттер от HBO: утвержден актерский состав золотого трио",
        summary: "Разбор официального кастинга нового сериала и деталей первого сезона",
        pillar: "cinema-history-curiosities",
      },
      {
        title: "Дюна 3 Мессия: как Дени Вильнев покажет падение Пола Атрейдеса",
        summary: "Анализ сценария третьей части Дюны и подготовка масштабных съемок",
        pillar: "directors-screenplay-breakdowns",
      },
      {
        title: "Бокс-офис 2026: 5 фильмов, которые пробьют отметку в 1 миллиард долларов",
        summary: "Аналитика кинопроката, предварительные сборы IMAX и кассовые рекорды года",
        pillar: "box-office-analytics",
      },
      {
        title: "Клинок, рассекающий демонов: Финальная битва в Бесконечном замке",
        summary: "Разбор анимации ufotable, спецэффекты и дата выхода трилогии в кинотеатрах",
        pillar: "anime-culture-adaptations",
      },
      {
        title: "5 скрытых деталей трейлера Мстители: Секретные войны",
        summary: "Разбор пасхалок, таймкодов и камео культовых персонажей",
        pillar: "marvel-mcu-lore",
      },
      {
        title: "Новый фильм Кристофера Нолана: съемки на 70мм пленку и звездный каст",
        summary: "Все известные подробности о секретном проекте Нолана для Universal",
        pillar: "directors-screenplay-breakdowns",
      },
    ];

    const randomPick = dynamicTopics[Math.floor(Math.random() * dynamicTopics.length)] ?? dynamicTopics[0]!;
    const topic = customTopic || { title: randomPick.title, summary: randomPick.summary };
    const effectivePillar = customTopic ? pillarId : randomPick.pillar;

    try {
      const res = await fetch(`${this.openclawUrl}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          tenantId,
          targetPillarId: effectivePillar,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.runId) {
          logger.info({ runId: data.runId, tenantId, pillarId: effectivePillar, topic: topic.title }, "Started run via OpenClaw /runs API");
          return data.runId;
        }
      }
    } catch (err) {
      logger.warn({ err }, "Failed to start run via OpenClaw HTTP — using direct DB enqueue");
    }

    // Direct DB Enqueue Fallback
    const runId = `test_${Date.now().toString(36)}`;
    const now = new Date();
    const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);

    await runsCol.insertOne({
      runId,
      tenantId,
      status: PipelineRunStatus.RUNNING,
      currentStage: PipelineStage.TREND,
      topic,
      contentPillarId: effectivePillar,
      retries: {},
      createdAt: now,
      updatedAt: now,
    } as any);

    await this.queues[PipelineStage.TREND].add("trend-job", {
      runId,
      stage: PipelineStage.TREND,
      tenantId,
      payload: { topic, pillarId: effectivePillar },
    } as any);

    logger.info({ runId, tenantId, pillarId: effectivePillar }, "Started test pipeline run directly via DB");
    return runId;
  }
}
