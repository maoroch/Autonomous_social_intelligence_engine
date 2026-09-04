import { buildMainMenuKeyboard } from "../keyboards/inline.js";
import { UserRole } from "../types/actions.types.js";
import type { TelegramApiService } from "../services/telegram-api.service.js";
import type { LogViewerService } from "../services/log-viewer.js";
import type { TestRunnerService } from "../services/test-runner.js";
import type { AccessControlService } from "../services/access-control.service.js";
import type { BotQueues } from "../types/bot.types.js";

export class SystemController {
  constructor(
    private telegramApi: TelegramApiService,
    private logViewer: LogViewerService,
    private testRunner: TestRunnerService,
    private queues: BotQueues,
    private accessControl: AccessControlService
  ) {}

  async showWelcome(chatId: number | string, userId: number = 0): Promise<void> {
    const role = await this.accessControl.getUserRole(userId);

    if (role === UserRole.TESTO_ADMIN) {
      const testoWelcome =
        `🏭 *Добро пожаловать в Testo Kazakhstan B2B Portal!* 🇰🇿\n\n` +
        `Вы авторизованы как *Testo Admin*. Вам доступно управление публикациями по измерительному оборудованию Testo (газоанализаторы ТЭЦ, термолокаторы, фармацевтика GxP/Saveris).\n\n` +
        `📌 *Команды Testo Казахстан:*\n` +
        `• \`/daily_testo\` — Главный хаб Testo\n` +
        `• \`/testo_media\` — Живые упоминания Testo в зарубежных СМИ\n` +
        `• \`/testo_cases\` — Международные кейсы внедрения (Application Reports)\n` +
        `• \`/post_testo <тема>\` — Создать публикацию по оборудованию\n` +
        `• \`/my_role\` — Информация о вашей роли и правах\n` +
        `• \`/status\` — Статус последних прогонов карточек\n\n` +
        `🔒 *Изоляция*: Доступ к развлекательному и IT контенту отключен для вашего профиля.`;

      await this.telegramApi.sendMessage(chatId, testoWelcome, buildMainMenuKeyboard(role));
      return;
    }

    if (role === UserRole.TECH_ADMIN) {
      const techWelcome =
        `💻 *Добро пожаловать в IT & Tech Content Hub!* 🚀\n\n` +
        `Вы авторизованы как *Tech Admin*. Доступ к созданию постов по архитектуре и трендам разработки.\n\n` +
        `📌 *Команды:*\n` +
        `• \`/daily_tech\` — Радар IT & Tech (Архитектура, Open-Source)\n` +
        `• \`/post_tech <тема>\` — Создать пост по IT-теме\n` +
        `• \`/my_role\` — Ваша роль\n` +
        `• \`/status\` — Статус прогонов`;

      await this.telegramApi.sendMessage(chatId, techWelcome, buildMainMenuKeyboard(role));
      return;
    }

    if (role === UserRole.CINEMA_ADMIN) {
      const cinemaWelcome =
        `🎬 *Добро пожаловать в KinoPeek Media Hub!* 🍿\n\n` +
        `Вы авторизованы как *Cinema Admin*. Доступ к аналитике кино, лора Marvel и кассовых сборов.\n\n` +
        `📌 *Команды:*\n` +
        `• \`/daily_cinema\` — Радар тем кино\n` +
        `• \`/trends\` — Горячие тренды СМИ (Den of Geek)\n` +
        `• \`/post_cinema <тема>\` — Пост по теме кино\n` +
        `• \`/my_role\` — Ваша роль\n` +
        `• \`/status\` — Статус прогонов`;

      await this.telegramApi.sendMessage(chatId, cinemaWelcome, buildMainMenuKeyboard(role));
      return;
    }

    if (role === UserRole.GUEST) {
      const guestWelcome =
        `🔒 *Multi-Portal AI Content Engine*\n\n` +
        `Ваш Telegram ID: \`${userId}\`\n` +
        `Статус: *Гость (без прав доступа)*\n\n` +
        `Чтобы получить доступ к управлению публикациями (например, стать *Testo Admin*), обратитесь к главному администратору с вашим Telegram ID.`;

      await this.telegramApi.sendMessage(chatId, guestWelcome, buildMainMenuKeyboard(role));
      return;
    }

    // SUPERADMIN
    const welcome =
      `🤖 *Добро пожаловать в Multi-Portal AI Content Hub!* 👑\n\n` +
      `Вы авторизованы как *Super Administrator*. Полный доступ ко всем порталам и администрированию.\n\n` +
      `📌 *Команды кураторов тем:*\n` +
      `• \`/daily_cinema\` — Радар тем кино и Marvel\n` +
      `• \`/daily_tech\` — Радар IT & Tech (Архитектура, Open-Source)\n` +
      `• \`/daily_testo\` — Радар Testo (Газоанализаторы ТЭЦ, Фармацевтика GxP)\n\n` +
      `✍️ *Создание постов:*\n` +
      `• \`/post_cinema <тема>\`\n` +
      `• \`/post_tech <тема>\`\n` +
      `• \`/post_testo <тема>\`\n\n` +
      `⚙️ *Системные команды и роли:*\n` +
      `• \`/my_role\` — Текущая роль\n` +
      `• \`/roles\` — Список назначенных ролей\n` +
      `• \`/grant_role <userId> <role>\` — Назначить роль (superadmin, testo_admin, tech_admin, cinema_admin)\n` +
      `• \`/trends\` — Тренды кино\n` +
      `• \`/status\` — Статус прогонов\n` +
      `• \`/logs\` — Журнал логов`;

    await this.telegramApi.sendMessage(chatId, welcome, buildMainMenuKeyboard(role));
  }

