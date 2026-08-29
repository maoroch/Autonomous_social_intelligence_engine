"use client";

import React from "react";
import { SlideCardEditor } from "./SlideCardEditor";
import { SlidePreviewDeck } from "./SlidePreviewDeck";
import { TemplateSelector } from "./TemplateSelector";
import type { SlideData } from "@/hooks/useSlideDeckEditor";

interface CarouselTabProps {
  runId: string;
  tenantId: string;
  slides: SlideData[];
  activeSlide: number;
  selectedTemplate: string;
  isAwaitingApproval: boolean;
  isReRendering: boolean;
  actionLoading?: boolean;
  renderedStyles?: Record<string, any>;
  onSlideChange: (index: number, field: keyof SlideData, value: string | string[]) => void;
  onTemplateChange: (template: string) => void;
  onSelectSlide: (index: number) => void;
  onSaveManualEdits?: () => void;
}

export function CarouselTab({
  runId,
  tenantId,
  slides,
  activeSlide,
  selectedTemplate,
  isAwaitingApproval,
  isReRendering,
  actionLoading = false,
  renderedStyles,
  onSlideChange,
  onTemplateChange,
  onSelectSlide,
  onSaveManualEdits,
}: CarouselTabProps) {
  if (slides.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center", color: "#64748B", background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0" }}>
        Карусель еще генерируется или не содержит слайдов...
      </div>
    );
  }

  return (
    <div>
      <TemplateSelector
        selectedTemplate={selectedTemplate}
        onTemplateChange={onTemplateChange}
        isAwaitingApproval={isAwaitingApproval}
        tenantId={tenantId}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 28, minWidth: 0 }}>
        {/* Interactive Editor */}
        <SlideCardEditor
          slides={slides}
          activeSlide={activeSlide}
          selectedTemplate={selectedTemplate}
          isAwaitingApproval={isAwaitingApproval}
          actionLoading={actionLoading}
          onSlideChange={onSlideChange}
          onSelectSlide={onSelectSlide}
          onSaveManualEdits={onSaveManualEdits}
        />

        {/* Live Visual Deck */}
        <SlidePreviewDeck
          runId={runId}
          selectedTemplate={selectedTemplate}
          renderedStyles={renderedStyles}
          isReRendering={isReRendering}
          totalSlides={slides.length}
          activeSlide={activeSlide}
          onSelectSlide={onSelectSlide}
        />
      </div>
    </div>
  );
}
