import type { TemplateManifest } from "../validators/template.validator.js";
import type { SlideItem, SlideDeck } from "../validators/slide-deck.validator.js";
import type { DesignJobPayload } from "../validators/job-payload.validator.js";

export * from "../validators/index.js";

export interface StyleConfig {
  key: string;
  name?: string;
  coverTemplate: string;
  cardTemplate: string;
  defaultCoverBadge: string;
  defaultCardBadge: string;
  bulletFormat?: "card-box" | "inline-arrow" | "bullet-icon" | "p-tag";
  brand?: {
    accentColor: string;
    inkColor: string;
    paperColor: string;
  };
}

export interface RenderContext {
  title: string;
  badge: string;
  body: string;
  bodyHtml: string;
  bodyStyle: string;
  pageText: string;
  pageNumber: number;
  totalPages: number;
  footerLeft: string;
  accentColor: string;
  inkColor: string;
  paperColor: string;
  illustration: string;
  illustrationStyle: string;
}

export interface RenderedStyleOutput {
  zipId: string;
  coverId: string;
  imageIds: string[];
}
