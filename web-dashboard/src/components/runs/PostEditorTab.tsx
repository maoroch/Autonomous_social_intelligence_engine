"use client";

import React, { useState } from "react";

interface PostEditorTabProps {
  bodyText: string;
  isAwaitingApproval: boolean;
  isAdapting: boolean;
  copySuccess: string | null;
  adaptations?: {
    telegram?: { text: string; hook?: string; hashtags?: string[]; length: "short" | "long"; alignmentScore?: number };
    threads?: { text: string; hook?: string; hashtags?: string[]; length: "short" | "long"; alignmentScore?: number };
  };
  onBodyChange: (val: string) => void;
  onCopy: (text: string, label: string) => void;
  onAdapt: () => void;
}

export function PostEditorTab({
  bodyText,
  isAwaitingApproval,
  isAdapting,
  copySuccess,
  adaptations,
  onBodyChange,
  onCopy,
  onAdapt,
}: PostEditorTabProps) {
  const [activePlatformTab, setActivePlatformTab] = useState<"linkedin" | "telegram" | "threads">("linkedin");

  const fullLinkedInText = bodyText.trim();
  const telegramText = adaptations?.telegram?.text || fullLinkedInText;
  const threadsText = adaptations?.threads?.text || fullLinkedInText;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28, minWidth: 0 }}>
      {/* Left Column: Unified Single Post Editor */}
      <div className="card" style={{ padding: 24, background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", margin: 0 }}>
            Основной пост (LinkedIn / Master Text)
          </h3>
          <button
            onClick={() => onCopy(fullLinkedInText, "linkedin")}
            className="btn btn-secondary"
            style={{ fontSize: 13, padding: "6px 12px" }}
          >
            {copySuccess === "linkedin" ? "✓ Скопировано!" : "📋 Скопировать"}
          </button>
        </div>

        {/* Single Unified Post Body */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
              📝 Текст публикации (Хук, содержание и призыв к действию)
            </label>
            <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>
              {bodyText.length} символов
            </span>
          </div>
          <textarea
            rows={18}
            value={bodyText}
            disabled={!isAwaitingApproval}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder="Введите или отредактируйте полный текст публикации..."
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 10,
              border: "1px solid #CBD5E1",
              fontSize: 15,
              lineHeight: 1.6,
              color: "#0F172A",
              fontFamily: "inherit",
              resize: "vertical",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.03)",
            }}
          />
        </div>
      </div>

      {/* Right Column: Multi-platform Adaptations */}
      <div className="card" style={{ padding: 24, background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", margin: 0 }}>
            Мультипостинг и адаптация
          </h3>
          <button
            onClick={onAdapt}
            disabled={isAdapting}
            className="btn btn-secondary"
            style={{ fontSize: 13, padding: "6px 12px" }}
          >
            {isAdapting ? "Адаптация..." : "⚡ Адаптировать"}
          </button>
        </div>

        {/* Platform tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setActivePlatformTab("telegram")}
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              background: activePlatformTab === "telegram" ? "#229ED9" : "#F8FAFC",
              color: activePlatformTab === "telegram" ? "#FFFFFF" : "#334155",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ✈️ Telegram
          </button>
          <button
            onClick={() => setActivePlatformTab("threads")}
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              background: activePlatformTab === "threads" ? "#000000" : "#F8FAFC",
              color: activePlatformTab === "threads" ? "#FFFFFF" : "#334155",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            🧵 Threads / IG
          </button>
        </div>

        {/* Platform Content View */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
              {activePlatformTab === "telegram" ? "Форматированный текст Telegram (HTML/Markdown)" : "Краткий тред Threads (до 500 символов)"}
            </span>
            <button
              onClick={() => onCopy(activePlatformTab === "telegram" ? telegramText : threadsText, activePlatformTab)}
              style={{ fontSize: 12, border: "none", background: "none", color: "#6366F1", cursor: "pointer", fontWeight: 700 }}
            >
              {copySuccess === activePlatformTab ? "✓ Скопировано!" : "Скопировать"}
            </button>
          </div>

          <textarea
            rows={18}
            readOnly
            value={activePlatformTab === "telegram" ? telegramText : threadsText}
            style={{
              width: "100%",
              flex: 1,
              padding: "14px 16px",
              borderRadius: 10,
              border: "1px solid #E2E8F0",
              background: "#F8FAFC",
              fontSize: 14,
              lineHeight: 1.6,
              color: "#334155",
              fontFamily: "inherit",
              resize: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}
