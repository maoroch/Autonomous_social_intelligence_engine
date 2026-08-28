import { z } from "zod";

export const SlideItemSchema = z.object({
  slide_number: z.number().optional(),
  title: z.string().default(""),
  bullets: z.array(z.string()).default([]),
  badge: z.string().optional(),
  illustration: z.string().optional(),
  illustration_name: z.string().optional(),
  image_url: z.string().optional(),
  image_prompt: z.string().optional(),
  isCover: z.boolean().optional(),
  footer: z.string().optional(),
  call_to_action: z.string().optional(),
});

export const SlideDeckSchema = z.object({
  template_name: z.string().optional(),
  slides: z.array(SlideItemSchema).min(1, "At least one slide is required"),
  hook: z.string().optional(),
  cta: z.string().optional(),
});

export type SlideItem = z.infer<typeof SlideItemSchema>;
export type SlideDeck = z.infer<typeof SlideDeckSchema>;
