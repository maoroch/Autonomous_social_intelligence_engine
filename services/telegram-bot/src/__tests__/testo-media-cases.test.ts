import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TestoMediaService } from "../services/testo-media.service.js";
import { TestoCasesService } from "../services/testo-cases.service.js";
import { TestoController } from "../controllers/testo.controller.js";
import { AccessControlService } from "../services/access-control.service.js";
import { CommandRouter } from "../routes/command.router.js";
import { CallbackRouter } from "../routes/callback.router.js";
import { UserRole, CallbackAction } from "../types/actions.types.js";
import type { TelegramMessage } from "../types/telegram.types.js";

describe("Testo Media and Cases Isolation & Routing Unit Tests", () => {
  const TESTO_ADMIN_ID = 112233;
  const SUPERADMIN_ID = 998877;
  const CINEMA_ADMIN_ID = 445566;

  process.env.TELEGRAM_SUPERADMIN_IDS = `${SUPERADMIN_ID}`;
  process.env.TELEGRAM_TESTO_ADMIN_IDS = `${TESTO_ADMIN_ID}`;

  const accessControl = new AccessControlService();

  test("AccessControlService correctly permissions /testo_media and /testo_cases", async () => {
    // Testo Admin should have access
    const mediaCheckTesto = await accessControl.canExecuteCommand(TESTO_ADMIN_ID, "/testo_media");
    assert.strictEqual(mediaCheckTesto.allowed, true);

    const casesCheckTesto = await accessControl.canExecuteCommand(TESTO_ADMIN_ID, "/testo_cases");
    assert.strictEqual(casesCheckTesto.allowed, true);

    // Superadmin should have access
    const mediaCheckSuper = await accessControl.canExecuteCommand(SUPERADMIN_ID, "/testo_media");
    assert.strictEqual(mediaCheckSuper.allowed, true);

    const casesCheckSuper = await accessControl.canExecuteCommand(SUPERADMIN_ID, "/testo_cases");
    assert.strictEqual(casesCheckSuper.allowed, true);

    // Cinema Admin or guest should NOT have access
    const mediaCheckCinema = await accessControl.canExecuteCommand(CINEMA_ADMIN_ID, "/testo_media");
    assert.strictEqual(mediaCheckCinema.allowed, false);

    const casesCheckCinema = await accessControl.canExecuteCommand(CINEMA_ADMIN_ID, "/testo_cases");
    assert.strictEqual(casesCheckCinema.allowed, false);

    // Callbacks permissions
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.TESTO_MEDIA_PICK, "0")).allowed, true);
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.TESTO_MEDIA_REFRESH)).allowed, true);
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.TESTO_CASES_PICK, "0")).allowed, true);
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.TESTO_CASES_REFRESH)).allowed, true);
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.CMD, "testo_media")).allowed, true);
    assert.strictEqual((await accessControl.canExecuteAction(TESTO_ADMIN_ID, CallbackAction.CMD, "testo_cases")).allowed, true);

    // Forbidden for cinema admin
    assert.strictEqual((await accessControl.canExecuteAction(CINEMA_ADMIN_ID, CallbackAction.TESTO_MEDIA_PICK, "0")).allowed, false);
    assert.strictEqual((await accessControl.canExecuteAction(CINEMA_ADMIN_ID, CallbackAction.TESTO_CASES_PICK, "0")).allowed, false);
  });

  test("TestoMediaService returns articles mentioning Testo and formats batch content", async () => {
    const service = new TestoMediaService();
    const articles = await service.fetchArticles();

    assert.ok(Array.isArray(articles));
    assert.ok(articles.length > 0);

    for (const article of articles) {
      assert.ok(article.title.length > 0);
      assert.ok(article.url.startsWith("http"));
      assert.ok(article.source.length > 0);
      assert.ok(Array.isArray(article.batches));
      assert.ok((article.batches?.length ?? 0) > 0);
    }

    // Check message formatting
    const formatted = service.formatArticleListMessage(articles);
    assert.match(formatted.text, /Testo в зарубежных медиа СМИ/);
    assert.match(formatted.text, /1️⃣/);

    // Check keyboard creation
    const keyboard = service.getArticleSelectionKeyboard(articles);
    assert.ok(keyboard.inline_keyboard.length >= 2);
    assert.strictEqual(keyboard.inline_keyboard[0][0].callback_data, "testo_media_pick:0");

    // Check user cache
    service.saveUserArticles(123, articles);
    const cached = service.getArticleByIndex(123, 0);
    assert.ok(cached);
    assert.strictEqual(cached?.title, articles[0]?.title);
  });

  test("TestoCasesService returns verified industrial case studies and formats list message", async () => {
    const service = new TestoCasesService();
    const cases = await service.fetchCases();

    assert.ok(Array.isArray(cases));
    assert.ok(cases.length >= 4);

    const firstCase = cases[0];
    assert.ok(firstCase);
    assert.ok(firstCase.title.includes("Testo"));
    assert.ok(firstCase.instrumentModel.length > 0);
    assert.ok(firstCase.roiMetric.length > 0);
    assert.ok(Array.isArray(firstCase.batches));

    // Check message formatting
    const formatted = service.formatCasesListMessage(cases);
    assert.match(formatted.text, /Международные кейсы внедрения Testo/);
    assert.match(formatted.text, /Прибор:/);
    assert.match(formatted.text, /Эффект:/);

    // Check keyboard
    const keyboard = service.getCasesSelectionKeyboard(cases);
    assert.ok(keyboard.inline_keyboard.length >= 2);
    assert.strictEqual(keyboard.inline_keyboard[0][0].callback_data, "testo_cases_pick:0");

    // Check user cache
    service.saveUserCases(456, cases);
    const cached = service.getCaseByIndex(456, 0);
    assert.ok(cached);
    assert.strictEqual(cached?.title, firstCase.title);
  });

  test("CommandRouter correctly dispatches /testo_media and /testo_cases to TestoController", async () => {
    const sentMessages: Array<{ chatId: number | string; text: string; markup: any }> = [];
    const mockTelegramApi: any = {
      sendMessage: async (chatId: number | string, text: string, markup: any) => {
        sentMessages.push({ chatId, text, markup });
      },
    };

    let mediaCalled = false;
    let casesCalled = false;

    const mockTestoController: any = {
      showMediaMenu: async (chatId: number | string) => {
        mediaCalled = true;
      },
      showCasesMenu: async (chatId: number | string) => {
        casesCalled = true;
      },
      showTestoMenu: async (chatId: number | string) => {},
    };

    const router = new CommandRouter(
      mockTelegramApi,
      {} as any,
      {} as any,
      {} as any,
      accessControl,
      mockTestoController
    );

    const baseMsg: TelegramMessage = {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      from: { id: TESTO_ADMIN_ID, is_bot: false, first_name: "Test" },
      chat: { id: TESTO_ADMIN_ID, type: "private" },
      text: "/testo_media",
    };

    // Route /testo_media
    await router.route(baseMsg);
    assert.strictEqual(mediaCalled, true);

    // Route /testo_cases
    await router.route({
      ...baseMsg,
      message_id: 2,
      text: "/testo_cases",
    });
    assert.strictEqual(casesCalled, true);
  });

  test("CallbackRouter routes testo_media_pick and testo_cases_pick to TestoController", async () => {
    let mediaPickParam = "";
    let casesPickParam = "";

    const mockTelegramApi: any = {
      answerCallbackQuery: async () => {},
      sendMessage: async () => {},
    };

    const mockTestoController: any = {
      handleMediaPick: async (chatId: number | string, userId: number, param?: string) => {
        mediaPickParam = param || "";
      },
      handleCasesPick: async (chatId: number | string, userId: number, param?: string) => {
        casesPickParam = param || "";
      },
    };

    const callbackRouter = new CallbackRouter(
      mockTelegramApi,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      accessControl,
      mockTestoController
    );

    await callbackRouter.route({
      id: "cb_1",
      from: { id: TESTO_ADMIN_ID, is_bot: false, first_name: "Admin" },
      message: { message_id: 10, chat: { id: TESTO_ADMIN_ID, type: "private" }, date: Date.now() },
      data: "testo_media_pick:1",
    });
    assert.strictEqual(mediaPickParam, "1");

    await callbackRouter.route({
      id: "cb_2",
      from: { id: TESTO_ADMIN_ID, is_bot: false, first_name: "Admin" },
      message: { message_id: 11, chat: { id: TESTO_ADMIN_ID, type: "private" }, date: Date.now() },
      data: "testo_cases_pick:2",
    });
    assert.strictEqual(casesPickParam, "2");
  });
});
