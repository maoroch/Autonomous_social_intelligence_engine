import { z } from "zod";

export const RawTrendItemSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  score: z.number().default(50),
  source: z.string().default("unknown"),
  summary: z.string().optional(),
  fullArticleText: z.string().optional(),
  publishedAt: z.string().optional(),
});

export const AnalyzedTrendItemSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  score: z.number().min(0).max(100),
  keywords: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  fullArticleText: z.string().optional(),
});

export const TrendAnalysisOutputSchema = z.object({
  items: z.array(AnalyzedTrendItemSchema),
});

export type RawTrendItem = z.infer<typeof RawTrendItemSchema>;
export type AnalyzedTrendItem = z.infer<typeof AnalyzedTrendItemSchema>;
export type TrendAnalysisOutput = z.infer<typeof TrendAnalysisOutputSchema>;
