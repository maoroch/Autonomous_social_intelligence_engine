"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { saveRunEdits } from "@/lib/api-client";

export interface SlideData {
  key: string;
  badge: string;
  title: string;
  bullets: string[];
  footer: string;
  illustration?: string;
  isCover?: boolean;
}

export function useSlideDeckEditor(
  runId: string,
  tenantId: string,
  designResult: any,
  isAwaitingApproval: boolean,
  onReRenderTriggered?: (currentPreviewId: string | null) => void
) {
  const [slideDeck, setSlideDeck] = useState<SlideData[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("industrial-measurement-equipment");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const hasInitializedRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize slides on first load
  useEffect(() => {
    if (designResult && !hasInitializedRef.current) {
      if (designResult.template_name) {
        setSelectedTemplate(designResult.template_name);
      }

      const rawSlides =
        designResult?.card_deck?.slides ||
        (designResult?.render_data ? Object.values(designResult.render_data) : []);

      if (rawSlides.length > 0) {
        setSlideDeck(
          rawSlides.map((val: any, idx: number) => ({
            key: `slide_${idx + 1}`,
            badge: val.badge || "",
            title: val.title || "",
            bullets: Array.isArray(val.bullets) ? val.bullets : [],
            footer: val.footer || "",
            illustration: val.illustration || val.illustration_name || "none",
            isCover: idx === 0,
          }))
        );
        hasInitializedRef.current = true;
      }
    }
  }, [designResult]);

  const saveSlides = useCallback(
    async (updatedSlides: SlideData[], templateName: string) => {
      setSaveStatus("saving");
      try {
        const renderDataObj: Record<string, any> = {};
        updatedSlides.forEach((s, i) => {
          renderDataObj[`slide_${i + 1}`] = {
            badge: s.badge,
            title: s.title,
            bullets: s.bullets,
            footer: s.footer,
            illustration: s.illustration,
          };
        });

        await saveRunEdits(runId, tenantId, {
          render_data: renderDataObj,
          customSlides: updatedSlides,
          template_name: templateName,
        });

        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2500);

        if (onReRenderTriggered) {
          const previewId = designResult?.preview_cover_1_id || designResult?.coverImageId || null;
          onReRenderTriggered(previewId);
        }
      } catch (err) {
        console.error("Failed to save slide deck edits", err);
        setSaveStatus("error");
      }
    },
    [runId, tenantId, designResult, onReRenderTriggered]
  );

  const handleSlideChange = (
    index: number,
    field: keyof SlideData,
    value: string | string[]
  ) => {
    const updated = [...slideDeck];
    if (!updated[index]) return;

    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setSlideDeck(updated);

    // Debounced autosave
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      saveSlides(updated, selectedTemplate);
    }, 1000);
  };

  const handleTemplateChange = (newTemplate: string) => {
    setSelectedTemplate(newTemplate);
    saveSlides(slideDeck, newTemplate);
  };

  return {
    slideDeck,
    activeSlide,
    selectedTemplate,
    saveStatus,
    setActiveSlide,
    handleSlideChange,
    handleTemplateChange,
    saveSlides,
  };
}
