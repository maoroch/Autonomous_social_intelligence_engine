"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface RunListItem {
  runId: string;
  status: "running" | "awaiting_approval" | "approved" | "rejected" | "failed";
  currentStage: string;
  topic: { title: string; summary: string };
  updatedAt: string;
}

interface Analytics {
  total: number;
  running: number;
  awaiting: number;
  approved: number;
  rejected: number;
  failed: number;
  successRate: number;
}

export default function DashboardPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [profileId, setProfileId] = useState("");
  const [profiles, setProfiles] = useState<any[]>([]);

  // Filters & Status
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [serviceStatus, setServiceStatus] = useState<Record<string, boolean>>({});
  const [statusLoading, setStatusLoading] = useState(true);

  const fetchRuns = async () => {
    try {
      const res = await fetch(`/api/runs/list?tenantId=${encodeURIComponent(tenantId)}`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.items ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch runs:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        setServiceStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch health status:", err);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    fetchHealth();
    fetch(`/api/profiles?tenantId=${encodeURIComponent(tenantId)}`).then(res => res.json()).then(data => {
      setProfiles(data);
      if (data.length > 0) setProfileId(data[0]._id);
    });

    // Poll runs and health every 8 seconds
    const interval = setInterval(() => {
      fetchRuns();
      fetchHealth();
    }, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const [formError, setFormError] = useState<string | null>(null);

  const handleStartRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/runs?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: {
            title,
            summary,
          },
          profileId,
          tenantId,
        }),
      });
      if (res.ok) {
        setTitle("");
        setSummary("");
        fetchRuns();
      } else {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || "Не удалось запустить пайплайн");
      }
    } catch (err: any) {
      console.error("Failed to start run:", err);
      setFormError(err.message || " Ошибка сети при запуске пайплайна");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestartRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/runs/${runId}/restart?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        fetchRuns();
      } else {
        alert("Не удалось перезапустить прогон");
      }
    } catch (err) {
      console.error("Failed to restart run:", err);
      alert("Ошибка при перезапуске прогона");
    }
  };

  // Calculate Analytics
  const calculateAnalytics = (): Analytics => {
    const total = runs.length;
    const running = runs.filter((r) => r.status === "running").length;
    const awaiting = runs.filter((r) => r.status === "awaiting_approval").length;
    const approved = runs.filter((r) => r.status === "approved").length;
    const rejected = runs.filter((r) => r.status === "rejected").length;
    const failed = runs.filter((r) => r.status === "failed").length;

    const finished = approved + rejected + failed;
    const successRate = finished > 0 ? Math.round((approved / finished) * 100) : 0;

    return { total, running, awaiting, approved, rejected, failed, successRate };
  };

  const stats = calculateAnalytics();

  // Filtered list
  const filteredRuns = runs.filter((r) => {
    if (filterStatus === "all") return true;
    return r.status === filterStatus;
  });

  return (
    <main className="container">
      {/* Analytics Summary */}
      <section className="grid-3" style={{ marginBottom: 40 }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Всего прогонов</span>
          <span style={{ fontSize: 36, fontWeight: 700, color: "var(--text-main)" }}>{stats.total}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>активных и архивных задач</span>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Успешность (Success Rate)</span>
          <span style={{ fontSize: 36, fontWeight: 700, color: "var(--green)" }}>{stats.successRate}%</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>доля одобренных постов к завершенным</span>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Ожидают аппрува</span>
          <span style={{ fontSize: 36, fontWeight: 700, color: "var(--secondary)" }}>{stats.awaiting}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>требуют вашего внимания</span>
        </div>
      </section>

      {/* Main Grid */}
      <section className="grid-main">
        {/* Left Side: Run List */}
        <div className="card" style={{ minHeight: 400 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ margin: 0 }}>История прогонов</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ padding: "6px 12px", fontSize: 13, cursor: "pointer" }}
              >
                <option value="all">Все статусы</option>
                <option value="running">В работе</option>
                <option value="awaiting_approval">Ожидают аппрува</option>
                <option value="approved">Одобрено</option>
                <option value="rejected">Отклонено</option>
                <option value="failed">Ошибка</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>Загрузка истории прогонов...</div>
          ) : filteredRuns.length === 0 ? (
            <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-muted)" }}>
              Нет прогонов с выбранным статусом.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {filteredRuns.map((run) => (
                <div
                  key={run.runId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px 20px",
                    background: "#ffffff",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    transition: "border-color 0.2s, background 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#0A66C2")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  <div style={{ flex: 1, marginRight: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                      <span className={`badge badge-${run.status === "awaiting_approval" ? "awaiting" : run.status}`}>
                        {run.status === "awaiting_approval" ? "ожидает" : run.status === "running" ? "активен" : run.status}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        ID: {run.runId.substring(0, 8)}...
                      </span>
                    </div>
                    <strong style={{ fontSize: 16, color: "var(--text-main)", display: "block", marginBottom: 4 }}>
                      {run.topic.title || "(Сбор трендов в процессе...)"}
                    </strong>
                    {run.topic.summary && (
                      <span style={{ fontSize: 13, color: "var(--text-muted)", display: "block" }}>
                        {run.topic.summary.substring(0, 100)}
                        {run.topic.summary.length > 100 && "..."}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {run.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => handleRestartRun(run.runId)}
                        className="btn btn-secondary"
                        style={{ padding: "8px 14px", fontSize: 13, borderRadius: 6, color: "var(--red)", borderColor: "rgba(239, 68, 68, 0.4)" }}
                      >
                        🔄 Перезапустить
                      </button>
                    )}
                    <Link
                      href={`/${tenantId}/dashboard/runs/${run.runId}`}
                      className="btn btn-secondary"
                      style={{ padding: "8px 16px", fontSize: 13, borderRadius: 6 }}
                    >
                      Открыть →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Form & Status */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Create Run Form */}
          <div className="card">
            <h3 style={{ marginBottom: 16, fontSize: 18 }}>Запустить новый пайплайн</h3>
            {formError && (
              <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8, color: "var(--red)", fontSize: 13, marginBottom: 16 }}>
                ⚠️ {formError}
              </div>
            )}
            <form onSubmit={handleStartRun} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Профиль автора</label>
                <select value={profileId} onChange={e => setProfileId(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "#ffffff", color: "var(--text-main)" }}>
                  <option value="" disabled>Выберите профиль</option>
                  {profiles.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Тема (опционально)</label>
                <input
                  type="text"
                  placeholder={tenantId === "testo" ? "Например: Разбор системы Testo Saveris Pharma" : "Например: Переход на Node.js 22"}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Краткое описание / Заметки</label>
                <textarea
                  rows={3}
                  placeholder={tenantId === "testo" ? "Дополнительные модели (Testo 174T, 883), требования B2B..." : "Дополнительные ключевые слова или контекст..."}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  style={{ resize: "none" }}
                />
              </div>
              <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: "100%" }}>
                {submitting ? "Запуск..." : "Запустить пайплайн 🚀"}
              </button>
            </form>
          </div>

          {/* Service Status Panel */}
          <div className="card">
            <h3 style={{ marginBottom: 16, fontSize: 18 }}>Статус системы</h3>
            {statusLoading ? (
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Опрашиваем сервисы...</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Object.entries(serviceStatus).map(([name, online]) => (
                  <div
                    key={name}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ textTransform: "capitalize", fontWeight: 500 }}>
                      {name.replace("agent-", "")}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: online ? "var(--green)" : "var(--red)",
                          boxShadow: online
                            ? "0 0 8px var(--green)"
                            : "0 0 8px var(--red)"
                        }}
                      />
                      <span style={{ color: online ? "var(--green)" : "var(--red)", fontWeight: 600, fontSize: 12 }}>
                        {online ? "ONLINE" : "OFFLINE"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
