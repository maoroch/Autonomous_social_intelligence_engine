/**
 * Простой keyword-based retrieval (без embeddings/векторной БД — её нет в текущей инфраструктуре).
 * Это валидный, хоть и более грубый вариант RAG для относительно небольшого корпуса
 * (спецификации приборов, десятки-сотни фрагментов на клиента) — полноценный semantic search
 * можно добавить позже, заменив реализацию scoreChunk, не меняя вызывающий код.
 *
 * Алгоритм: токенизация запроса и каждого чанка, оценка релевантности через долю пересечения
 * токенов запроса с токенами чанка (простой Jaccard-подобный скор), с бонусом за точное
 * вхождение фраз длиннее одного слова. Возвращает top-K чанков выше порога релевантности.
 */

export interface RetrievableChunk {
  productName: string;
  sourceLabel: string;
  content: string;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function scoreChunk(queryTokens: Set<string>, chunk: RetrievableChunk): number {
  const chunkTokens = tokenize(`${chunk.productName} ${chunk.content}`);
  if (chunkTokens.size === 0) return 0;

  let overlap = 0;
  for (const t of queryTokens) {
    if (chunkTokens.has(t)) overlap++;
  }
  if (overlap === 0) return 0;

  // Jaccard-подобная метрика: пересечение относительно размера обоих множеств.
  const union = new Set([...queryTokens, ...chunkTokens]).size;
  return overlap / union;
}

/** Возвращает top-K наиболее релевантных чанков запросу, отсортированных по убыванию скора. */
export function retrieveRelevantChunks(
  query: string,
  chunks: RetrievableChunk[],
  topK = 3,
  minScore = 0.02,
): RetrievableChunk[] {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return [];

  return chunks
    .map((chunk) => ({ chunk, score: scoreChunk(queryTokens, chunk) }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}

/** Форматирует найденные факты в текстовый блок для инъекции в промпт LLM. */
export function formatFactsForPrompt(chunks: RetrievableChunk[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map((c) => `- [${c.productName}] ${c.content} (источник: ${c.sourceLabel})`)
    .join("\n");
}
