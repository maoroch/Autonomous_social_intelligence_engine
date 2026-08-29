export function parseCleanJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  cleaned = cleaned.trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with resilient extract
  }

  // Extract outer JSON braces
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(extracted);
    } catch {
      // Continue to newline escaping
    }
  }

  let inString = false;
  let result = "";
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const prevChar = i > 0 ? cleaned[i - 1] : "";
    if (char === '"' && prevChar !== "\\") {
      inString = !inString;
      result += char;
    } else if (char === "\n" && inString) {
      result += "\\n";
    } else if (char === "\r" && inString) {
      result += "\\r";
    } else if (char === "\t" && inString) {
      result += "\\t";
    } else {
      result += char;
    }
  }

  try {
    return JSON.parse(result);
  } catch (err) {
    const fBrace = result.indexOf("{");
    const lBrace = result.lastIndexOf("}");
    if (fBrace !== -1 && lBrace > fBrace) {
      const extracted = result.substring(fBrace, lBrace + 1);
      return JSON.parse(extracted);
    }
    throw err;
  }
}

export function sanitizeLlmOutput(rawObj: any): {
  text: string;
  hook: string;
  cta: string;
  ru_post?: { hook?: string; text: string; hashtags?: string[] };
} {
  if (!rawObj || typeof rawObj !== "object") {
    throw new Error("LLM did not return an object");
  }

  // 1. Извлечение основного текста из всех возможных структур
  let text = "";
  if (typeof rawObj.text === "string" && rawObj.text.trim()) {
    text = rawObj.text.trim();
  } else if (rawObj.заголовок || rawObj.лид || rawObj.буллеты || rawObj.детали || rawObj.подробности) {
    const parts: string[] = [];
    if (rawObj.заголовок) parts.push(String(rawObj.заголовок).trim());
    if (rawObj.лид) parts.push(String(rawObj.лид).trim());
    if (Array.isArray(rawObj.буллеты) && rawObj.буллеты.length > 0) {
      parts.push(rawObj.буллеты.map((b: any) => `• ${typeof b === "string" ? b : JSON.stringify(b)}`).join("\n"));
    }
    if (rawObj.детали || rawObj.подробности || rawObj.цитаты) {
      const d = rawObj.детали || rawObj.подробности || rawObj.цитаты;
      if (Array.isArray(d)) {
        parts.push(d.join("\n\n"));
      } else {
        parts.push(String(d).trim());
      }
    }
    if (rawObj.вопрос || rawObj.cta) parts.push(String(rawObj.вопрос || rawObj.cta).trim());
    text = parts.filter(Boolean).join("\n\n");
  } else if (Array.isArray(rawObj.sections) && rawObj.sections.length > 0) {
    text = rawObj.sections
      .map((s: any) => {
        if (typeof s === "string") return s;
        const heading = s.heading || s.title || s.person || "";
        const prev = s.previousCareer ? `📌 Предыдущая профессия: ${s.previousCareer}` : "";
        const breakout = s.breakoutRole || s.breakout || (Array.isArray(s.breakoutRoles) ? s.breakoutRoles.join(", ") : "");
        const breakoutStr = breakout ? `🎬 Прорыв: ${breakout}` : "";
        const body = s.text || s.content || s.body || s.analysis || "";
        
        const parts = [
          heading ? `### ${heading}` : "",
          prev,
          breakoutStr,
          body
        ].filter(Boolean);
        return parts.join("\n");
      })
      .filter(Boolean)
      .join("\n\n");
  } else if (rawObj.ru_post && typeof rawObj.ru_post.text === "string" && rawObj.ru_post.text.trim()) {
    text = rawObj.ru_post.text.trim();
  } else if (typeof rawObj.post === "string" && rawObj.post.trim()) {
    text = rawObj.post.trim();
  } else if (typeof rawObj.body === "string" && rawObj.body.trim()) {
    text = rawObj.body.trim();
  } else if (typeof rawObj.content === "string" && rawObj.content.trim()) {
    text = rawObj.content.trim();
  } else if (typeof rawObj.article === "string" && rawObj.article.trim()) {
    text = rawObj.article.trim();
  } else if (typeof rawObj.summary === "string" && rawObj.summary.trim()) {
    text = rawObj.summary.trim();
  }

  // 2. Извлечение хука
  let hook = "";
  if (typeof rawObj.hook === "string" && rawObj.hook.trim()) {
    hook = rawObj.hook.trim();
  } else if (typeof rawObj.заголовок === "string" && rawObj.заголовок.trim()) {
    hook = rawObj.заголовок.trim();
  } else if (typeof rawObj.title === "string" && rawObj.title.trim()) {
    hook = rawObj.title.trim();
  } else if (rawObj.ru_post && typeof rawObj.ru_post.hook === "string" && rawObj.ru_post.hook.trim()) {
    hook = rawObj.ru_post.hook.trim();
  } else if (text) {
    const firstLine = text.split("\n")[0]?.replace(/^#+\s*/, "").trim();
    hook = firstLine || "No hook generated";
  } else {
    hook = "No hook generated";
  }

  // 3. Извлечение CTA
  let cta = "";
  if (typeof rawObj.cta === "string" && rawObj.cta.trim()) {
    cta = rawObj.cta.trim();
  } else if (typeof rawObj.вопрос === "string" && rawObj.вопрос.trim()) {
    cta = rawObj.вопрос.trim();
  } else if (typeof rawObj.call_to_action === "string" && rawObj.call_to_action.trim()) {
    cta = rawObj.call_to_action.trim();
  } else {
    cta = "Какое ваше мнение? Поделитесь в комментариях!";
  }

  const rawHashtags = Array.isArray(rawObj.hashtags)
    ? rawObj.hashtags
    : Array.isArray(rawObj.хэштеги)
      ? rawObj.хэштеги
      : Array.isArray(rawObj.ru_post?.hashtags)
        ? rawObj.ru_post.hashtags
        : [];

  let ru_post: { hook?: string; text: string; hashtags?: string[] } | undefined;
  if (rawObj.ru_post && typeof rawObj.ru_post === "object") {
    ru_post = {
      hook: typeof rawObj.ru_post.hook === "string" ? rawObj.ru_post.hook.trim() : hook,
      text: typeof rawObj.ru_post.text === "string" ? rawObj.ru_post.text.trim() : text,
      hashtags: rawHashtags,
    };
  } else {
    ru_post = {
      hook,
      text,
      hashtags: rawHashtags,
    };
  }

  return {
    text: text || "No text generated",
    hook,
    cta,
    ru_post,
  };
}
