"use client";

import { useEffect, useState, use } from "react";
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

  // Carousel slider state
  const [activeSlide, setActiveSlide] = useState(0);

  const fetchRunDetails = async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setRun(data.run);
        setStages(data.stages ?? []);
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
    // Poll run details while running
    let interval: NodeJS.Timeout;
    if (run?.status === "running") {
      interval = setInterval(fetchRunDetails, 4000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [runId, run?.status]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/approve`, { method: "POST" });
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

  // Extract specific stage results
  const trendResult = stages.find((s) => s.stage === "trend")?.result;
  const positioningResult = stages.find((s) => s.stage === "positioning")?.result;
  const strategyResult = stages.find((s) => s.stage === "strategy")?.result;
  const writingResult = stages.find((s) => s.stage === "writing")?.result;
  const designResult = stages.find((s) => s.stage === "design")?.result;
  const seoResult = stages.find((s) => s.stage === "seo")?.result;

  const slides = designResult?.render_data 
    ? Object.entries(designResult.render_data).map(([key, val]: [string, any]) => ({
        key,
        title: val.title || "Без заголовка",
        bullets: Array.isArray(val.bullets) ? val.bullets : [],
        footer: val.footer || "",
      }))
    : [];

  const accentColor = designResult?.accent_color || "var(--secondary)";

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
          {run.status === "awaiting_approval" && (
            <div style={{ display: "flex", gap: 12 }}>
              <button disabled={actionLoading} onClick={handleApprove} className="btn btn-primary" style={{ padding: "10px 20px" }}>
                {actionLoading ? "..." : "Одобрить и опубликовать"}
              </button>
              <button disabled={actionLoading} onClick={handleReject} className="btn btn-danger" style={{ padding: "10px 20px" }}>
                {actionLoading ? "..." : "Отклонить"}
              </button>
            </div>
          )}
        </div>

        {/* Progress Tracker */}
        <div style={{ display: "flex", justifyContent: "space-between", position: "relative", marginTop: 40, padding: "0 10px" }}>
          {/* Line behind stages */}
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
            const currentIdx = stagesOrder.indexOf(run.currentStage);
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
          {/* Post Preview */}
          {writingResult ? (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
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
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>LinkedIn Post Preview</span>
                </div>
              </div>
              <div style={{ padding: 24 }}>
                {/* LinkedIn Style Post */}
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
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>
              Текст поста еще генерируется...
            </div>
          )}

          {/* Carousel Presentation Preview */}
          {slides.length > 0 ? (
            <div className="card" style={{ background: "rgba(10, 13, 22, 0.5)" }}>
              <h3 style={{ marginBottom: 20 }}>Слайды карусели</h3>
              
              {/* Actual Carousel slide view */}
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
                transition: "all 0.3s ease"
              }}>
                <div>
                  <h4 style={{ fontSize: 24, marginBottom: 24, color: "#fff", lineHeight: 1.3 }}>
                    {slides[activeSlide].title}
                  </h4>
                  <ul style={{ paddingLeft: 20, margin: 0 }}>
                    {slides[activeSlide].bullets.map((b: string, i: number) => (
                      <li key={i} style={{ fontSize: 16, color: "#cbd5e1", marginBottom: 12, lineHeight: 1.4 }}>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--text-muted)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
                  <span>{slides[activeSlide].footer}</span>
                  <span style={{ fontWeight: 600, color: accentColor }}>
                    Слайд {activeSlide + 1} из {slides.length}
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
                  {slides.map((_, idx) => (
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
                  disabled={activeSlide === slides.length - 1}
                  onClick={() => setActiveSlide((prev) => prev + 1)}
                  className="btn btn-secondary"
                  style={{ padding: "8px 16px", borderRadius: 6, fontSize: 13 }}
                >
                  Вперед →
                </button>
              </div>
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
                {/* Circular Score Gauge */}
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

              {/* Recommendations checklist */}
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
