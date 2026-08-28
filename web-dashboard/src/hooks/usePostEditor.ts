"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { saveRunEdits, triggerAdaptation } from "@/lib/api-client";

export function usePostEditor(
  runId: string,
  tenantId: string,
  writingResult: any,
  runStatus: string
) {
  const [bodyText, setBodyText] = useState("");
  const [isAdapting, setIsAdapting] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (writingResult && !hasInitializedRef.current) {
      const fullText = writingResult?.text || writingResult?.body || "";
      setBodyText(fullText);
      hasInitializedRef.current = true;
    }
  }, [writingResult]);

  const savePost = useCallback(async () => {
    setSaveStatus("saving");
    try {
      await saveRunEdits(runId, tenantId, {
        postText: bodyText,
        bodyText,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err) {
      console.error("Failed to save post edits", err);
      setSaveStatus("error");
    }
  }, [runId, tenantId, bodyText]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(label);
    setTimeout(() => setCopySuccess(null), 2500);
  };

  const handleAdapt = async (platforms: string[] = ["telegram", "threads"]) => {
    setIsAdapting(true);
    try {
      await triggerAdaptation(runId, tenantId, platforms);
    } catch (err) {
      alert("Ошибка при вызове адаптации постов");
    } finally {
      setIsAdapting(false);
    }
  };

  return {
    bodyText,
    isAdapting,
    copySuccess,
    saveStatus,
    setBodyText,
    savePost,
    handleCopy,
    handleAdapt,
  };
}
