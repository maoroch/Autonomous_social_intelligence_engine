"use client";

import React from "react";

interface RunHeaderProps {
  runId: string;
  topicTitle: string;
  status: string;
  seoImprovementsCount?: number;
  needsComplianceReview?: boolean;
  actionLoading: boolean;
  onApprove: () => void;
  onReject: () => void;
  onOpenRedesign: () => void;
  onOpenReprocess: () => void;
  onSaveManualEdits: () => void;
}

export function RunHeader({
  runId,
  topicTitle,
  status,
  seoImprovementsCount,
  needsComplianceReview,
  actionLoading,
  onApprove,
  onReject,
  onOpenRedesign,
  onOpenReprocess,
  onSaveManualEdits,
}: RunHeaderProps) {
  const isAwaiting = status === "awaiting_approval" || status === "human_approval_required";

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                background:
                  status === "approved" || status === "published"
                    ? "rgba(16, 185, 129, 0.15)"
                    : status === "rejected" || status === "failed"
                    ? "rgba(239, 68, 68, 0.15)"
                    : "rgba(99, 102, 241, 0.15)",
                color:
                  status === "approved" || status === "published"
                    ? "#10B981"
                    : status === "rejected" || status === "failed"
                    ? "#EF4444"
                    : "#6366F1",
                border: `1px solid ${
                  status === "approved" || status === "published"
                    ? "rgba(16, 185, 129, 0.3)"
                    : status === "rejected" || status === "failed"
                    ? "rgba(239, 68, 68, 0.3)"
                    : "rgba(99, 102, 241, 0.3)"
                }`,
              }}
            >
              {status === "awaiting_approval" ? "Ожидает подтверждения" : status}
            </span>
            <span style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              ID: {runId}
            </span>
            {Boolean(seoImprovementsCount) && (
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "#FEF3C7",
                  color: "#D97706",
                  fontWeight: 700,
                }}
              >
                ДОРАБОТКА SEO: ПОПЫТКА {seoImprovementsCount} ИЗ 2
              </span>
            )}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", margin: "8px 0" }}>
            {topicTitle}
          </h1>
        </div>

        {isAwaiting && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              disabled={actionLoading}
              onClick={onOpenRedesign}
              className="btn btn-secondary"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px" }}
            >
              🎨 Переделать дизайн
            </button>
            <button
              disabled={actionLoading}
              onClick={onOpenReprocess}
              className="btn btn-secondary"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px" }}
            >
              🔄 Переписать пост
            </button>
            <button
              disabled={actionLoading}
              onClick={onSaveManualEdits}
              className="btn btn-secondary"
              style={{ padding: "10px 16px" }}
            >
              💾 Сохранить правки
            </button>
            <button
              disabled={actionLoading}
              onClick={onApprove}
              className="btn btn-primary"
              style={{ padding: "10px 22px", fontWeight: 700, background: "#FF7900" }}
            >
              {actionLoading ? "..." : "Одобрить и опубликовать"}
            </button>
            <button
              disabled={actionLoading}
              onClick={onReject}
              className="btn btn-danger"
              style={{ padding: "10px 18px" }}
            >
              {actionLoading ? "..." : "Отклонить"}
            </button>
          </div>
        )}
      </div>

      {needsComplianceReview && (
        <div
          style={{
            marginTop: 16,
            padding: "14px 18px",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderLeft: "5px solid #F59E0B",
            borderRadius: 10,
            fontSize: 14,
            color: "#92400E",
            lineHeight: 1.4,
          }}
        >
          ⚠️ <strong>Внимание (Fact-Checking):</strong> В тексте обнаружены числовые характеристики или отраслевые утверждения. Проверьте формулировки на соответствие метрологической документации перед публикацией.
        </div>
      )}
    </div>
  );
}
