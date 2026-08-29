"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useRunDetails } from "@/hooks/useRunDetails";
import { useSlideDeckEditor } from "@/hooks/useSlideDeckEditor";
import { usePostEditor } from "@/hooks/usePostEditor";
import { approveRun, rejectRun, triggerRedesign, triggerReprocess, saveRunEdits } from "@/lib/api-client";

import { RunHeader } from "@/components/runs/RunHeader";
import { RunProgressTracker } from "@/components/runs/RunProgressTracker";
import { PostEditorTab } from "@/components/runs/PostEditorTab";
import { CarouselTab } from "@/components/runs/CarouselTab";
import { ValidationAuditTab } from "@/components/runs/ValidationAuditTab";
import { RedesignModal } from "@/components/runs/modals/RedesignModal";
import { ReprocessModal } from "@/components/runs/modals/ReprocessModal";

interface PageProps {
  params: Promise<{ runId: string; tenantId: string }>;
}

export default function RunDetailsPage({ params }: PageProps) {
  const { runId, tenantId } = use(params);
  const router = useRouter();

  const [activeMainTab, setActiveMainTab] = useState<"editor" | "carousel" | "analytics">("editor");
  const [actionLoading, setActionLoading] = useState(false);
  const [isRedesignModalOpen, setIsRedesignModalOpen] = useState(false);
  const [isReprocessModalOpen, setIsReprocessModalOpen] = useState(false);

  // Hook 1: Run Details & Polling
  const {
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
  } = useRunDetails(runId, tenantId);

  const stagesReversed = [...stages].reverse();
  const writingResult = stagesReversed.find((s) => s.stage === "writing")?.result;
  const designResult = stagesReversed.find((s) => s.stage === "design")?.result;

  const isAwaitingApproval =
    run?.status === "awaiting_approval" || run?.status === "human_approval_required";

  // Hook 2: Slide Deck Editor & Preview
  const {
    slideDeck,
    activeSlide,
    selectedTemplate,
    setActiveSlide,
    handleSlideChange,
    handleTemplateChange,
    saveSlides,
    markClean,
  } = useSlideDeckEditor(
    runId,
    tenantId,
    designResult,
    isAwaitingApproval,
    triggerReRenderingState
  );

  // Hook 3: Post Master Copywriting & Adaptations
  const {
    bodyText,
    isAdapting,
    copySuccess,
    setBodyText,
    savePost,
    handleCopy,
    handleAdapt,
  } = usePostEditor(runId, tenantId, writingResult, run?.status || "");

  // Actions
  const handleApprove = async () => {
    setActionLoading(true);
    try {
      if (isAwaitingApproval) {
        await savePost();
      }
      await approveRun(runId, tenantId);
      router.push(`/${tenantId}/dashboard`);
    } catch (err) {
      alert("Ошибка при одобрении публикации");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!confirm("Вы уверены, что хотите отклонить публикацию?")) return;
    setActionLoading(true);
    try {
      await rejectRun(runId, tenantId);
      router.push(`/${tenantId}/dashboard`);
    } catch (err) {
      alert("Ошибка при отклонении публикации");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRedesignSubmit = async (notes: string, templateName: string) => {
    setActionLoading(true);
    try {
      await triggerRedesign(runId, tenantId, notes, templateName);
      setIsRedesignModalOpen(false);
      fetchDetails();
    } catch (err) {
      alert("Не удалось запустить перегенерацию дизайна");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReprocessSubmit = async (notes: string) => {
    setActionLoading(true);
    try {
      await triggerReprocess(runId, tenantId, notes);
      setIsReprocessModalOpen(false);
      fetchDetails();
    } catch (err) {
      alert("Не удалось перезапустить пост");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveManualEdits = async () => {
    setActionLoading(true);
    try {
      const data = await saveRunEdits(runId, tenantId, {
        postText: bodyText,
        bodyText,
        slides: slideDeck,
        customSlides: slideDeck,
        template_name: selectedTemplate,
      });
      if (data?.run && data?.stages) {
        updateRunAndStages(data.run, data.stages);
      } else {
        if (data?.stages) setStages(data.stages);
        if (data?.run) setRun(data.run);
      }
      markClean();
      alert("Правки успешно сохранены и слайды перерендерены!");
    } catch (err) {
      console.error("Error saving manual edits:", err);
      alert("Ошибка при сохранении правок");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="container" style={{ padding: 40, textAlign: "center" }}>
        <p>Загрузка данных прогона...</p>
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="container" style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>
        <p>{error || "Прогон не найден"}</p>
        <Link href={`/${tenantId}/dashboard`} style={{ color: "#6366F1", marginTop: 12, display: "inline-block" }}>
          ← Вернуться к дашборду
        </Link>
      </main>
    );
  }

  return (
    <main className="container" style={{ paddingBottom: 60 }}>
      {/* Top Back Link */}
      <div style={{ marginBottom: 20 }}>
        <Link href={`/${tenantId}/dashboard`} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "#64748B" }}>
          ← Назад к дашборду
        </Link>
      </div>

      {/* Header & Controls */}
      <RunHeader
        runId={run.runId}
        topicTitle={run.topic?.title || "Без заголовка"}
        status={run.status}
        seoImprovementsCount={run.seoImprovementsCount}
        needsComplianceReview={run.needsComplianceReview}
        actionLoading={actionLoading}
        onApprove={handleApprove}
        onReject={handleReject}
        onOpenRedesign={() => setIsRedesignModalOpen(true)}
        onOpenReprocess={() => setIsReprocessModalOpen(true)}
        onSaveManualEdits={handleSaveManualEdits}
      />

      {/* Progress Timeline Tracker */}
      <RunProgressTracker
        stages={stages}
        currentStage={run.currentStage}
        runStatus={run.status}
      />

      {/* Segmented Control Navigation Tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 24,
          background: "#FFFFFF",
          padding: 6,
          borderRadius: 14,
          border: "1px solid #E2E8F0",
          boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
          width: "fit-content",
        }}
      >
        <button
          onClick={() => setActiveMainTab("editor")}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: activeMainTab === "editor" ? "#0F172A" : "transparent",
            color: activeMainTab === "editor" ? "#FFFFFF" : "#64748B",
            fontWeight: activeMainTab === "editor" ? 700 : 600,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          ✍️ Контент & Мультипостинг
        </button>

        <button
          onClick={() => setActiveMainTab("carousel")}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: activeMainTab === "carousel" ? "#0F172A" : "transparent",
            color: activeMainTab === "carousel" ? "#FFFFFF" : "#64748B",
            fontWeight: activeMainTab === "carousel" ? 700 : 600,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          🎨 Карусель & Слайды
        </button>

        <button
          onClick={() => setActiveMainTab("analytics")}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: activeMainTab === "analytics" ? "#0F172A" : "transparent",
            color: activeMainTab === "analytics" ? "#FFFFFF" : "#64748B",
            fontWeight: activeMainTab === "analytics" ? 700 : 600,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          🛡️ Валидация & SEO (Аналитика)
        </button>
      </div>

      {/* Tab 1: Post Editor */}
      {activeMainTab === "editor" && (
        <PostEditorTab
          bodyText={bodyText}
          isAwaitingApproval={isAwaitingApproval}
          isAdapting={isAdapting}
          copySuccess={copySuccess}
          adaptations={run.adaptations}
          onBodyChange={setBodyText}
          onCopy={handleCopy}
          onAdapt={handleAdapt}
        />
      )}

      {/* Tab 2: Carousel & Slides */}
      {activeMainTab === "carousel" && (
        <CarouselTab
          runId={runId}
          tenantId={tenantId}
          slides={slideDeck}
          activeSlide={activeSlide}
          selectedTemplate={selectedTemplate}
          isAwaitingApproval={isAwaitingApproval}
          isReRendering={isReRendering}
          actionLoading={actionLoading}
          renderedStyles={designResult?.rendered_styles}
          onSlideChange={handleSlideChange}
          onTemplateChange={handleTemplateChange}
          onSelectSlide={setActiveSlide}
          onSaveManualEdits={handleSaveManualEdits}
        />
      )}

      {/* Tab 3: Validation & SEO */}
      {activeMainTab === "analytics" && (
        <ValidationAuditTab
          evaluation={run.evaluation}
          stages={stages}
        />
      )}

      {/* Modals */}
      <RedesignModal
        isOpen={isRedesignModalOpen}
        onClose={() => setIsRedesignModalOpen(false)}
        onSubmit={handleRedesignSubmit}
        currentTemplate={selectedTemplate}
        availableTemplates={[
          { key: "industrial-measurement-equipment", name: "🔶 Testo Brand (Default)" },
          { key: "testo-brand-orange", name: "Testo Brand Orange" },
          { key: "testo-pharma-compliance", name: "Testo Pharma Blue" },
          { key: "testo-pharma-cold-chain", name: "Testo Cold Chain Cyan" },
          { key: "testo-pharma-audit", name: "Testo Audit Green" },
        ]}
        actionLoading={actionLoading}
      />

      <ReprocessModal
        isOpen={isReprocessModalOpen}
        onClose={() => setIsReprocessModalOpen(false)}
        onSubmit={handleReprocessSubmit}
        actionLoading={actionLoading}
      />
    </main>
  );
}
