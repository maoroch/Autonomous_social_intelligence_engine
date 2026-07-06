"use client";

import { useEffect, useState, use, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface PageProps {
  params: Promise<{ runId: string }>;
}

interface RunDoc {
  runId: string;
  status: "running" | "awaiting_approval" | "approved" | "rejected" | "failed";
  currentStage: string;
  topic: { title: string; summary: string };
  seoImprovementsCount?: number;
  updatedAt: string;
}

interface StageResult {
  stage: string;
  result: any;
}

export default function RunDetailPage({ params }: PageProps) {
  const { runId } = use(params);
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
  const [selectedTemplate, setSelectedTemplate] = useState<"cover-1" | "cover-2">("cover-2");
  const [isReRendering, setIsReRendering] = useState(false);
  const isReRenderingRef = useRef(false);
  const prevPreviewIdRef = useRef<string | null>(null);

  // Carousel slider state
  const [activeSlide, setActiveSlide] = useState(0);
  const [availableIllustrations, setAvailableIllustrations] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/illustrations")
      .then(res => res.json())
      .then(data => setAvailableIllustrations(data))
      .catch(err => console.error("Failed to load illustrations", err));
  }, []);

  const fetchRunDetails = async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
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
        await fetch(`/api/runs/${runId}/edit`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postText: { hook, text: bodyText, cta },
            slides: slideDeck
          }),
        });
      }
      
      const res = await fetch(`/api/runs/${runId}/approve`, {
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
      const res = await fetch(`/api/runs/${runId}/reject`, { method: "POST" });
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
      const res = await fetch(`/api/runs/${runId}/edit`, {
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
        <Link href="/" className="btn btn-secondary" style={{ marginTop: 16 }}>
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
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 }}>
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
            <h1 style={{ margin: 0, fontSize: 28, color: "#fff" }}>
              {run.topic.title || "Генерация темы..."}
            </h1>
          </div>
          
          {/* Action Panel */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {isAwaitingApproval && (
              <>
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
        <div style={{ display: "flex", justifyContent: "space-between", position: "relative", marginTop: 40, padding: "0 10px" }}>
          <div style={{
            position: "absolute",
            top: 15,
            left: 20,
            right: 20,
            height: 2,
            background: "rgba(255,255,255,0.08)",
            zIndex: 1
          }} />
          
          {["trend", "positioning", "strategy", "writing", "design", "seo", "human_approval"].map((stage, idx) => {
            const stagesOrder = ["trend", "positioning", "strategy", "writing", "design", "seo", "human_approval"];
            const isCompleted = stages.some((s) => s.stage === stage) || (run.status === "awaiting_approval" && stage !== "human_approval");
            const isActive = run.currentStage === stage;
            
            return (
              <div key={stage} style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 2, flex: 1 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: isCompleted ? "var(--green)" : isActive ? "var(--secondary)" : "var(--bg-main)",
                  border: `2px solid ${isCompleted ? "var(--green)" : isActive ? "var(--secondary)" : "rgba(255,255,255,0.2)"}`,
                  boxShadow: isActive ? "0 0 12px var(--secondary)" : "none",
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
                  marginTop: 8,
                  color: isActive ? "var(--secondary)" : isCompleted ? "#fff" : "var(--text-muted)",
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

      {/* Main Grid: Post, Slides vs Audits */}
      <section className="grid-main">
        {/* Left Side: Post and Slides */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {/* Post Preview (Editable or Read-only) */}
          {writingResult ? (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #0a66c2, #8b5cf6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "bold",
                    color: "white"
                  }}>ME</div>
                  <div>
                    <strong style={{ display: "block", fontSize: 15 }}>Автор публикации</strong>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>LinkedIn Post Editor</span>
                  </div>
                </div>
                {isAwaitingApproval && (
                  <span style={{ fontSize: 12, color: "var(--secondary)", fontWeight: 600 }}>Режим правки ✍</span>
                )}
              </div>
              <div style={{ padding: 24 }}>
                {isAwaitingApproval ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Hook (Заголовок поста)</label>
                      <input
                        type="text"
                        value={hook}
                        onChange={(e) => setHook(e.target.value)}
                        style={{ fontSize: 15, fontWeight: "bold" }}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Тело публикации</label>
                      <textarea
                        rows={8}
                        value={bodyText}
                        onChange={(e) => setBodyText(e.target.value)}
                        style={{ fontSize: 15, fontFamily: "inherit", resize: "vertical" }}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>CTA (Призыв к действию)</label>
                      <input
                        type="text"
                        value={cta}
                        onChange={(e) => setCta(e.target.value)}
                        style={{ fontSize: 15, color: "var(--primary)", fontWeight: 600 }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "-apple-system, system-ui, BlinkMacSystemFont, sans-serif",
                    fontSize: 15,
                    lineHeight: "1.5",
                    color: "#e2e8f0"
                  }}>
                    <strong style={{ fontSize: 16, display: "block", marginBottom: 12, color: "#fff" }}>
                      {writingResult.hook}
                    </strong>
                    {writingResult.text}
                    <div style={{ marginTop: 16, color: "var(--primary)", fontWeight: 600 }}>
                      {writingResult.cta}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>
              Текст поста еще генерируется...
            </div>
          )}

          {/* Carousel Presentation Preview */}
          {activeSlides.length > 0 ? (
            <div className="card" style={{ background: "rgba(10, 13, 22, 0.5)" }}>
              <h3 style={{ marginBottom: 20 }}>Слайды карусели</h3>
              
              {/* Slide block */}
              <div style={{
                aspectRatio: "1/1",
                maxWidth: 460,
                margin: "0 auto 20px auto",
                background: "#1e293b",
                border: `4px solid ${accentColor}`,
                borderRadius: 16,
                padding: 32,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                position: "relative",
              }}>
                <div>
                  {isAwaitingApproval ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Заголовок слайда</label>
                      <input
                        type="text"
                        value={activeSlides[activeSlide].title}
                        onChange={(e) => handleSlideChange(activeSlide, "title", e.target.value)}
                        style={{ fontSize: 16, fontWeight: "bold", background: "rgba(0,0,0,0.2)" }}
                      />
                      <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginTop: 6 }}>Буллиты слайда (по одному на строку)</label>
                      <textarea
                        rows={4}
                        value={activeSlides[activeSlide].bullets.join("\n")}
                        onChange={(e) => handleSlideChange(activeSlide, "bullets", e.target.value.split("\n"))}
                        style={{ fontSize: 14, fontFamily: "inherit", background: "rgba(0,0,0,0.2)", resize: "none" }}
                      />
                      <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginTop: 6 }}>Иллюстрация слайда</label>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <select
                          value={activeSlides[activeSlide].illustration || "none"}
                          onChange={(e) => handleSlideChange(activeSlide, "illustration", e.target.value)}
                          style={{ flex: 1, padding: "8px", borderRadius: "6px", background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid var(--border)", fontSize: "13px" }}
                        >
                          <option value="none">Без иллюстрации</option>
                          {availableIllustrations.map((ill) => (
                            <option key={ill._id} value={ill.name}>{ill.name}</option>
                          ))}
                        </select>
                        {activeSlides[activeSlide].illustration && activeSlides[activeSlide].illustration !== "none" && (
                          <div
                            style={{ width: 36, height: 36, background: "rgba(255,255,255,0.1)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 4 }}
                            dangerouslySetInnerHTML={{
                              __html: availableIllustrations.find(i => i.name === activeSlides[activeSlide].illustration)?.svgContent || ""
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4 style={{ fontSize: 24, marginBottom: 24, color: "#fff", lineHeight: 1.3 }}>
                        {activeSlides[activeSlide].title}
                      </h4>
                      <ul style={{ paddingLeft: 20, margin: 0 }}>
                        {activeSlides[activeSlide].bullets.map((b: string, i: number) => (
                          <li key={i} style={{ fontSize: 16, color: "#cbd5e1", marginBottom: 12, lineHeight: 1.4 }}>
                            {b}
                          </li>
                        ))}
                      </ul>
                      {activeSlides[activeSlide].illustration && activeSlides[activeSlide].illustration !== "none" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
                          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Иллюстрация: <strong>{activeSlides[activeSlide].illustration}</strong></span>
                          <div
                            style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 2 }}
                            dangerouslySetInnerHTML={{
                              __html: availableIllustrations.find(i => i.name === activeSlides[activeSlide].illustration)?.svgContent || ""
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--text-muted)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
                  {isAwaitingApproval ? (
                    <input
                      type="text"
                      value={activeSlides[activeSlide].footer}
                      onChange={(e) => handleSlideChange(activeSlide, "footer", e.target.value)}
                      placeholder="Подпись футера"
                      style={{ fontSize: 12, background: "rgba(0,0,0,0.2)", padding: "4px 8px", width: "60%" }}
                    />
                  ) : (
                    <span>{activeSlides[activeSlide].footer}</span>
                  )}
                  <span style={{ fontWeight: 600, color: accentColor }}>
                    Слайд {activeSlide + 1} из {activeSlides.length}
                  </span>
                </div>
              </div>

              {/* Slider Controls */}
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16 }}>
                <button
                  disabled={activeSlide === 0}
                  onClick={() => setActiveSlide((prev) => prev - 1)}
                  className="btn btn-secondary"
                  style={{ padding: "8px 16px", borderRadius: 6, fontSize: 13 }}
                >
                  ← Назад
                </button>
                
                {/* Dots indicator */}
                <div style={{ display: "flex", gap: 6 }}>
                  {activeSlides.map((_, idx) => (
                    <span
                      key={idx}
                      onClick={() => setActiveSlide(idx)}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: activeSlide === idx ? accentColor : "rgba(255,255,255,0.2)",
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
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 24, marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setSelectedTemplate("cover-1")}
                  className="btn"
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    fontSize: 13,
                    background: selectedTemplate === "cover-1" ? "var(--green)" : "rgba(255,255,255,0.06)",
                    color: selectedTemplate === "cover-1" ? "#000" : "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Светлая сетка (Стиль 1)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTemplate("cover-2")}
                  className="btn"
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    fontSize: 13,
                    background: selectedTemplate === "cover-2" ? "#CC84FF" : "rgba(255,255,255,0.06)",
                    color: selectedTemplate === "cover-2" ? "#000" : "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Темный фиолетовый (Стиль 2)
                </button>
              </div>

              {/* Dynamic ZIP Export / PNG Preview */}
              {designResult && (
                (() => {
                  const currentPreviewId = selectedTemplate === "cover-1"
                    ? (designResult.preview_cover_1_id || designResult.imageId)
                    : (designResult.preview_cover_2_id || designResult.imageId);

                  const currentZipId = selectedTemplate === "cover-1"
                    ? (designResult.zip_cover_1_id || designResult.imageId)
                    : (designResult.zip_cover_2_id || designResult.imageId);

                  return (
                    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                      {isReRendering && (
                        <div style={{
                          padding: "6px 12px",
                          borderRadius: "4px",
                          background: "rgba(204, 132, 255, 0.15)",
                          border: "1px solid #CC84FF",
                          color: "#CC84FF",
                          fontSize: "12px",
                          fontWeight: 500,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 8,
                        }}>
                          ⏳ Генерация новых изображений...
                        </div>
                      )}
                      {currentPreviewId && (
                        <div style={{ textAlign: "center" }}>
                          <span style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>Предпросмотр обложки:</span>
                          <img
                            src={`/api/proxy/images/${currentPreviewId}`}
                            alt={`Preview ${selectedTemplate}`}
                            style={{
                              maxWidth: "260px",
                              borderRadius: "8px",
                              border: `2px solid ${selectedTemplate === "cover-1" ? "var(--green)" : "#CC84FF"}`,
                              boxShadow: "0 10px 20px rgba(0,0,0,0.3)"
                            }}
                          />
                        </div>
                      )}
                      {currentZipId && (
                        <div style={{ textAlign: "center", marginTop: 8 }}>
                          <a
                            href={`/api/proxy/images/${currentZipId}`}
                            download={`carousel_${run?.runId || "run"}_${selectedTemplate}.zip`}
                            className="btn btn-primary"
                            style={{
                              padding: "10px 20px",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              fontWeight: 600,
                            }}
                          >
                            📦 Скачать ZIP Архив (Слайды PNG)
                          </a>
                          <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                            Архив содержит обложку и карточки поста в формате PNG
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          ) : designResult ? (
            <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>
              Нет данных для карусели.
            </div>
          ) : null}
        </div>

        {/* Right Side: Audits and Metadata */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {/* SEO Audit Result */}
          {seoResult ? (
            <div className="card">
              <h3 style={{ marginBottom: 20 }}>SEO Аудит</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
                <div style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: `conic-gradient(${seoResult.score >= 80 ? "var(--green)" : "var(--amber)"} ${seoResult.score * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <div style={{
                    width: 68,
                    height: 68,
                    borderRadius: "50%",
                    background: "var(--bg-main)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column"
                  }}>
                    <span style={{ fontSize: 20, fontWeight: "bold", color: "#fff" }}>{seoResult.score}</span>
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
          ) : null}

          {/* Strategy Details */}
          {strategyResult ? (
            <div className="card">
              <h3 style={{ marginBottom: 16 }}>Контент-Стратегия</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
                <div>
                  <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Формат публикации</span>
                  <strong style={{ color: "#fff" }}>{strategyResult.format}</strong>
                </div>
                <div>
                  <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Целевая аудитория</span>
                  <strong style={{ color: "#fff" }}>{strategyResult.target_audience}</strong>
                </div>
                <div>
                  <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Ключевой месседж (Core Idea)</span>
                  <p style={{ margin: "4px 0 0 0", color: "#cbd5e1", lineHeight: 1.4 }}>{strategyResult.core_idea}</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Positioning Results */}
          {positioningResult ? (
            <div className="card">
              <h3 style={{ marginBottom: 16 }}>Позиционирование</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
                <div>
                  <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Соответствие теме</span>
                  <strong style={{ color: positioningResult.accepted ? "var(--green)" : "var(--red)" }}>
                    {positioningResult.relevance}% (Relevance)
                  </strong>
                </div>
                <div>
                  <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>Обоснование позиционирования</span>
                  <p style={{ margin: "4px 0 0 0", color: "#cbd5e1", lineHeight: 1.4 }}>{positioningResult.reason}</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Raw Log Explorer */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Отладочные логи</h3>
            <details style={{ fontSize: 13 }}>
              <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontWeight: 500 }}>Посмотреть RAW JSON стадий</summary>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                {stages.map((s) => (
                  <div key={s.stage} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12 }}>
                    <strong style={{ display: "block", textTransform: "uppercase", fontSize: 11, color: "var(--secondary)", marginBottom: 6 }}>
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
      </section>
    </main>
  );
}
