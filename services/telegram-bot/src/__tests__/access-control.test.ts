import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AccessControlService } from "../services/access-control.service.js";
import { UserRole, CallbackAction } from "../types/actions.types.js";
import { buildMainMenuKeyboard } from "../keyboards/inline.js";
import { CommandRouter } from "../routes/command.router.js";
import { CallbackRouter } from "../routes/callback.router.js";

describe("Telegram Bot Access Control and Testo Admin Role Unit Tests", () => {
  const TESTO_ADMIN_ID = 999111;
  const SUPERADMIN_ID = 888222;
  const GUEST_ID = 123456;

  process.env.TELEGRAM_SUPERADMIN_IDS = `${SUPERADMIN_ID}`;
  process.env.TELEGRAM_TESTO_ADMIN_IDS = `${TESTO_ADMIN_ID}`;

  const accessControl = new AccessControlService();

  test("AccessControlService should accurately identify roles from ENV and grant correct tenant permissions", async () => {
    const superRole = await accessControl.getUserRole(SUPERADMIN_ID);
    assert.strictEqual(superRole, UserRole.SUPERADMIN);

    const testoRole = await accessControl.getUserRole(TESTO_ADMIN_ID);
    assert.strictEqual(testoRole, UserRole.TESTO_ADMIN);

    const guestRole = await accessControl.getUserRole(GUEST_ID);
    assert.strictEqual(guestRole, UserRole.GUEST);

    // Проверка доступа к порталам
    assert.strictEqual(await accessControl.canAccessTenant(TESTO_ADMIN_ID, "testo"), true);
    assert.strictEqual(await accessControl.canAccessTenant(TESTO_ADMIN_ID, "cinema-media"), false);
    assert.strictEqual(await accessControl.canAccessTenant(TESTO_ADMIN_ID, "software-development-default"), false);

    assert.strictEqual(await accessControl.canAccessTenant(SUPERADMIN_ID, "testo"), true);
    assert.strictEqual(await accessControl.canAccessTenant(SUPERADMIN_ID, "cinema-media"), true);
    assert.strictEqual(await accessControl.canAccessTenant(SUPERADMIN_ID, "software-development-default"), true);

    assert.strictEqual(await accessControl.canAccessTenant(GUEST_ID, "testo"), false);
  });

  test("canExecuteCommand should restrict Testo Admin exclusively to Testo portal", async () => {
    // Разрешенные команды для Testo Admin
    assert.strictEqual((await accessControl.canExecuteCommand(TESTO_ADMIN_ID, "/daily_testo")).allowed, true);
    assert.strictEqual((await accessControl.canExecuteCommand(TESTO_ADMIN_ID, "/post_testo")).allowed, true);
    assert.strictEqual((await accessControl.canExecuteCommand(TESTO_ADMIN_ID, "/curate_testo")).allowed, true);
    assert.strictEqual((await accessControl.canExecuteCommand(TESTO_ADMIN_ID, "/my_role")).allowed, true);
    assert.strictEqual((await accessControl.canExecuteCommand(TESTO_ADMIN_ID, "/start")).allowed, true);

    // Запрещенные команды чужих порталов
    const cinemaCheck = await accessControl.canExecuteCommand(TESTO_ADMIN_ID, "/daily_cinema");
    assert.strictEqual(cinemaCheck.allowed, false);
    assert.match(cinemaCheck.reason || "", /Testo/);

    const trendsCheck = await accessControl.canExecuteCommand(TESTO_ADMIN_ID, "/trends");
    assert.strictEqual(trendsCheck.allowed, false);

    const techCheck = await accessControl.canExecuteCommand(TESTO_ADMIN_ID, "/daily_tech");
    assert.strictEqual(techCheck.allowed, false);
  });

  test("canExecuteAction should restrict Testo Admin exclusively to Testo callbacks", async () => {
    // Разрешено: Testo-действия
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.TESTO_MODE, "pharma")).allowed, true);
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.TESTO_PICK, "0")).allowed, true);
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.CMD, "daily_testo")).allowed, true);

    // Запрещено: действия кино и tech
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.CINEMA_MODE, "popular")).allowed, false);
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.TREND_PICK, "0")).allowed, false);
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.TECH_MODE, "popular")).allowed, false);
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.CMD, "daily_cinema")).allowed, false);
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.CMD, "logs")).allowed, false);
  });

  test("buildMainMenuKeyboard should produce tailored portal-isolated keyboards per role", () => {
    const testoKeyboard = buildMainMenuKeyboard(UserRole.TESTO_ADMIN);
    const testoButtonTexts = testoKeyboard.inline_keyboard.flat().map((b) => b.text);
    assert.ok(testoButtonTexts.some((t) => t.includes("Testo")));
    assert.ok(!testoButtonTexts.some((t) => t.includes("KinoPeek")));
    assert.ok(!testoButtonTexts.some((t) => t.includes("IT & Tech")));

    const superKeyboard = buildMainMenuKeyboard(UserRole.SUPERADMIN);
    const superButtonTexts = superKeyboard.inline_keyboard.flat().map((b) => b.text);
    assert.ok(superButtonTexts.some((t) => t.includes("Testo")));
    assert.ok(superButtonTexts.some((t) => t.includes("KinoPeek")));
    assert.ok(superButtonTexts.some((t) => t.includes("IT & Tech")));
  });

  test("CommandRouter should block non-testo commands and execute permitted commands for Testo Admin", async () => {
    let sentMessage = "";
    const mockTelegramApi: any = {
      sendMessage: async (_chatId: any, text: string) => {
        sentMessage = text;
      },
    };

    let testoMenuShown = false;
    const mockCuratorController: any = {
      showTestoMenu: async () => {
        testoMenuShown = true;
      },
      showCinemaMenu: async () => {
        throw new Error("Should not be called for Testo Admin!");
      },
    };

    const mockSystemController: any = {
      showMyRole: async (_chatId: any, userId: number) => {
        sentMessage = `Role displayed for ${userId}`;
      },
    };

    const mockTrendsController: any = {};

    const router = new CommandRouter(
      mockTelegramApi,
      mockSystemController,
      mockCuratorController,
      mockTrendsController,
      accessControl
    );

    // 1. Попытка вызвать /daily_cinema под учетной записью Testo Admin
    await router.route({
      message_id: 1,
      date: Date.now(),
      chat: { id: 100, type: "private" },
      from: { id: TESTO_ADMIN_ID, is_bot: false, first_name: "Testo Admin" },
      text: "/daily_cinema",
    });
    assert.match(sentMessage, /Доступ ограничен.*Testo Казахстан/);
    assert.strictEqual(testoMenuShown, false);

    // 2. Разрешенный вызов /daily_testo под учетной записью Testo Admin
    await router.route({
      message_id: 2,
      date: Date.now(),
      chat: { id: 100, type: "private" },
      from: { id: TESTO_ADMIN_ID, is_bot: false, first_name: "Testo Admin" },
      text: "/daily_testo",
    });
    assert.strictEqual(testoMenuShown, true);

    // 3. Вызов /my_role
    await router.route({
      message_id: 3,
      date: Date.now(),
      chat: { id: 100, type: "private" },
      from: { id: TESTO_ADMIN_ID, is_bot: false, first_name: "Testo Admin" },
      text: "/my_role",
    });
    assert.strictEqual(sentMessage, `Role displayed for ${TESTO_ADMIN_ID}`);
  });

  test("CallbackRouter should enforce role boundary on inline button clicks", async () => {
    let answeredAlertText = "";
    const mockTelegramApi: any = {
      answerCallbackQuery: async (_id: string, text?: string) => {
        if (text) answeredAlertText = text;
      },
    };

    const mockApprovalController: any = {};
    const mockCuratorController: any = {
      handleTestoMode: async () => {},
    };
    const mockTrendsController: any = {};
    const mockSystemController: any = {};

    const callbackRouter = new CallbackRouter(
      mockTelegramApi,
      mockApprovalController,
      mockCuratorController,
      mockTrendsController,
      mockSystemController,
      accessControl
    );

    // Попытка кликнуть "cmd:daily_cinema" Testo-админом
    await callbackRouter.route({
      id: "cb_1",
      from: { id: TESTO_ADMIN_ID, is_bot: false, first_name: "Testo" },
      message: { message_id: 10, date: Date.now(), chat: { id: 100, type: "private" } },
      data: "cmd:daily_cinema",
    });

    assert.match(answeredAlertText, /ограничен/);
  });
});
