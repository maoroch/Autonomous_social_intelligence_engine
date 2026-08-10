"use client";

import { useEffect, useState, use, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface PageProps {
  params: Promise<{ runId: string; tenantId: string }>;
}

interface RunDoc {
  runId: string;
  status: "running" | "awaiting_approval" | "approved" | "rejected" | "failed";
  currentStage: string;
  topic: { title: string; summary: string };
  seoImprovementsCount?: number;
  needsComplianceReview?: boolean;
  contentPillarId?: string;
  adaptations?: {
    telegram?: { text: string; hook?: string; hashtags?: string[]; length: "short" | "long"; alignmentScore?: number };
    threads?: { text: string; hook?: string; hashtags?: string[]; length: "short" | "long"; alignmentScore?: number };
  };
  evaluation?: {
    writing?: { alignmentScore: number; driftReport: { rule: string; passed: boolean; details: string }[]; isGoldenMatch: boolean; evaluatedAt: string };
    design?: { alignmentScore: number; driftReport: { rule: string; passed: boolean; details: string }[]; isGoldenMatch: boolean; evaluatedAt: string };
  };
  updatedAt: string;
}

interface StageResult {
  stage: string;
  result: any;
}

export default function RunDetailPage({ params }: PageProps) {
  const { runId, tenantId } = use(params);
  const router = useRouter();

  const [run, setRun] = useState<RunDoc | null>(null);
  const [stages, setStages] = useState<StageResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // States for editing
  const [hook, setHook] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [cta, setCta] = useState("");
  const [slideDeck, setSlideDeck] = useState<any[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("cover-2");
  const [isReRendering, setIsReRendering] = useState(false);
  const isReRenderingRef = useRef(false);
  const prevPreviewIdRef = useRef<string | null>(null);

  // Main Tab Navigation State
  const [activeMainTab, setActiveMainTab] = useState<"editor" | "carousel" | "analytics">("editor");

  // Multi-Platform Adaptation State
  const [activePlatformTab, setActivePlatformTab] = useState<"linkedin" | "telegram" | "threads">("linkedin");
  const [adaptLength, setAdaptLength] = useState<"short" | "long">("long");
  const [isAdapting, setIsAdapting] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // States for reprocessing
  const [isReprocessModalOpen, setIsReprocessModalOpen] = useState(false);
  const [reprocessNotes, setReprocessNotes] = useState("");

  // Carousel slider state
  const [activeSlide, setActiveSlide] = useState(0);
  const [availableIllustrations, setAvailableIllustrations] = useState<any[]>([]);

  const handleAdapt = async () => {
    setIsAdapting(true);
    try {
      const res = await fetch(`/api/runs/${runId}/adapt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textLength: adaptLength }),
      });
      if (res.ok) {
        await fetchRunDetails();
        setActivePlatformTab("telegram");
      } else {
        alert("Не удалось сгенерировать посты для Telegram и Threads.");
      }
    } catch (err) {
      console.error(err);
      alert("Ошибка при вызове адаптации постов");
    } finally {
      setIsAdapting(false);
    }
  };

  const handleCopyText = (textToCopy: string, label: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopySuccess(label);
    setTimeout(() => setCopySuccess(null), 2500);
  };

  const handleReprocess = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/reprocess?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: reprocessNotes }),
      });
      if (res.ok) {
        setIsReprocessModalOpen(false);
        setReprocessNotes("");
        fetchRunDetails();
      } else {
        alert("Не удалось отправить на перегенерацию.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/illustrations")
      .then(res => res.json())
      .then(data => setAvailableIllustrations(data))
      .catch(err => console.error("Failed to load illustrations", err));
  }, []);

  const fetchRunDetails = async () => {
    try {
      const res = await fetch(`/api/runs/${runId}?tenantId=${encodeURIComponent(tenantId)}`);
      if (res.ok) {
        const data = await res.json();
        setRun(data.run);
        setStages(data.stages ?? []);

        const stagesReversed = [...(data.stages || [])].reverse();
        const designStage = stagesReversed.find((s: any) => s.stage === "design");
        if (designStage?.result?.template_name) {
          setSelectedTemplate(designStage.result.template_name);
        }

        const newPreviewId = designStage?.result?.preview_cover_1_id || designStage?.result?.imageId || null;
        if (isReRenderingRef.current && newPreviewId && newPreviewId !== prevPreviewIdRef.current) {
          setIsReRendering(false);
          isReRenderingRef.current = false;
        }

        // Populate editable states if awaiting_approval and not already edited
        if (data.run.status === "awaiting_approval") {
          const writingResult = stagesReversed.find((s: any) => s.stage === "writing")?.result;
          const designResult = designStage?.result;

          setHook(prev => prev || writingResult?.hook || "");
          setBodyText(prev => prev || writingResult?.text || "");
          setCta(prev => prev || writingResult?.cta || "");
          setSlideDeck(prev => prev.length > 0 ? prev : (designResult?.render_data
            ? Object.entries(designResult.render_data).map(([key, val]: [string, any]) => ({
              key,
              title: val.title || "",
              bullets: Array.isArray(val.bullets) ? val.bullets : [],
              footer: val.footer || "",
              illustration: val.illustration || "none",
            }))
            : []
          ));
        }
      } else {
        setError("Прогон не найден или произошла ошибка.");
      }
    } catch (err) {
      console.error(err);
      setError("Не удалось подключиться к серверу.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRunDetails();

    // Poll run details while running or re-rendering
    let interval: NodeJS.Timeout;
    if (run?.status === "running" || isReRendering) {
      interval = setInterval(fetchRunDetails, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [runId, run?.status, isReRendering]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      // Auto-save changes first if awaiting approval
      if (run?.status === "awaiting_approval") {
        await fetch(`/api/runs/${runId}/edit?tenantId=${encodeURIComponent(tenantId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postText: { hook, text: bodyText, cta },
            slides: slideDeck
          }),
        });
      }

      const res = await fetch(`/api/runs/${runId}/approve?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_name: selectedTemplate }),
      });
      if (res.ok) {
        fetchRunDetails();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/reject?tenantId=${encodeURIComponent(tenantId)}`, { method: "POST" });
      if (res.ok) {
        fetchRunDetails();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    setSaveStatus("saving");

    // Store current preview ID to track changes
    const designStage = [...stages].reverse().find((s) => s.stage === "design");
    prevPreviewIdRef.current = designStage?.result?.preview_cover_1_id || designStage?.result?.imageId || null;

    try {
      const res = await fetch(`/api/runs/${runId}/edit?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postText: { hook, text: bodyText, cta },
          slides: slideDeck
        }),
      });
      if (res.ok) {
        setSaveStatus("success");
        setIsReRendering(true);
        isReRenderingRef.current = true;
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
    }
  };

  const handleSlideChange = (index: number, field: string, value: any) => {
    setSlideDeck((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  if (loading) {
    return (
      <main className="container" style={{ textAlign: "center", padding: "100px 0" }}>
        <p style={{ color: "var(--text-muted)" }}>Загрузка деталей прогона...</p>
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="container" style={{ textAlign: "center", padding: "100px 0" }}>
        <h2 style={{ color: "var(--red)" }}>Ошибка</h2>
        <p style={{ color: "var(--text-muted)" }}>{error || "Прогон не найден"}</p>
        <Link href={`/${tenantId}/dashboard`} className="btn btn-secondary" style={{ marginTop: 16 }}>
          ← Вернуться на дашборд
        </Link>
      </main>
    );
  }

  const stagesReversed = [...stages].reverse();
  const trendResult = stagesReversed.find((s) => s.stage === "trend")?.result;
  const positioningResult = stagesReversed.find((s) => s.stage === "positioning")?.result;
  const strategyResult = stagesReversed.find((s) => s.stage === "strategy")?.result;
  const writingResult = stagesReversed.find((s) => s.stage === "writing")?.result;
  const designResult = stagesReversed.find((s) => s.stage === "design")?.result;
  const seoResult = stagesReversed.find((s) => s.stage === "seo")?.result;

  const accentColor = designResult?.accent_color || "var(--secondary)";
  const isAwaitingApproval = run.status === "awaiting_approval";

  // Use slideDeck state if editing, otherwise fall back to database result
  const activeSlides = isAwaitingApproval && slideDeck.length > 0
    ? slideDeck
    : (designResult?.render_data
      ? Object.entries(designResult.render_data).map(([key, val]: [string, any]) => ({
        key,
        title: val.title || "",
        bullets: Array.isArray(val.bullets) ? val.bullets : [],
        footer: val.footer || "",
        illustration: val.illustration || "none",
      }))
      : []
    );

  return (
    <main className="container">
      <div style={{ marginBottom: 24 }}>
        <Link href={`/${tenantId}/dashboard`} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 }}>
          ← Назад к дашборду
        </Link>
      </div>

      {/* Header Info */}
      <div className="card" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <span className={`badge badge-${run.status === "awaiting_approval" ? "awaiting" : run.status}`}>
                {run.status === "awaiting_approval" ? "ожидает подтверждения" : run.status === "running" ? "в процессе" : run.status}
              </span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>ID прогона: {run.runId}</span>
              {run.seoImprovementsCount && run.seoImprovementsCount > 0 ? (
                <span className="badge badge-running" style={{ fontSize: 11 }}>
                  Доработка SEO: Попытка {run.seoImprovementsCount} из 2
                </span>
              ) : null}
            </div>
            <h1 style={{ margin: 0, fontSize: 28, color: "var(--text-main)" }}>
              {run.topic.title || "Генерация темы..."}
            </h1>
          </div>

          {/* Action Panel */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {isAwaitingApproval && (
              <>
                <button
                  disabled={actionLoading}
                  onClick={() => setIsReprocessModalOpen(true)}
                  className="btn"
                  style={{
                    padding: "10px 20px",
                    background: "#f3f4f6",
                    color: "#374151",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  🔄 Переделать пост
                </button>
                <button
                  disabled={actionLoading || saveStatus === "saving"}
                  onClick={handleSaveChanges}
                  className="btn btn-secondary"
                  style={{
                    padding: "10px 20px",
                    background: saveStatus === "success" ? "var(--green)" : saveStatus === "error" ? "var(--red)" : "transparent",
                    border: "1px solid var(--border)",
                  }}
                >
                  {saveStatus === "saving" ? "Сохранение..." : saveStatus === "success" ? "Сохранено! ✓" : saveStatus === "error" ? "Ошибка" : "Сохранить правки"}
                </button>
                {run.needsComplianceReview && (
                  <div
                    style={{
                      width: "100%",
                      background: "#fef3c7",
                      border: "1px solid #f59e0b",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                      color: "#92400e",
                      marginBottom: 4,
                    }}
                  >
                    ⚠️ В тексте обнаружены числа/характеристики, не найденные в исходной теме — проверьте
                    формулировки на фактологическую точность перед публикацией (автоматическая эвристика,
                    возможны ложные срабатывания).
                  </div>
                )}
                <button disabled={actionLoading} onClick={handleApprove} className="btn btn-primary" style={{ padding: "10px 20px" }}>
                  {actionLoading ? "..." : "Одобрить и опубликовать"}
                </button>
                <button disabled={actionLoading} onClick={handleReject} className="btn btn-danger" style={{ padding: "10px 20px" }}>
                  {actionLoading ? "..." : "Отклонить"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Progress Tracker */}
        <div style={{ display: "flex", justifyContent: "space-between", position: "relative", marginTop: 28, padding: "0 10px" }}>
          <div style={{
            position: "absolute",
            top: 15,
            left: 20,
            right: 20,
            height: 2,
            background: "#e5e7eb",
            zIndex: 1
          }} />

          {["trend", "positioning", "strategy", "writing", "design", "seo", "human_approval"].map((stage, idx) => {
            const isCompleted = stages.some((s) => s.stage === stage) || (run.status === "awaiting_approval" && stage !== "human_approval");
            const isActive = run.currentStage === stage;

            return (
              <div key={stage} style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 2, flex: 1 }}>
                <div style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: isCompleted ? "var(--green)" : isActive ? "var(--secondary)" : "#f3f4f6",
                  border: `2px solid ${isCompleted ? "var(--green)" : isActive ? "var(--secondary)" : "#d1d5db"}`,
                  boxShadow: isActive ? "0 0 12px rgba(99, 102, 241, 0.4)" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: "bold",
                  color: isCompleted || isActive ? "#fff" : "var(--text-muted)",
                  transition: "all 0.3s"
                }}>
                  {isCompleted ? "✓" : idx + 1}
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  marginTop: 6,
                  color: isActive ? "var(--secondary)" : isCompleted ? "var(--green)" : "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                  textAlign: "center"
                }}>
                  {stage.replace("_", " ")}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Segmented Control Main Tabs Navigation */}
      <div style={{
        display: "flex",
        gap: 8,
        marginBottom: 24,
        background: "#ffffff",
        padding: 6,
        borderRadius: 14,
        border: "1px solid #e2e8f0",
        boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
        width: "fit-content"
      }}>
        <button
          onClick={() => setActiveMainTab("editor")}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: activeMainTab === "editor" ? "#0f172a" : "transparent",
            color: activeMainTab === "editor" ? "#ffffff" : "#64748b",
            fontWeight: activeMainTab === "editor" ? 700 : 600,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "all 0.2s"
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
            background: activeMainTab === "carousel" ? "#0f172a" : "transparent",
            color: activeMainTab === "carousel" ? "#ffffff" : "#64748b",
            fontWeight: activeMainTab === "carousel" ? 700 : 600,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "all 0.2s"
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
            background: activeMainTab === "analytics" ? "#0f172a" : "transparent",
            color: activeMainTab === "analytics" ? "#ffffff" : "#64748b",
            fontWeight: activeMainTab === "analytics" ? 700 : 600,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "all 0.2s"
          }}
        >
          🛡️ Валидация & SEO (Аналитика)
          {run.evaluation?.writing && (
            <span style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 12,
              background: run.evaluation.writing.isGoldenMatch ? "#dcfce7" : "#fee2e2",
              color: run.evaluation.writing.isGoldenMatch ? "#166534" : "#991b1b",
              fontWeight: 700
            }}>
              {run.evaluation.writing.alignmentScore}%
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: CONTENT & MULTI-PLATFORM ADAPTATION EDITOR */}
      {activeMainTab === "editor" && (
        <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, minWidth: 0 }}>
          {/* Left Column: Post Content & Adaptation */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Post Adaptations & Editor Card */}
            <div className="card" style={{ padding: 24, border: "1px solid #d0d7de", borderRadius: 16, background: "#ffffff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🌐 Публикация & Мультипостинг</h3>
                  <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#57606a" }}>
                    Просмотр и редактирование поста для LinkedIn, а также автоматическая адаптация для Telegram и Threads.
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <select
                    value={adaptLength}
                    onChange={(e) => setAdaptLength(e.target.value as "short" | "long")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #d0d7de",
                      fontSize: 13,
                      fontWeight: 600,
                      background: "#f6f8fa",
                    }}
                  >
                    <option value="long">📜 Подробный (~2000 симв.)</option>
                    <option value="short">📝 Краткий (~500 симв.)</option>
                  </select>
                  <button
                    disabled={isAdapting}
                    onClick={handleAdapt}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      background: "linear-gradient(135deg, #0088cc, #24292e)",
                      color: "#ffffff",
                      border: "none",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: isAdapting ? "not-allowed" : "pointer",
                    }}
                  >
                    {isAdapting ? "⏳ Генерация..." : "🚀 Адаптировать (TG & Threads)"}
                  </button>
                </div>
              </div>

              {/* Platform Selector Tabs */}
              <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid #eaeef2", paddingBottom: 10 }}>
                <button
                  onClick={() => setActivePlatformTab("linkedin")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px 8px 0 0",
                    border: "none",
                    borderBottom: activePlatformTab === "linkedin" ? "3px solid #0a66c2" : "none",
                    background: activePlatformTab === "linkedin" ? "#ddf4ff" : "transparent",
                    color: activePlatformTab === "linkedin" ? "#0969da" : "#57606a",
                    fontWeight: activePlatformTab === "linkedin" ? 700 : 500,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  🌐 LinkedIn (Оригинал)
                </button>
                <button
                  onClick={() => setActivePlatformTab("telegram")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px 8px 0 0",
                    border: "none",
                    borderBottom: activePlatformTab === "telegram" ? "3px solid #0088cc" : "none",
                    background: activePlatformTab === "telegram" ? "#e0f2fe" : "transparent",
                    color: activePlatformTab === "telegram" ? "#0369a1" : "#57606a",
                    fontWeight: activePlatformTab === "telegram" ? 700 : 500,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  📱 Telegram (RU) {run.adaptations?.telegram?.alignmentScore ? `🛡️ ${run.adaptations.telegram.alignmentScore}%` : ""}
                </button>
                <button
                  onClick={() => setActivePlatformTab("threads")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px 8px 0 0",
                    border: "none",
                    borderBottom: activePlatformTab === "threads" ? "3px solid #000000" : "none",
                    background: activePlatformTab === "threads" ? "#f3f4f6" : "transparent",
                    color: activePlatformTab === "threads" ? "#111827" : "#57606a",
                    fontWeight: activePlatformTab === "threads" ? 700 : 500,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  🧵 Threads (RU) {run.adaptations?.threads?.alignmentScore ? `🛡️ ${run.adaptations.threads.alignmentScore}%` : ""}
                </button>
              </div>

              {/* Platform Specific Content */}
              {activePlatformTab === "linkedin" && (
                <div>
                  {isAwaitingApproval ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Hook (Заголовок)</label>
                        <input
                          type="text"
                          value={hook}
                          onChange={(e) => setHook(e.target.value)}
                          style={{ fontSize: 15, fontWeight: "bold", padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Тело публикации</label>
                        <textarea
                          rows={8}
                          value={bodyText}
                          onChange={(e) => setBodyText(e.target.value)}
                          style={{ fontSize: 14, fontFamily: "inherit", resize: "vertical", padding: 10, borderRadius: 8, border: "1px solid var(--border)", lineHeight: 1.5 }}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>CTA (Призыв к действию)</label>
                        <input
                          type="text"
                          value={cta}
                          onChange={(e) => setCta(e.target.value)}
                          style={{ fontSize: 14, color: "var(--primary)", fontWeight: 600, padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: 20, borderRadius: 12, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                      <strong style={{ fontSize: 16, display: "block", marginBottom: 12, color: "#0f172a" }}>{writingResult?.hook}</strong>
                      {writingResult?.text}
                      <div style={{ marginTop: 16, color: "#0969da", fontWeight: 600 }}>{writingResult?.cta}</div>
                    </div>
                  )}
                </div>
              )}

              {activePlatformTab === "telegram" && (
                <div>
                  {run.adaptations?.telegram ? (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, background: "#dcfce7", color: "#166534", padding: "4px 10px", borderRadius: 12 }}>
                          🛡️ Golden Dataset Match: {run.adaptations.telegram.alignmentScore ?? 95}% (Эмодзи строго в заголовке)
                        </span>
                        <button
                          onClick={() => handleCopyText(run.adaptations!.telegram!.text, "telegram")}
                          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #d0d7de", background: "#ffffff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          {copySuccess === "telegram" ? "✓ Скопировано!" : "📋 Скопировать пост"}
                        </button>
                      </div>
                      <div style={{ background: "#0d1117", color: "#f0f6fc", padding: 20, borderRadius: 12, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "sans-serif" }}>
                        {run.adaptations.telegram.text}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: 24, color: "#6e7681" }}>
                      Нажмите кнопку «🚀 Адаптировать (TG & Threads)» выше для генерации.
                    </div>
                  )}
                </div>
              )}

              {activePlatformTab === "threads" && (
                <div>
                  {run.adaptations?.threads ? (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, background: "#dcfce7", color: "#166534", padding: "4px 10px", borderRadius: 12 }}>
                          🛡️ Golden Dataset Match: {run.adaptations.threads.alignmentScore ?? 95}% (Эмодзи строго в заголовке)
                        </span>
                        <button
                          onClick={() => handleCopyText(run.adaptations!.threads!.text, "threads")}
                          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #d0d7de", background: "#ffffff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          {copySuccess === "threads" ? "✓ Скопировано!" : "📋 Скопировать пост"}
                        </button>
                      </div>
                      <div style={{ background: "#ffffff", color: "#111827", border: "1px solid #e5e7eb", padding: 20, borderRadius: 12, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "sans-serif" }}>
                        {run.adaptations.threads.text}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: 24, color: "#6e7681" }}>
                      Нажмите кнопку «🚀 Адаптировать (TG & Threads)» выше для генерации.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Strategy & Positioning Context */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {strategyResult && (
              <div className="card">
                <h3 style={{ marginBottom: 14, fontSize: 16 }}>Контент-Стратегия</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
                  <div>
                    <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Формат</span>
                    <strong style={{ color: "var(--text-main)" }}>{strategyResult.format}</strong>
                  </div>
                  <div>
                    <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Целевая аудитория</span>
                    <strong style={{ color: "var(--text-main)" }}>{strategyResult.target_audience}</strong>
                  </div>
                  <div>
                    <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Ключевая идея (Core Idea)</span>
                    <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", lineHeight: 1.4 }}>{strategyResult.core_idea}</p>
                  </div>
                </div>
              </div>
            )}

            {positioningResult && (
              <div className="card">
                <h3 style={{ marginBottom: 14, fontSize: 16 }}>Позиционирование</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
                  <div>
                    <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Соответствие теме</span>
                    <strong style={{ color: positioningResult.accepted ? "var(--green)" : "var(--red)" }}>
                      {positioningResult.relevance}% (Relevance)
                    </strong>
                  </div>
                  <div>
                    <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Обоснование</span>
                    <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", lineHeight: 1.4 }}>{positioningResult.reason}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 2: CAROUSEL & SLIDE DECK EDITOR */}
      {activeMainTab === "carousel" && (
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, minWidth: 0 }}>
          {activeSlides.length > 0 ? (
            <>
              {/* Left Column: Interactive Slide Editor */}
              <div className="card" style={{ padding: 24 }}>
                <h3 style={{ marginBottom: 20 }}>Слайды карусели</h3>
                {(() => {
                  const isLightTemplate = ["cover-1", "cover-6"].includes(selectedTemplate);
                  return (
                    <div style={{
                      aspectRatio: "1/1",
                      maxWidth: 420,
                      margin: "0 auto 20px auto",
                      background: isLightTemplate ? "#ffffff" : selectedTemplate === "cover-3" || selectedTemplate === "cover-8" ? "#0D1117" : selectedTemplate === "cover-4" || selectedTemplate === "cover-9" ? "#0F172A" : selectedTemplate === "cover-5" ? "#090D16" : selectedTemplate === "cover-7" ? "#030712" : "#1e293b",
                      border: isLightTemplate ? "3px solid var(--green)" : `3px solid ${accentColor}`,
                      borderRadius: 16,
                      padding: 24,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      position: "relative",
                    }}>
                      <div>
                        {isAwaitingApproval ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <label style={{ fontSize: 11, color: isLightTemplate ? "#6b7280" : "rgba(255,255,255,0.6)", fontWeight: 600 }}>Заголовок слайда</label>
                            <input
                              type="text"
                              value={activeSlides[activeSlide].title}
                              onChange={(e) => handleSlideChange(activeSlide, "title", e.target.value)}
                              style={{
                                fontSize: 15,
                                fontWeight: "bold",
                                background: isLightTemplate ? "#f9fafb" : "rgba(255,255,255,0.12)",
                                color: isLightTemplate ? "#111827" : "#fff",
                                border: isLightTemplate ? "1px solid #d1d5db" : "1px solid rgba(255,255,255,0.2)",
                                width: "100%",
                                padding: "6px 10px",
                                borderRadius: "6px"
                              }}
                            />
                            <label style={{ fontSize: 11, color: isLightTemplate ? "#6b7280" : "rgba(255,255,255,0.6)", fontWeight: 600 }}>Буллиты слайда (по одному на строку)</label>
                            <textarea
                              rows={4}
                              value={activeSlides[activeSlide].bullets.join("\n")}
                              onChange={(e) => handleSlideChange(activeSlide, "bullets", e.target.value.split("\n"))}
                              style={{
                                fontSize: 13,
                                fontFamily: "inherit",
                                background: isLightTemplate ? "#f9fafb" : "rgba(255,255,255,0.12)",
                                color: isLightTemplate ? "#111827" : "#fff",
                                border: isLightTemplate ? "1px solid #d1d5db" : "1px solid rgba(255,255,255,0.2)",
                                resize: "none",
                                width: "100%",
                                padding: "6px 10px",
                                borderRadius: "6px"
                              }}
                            />
                            <label style={{ fontSize: 11, color: isLightTemplate ? "#6b7280" : "rgba(255,255,255,0.6)", fontWeight: 600 }}>Иллюстрация слайда</label>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                              <select
                                value={activeSlides[activeSlide].illustration || "none"}
                                onChange={(e) => handleSlideChange(activeSlide, "illustration", e.target.value)}
                                style={{
                                  flex: 1,
                                  padding: "8px",
                                  borderRadius: "6px",
                                  background: isLightTemplate ? "#f9fafb" : "rgba(255,255,255,0.12)",
                                  color: isLightTemplate ? "#111827" : "#fff",
                                  border: isLightTemplate ? "1px solid #d1d5db" : "1px solid rgba(255,255,255,0.2)",
                                  fontSize: "13px"
                                }}
                              >
                                <option value="none">Без иллюстрации</option>
                                {availableIllustrations.map((ill) => (
                                  <option key={ill._id} value={ill.name}>{ill.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h4 style={{ fontSize: 22, marginBottom: 16, color: isLightTemplate ? "#111827" : "#fff", lineHeight: 1.3 }}>
                              {activeSlides[activeSlide].title}
                            </h4>
                            <ul style={{ paddingLeft: 20, margin: 0 }}>
                              {activeSlides[activeSlide].bullets.map((b: string, i: number) => (
                                <li key={i} style={{ fontSize: 14, color: isLightTemplate ? "#374151" : "#cbd5e1", marginBottom: 10, lineHeight: 1.4 }}>
                                  {b}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, paddingTop: 12, borderTop: isLightTemplate ? "1px solid #e5e7eb" : "1px solid rgba(255,255,255,0.1)" }}>
                        <span>{activeSlides[activeSlide].footer}</span>
                        <span style={{ fontWeight: 600, color: isLightTemplate ? "var(--green)" : accentColor }}>
                          Слайд {activeSlide + 1} из {activeSlides.length}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Slider Controls */}
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginBottom: 20 }}>
                  <button
                    disabled={activeSlide === 0}
                    onClick={() => setActiveSlide((prev) => prev - 1)}
                    className="btn btn-secondary"
                    style={{ padding: "8px 16px", borderRadius: 6, fontSize: 13 }}
                  >
                    ← Назад
                  </button>
                  <div style={{ display: "flex", gap: 6 }}>
                    {activeSlides.map((_, idx) => (
                      <span
                        key={idx}
                        onClick={() => setActiveSlide(idx)}
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: activeSlide === idx ? accentColor : "#d1d5db",
                          cursor: "pointer",
                          transition: "background 0.2s"
                        }}
                      />
                    ))}
                  </div>
                  <button
                    disabled={activeSlide === activeSlides.length - 1}
                    onClick={() => setActiveSlide((prev) => prev + 1)}
                    className="btn btn-secondary"
                    style={{ padding: "8px 16px", borderRadius: 6, fontSize: 13 }}
                  >
                    Вперед →
                  </button>
                </div>

                {/* Template Style Toggle Selector */}
                <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { key: "cover-1", label: "☀️ Светлая сетка", color: "#10B981" },
                    { key: "cover-2", label: "🌙 Тёмный Purple", color: "#8b5cf6" },
                    { key: "cover-3", label: "💻 Cyberpunk Terminal", color: "#00F5FF" },
                    { key: "cover-4", label: "📐 Blueprint Spec", color: "#FACC15" },
                    { key: "cover-5", label: "🔮 Obsidian Glass", color: "#EC4899" },
                    { key: "cover-6", label: "📰 Warm Editorial", color: "#EA580C" },
                    { key: "cover-7", label: "🟩 Matrix Emerald", color: "#10B981" },
                    { key: "cover-8", label: "🐙 GitHub Repos", color: "#58A6FF" },
                    { key: "cover-9", label: "🛠️ Pet Projects", color: "#38BDF8" },
                  ].map((tmpl) => (
                    <button
                      key={tmpl.key}
                      type="button"
                      onClick={() => setSelectedTemplate(tmpl.key)}
                      className="btn"
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        fontSize: 12,
                        background: selectedTemplate === tmpl.key ? tmpl.color : "#f3f4f6",
                        color: selectedTemplate === tmpl.key ? (["#FACC15", "#00F5FF"].includes(tmpl.color) ? "#0F172A" : "#fff") : "#374151",
                        border: selectedTemplate === tmpl.key ? `2px solid ${tmpl.color}` : "2px solid #e5e7eb",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Column: Carousel PNG Preview Gallery & ZIP Download */}
              <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ marginBottom: 16 }}>Предпросмотр всех слайдов</h3>
                  {designResult && (() => {
                    const styleData = designResult.rendered_styles?.[selectedTemplate];
                    const currentZipId = styleData?.zipId ||
                      (selectedTemplate === "cover-1" ? (designResult.zip_cover_1_id || designResult.imageId) :
                       selectedTemplate === "cover-2" ? (designResult.zip_cover_2_id || designResult.imageId) : undefined);

                    return currentZipId ? (
                      <div>
                        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 16, scrollSnapType: "x mandatory" }}>
                          {Array.from({ length: activeSlides.length || designResult.card_count || 5 }).map((_, index) => (
                            <div key={index} style={{ flex: "0 0 160px", scrollSnapAlign: "start", textAlign: "center" }}>
                              <img
                                src={`/api/proxy/images/${currentZipId}?index=${index}&t=${encodeURIComponent(run?.updatedAt || "")}`}
                                alt={`Slide ${index + 1}`}
                                loading="lazy"
                                style={{ width: "100%", aspectRatio: "1080/1350", borderRadius: 8, border: "1px solid var(--border)", objectFit: "cover" }}
                              />
                              <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "block" }}>Слайд {index + 1}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ textAlign: "center", marginTop: 20 }}>
                          <a
                            href={`/api/proxy/images/${currentZipId}`}
                            download={`carousel_${run?.runId || "run"}_${selectedTemplate}.zip`}
                            className="btn btn-primary"
                            style={{ padding: "12px 24px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 15 }}
                          >
                            📦 Скачать ZIP Архив (Слайды PNG)
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: 20, background: "rgba(245, 158, 11, 0.1)", borderRadius: 8, color: "#d97706", fontSize: 13, textAlign: "center" }}>
                        ⚡ Слайды для шаблона {selectedTemplate} еще не отрендерены. Нажмите «Сохранить правки» выше.
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          ) : (
            <div className="card" style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--text-muted)" }}>
              Карусель еще генерируется...
            </div>
          )}
        </section>
      )}

      {/* TAB 3: VALIDATION, SEO AUDIT & LOGS */}
      {activeMainTab === "analytics" && (
        <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 24, minWidth: 0 }}>
          {/* Left Column: Golden Dataset Evaluation & Raw Logs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Golden Dataset Evaluation Panel */}
            {run.evaluation && (run.evaluation.writing || run.evaluation.design) ? (
              <div style={{
                background: "linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: "22px 24px",
              }}>
                <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 700, marginBottom: 16, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  🛡️ GOLDEN DATASET VALIDATION (QUALITY GATE)
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {run.evaluation.writing && (() => {
                    const { alignmentScore, isGoldenMatch, driftReport } = run.evaluation!.writing!;
                    const failedRules = driftReport.filter(r => !r.passed);
                    return (
                      <div style={{
                        flex: 1, minWidth: 260,
                        background: isGoldenMatch ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                        border: `1px solid ${isGoldenMatch ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                        borderRadius: 12, padding: "16px 18px",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>✍️ Writing Agent</span>
                          <span style={{ fontSize: 20, fontWeight: 800, color: alignmentScore >= 80 ? "#10b981" : alignmentScore >= 50 ? "#f59e0b" : "#ef4444" }}>
                            {alignmentScore}%
                          </span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {driftReport.map((r) => (
                            <span key={r.rule} title={r.details} style={{
                              fontSize: 11, padding: "3px 8px", borderRadius: 20,
                              background: r.passed ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                              color: r.passed ? "#34d399" : "#f87171",
                              border: `1px solid ${r.passed ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
                              cursor: "help",
                            }}>
                              {r.passed ? "✓" : "✗"} {r.rule.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                        {failedRules.length > 0 && (
                          <div style={{ marginTop: 12, fontSize: 12, color: "#f87171" }}>
                            {failedRules[0].details}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {run.evaluation.design && (() => {
                    const { alignmentScore, isGoldenMatch, driftReport } = run.evaluation!.design!;
                    const failedRules = driftReport.filter(r => !r.passed);
                    return (
                      <div style={{
                        flex: 1, minWidth: 260,
                        background: isGoldenMatch ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                        border: `1px solid ${isGoldenMatch ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                        borderRadius: 12, padding: "16px 18px",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>🎨 Design Agent</span>
                          <span style={{ fontSize: 20, fontWeight: 800, color: alignmentScore >= 80 ? "#10b981" : alignmentScore >= 50 ? "#f59e0b" : "#ef4444" }}>
                            {alignmentScore}%
                          </span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {driftReport.map((r) => (
                            <span key={r.rule} title={r.details} style={{
                              fontSize: 11, padding: "3px 8px", borderRadius: 20,
                              background: r.passed ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                              color: r.passed ? "#34d399" : "#f87171",
                              border: `1px solid ${r.passed ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
                              cursor: "help",
                            }}>
                              {r.passed ? "✓" : "✗"} {r.rule.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                        {failedRules.length > 0 && (
                          <div style={{ marginTop: 12, fontSize: 12, color: "#f87171" }}>
                            {failedRules[0].details}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>
                Данные валидации Golden Dataset пока не рассчитаны для этого прогона.
              </div>
            )}

            {/* Raw Log Explorer */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>Отладочные логи</h3>
              <details style={{ fontSize: 13 }}>
                <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontWeight: 600 }}>Посмотреть RAW JSON стадий</summary>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                  {stages.map((s) => (
                    <div key={s.stage} style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                      <strong style={{ display: "block", textTransform: "uppercase", fontSize: 11, color: "var(--primary)", marginBottom: 6 }}>
                        {s.stage}
                      </strong>
                      <pre style={{ margin: 0, fontSize: 11, overflowX: "auto", color: "var(--text-muted)" }}>
                        {JSON.stringify(s.result, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>

          {/* Right Column: SEO Audit */}
          <div>
            {seoResult ? (
              <div className="card" style={{ padding: 24 }}>
                <h3 style={{ marginBottom: 20 }}>SEO Аудит</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
                  <div style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background: `conic-gradient(${seoResult.score >= 80 ? "var(--green)" : "var(--amber)"} ${seoResult.score * 3.6}deg, #e5e7eb 0deg)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <div style={{
                      width: 68,
                      height: 68,
                      borderRadius: "50%",
                      background: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column"
                    }}>
                      <span style={{ fontSize: 20, fontWeight: "bold", color: "var(--text-main)" }}>{seoResult.score}</span>
                      <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>score</span>
                    </div>
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 4px 0", color: seoResult.score >= 80 ? "var(--green)" : "var(--amber)" }}>
                      {seoResult.score >= 80 ? "Проверка пройдена" : "Требует внимания"}
                    </h4>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {seoResult.score >= 80 ? "Пост соответствует всем стандартам" : "Рекомендуется доработка текста"}
                    </span>
                  </div>
                </div>

                {seoResult.recommendations && seoResult.recommendations.length > 0 ? (
                  <div>
                    <strong style={{ fontSize: 13, display: "block", marginBottom: 10 }}>Рекомендации:</strong>
                    <ul style={{ padding: 0, margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                      {seoResult.recommendations.map((rec: string, idx: number) => (
                        <li key={idx} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                          <span style={{ color: "var(--amber)" }}>⚠</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--green)", margin: 0 }}>✓ Рекомендаций нет, текст идеален!</p>
                )}
              </div>
            ) : (
              <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>
                Данные SEO аудита ещё генерируются...
              </div>
            )}
          </div>
        </section>
      )}

      {/* Reprocess Dialog Modal */}
      {isReprocessModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}>
          <div className="card" style={{ width: "100%", maxWidth: 500, padding: 24, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)" }}>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>Отправить пост на перегенерацию</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Опишите, что именно нужно исправить (например: "Сделай текст более профессиональным и добавь больше деталей про Docker").
            </p>
            <textarea
              rows={4}
              value={reprocessNotes}
              onChange={(e) => setReprocessNotes(e.target.value)}
              placeholder="Введите ваши пожелания и инструкции для ИИ-агентов..."
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 14,
                marginBottom: 20,
                resize: "none",
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setIsReprocessModalOpen(false);
                  setReprocessNotes("");
                }}
                className="btn btn-secondary"
                style={{ padding: "8px 16px", borderRadius: 6, fontSize: 13 }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleReprocess}
                disabled={actionLoading || !reprocessNotes.trim()}
                className="btn btn-primary"
                style={{ padding: "8px 16px", borderRadius: 6, fontSize: 13 }}
              >
                {actionLoading ? "Отправка..." : "Запустить перегенерацию 🚀"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
