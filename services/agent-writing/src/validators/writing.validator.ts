import { z } from "zod";

export const RussianPostAdaptationSchema = z.object({
  hook: z.string().optional(),
  text: z.string().min(1, "Post text cannot be empty"),
  hashtags: z.array(z.string()).default([]),
});

export const WritingOutputInternalSchema = z.object({
  text: z.string().min(1, "Text is required"),
  hook: z.string().default(""),
  cta: z.string().default(""),
  ru_post: RussianPostAdaptationSchema.optional(),
});

export const AdaptationRequestSchema = z.object({
  runId: z.string().optional(),
  tenantId: z.string().optional(),
  topicTitle: z.string().optional(),
  topicSummary: z.string().optional(),
  existingText: z.string().optional(),
  targetPlatform: z.enum(["telegram", "threads", "linkedin"]),
  textLength: z.enum(["short", "long"]).default("long"),
  pillarId: z.string().optional(),
});

export type RussianPostAdaptation = z.infer<typeof RussianPostAdaptationSchema>;
export type WritingOutputInternal = z.infer<typeof WritingOutputInternalSchema>;
export type AdaptationRequest = z.infer<typeof AdaptationRequestSchema>;
