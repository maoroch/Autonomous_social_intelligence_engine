"use client";

import React from "react";

interface ValidationAuditTabProps {
  evaluation?: {
    writing?: { alignmentScore: number; driftReport: { rule: string; passed: boolean; details: string }[]; isGoldenMatch: boolean; evaluatedAt: string };
    design?: { alignmentScore: number; driftReport: { rule: string; passed: boolean; details: string }[]; isGoldenMatch: boolean; evaluatedAt: string };
  };
  stages: any[];
}

export function ValidationAuditTab({ evaluation, stages }: ValidationAuditTabProps) {
  const writingScore = evaluation?.writing?.alignmentScore ?? 100;
  const designScore = evaluation?.design?.alignmentScore ?? 100;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 28, minWidth: 0 }}>
      {/* Left Column: Golden Dataset Evaluation */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            background: "linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: 24,
            color: "#FFFFFF",
          }}
        >
          <div style={{ fontSize: 13, color: "#94A3B8", fontWeight: 700, marginBottom: 16, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            🛡️ GOLDEN DATASET VALIDATION (QUALITY GATE)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div style={{ background: "rgba(255,255,255,0.05)", padding: 16, borderRadius: 12 }}>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>Writing Alignment</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: writingScore >= 85 ? "#10B981" : "#F59E0B" }}>
                {writingScore}%
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", padding: 16, borderRadius: 12 }}>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>Design Alignment</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: designScore >= 85 ? "#10B981" : "#F59E0B" }}>
                {designScore}%
              </div>
            </div>
          </div>

          {evaluation?.writing?.driftReport && evaluation.writing.driftReport.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 10 }}>
                Отчет о соответствии правилам:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {evaluation.writing.driftReport.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: r.passed ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                      border: `1px solid ${r.passed ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                      fontSize: 13,
                    }}
                  >
                    <span>{r.passed ? "✅" : "⚠️"}</span>
                    <div>
                      <div style={{ fontWeight: 600, color: r.passed ? "#10B981" : "#EF4444" }}>{r.rule}</div>
                      {r.details && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{r.details}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Stage Execution Logs */}
      <div className="card" style={{ padding: 24, background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0" }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 16 }}>
          📋 Логи выполнения стадий
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {stages.map((st, i) => (
            <div key={i} style={{ padding: 12, borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", color: "#334155" }}>
                  {st.stage}
                </span>
                <span style={{ fontSize: 12, color: "#10B981", fontWeight: 700 }}>✓ COMPLETED</span>
              </div>
              <pre style={{ fontSize: 11, color: "#64748B", margin: 0, maxHeight: 80, overflow: "auto", fontFamily: "var(--font-mono)" }}>
                {JSON.stringify(st.result, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
