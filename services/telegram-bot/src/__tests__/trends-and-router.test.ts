import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCallbackData } from "../validation/callback.schema.js";
import { parseCommand } from "../validation/command.schema.js";
import { CallbackAction } from "../types/actions.types.js";
import { CallbackHandler } from "../handlers/callbacks.js";
import { CommandHandler } from "../handlers/commands.js";

describe("Trends and Router Architecture Unit Tests", () => {
  test("parseCallbackData should correctly validate and parse known actions", () => {
    const res1 = parseCallbackData("cmd:trends");
    assert.ok(res1.success);
    assert.strictEqual(res1.data.action, CallbackAction.CMD);
    assert.strictEqual(res1.data.param, "trends");

    const res2 = parseCallbackData("cinema_pick:0");
    assert.ok(res2.success);
    assert.strictEqual(res2.data.action, CallbackAction.CINEMA_PICK);
    assert.strictEqual(res2.data.param, "0");

    const res3 = parseCallbackData("cinema_mode:popular");
    assert.ok(res3.success);
    assert.strictEqual(res3.data.action, CallbackAction.CINEMA_MODE);
    assert.strictEqual(res3.data.param, "popular");
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

  test("CallbackHandler should route cmd:trends to live media crawler and send detailed article breakdown", async () => {
    let sentText = "";
    let sentMarkup: any = null;

    const mockCinemaCurator: any = {
      fetchCuratedTopics: async (mode: string) => [
        {
          title: "Spider-Man: Brand New Day Proves Video Games Can Be Action Movie Storyboards",
          url: "https://www.denofgeek.com/movies/spider-man/",
          summary: "Marvel sucks at following its comic source material...",
          source: "Den of Geek",
          category: mode,
        },
      ],
      saveUserArticles: () => {},
      formatArticleListMessage: (articles: any[], mode: string) => ({
        text: `🍿 🔥 ПОПУЛЯРНЫЕ ТЕМЫ И РАЗБОРЫ ЛОРА\n\n1️⃣ ${articles[0].title}\n📖 ${articles[0].summary}\n🔗 Источник (${articles[0].source})`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "1️⃣ Spider-Man: Brand New Day...", callback_data: "cinema_pick:0" }],
            [{ text: "🔄 Обновить подборку", callback_data: "cinema_refresh:popular" }],
          ],
        },
      }),
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
      async (_chatId, text, markup) => {
        sentText = text;
        sentMarkup = markup;
      }
    );

    await handler.handleCallback({
      id: "cb_trends_live",
      from: { id: 11111 },
      message: { message_id: 10, chat: { id: 777 } },
      data: "cmd:trends",
    });

    assert.ok(sentText.includes("ПОПУЛЯРНЫЕ ТЕМЫ И РАЗБОРЫ ЛОРА"), "Should display parsed crawler header");
    assert.ok(sentText.includes("Spider-Man: Brand New Day"), "Should contain full parsed article title");
    assert.ok(sentText.includes("Источник (Den of Geek)"), "Should contain media source citation");
    assert.ok(sentMarkup?.inline_keyboard?.length >= 2, "Should provide selection buttons");
    assert.strictEqual(sentMarkup.inline_keyboard[0][0].callback_data, "cinema_pick:0");
  });

  test("CommandHandler should handle /trends command by fetching real media trends", async () => {
    let sentText = "";
    let sentMarkup: any = null;

    const mockCinemaCurator: any = {
      fetchCuratedTopics: async () => [
        {
          title: "HBO Harry Potter Series Cast Updates",
          url: "https://www.denofgeek.com/tv/harry-potter/",
          summary: "HBO begins casting for golden trio...",
          source: "Den of Geek",
          category: "popular",
        },
      ],
      saveUserArticles: () => {},
      formatArticleListMessage: (articles: any[]) => ({
        text: `🍿 🔥 ПОПУЛЯРНЫЕ ТЕМЫ И РАЗБОРЫ ЛОРА\n\n1️⃣ ${articles[0].title}`,
        replyMarkup: {
          inline_keyboard: [[{ text: "1️⃣ Harry Potter...", callback_data: "cinema_pick:0" }]],
        },
      }),
    };

    const handler = new CommandHandler(
      {} as any,
      {} as any,
      {} as any,
      mockCinemaCurator,
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

    assert.ok(sentText.includes("ПОПУЛЯРНЫЕ ТЕМЫ И РАЗБОРЫ ЛОРА"), "Should send crawler parsed output");
    assert.strictEqual(sentMarkup.inline_keyboard[0][0].callback_data, "cinema_pick:0");
  });
});
