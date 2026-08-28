export interface ExtractedRepoSource {
  title: string;
  summary: string;
  url: string;
}

export function extractGithubUrl(text: string): string {
  if (!text || typeof text !== "string") return "";
  const m = text.match(/(?:https?:\/\/)?github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i);
  if (m && m[1] && !m[1].endsWith("/trending")) {
    return `https://github.com/${m[1].replace(/\/$/, "")}`;
  }
  return "";
}

export function extractVerifiedGithubSources(
  trendItems: any[],
  isGithubShowcase: boolean
): ExtractedRepoSource[] {
  if (!isGithubShowcase || !Array.isArray(trendItems)) return [];

  const trendItemsList: ExtractedRepoSource[] = [];
  const seenUrls = new Set<string>();

  for (const item of trendItems) {
    let foundUrl = extractGithubUrl(item.url);
    if (!foundUrl && Array.isArray(item.sources)) {
      for (const s of item.sources) {
        foundUrl = extractGithubUrl(s);
        if (foundUrl) break;
      }
    }
    if (!foundUrl) {
      foundUrl = extractGithubUrl(item.summary || "") || extractGithubUrl(item.title || "");
    }
    if (foundUrl && !seenUrls.has(foundUrl)) {
      seenUrls.add(foundUrl);
      trendItemsList.push({
        title: item.title,
        summary: item.summary || "",
        url: foundUrl,
      });
    }
  }

  return trendItemsList;
}

export function buildVerifiedSourcesBlock(sources: ExtractedRepoSource[]): string {
  if (sources.length === 0) return "";
  return `\nCRITICAL GITHUB REPOSITORY MATCHING REQUIREMENT:
You MUST feature 3-4 DIFFERENT repositories using the titles and exact URLs below:
${sources.map((t, idx) => `- Repo #${idx + 1}: "${t.title}" -> ${t.url}`).join("\n")}
DO NOT REPEAT THE SAME REPOSITORY OR THE SAME URL MULTIPLE TIMES. EVERY REPOSITORY MUST HAVE A UNIQUE URL.\n`;
}

export function substituteGithubUrlsInText(text: string, verifiedSources: ExtractedRepoSource[]): string {
  const verifiedGithubUrls = Array.from(new Set(verifiedSources.map((t) => t.url).filter((u) => u.length > 0)));
  if (verifiedGithubUrls.length === 0) return text;

  let urlIdx = 0;
  const usedUrls = new Set<string>();
  const githubUrlRegex = /https:\/\/github\.com\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?/g;

  return text.replace(githubUrlRegex, (match: string) => {
    if (verifiedGithubUrls.includes(match) && !usedUrls.has(match)) {
      usedUrls.add(match);
      return match;
    }
    let substitute: string =
      verifiedGithubUrls[urlIdx % verifiedGithubUrls.length] ||
      verifiedGithubUrls[0] ||
      "https://github.com/trending";

    if (usedUrls.has(substitute) && verifiedGithubUrls.length > usedUrls.size) {
      const unused = verifiedGithubUrls.find((u: string) => !usedUrls.has(u));
      if (unused) substitute = unused;
    }
    usedUrls.add(substitute);
    urlIdx++;
    return substitute;
  });
}
