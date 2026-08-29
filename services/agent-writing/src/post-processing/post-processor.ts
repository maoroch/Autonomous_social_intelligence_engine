export function applyDeterministicPostProcessing(
  rawText: string,
  platform: "linkedin" | "telegram" | "threads",
  defaultHashtags: string[] = [],
  isTesto: boolean = false,
  tenantId: string = "software-development-default"
): { text: string; headerEmojiUsed: boolean; bodyEmojisStrippedCount: number } {
  let text = rawText.trim();
  const isCinema = tenantId === "cinema-media";

  if (isTesto) {
    // Strip accidental tech/github hashtags from Testo posts
    text = text
      .replace(
        /#(?:github|backend|softwareengineering|frontend|devops|typescript|python|code|repository|petprojects|nodejs|performance)\b/gi,
        ""
      )
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  } else if (isCinema) {
    // Strip accidental tech AND pharma hashtags from Cinema posts
    text = text
      .replace(
        /#(?:github|backend|softwareengineering|frontend|devops|typescript|python|code|repository|petprojects|nodejs|performance|testo|gxp|pharma|комплаенс|холодоваяцепь|21cfrpart11|фармацевтика|фармпроизводство)\b/gi,
        ""
      )
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  } else {
    // Strip accidental pharma/Testo hashtags from Tech posts
    text = text
      .replace(
        /#(?:testo|gxp|pharma|комплаенс|холодоваяцепь|21cfrpart11|фармацевтика|фармпроизводство)\b/gi,
        ""
      )
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  const emojiRegex =
    /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  let bodyEmojisStrippedCount = 0;
  let headerEmojiUsed = false;

  const lines = text.split("\n");
  if (lines.length > 0 && lines[0] !== undefined) {
    let firstLine = lines[0].trim();
    if (platform === "telegram" || platform === "threads") {
      const match = firstLine.match(emojiRegex);
      if (match) {
        headerEmojiUsed = true;
      } else {
        firstLine = `📌 ${firstLine}`;
        headerEmojiUsed = true;
      }
      lines[0] = firstLine;

      // Body Emoji Stripper: Strip all emojis from lines 2+
      for (let i = 1; i < lines.length; i++) {
        const lineContent = lines[i];
        if (lineContent !== undefined) {
          const lineEmojis = lineContent.match(emojiRegex);
          if (lineEmojis) {
            bodyEmojisStrippedCount += lineEmojis.length;
            lines[i] = lineContent.replace(emojiRegex, "").replace(/[ \t]{2,}/g, " ");
          }
        }
      }
    }
  }

  text = lines.join("\n").trim();

  // Hashtags Sanitizer: Extract hashtags from both AI writer hashtags array and body text
  const hashtagRegex = /#[\wа-яА-ЯёЁ_-]+/g;
  const matches = text.match(hashtagRegex) || [];
  const normalizedDefaultTags = defaultHashtags
    .filter((t) => typeof t === "string" && t.trim().length > 0)
    .map((t) => (t.startsWith("#") ? t.trim() : `#${t.trim()}`));

  let hashtags = Array.from(new Set([...normalizedDefaultTags, ...matches]));

  if (isTesto) {
    hashtags = hashtags.filter(
      (t) =>
        !/#(?:github|backend|softwareengineering|frontend|devops|typescript|python|code|repository|petprojects|nodejs|performance)\b/i.test(
          t
        )
    );
  } else if (isCinema) {
    hashtags = hashtags.filter(
      (t) =>
        !/#(?:github|backend|softwareengineering|frontend|devops|typescript|python|code|repository|petprojects|nodejs|performance|testo|gxp|pharma|комплаенс|холодоваяцепь|21cfrpart11|фармацевтика|фармпроизводство)\b/i.test(
          t
        )
    );
  } else {
    hashtags = hashtags.filter(
      (t) =>
        !/#(?:testo|gxp|pharma|комплаенс|холодоваяцепь|21cfrpart11|фармацевтика|фармпроизводство)\b/i.test(
          t
        )
    );
  }

  if (hashtags.length === 0) {
    let fallbackTags = ["#github", "#backend", "#softwareengineering"];
    if (isTesto) {
      fallbackTags = ["#testo", "#gxp", "#pharma", "#комплаенс"];
    } else if (isCinema) {
      fallbackTags = ["#кино", "#фильмы", "#cinema", "#marvel", "#киноновости"];
    } else if (defaultHashtags.length > 0) {
      fallbackTags = defaultHashtags;
    }
    hashtags = fallbackTags;
  }

  // Remove hashtags from main body text so they are not duplicated in the middle
  const cleanBody = text
    .replace(hashtagRegex, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  text = `${cleanBody}\n\n${hashtags.join(" ")}`;

  return { text, headerEmojiUsed, bodyEmojisStrippedCount };
}
