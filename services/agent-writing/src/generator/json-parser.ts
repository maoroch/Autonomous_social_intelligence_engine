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
    const firstBrace = result.indexOf("{");
    const lastBrace = result.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const extracted = result.substring(firstBrace, lastBrace + 1);
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

  const text = typeof rawObj.text === "string" ? rawObj.text.trim() : "No text generated";
  const hook = typeof rawObj.hook === "string" ? rawObj.hook.trim() : "No hook generated";
  const cta = typeof rawObj.cta === "string" ? rawObj.cta.trim() : "No CTA generated";

  let ru_post: { hook?: string; text: string; hashtags?: string[] } | undefined;
  if (rawObj.ru_post && typeof rawObj.ru_post === "object") {
    ru_post = {
      hook: typeof rawObj.ru_post.hook === "string" ? rawObj.ru_post.hook.trim() : undefined,
      text: typeof rawObj.ru_post.text === "string" ? rawObj.ru_post.text.trim() : text,
      hashtags: Array.isArray(rawObj.ru_post.hashtags) ? rawObj.ru_post.hashtags : [],
    };
  }

  return {
    text,
    hook,
    cta,
    ru_post,
  };
}
