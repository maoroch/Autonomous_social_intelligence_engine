import { z } from "zod";

export const TemplateBrandColorsSchema = z.object({
  accentColor: z.string().default("#FF7900"),
  inkColor: z.string().default("#09090B"),
  paperColor: z.string().default("#FFFFFF"),
});

export const TemplateManifestSchema = z.object({
  id: z.string().min(1, "Template ID is required"),
  name: z.string().min(1, "Template display name is required"),
  description: z.string().optional(),
  tenants: z.array(z.string()).min(1, "At least one tenant must be specified"),
  cover: z.string().min(1, "Cover template file relative path is required"),
  card: z.string().min(1, "Card template file relative path is required"),
  defaultCoverBadge: z.string().default("B2B CASE"),
  defaultCardBadge: z.string().default("OVERVIEW"),
  brand: TemplateBrandColorsSchema.default({
    accentColor: "#FF7900",
    inkColor: "#09090B",
    paperColor: "#FFFFFF",
  }),
  bulletFormat: z.enum(["card-box", "inline-arrow", "bullet-icon", "p-tag"]).default("card-box"),
  tags: z.array(z.string()).default([]),
});

export type TemplateManifest = z.infer<typeof TemplateManifestSchema>;
