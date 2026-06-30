"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface RunListItem {
  runId: string;
  status: "running" | "awaiting_approval" | "approved" | "rejected" | "failed";
  currentStage: string;
  topic: { title: string; summary: string };
  updatedAt: string;
}

export default function RunsHistoryPage() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchRuns = async () => {
    try {
      const res = await fetch("/api/runs/list");
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

  useEffect(() => {
    fetchRuns();
  }, []);

  // Filtered lists
  const filteredRuns = runs.filter((run) => {
    const matchesStatus = filterStatus === "all" || run.status === filterStatus;
    const matchesSearch =
      run.topic.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      run.runId.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <main className="container">
      <div style={{ marginBottom: 24 }}>
        <Link href="/" style={{ fontSize: 14, fontWeight: 500 }}>
          ← Назад к дашборду
        </Link>
      </div>

      <div className="card" style={{ minHeight: 500 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Архив и история прогонов</h1>
          
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {/* Search Input */}
            <input
              type="text"
              placeholder="Поиск по теме или ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: "6px 12px", fontSize: 13, minWidth: 200 }}
            />

            {/* Status Select */}
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
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>Загрузка архива...</div>
        ) : filteredRuns.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-muted)" }}>
            Ничего не найдено по заданным фильтрам.
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
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  transition: "border-color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.2)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              >
                <div style={{ flex: 1, marginRight: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                    <span className={`badge badge-${run.status === "awaiting_approval" ? "awaiting" : run.status}`}>
                      {run.status === "awaiting_approval" ? "ожидает" : run.status === "running" ? "активен" : run.status}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Текущая стадия: <strong style={{ color: "var(--text-main)", textTransform: "uppercase" }}>{run.currentStage}</strong>
                    </span>
                  </div>
                  <strong style={{ fontSize: 16, color: "#fff", display: "block", marginBottom: 4 }}>
                    {run.topic.title || "(Тема генерируется...)"}
                  </strong>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Обновлено: {new Date(run.updatedAt).toLocaleString("ru-RU")} · ID: {run.runId}
                  </span>
                </div>
                <div>
                  <Link
                    href={`/runs/${run.runId}`}
                    className="btn btn-secondary"
                    style={{ padding: "8px 16px", fontSize: 13, borderRadius: 6 }}
                  >
                    Подробнее →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