  async showMainMenu(chatId: number | string, userId: number = 0): Promise<void> {
    const role = await this.accessControl.getUserRole(userId);
    const title =
      role === UserRole.TESTO_ADMIN
        ? `🏭 *Меню Testo Казахстан B2B:*`
        : `🤖 *Главное меню Multi-Portal AI Hub:*`;
    await this.telegramApi.sendMessage(chatId, title, buildMainMenuKeyboard(role));
  }

  async showMyRole(chatId: number | string, userId: number, username?: string): Promise<void> {
    const role = await this.accessControl.getUserRole(userId);
    const roleTitle = this.accessControl.formatRoleTitle(role);
    const allowed = this.accessControl.getAllowedPortals(role);

    const portalsList =
      allowed.length > 0
        ? allowed.map((p) => `• \`${p}\``).join("\n")
        : "_Нет разрешенных порталов_";

    const text =
      `👤 *Информация о профиле Telegram:*\n\n` +
      `• *ID пользователя:* \`${userId}\`\n` +
      `• *Username:* ${username ? `@${username}` : "_не указан_"}\n` +
      `• *Текущая роль:* ${roleTitle}\n\n` +
      `🏢 *Разрешенные порталы:*\n${portalsList}`;

    await this.telegramApi.sendMessage(chatId, text);
  }

  async handleGrantRole(
    chatId: number | string,
    requesterId: number,
    args: string
  ): Promise<void> {
    const requesterRole = await this.accessControl.getUserRole(requesterId);
    if (requesterRole !== UserRole.SUPERADMIN) {
      await this.telegramApi.sendMessage(
        chatId,
        "⛔ Назначать роли может только главный администратор (Superadmin)."
      );
      return;
    }

    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
      await this.telegramApi.sendMessage(
        chatId,
        "⚠️ *Формат команды:*\n`/grant_role <userId> <role>`\n\nДоступные роли:\n• `testo_admin`\n• `tech_admin`\n• `cinema_admin`\n• `superadmin`\n• `guest`\n\nПример:\n`/grant_role 123456789 testo_admin`"
      );
      return;
    }

    const targetUserId = Number(parts[0]);
    const targetRole = parts[1]?.toLowerCase() as UserRole;

    if (isNaN(targetUserId) || targetUserId <= 0) {
      await this.telegramApi.sendMessage(chatId, "❌ Некорректный Telegram User ID.");
      return;
    }

    const validRoles = Object.values(UserRole);
    if (!validRoles.includes(targetRole)) {
      await this.telegramApi.sendMessage(
        chatId,
        `❌ Неизвестная роль \`${targetRole}\`. Допустимые: ${validRoles.join(", ")}`
      );
      return;
    }

