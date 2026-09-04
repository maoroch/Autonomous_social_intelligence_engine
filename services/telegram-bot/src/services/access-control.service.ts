import { getDb } from "@pipeline/shared/db";
import { createLogger } from "@pipeline/shared/logger";
import { UserRole, CallbackAction, type PortalTenant } from "../types/actions.types.js";

const logger = createLogger("telegram-bot:access-control");

export const TELEGRAM_ROLES_COLLECTION = "telegram_bot_roles";

export interface TelegramUserRoleDoc {
  userId: number;
  username?: string;
  role: UserRole;
  grantedBy?: number;
  grantedAt: Date;
  updatedAt: Date;
}

export class AccessControlService {
  private inMemoryRoles = new Map<number, UserRole>();
  private superadminIds = new Set<number>();
  private testoAdminIds = new Set<number>();
  private techAdminIds = new Set<number>();
  private cinemaAdminIds = new Set<number>();

  constructor() {
    this.loadEnvRoles();
  }

  /**
   * Инициализация ролей из переменных окружения
   */
  private loadEnvRoles(): void {
    const parseIds = (envVal?: string): number[] => {
      if (!envVal) return [];
      return envVal
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n) && n > 0);
    };

    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (adminChatId) {
      const parsed = Number(adminChatId.trim());
      if (!isNaN(parsed) && parsed > 0) {
        this.superadminIds.add(parsed);
      }
    }

    parseIds(process.env.TELEGRAM_SUPERADMIN_IDS).forEach((id) => this.superadminIds.add(id));
    parseIds(process.env.TELEGRAM_TESTO_ADMIN_IDS).forEach((id) => this.testoAdminIds.add(id));
    parseIds(process.env.TELEGRAM_TECH_ADMIN_IDS).forEach((id) => this.techAdminIds.add(id));
    parseIds(process.env.TELEGRAM_CINEMA_ADMIN_IDS).forEach((id) => this.cinemaAdminIds.add(id));

    logger.info(
      {
        superadminsCount: this.superadminIds.size,
        testoAdminsCount: this.testoAdminIds.size,
        techAdminsCount: this.techAdminIds.size,
        cinemaAdminsCount: this.cinemaAdminIds.size,
      },
      "Loaded initial Telegram Bot roles from environment variables"
    );
  }

  /**
   * Получение роли пользователя (с проверкой ENV, кэша и MongoDB)
   */
  async getUserRole(userId: number): Promise<UserRole> {
    if (!userId) return UserRole.GUEST;

    // 1. Приоритет переменных окружения
    if (this.superadminIds.has(userId)) {
      return UserRole.SUPERADMIN;
    }
    if (this.testoAdminIds.has(userId)) {
      return UserRole.TESTO_ADMIN;
    }
    if (this.techAdminIds.has(userId)) {
      return UserRole.TECH_ADMIN;
    }
    if (this.cinemaAdminIds.has(userId)) {
      return UserRole.CINEMA_ADMIN;
    }

    // 2. Проверка in-memory кэша
    if (this.inMemoryRoles.has(userId)) {
      return this.inMemoryRoles.get(userId)!;
    }

    // 3. Запрос в MongoDB (если подключена)
    try {
      const db = getDb();
      if (db) {
        const doc = await db
          .collection<TelegramUserRoleDoc>(TELEGRAM_ROLES_COLLECTION)
          .findOne({ userId });
        if (doc?.role) {
          this.inMemoryRoles.set(userId, doc.role);
          return doc.role;
        }
      }
    } catch {
      // База данных может быть не подключена во время unit-тестов
    }

    // Если список админов в ENV пуст, первый админ из TELEGRAM_ADMIN_CHAT_ID становится superadmin
    if (this.superadminIds.size === 0 && this.testoAdminIds.size === 0) {
      return UserRole.SUPERADMIN;
    }

    return UserRole.GUEST;
  }

  /**
   * Проверка доступа к конкретному порталу/тенантId
   */
  async canAccessTenant(userId: number, tenantId: string): Promise<boolean> {
    const role = await this.getUserRole(userId);

    if (role === UserRole.SUPERADMIN) {
      return true;
    }

    if (tenantId === "testo") {
      return role === UserRole.TESTO_ADMIN;
    }

    if (tenantId === "software-development-default") {
      return role === UserRole.TECH_ADMIN;
    }

    if (tenantId === "cinema-media") {
      return role === UserRole.CINEMA_ADMIN;
    }

    return false;
  }

  /**
   * Проверка прав на выполнение slash-команд
   */
  async canExecuteCommand(
    userId: number,
    command: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const role = await this.getUserRole(userId);

    // Общедоступные системные команды
    if (["/start", "/help", "/my_role", "/status"].includes(command)) {
      return { allowed: true };
    }

    // Superadmin может всё
    if (role === UserRole.SUPERADMIN) {
      return { allowed: true };
    }

    // Роль: Testo Admin
    if (role === UserRole.TESTO_ADMIN) {
      const allowedTestoCommands = ["/daily_testo", "/curate_testo", "/post_testo", "/testo_trends", "/trends"];
      if (allowedTestoCommands.includes(command)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason:
          "⛔ *Доступ ограничен*: Ваш аккаунт назначен администратором портала *Testo Казахстан*. Вы можете управлять только задачами Testo (`/daily_testo`, `/testo_trends`, `/post_testo`).",
      };
    }

    // Роль: Tech Admin
    if (role === UserRole.TECH_ADMIN) {
      const allowedTechCommands = ["/daily_tech", "/curate_tech", "/post_tech"];
      if (allowedTechCommands.includes(command)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: "⛔ *Доступ ограничен*: Доступ разрешен только к порталу *IT & Tech* (`/daily_tech`).",
      };
    }

    // Роль: Cinema Admin
    if (role === UserRole.CINEMA_ADMIN) {
      const allowedCinemaCommands = ["/daily_cinema", "/curate_cinema", "/post_cinema", "/trends"];
      if (allowedCinemaCommands.includes(command)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason:
          "⛔ *Доступ ограничен*: Доступ разрешен только к кино-порталу *KinoPeek* (`/daily_cinema`, `/trends`).",
      };
    }

    // Для остальных (Guest) запрещены команды генерации
    return {
      allowed: false,
      reason:
        "🔒 *Требуется авторизация*: У вашего Telegram-аккаунта нет прав для выполнения этой команды. Обратитесь к главному администратору.",
    };
  }

  /**
   * Проверка прав на выполнение Callback-действий
   */
  async canExecuteAction(
    userId: number,
    action: CallbackAction,
    param?: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const role = await this.getUserRole(userId);

    // Superadmin может выполнять любые callback
    if (role === UserRole.SUPERADMIN) {
      return { allowed: true };
    }

    // Управление ролями доступно только Superadmin
    if (
      action === CallbackAction.REVOKE_TESTO ||
      action === CallbackAction.REVOKE_ROLE ||
      (action === CallbackAction.CMD && (param === "manage_testo" || param === "add_testo_prompt"))
    ) {
      return { allowed: false, reason: "⛔ Управление доступом к порталам разрешено только Superadmin." };
    }

    // Общие действия меню
    if (action === CallbackAction.CMD) {
      if (param === "main_menu" || param === "status" || param === "my_role") {
        return { allowed: true };
      }
      if (param === "daily_testo") {
        return role === UserRole.TESTO_ADMIN
          ? { allowed: true }
          : { allowed: false, reason: "⛔ Портал Testo Казахстан доступен только Testo-администраторам." };
      }
      if (param === "daily_cinema") {
        return role === UserRole.CINEMA_ADMIN
          ? { allowed: true }
          : { allowed: false, reason: "⛔ Доступ к порталу KinoPeek ограничен вашей ролью." };
      }
      if (param === "trends") {
        return role === UserRole.CINEMA_ADMIN || role === UserRole.TESTO_ADMIN
          ? { allowed: true }
          : { allowed: false, reason: "⛔ Доступ к трендам ограничен вашей ролью." };
      }
      if (param === "daily_tech") {
        return role === UserRole.TECH_ADMIN
          ? { allowed: true }
          : { allowed: false, reason: "⛔ Доступ к IT & Tech порталу ограничен вашей ролью." };
      }
      if (param === "logs" || param === "queues") {
        return { allowed: false, reason: "⛔ Доступ к системным логам разрешен только Superadmin." };
      }
    }

    // Testo-специфичные действия
    const isTestAction = [
      CallbackAction.TESTO_MODE,
      CallbackAction.TESTO_PICK,
      CallbackAction.TESTO_REFRESH,
    ].includes(action);

    if (isTestAction) {
      return role === UserRole.TESTO_ADMIN
        ? { allowed: true }
        : { allowed: false, reason: "⛔ Только Testo-администраторы могут работать с каталогом Testo." };
    }

    // Cinema-специфичные действия
    const isCinemaAction = [
      CallbackAction.CINEMA_MODE,
      CallbackAction.CINEMA_PICK,
      CallbackAction.CINEMA_REFRESH,
      CallbackAction.TREND_PICK,
    ].includes(action);

    if (isCinemaAction) {
      return role === UserRole.CINEMA_ADMIN
        ? { allowed: true }
        : { allowed: false, reason: "⛔ Управление кино-порталом доступно только Cinema-администраторам." };
    }

    // Tech-специфичные действия
    const isTechAction = [
      CallbackAction.TECH_MODE,
      CallbackAction.TECH_PICK,
      CallbackAction.TECH_REFRESH,
    ].includes(action);

    if (isTechAction) {
      return role === UserRole.TECH_ADMIN
        ? { allowed: true }
        : { allowed: false, reason: "⛔ Управление Tech-радаром доступно только Tech-администраторам." };
    }

    return { allowed: true };
  }

  // === DYNAMIC TESTO ADMIN MANAGEMENT ===

  private pendingActions = new Map<number, string>();

  setPendingAction(userId: number, action: string): void {
    this.pendingActions.set(userId, action);
  }

  getPendingAction(userId: number): string | undefined {
    return this.pendingActions.get(userId);
  }

  clearPendingAction(userId: number): void {
    this.pendingActions.delete(userId);
  }

  /**
   * Добавление Testo-администратора по ID
   */
  async addTestoAdmin(userId: number, grantedBy: number, username?: string): Promise<void> {
    await this.grantRole(userId, UserRole.TESTO_ADMIN, grantedBy, username);
  }

  /**
   * Отзыв доступа Testo-администратора по ID
   */
  async removeTestoAdmin(userId: number, revokedBy: number): Promise<void> {
    this.inMemoryRoles.set(userId, UserRole.GUEST);
    this.testoAdminIds.delete(userId);

    try {
      const db = getDb();
      if (db) {
        await db.collection<TelegramUserRoleDoc>(TELEGRAM_ROLES_COLLECTION).updateOne(
          { userId },
          {
            $set: {
              role: UserRole.GUEST,
              grantedBy: revokedBy,
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        );
        logger.info({ userId, revokedBy }, "Successfully revoked Testo admin access");
      }
    } catch (err) {
      logger.error({ err, userId }, "Failed to revoke Testo admin in MongoDB");
    }
  }

  /**
   * Получение списка всех действующих Testo-администраторов
   */
  async getTestoAdmins(): Promise<TelegramUserRoleDoc[]> {
    const list: TelegramUserRoleDoc[] = [];

    // 1. Из MongoDB
    try {
      const db = getDb();
      if (db) {
        const docs = await db
          .collection<TelegramUserRoleDoc>(TELEGRAM_ROLES_COLLECTION)
          .find({ role: UserRole.TESTO_ADMIN })
          .sort({ updatedAt: -1 })
          .toArray();
        list.push(...docs);
      }
    } catch {
      // MongoDB may not be connected
    }

    // 2. Из inMemoryRoles (кэш сессии)
    for (const [userId, role] of this.inMemoryRoles.entries()) {
      if (role === UserRole.TESTO_ADMIN && !list.some((doc) => doc.userId === userId)) {
        list.push({
          userId,
          role: UserRole.TESTO_ADMIN,
          grantedAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // 3. Из ENV (если ещё нет в списке и не отозван в кэше)
    for (const envId of this.testoAdminIds) {
      if (
        this.inMemoryRoles.get(envId) !== UserRole.GUEST &&
        !list.some((doc) => doc.userId === envId)
      ) {
        list.push({
          userId: envId,
          role: UserRole.TESTO_ADMIN,
          grantedAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return list;
  }

  /**
   * Назначение роли пользователю (сохранение в MongoDB и кэш)
   */
  async grantRole(
    userId: number,
    role: UserRole,
    grantedBy: number,
    username?: string
  ): Promise<void> {
    this.inMemoryRoles.set(userId, role);

    try {
      const db = getDb();
      if (db) {
        const now = new Date();
        await db.collection<TelegramUserRoleDoc>(TELEGRAM_ROLES_COLLECTION).updateOne(
          { userId },
          {
            $set: {
              userId,
              username,
              role,
              grantedBy,
              updatedAt: now,
            },
            $setOnInsert: {
              grantedAt: now,
            },
          },
          { upsert: true }
        );
        logger.info({ userId, role, grantedBy }, "Successfully granted and persisted role");
      }
    } catch (err) {
      logger.error({ err, userId, role }, "Failed to persist role to MongoDB");
    }
  }

  /**
   * Список всех назначенных ролей
   */
  async listRoles(): Promise<TelegramUserRoleDoc[]> {
    try {
      const db = getDb();
      if (!db) return [];
      return await db
        .collection<TelegramUserRoleDoc>(TELEGRAM_ROLES_COLLECTION)
        .find({})
        .sort({ updatedAt: -1 })
        .toArray();
    } catch (err) {
      logger.error({ err }, "Failed to list roles from MongoDB");
      return [];
    }
  }

  /**
   * Список разрешенных порталов для роли
   */
  getAllowedPortals(role: UserRole): PortalTenant[] {
    switch (role) {
      case UserRole.SUPERADMIN:
        return ["testo", "software-development-default", "cinema-media"];
      case UserRole.TESTO_ADMIN:
        return ["testo"];
      case UserRole.TECH_ADMIN:
        return ["software-development-default"];
      case UserRole.CINEMA_ADMIN:
        return ["cinema-media"];
      default:
        return [];
    }
  }

  /**
   * Человекочитаемое название роли
   */
  formatRoleTitle(role: UserRole): string {
    switch (role) {
      case UserRole.SUPERADMIN:
        return "👑 Super Administrator (Все порталы)";
      case UserRole.TESTO_ADMIN:
        return "🏭 Testo Kazakhstan Admin (Только Testo B2B)";
      case UserRole.TECH_ADMIN:
        return "💻 Tech Admin (Только IT / Architecture)";
      case UserRole.CINEMA_ADMIN:
        return "🎬 Cinema Admin (Только KinoPeek)";
      default:
        return "👤 Guest (Гость без доступа к генерации)";
    }
  }
}

