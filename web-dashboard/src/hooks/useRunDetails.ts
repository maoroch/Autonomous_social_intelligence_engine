"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { fetchRunDetails as fetchRunDetailsApi } from "@/lib/api-client";

export function useRunDetails(runId: string, tenantId: string) {
  const [run, setRun] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReRendering, setIsReRendering] = useState(false);

  const prevPreviewIdRef = useRef<string | null>(null);
  const isReRenderingRef = useRef(false);

  const fetchDetails = useCallback(async () => {
    try {
      const data = await fetchRunDetailsApi(runId, tenantId);
      setRun(data.run);
      setStages(data.stages ?? []);

      const stagesReversed = [...(data.stages || [])].reverse();
      const designStage = stagesReversed.find((s: any) => s.stage === "design");

      const newPreviewId =
        designStage?.result?.imageIds?.[0] ||
        designStage?.result?.updatedAt ||
        designStage?.result?.preview_cover_1_id ||
        designStage?.result?.imageId ||
        null;

      if (isReRenderingRef.current && newPreviewId && newPreviewId !== prevPreviewIdRef.current) {
        setIsReRendering(false);
        isReRenderingRef.current = false;
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to load run details");
    } finally {
      setLoading(false);
    }
  }, [runId, tenantId]);

  const triggerReRenderingState = useCallback((currentPreviewId: string | null) => {
    prevPreviewIdRef.current = currentPreviewId;
    isReRenderingRef.current = true;
    setIsReRendering(true);
  }, []);

  const updateRunAndStages = useCallback((newRun: any, newStages: any[]) => {
    setRun(newRun);
    setStages(newStages);
    setIsReRendering(false);
    isReRenderingRef.current = false;
  }, []);

  useEffect(() => {
    fetchDetails();

    let interval: NodeJS.Timeout | null = null;
    // Only poll when run is actively running in background or actively re-rendering
    if (run?.status === "running" || isReRendering) {
      interval = setInterval(fetchDetails, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchDetails, run?.status, isReRendering]);

  return {
    run,
    stages,
    loading,
    error,
    isReRendering,
    fetchDetails,
    setRun,
    setStages,
    triggerReRenderingState,
    updateRunAndStages,
  };
}
