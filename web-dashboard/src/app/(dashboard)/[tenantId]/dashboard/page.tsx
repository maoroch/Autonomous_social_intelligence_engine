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

    // Poll runs and health every 8 seconds
    const interval = setInterval(() => {
      fetchRuns();
      fetchHealth();
    }, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

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

        {/* Right Side: Launch Guidance & Status */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Telegram Bot Launch Guidance Card */}
          <div className="card" style={{ background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>🤖</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, color: "var(--text-main)" }}>Запуск пайплайна</h3>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Human-in-the-Loop Curator</span>
              </div>
            </div>

            <p style={{ fontSize: 13, color: "var(--text-main)", lineHeight: 1.5, marginBottom: 16 }}>
              Запуск генерации и сбор свежих инфоповодов происходит <strong>исключительно через Telegram-бота</strong>.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              <div style={{ padding: "10px 12px", background: "rgba(10, 102, 194, 0.06)", border: "1px solid rgba(10, 102, 194, 0.15)", borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#0A66C2", marginBottom: 2 }}>🎬 KinoPeek Radar</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Парсинг свежих и популярных инфоповодов кино и поп-культуры Den of Geek.</div>
              </div>
              <div style={{ padding: "10px 12px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.15)", borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#059669", marginBottom: 2 }}>💻 Tech & GitHub Radar</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Подборки трендовых open-source репозиториев и архитектурных инсайтов.</div>
              </div>
              <div style={{ padding: "10px 12px", background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.15)", borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#d97706", marginBottom: 2 }}>🏭 Testo Industry Radar</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Фармацевтический мониторинг (GxP/21 CFR Part 11) и газоанализ котельных.</div>
              </div>
            </div>

            <div style={{ padding: "12px", background: "#f1f5f9", borderRadius: 8, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 16 }}>
              ℹ️ <strong>Веб-дашборд предназначен для:</strong>
              <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                <li>Редактирования текстов и слайдов карусели</li>
                <li>Смены шаблонов и предпросмотра рендера</li>
                <li>Проверки комплаенса и аналитики постов</li>
              </ul>
            </div>

            <a
              href="https://t.me/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", width: "100%", padding: "10px 16px", fontSize: 14 }}
            >
              💬 Открыть Telegram Бот
            </a>
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
