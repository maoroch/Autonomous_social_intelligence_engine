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
  const lastDesignSyncRef = useRef<string>("");
  const isDirtyRef = useRef<boolean>(false);

  // Initialize and synchronize slides when designResult updates
  useEffect(() => {
    if (designResult) {
      if (designResult.template_name && !isDirtyRef.current) {
        setSelectedTemplate(designResult.template_name);
      }

      const rawSlides =
        designResult?.card_deck?.slides ||
        (designResult?.render_data ? Object.values(designResult.render_data) : []);

      const syncSignature = JSON.stringify({
        tpl: designResult.template_name,
        slides: rawSlides.map((s: any) => ({
          t: s.title,
          b: s.bullets,
          bg: s.badge,
          ill: s.illustration && s.illustration !== "none" ? s.illustration : (s.illustration_name || "")
        }))
      });

      // Synchronize if not dirty (or initial load)
      if (rawSlides.length > 0 && syncSignature !== lastDesignSyncRef.current && !isDirtyRef.current) {
        setSlideDeck(
          rawSlides.map((val: any, idx: number) => ({
            key: `slide_${idx + 1}`,
            badge: val.badge || "",
            title: val.title || "",
            bullets: Array.isArray(val.bullets) ? val.bullets : [],
            footer: val.footer || "",
            illustration: val.illustration && val.illustration !== "none" ? val.illustration : (val.illustration_name || ""),
            isCover: idx === 0,
          }))
        );
        lastDesignSyncRef.current = syncSignature;
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
          slides: updatedSlides,
          customSlides: updatedSlides,
          template_name: templateName,
        });

        setSaveStatus("saved");
        isDirtyRef.current = false;
        setTimeout(() => setSaveStatus("idle"), 2500);

        if (onReRenderTriggered) {
          const previewId = designResult?.imageIds?.[0] || designResult?.preview_cover_1_id || designResult?.coverImageId || null;
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
    isDirtyRef.current = true;
    const updated = [...slideDeck];
    if (!updated[index]) return;

    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setSlideDeck(updated);
  };

  const handleTemplateChange = (newTemplate: string) => {
    isDirtyRef.current = true;
    setSelectedTemplate(newTemplate);
  };

  const markClean = useCallback(() => {
    isDirtyRef.current = false;
  }, []);

  return {
    slideDeck,
    activeSlide,
    selectedTemplate,
    saveStatus,
    setActiveSlide,
    handleSlideChange,
    handleTemplateChange,
    saveSlides,
    markClean,
  };
}
