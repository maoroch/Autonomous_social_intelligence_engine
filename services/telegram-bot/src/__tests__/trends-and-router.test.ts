import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCallbackData } from "../validation/callback.schema.js";
import { parseCommand } from "../validation/command.schema.js";
import { CallbackAction } from "../types/actions.types.js";
import { CallbackHandler } from "../handlers/callbacks.js";
import { CommandHandler } from "../handlers/commands.js";
import { TREND_TOPICS, TrendsController } from "../controllers/trends.controller.js";

describe("Trends and Router Architecture Unit Tests", () => {
  test("parseCallbackData should correctly validate and parse known actions", () => {
    const res1 = parseCallbackData("cmd:trends");
    assert.ok(res1.success);
    assert.strictEqual(res1.data.action, CallbackAction.CMD);
    assert.strictEqual(res1.data.param, "trends");

    const res2 = parseCallbackData("trend_pick:spider_man_4");
    assert.ok(res2.success);
    assert.strictEqual(res2.data.action, CallbackAction.TREND_PICK);
    assert.strictEqual(res2.data.param, "spider_man_4");

    const res3 = parseCallbackData("cinema_pick:2");
    assert.ok(res3.success);
    assert.strictEqual(res3.data.action, CallbackAction.CINEMA_PICK);
    assert.strictEqual(res3.data.param, "2");
  });

  test("parseCallbackData should reject invalid or unknown actions", () => {
    const res1 = parseCallbackData("invalid_action_name:123");
    assert.strictEqual(res1.success, false);
    assert.match((res1 as any).error, /Unknown callback action/);

    const res2 = parseCallbackData("no_colon_here");
    assert.strictEqual(res2.success, false);
    assert.match((res2 as any).error, /missing colon separator/);

    const res3 = parseCallbackData("");
    assert.strictEqual(res3.success, false);
  });

  test("parseCommand should correctly extract command and arguments", () => {
    const cmd1 = parseCommand("/start");
    assert.ok(cmd1);
    assert.strictEqual(cmd1.command, "/start");
    assert.strictEqual(cmd1.args, "");

    const cmd2 = parseCommand("/post_cinema Spider-Man Brand New Day");
    assert.ok(cmd2);
    assert.strictEqual(cmd2.command, "/post_cinema");
    assert.strictEqual(cmd2.args, "Spider-Man Brand New Day");

    const notCmd = parseCommand("Just regular text");
    assert.strictEqual(notCmd, null);
  });

  test("TREND_TOPICS dictionary should have complete metadata for all hot topics", () => {
    const requiredKeys = ["spider_man_4", "harry_potter", "dune_3", "demon_slayer", "box_office_1b"];
    for (const key of requiredKeys) {
      const topic = TREND_TOPICS[key];
      assert.ok(topic, `Missing topic metadata for key: ${key}`);
      assert.ok(topic.title.length > 5, "Topic should have a descriptive title");
      assert.ok(topic.summary.length > 10, "Topic should have a summary");
      assert.ok(topic.source.length > 0, "Topic should have a source");
      assert.ok(topic.pillar.length > 0, "Topic should map to a content pillar");
      assert.ok(topic.fullArticleText.length > 20, "Topic should have grounding article text");
    }
  });

  test("CallbackHandler should route cmd:trends to showTrendsMenu", async () => {
    let sentText = "";
    let sentMarkup: any = null;

    const handler = new CallbackHandler(
      {} as any,
      "dummy_token",
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      "http://openclaw:4000",
      async (_chatId, text, markup) => {
        sentText = text;
        sentMarkup = markup;
      }
    );

    await handler.handleCallback({
      id: "cb_trends_menu",
      from: { id: 11111 },
      message: { message_id: 10, chat: { id: 777 } },
      data: "cmd:trends",
    });

    assert.ok(sentText.includes("Топ горячих трендов кино"), "Should send trends header text");
    assert.ok(sentMarkup?.inline_keyboard?.length >= 5, "Should return trends buttons");
    assert.strictEqual(sentMarkup.inline_keyboard[0][0].callback_data, "trend_pick:spider_man_4");
  });

  test("CallbackHandler should route trend_pick:spider_man_4 and trigger grounded cinema pipeline", async () => {
    let launched = false;
    let launchedArticle: any = null;
    let sentMessage = "";

    const mockCinemaCurator: any = {
      launchGroundedPipeline: async (article: any) => {
        launched = true;
        launchedArticle = article;
        return "kino_trend_run_999";
      },
    };

    const handler = new CallbackHandler(
      {} as any,
      "dummy_token",
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      mockCinemaCurator,
      {} as any,
      {} as any,
      "http://openclaw:4000",
      async (_chatId, text) => {
        sentMessage = text;
      }
    );

    await handler.handleCallback({
      id: "cb_trend_pick",
      from: { id: 22222 },
      message: { message_id: 20, chat: { id: 888 } },
      data: "trend_pick:spider_man_4",
    });

    assert.ok(launched, "Should launch pipeline via cinemaCurator");
    assert.ok(launchedArticle.title.includes("Человек-Паук 4"), "Should use Spider-Man topic title");
    assert.ok(sentMessage.includes("kino_trend_run_999"), "Confirmation message should include Run ID");
    assert.ok(sentMessage.includes("Человек-Паук 4"), "Confirmation message should include topic title");
  });

  test("CommandHandler should handle /trends command and show trends keyboard", async () => {
    let sentText = "";
    let sentMarkup: any = null;

    const handler = new CommandHandler(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      async (_chatId, text, markup) => {
        sentText = text;
        sentMarkup = markup;
      }
    );

    await handler.handleCommand({
      message_id: 30,
      from: { id: 33333 },
      chat: { id: 555 },
      text: "/trends",
    });

    assert.ok(sentText.includes("Топ горячих трендов кино"), "Should send trends text");
    assert.ok(sentMarkup?.inline_keyboard?.length >= 5, "Should provide trend buttons");
  });
});
