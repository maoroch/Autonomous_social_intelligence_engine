import { z } from "zod";
import { SlideItemSchema } from "./slide-deck.validator.js";

export const DesignJobPayloadSchema = z.object({
  isInlineEdit: z.boolean().optional().default(false),
  template_name: z.string().optional(),
  customSlides: z.array(SlideItemSchema).optional(),
  slideIndex: z.number().optional(),
  tenantId: z.string().optional(),
});

export type DesignJobPayload = z.infer<typeof DesignJobPayloadSchema>;