    await this.accessControl.grantRole(targetUserId, targetRole, requesterId);
    await this.telegramApi.sendMessage(
      chatId,
      `✅ *Роль успешно обновлена!*\nПользователю \`${targetUserId}\` назначена роль: ${this.accessControl.formatRoleTitle(targetRole)}`
    );
  }

  async handleListRoles(chatId: number | string, requesterId: number): Promise<void> {
    const requesterRole = await this.accessControl.getUserRole(requesterId);
    if (requesterRole !== UserRole.SUPERADMIN) {
      await this.telegramApi.sendMessage(
        chatId,
        "⛔ Просматривать список всех ролей может только Superadmin."
      );
      return;
    }

    const rolesList = await this.accessControl.listRoles();
    if (rolesList.length === 0) {
      await this.telegramApi.sendMessage(
        chatId,
        "📋 В базе MongoDB нет явно сохраненных ролей (используются базовые роли из переменных окружения)."
      );
      return;
    }

    const lines = ["📋 *Назначенные роли пользователей в MongoDB:*\n"];
    rolesList.forEach((r, idx) => {
      lines.push(
        `${idx + 1}. \`${r.userId}\` (${r.username ? "@" + r.username : "ID"}) — *${r.role}* (Обновлен: ${new Date(r.updatedAt).toLocaleDateString()})`
      );
    });

    await this.telegramApi.sendMessage(chatId, lines.join("\n"));
  }

  /**
   * Панель динамического управления доступом к Testo Казахстан
   */
  async showTestoAccessPanel(chatId: number | string, requesterId: number): Promise<void> {
    const requesterRole = await this.accessControl.getUserRole(requesterId);
    if (requesterRole !== UserRole.SUPERADMIN) {
      await this.telegramApi.sendMessage(
        chatId,
        "⛔ Управлять доступом к порталу Testo может только главный администратор (Superadmin)."
      );
      return;
    }

    const admins = await this.accessControl.getTestoAdmins();
    const lines = [
      `🏭 *Управление доступом к порталу Testo Казахстан* 🇰🇿\n`,
      `_Только указанные ниже пользователи имеют право запускать генерацию, выбирать приборы и модерировать публикации Testo:_\n`,
    ];

    const keyboardRows: any[][] = [];

    if (admins.length === 0) {
      lines.push(`_Текущих Testo-администраторов не назначено._\n`);
    } else {
      admins.forEach((admin, idx) => {
        const usernameStr = admin.username ? ` (@${admin.username})` : "";
        lines.push(`${idx + 1}️⃣ ID: \`${admin.userId}\`${usernameStr}`);
        keyboardRows.push([
          {
            text: `❌ Отозвать доступ у ID ${admin.userId}`,
            callback_data: `revoke_testo:${admin.userId}`,
          },
        ]);
      });
      lines.push("");
    }

    lines.push(`👇 *Быстрые действия:*`);
    lines.push(`• Нажмите кнопку ниже или используйте команды:\n  \`/add_testo <userId>\`\n  \`/remove_testo <userId>\``);

    keyboardRows.push([
      { text: "➕ Добавить Testo-админа по ID", callback_data: "cmd:add_testo_prompt" },
      { text: "🔄 Обновить список", callback_data: "cmd:manage_testo" },
    ]);
    keyboardRows.push([
      { text: "🔙 Главное меню", callback_data: "cmd:main_menu" },
    ]);

    await this.telegramApi.sendMessage(chatId, lines.join("\n"), {
      inline_keyboard: keyboardRows,
    });
  }

  /**
   * Запрос ID нового Testo-администратора
   */
  async promptAddTestoAdmin(chatId: number | string, requesterId: number): Promise<void> {
    const requesterRole = await this.accessControl.getUserRole(requesterId);
    if (requesterRole !== UserRole.SUPERADMIN) {
      await this.telegramApi.sendMessage(chatId, "⛔ Действие доступно только Superadmin.");
      return;
    }

    this.accessControl.setPendingAction(requesterId, "add_testo");

    await this.telegramApi.sendMessage(
      chatId,
      `✍️ *Добавление Testo-администратора*\n\n` +
      `Пришлите в ответ Telegram ID пользователя (например: \`123456789\`), которому нужно открыть доступ к порталу Testo Казахстан.\n\n` +
      `_Пользователь может узнать свой ID в этом боте через команду /my_role._\n` +
      `_Или отправьте команду \`/add_testo <ID>\`._`
    );
  }

  /**
   * Добавление Testo-администратора по введенному ID
   */
  async handleAddTestoAdminById(
    chatId: number | string,
    requesterId: number,
    targetUserIdStr: string,
    username?: string
  ): Promise<void> {
    const cleanId = targetUserIdStr.trim().replace(/^@/, "");
    const targetUserId = Number(cleanId);

    if (isNaN(targetUserId) || targetUserId <= 0) {
      await this.telegramApi.sendMessage(
        chatId,
        `❌ Некорректный Telegram ID: "${targetUserIdStr}". ID должен быть положительным числом.`
      );
      return;
    }

    await this.accessControl.addTestoAdmin(targetUserId, requesterId, username);
    await this.telegramApi.sendMessage(
      chatId,
      `✅ *Доступ к порталу Testo Казахстан успешно предоставлен!*\n\n` +
      `• Пользователь: \`${targetUserId}\`\n` +
      `• Роль: 🏭 *Testo Kazakhstan Admin*\n\n` +
      `Теперь пользователь видит только портал Testo и может управлять приборами.`
    );

    await this.showTestoAccessPanel(chatId, requesterId);
  }

  /**
   * Отзыв доступа Testo-администратора
   */
  async handleRevokeTestoAdmin(
    chatId: number | string,
    requesterId: number,
    targetUserIdStr: string,
    callbackQueryId?: string
  ): Promise<void> {
    const targetUserId = Number(targetUserIdStr.trim());
    if (isNaN(targetUserId)) return;

    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "Отозван доступ к Testo");
    }

    await this.accessControl.removeTestoAdmin(targetUserId, requesterId);
    await this.telegramApi.sendMessage(
      chatId,
      `🚫 *Доступ к Testo Казахстан отозван* у пользователя с ID \`${targetUserId}\`.`
    );

    await this.showTestoAccessPanel(chatId, requesterId);
  }



  async showStatus(chatId: number | string): Promise<void> {
    const summary = await this.logViewer.getRecentRunsSummary(5);
    await this.telegramApi.sendMessage(chatId, summary);
  }

  async showLogs(chatId: number | string, subParam?: string): Promise<void> {
    const cleanParam = (subParam || "").trim();

    if (!cleanParam) {
      const summary = await this.logViewer.getRecentRunsSummary(5);
      await this.telegramApi.sendMessage(chatId, summary);
      return;
    }

    if (cleanParam === "errors" || cleanParam === "error") {
      const errorsReport = await this.logViewer.getRecentErrors(5);
      await this.telegramApi.sendMessage(chatId, errorsReport);
      return;
    }

    if (cleanParam === "queues" || cleanParam === "queue") {
      const queueStats = await this.logViewer.getQueueStats(this.queues);
      await this.telegramApi.sendMessage(chatId, queueStats);
      return;
    }

    const runLog = await this.logViewer.getRunLogs(cleanParam);
    await this.telegramApi.sendMessage(chatId, runLog);
  }

  async showQueueStats(chatId: number | string): Promise<void> {
    const queueStats = await this.logViewer.getQueueStats(this.queues);
    await this.telegramApi.sendMessage(chatId, queueStats);
  }

  async runTestPipeline(chatId: number | string): Promise<void> {
    const runId = await this.testRunner.triggerPipelineTest("cinema-media", "marvel-mcu-lore");
    await this.telegramApi.sendMessage(
      chatId,
      `🧪 *Тестовый запуск пайплайна KinoPeek выполнен!*\nRun ID: \`${runId}\`\n\nКарточка скоро поступит на модерацию в этот чат.`
    );
  }

  async runUnitTests(chatId: number | string): Promise<void> {
    await this.telegramApi.sendMessage(chatId, `⏳ *Запуск системной диагностики и Unit-тестов...*`);
    const report = await this.testRunner.runHealthAndUnitTests();
    await this.telegramApi.sendMessage(chatId, report);
  }

  async handleCustomPost(
    chatId: number | string,
    portal: "cinema" | "tech" | "testo",
    topicTitle: string
  ): Promise<void> {
    if (!topicTitle) {
      const examples: Record<string, string> = {
        cinema: "`/post_cinema Секретные войны Marvel: кого вернут из старого каста`",
        tech: "`/post_tech Архитектура очередей: BullMQ vs RabbitMQ в high-load Node.js`",
        testo: "`/post_testo Сферы применения газоанализатора Testo 350: от котельных до металлургии`",
      };
      await this.telegramApi.sendMessage(
        chatId,
        `⚠️ *Укажите тему поста!*\nПример:\n${examples[portal]}`
      );
      return;
    }

    const portalConfig: Record<string, { tenantId: string; pillarId: string; icon: string; name: string }> = {
      cinema: { tenantId: "cinema-media", pillarId: "marvel-mcu-lore", icon: "🎬", name: "KinoPeek Media" },
      tech: { tenantId: "software-development-default", pillarId: "architecture-deep-dive", icon: "💻", name: "Tech Portal" },
      testo: { tenantId: "testo", pillarId: "gas-industrial-emissions", icon: "🏭", name: "Testo Kazakhstan" },
    };

    const config = portalConfig[portal]!;
    const runId = await this.testRunner.triggerPipelineTest(config.tenantId, config.pillarId, {
      title: topicTitle,
      summary: topicTitle,
    });

    await this.telegramApi.sendMessage(
      chatId,
      `${config.icon} *Запущен прогон ${config.name}!*\nТема: "${topicTitle}"\nRun ID: \`${runId}\``
    );
  }
}
