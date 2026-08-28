"use client";

import React from "react";
import { PIPELINE_STAGES } from "@/lib/constants";

interface RunProgressTrackerProps {
  stages: any[];
  currentStage: string;
  runStatus: string;
}

export function RunProgressTracker({ stages, currentStage, runStatus }: RunProgressTrackerProps) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", position: "relative", margin: "24px 0 32px", padding: "0 10px" }}>
      <div
        style={{
          position: "absolute",
          top: 15,
          left: 20,
          right: 20,
          height: 2,
          background: "#E2E8F0",
          zIndex: 1,
        }}
      />

      {PIPELINE_STAGES.map((stage, idx) => {
        const isCompleted =
          stages.some((s) => s.stage === stage) ||
          (runStatus === "awaiting_approval" && stage !== "human_approval");
        const isActive = currentStage === stage;

        return (
          <div key={stage} style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 2, flex: 1 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: isCompleted ? "#10B981" : isActive ? "#6366F1" : "#F1F5F9",
                border: `2px solid ${isCompleted ? "#10B981" : isActive ? "#6366F1" : "#CBD5E1"}`,
                boxShadow: isActive ? "0 0 12px rgba(99, 102, 241, 0.4)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: "bold",
                color: isCompleted || isActive ? "#FFFFFF" : "#64748B",
                transition: "all 0.3s",
              }}
            >
              {isCompleted ? "✓" : idx + 1}
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                marginTop: 8,
                color: isActive ? "#6366F1" : isCompleted ? "#10B981" : "#94A3B8",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                textAlign: "center",
              }}
            >
              {stage.replace("_", " ")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
