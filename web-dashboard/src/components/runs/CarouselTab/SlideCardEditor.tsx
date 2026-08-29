"use client";

import React from "react";
import type { SlideData } from "@/hooks/useSlideDeckEditor";
import { TEMPLATE_ACCENT_COLORS, TEMPLATE_BADGE_DEFAULTS } from "@/lib/constants";

interface SlideCardEditorProps {
  slides: SlideData[];
  activeSlide: number;
  selectedTemplate: string;
  isAwaitingApproval: boolean;
  actionLoading?: boolean;
  onSlideChange: (index: number, field: keyof SlideData, value: string | string[]) => void;
  onSelectSlide: (index: number) => void;
  onSaveManualEdits?: () => void;
}

export function SlideCardEditor({
  slides,
  activeSlide,
  selectedTemplate,
  isAwaitingApproval,
  actionLoading = false,
  onSlideChange,
  onSelectSlide,
  onSaveManualEdits,
}: SlideCardEditorProps) {
  const currentSlide = slides[activeSlide];
  if (!currentSlide) return null;

  const accentColor = TEMPLATE_ACCENT_COLORS[selectedTemplate] || "#FF7900";
  const defaultBadges = TEMPLATE_BADGE_DEFAULTS[selectedTemplate] || {
    cover: "B2B CASE",
    card: "TECHNICAL OVERVIEW",
  };
  const defaultBadgeText = activeSlide === 0 ? defaultBadges.cover : defaultBadges.card;

  return (
    <div className="card" style={{ padding: 24, background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", margin: 0 }}>
          Редактор: Слайд #{activeSlide + 1}
        </h3>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
          {activeSlide === 0 ? "Обложка (Cover)" : `Карточка ${activeSlide + 1} из ${slides.length}`}
        </span>
      </div>

      {/* Interactive Form Box */}
      <div
        style={{
          background: "#FFFFFF",
          border: `2px solid ${accentColor}`,
          borderRadius: 14,
          padding: 20,
          boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
        }}
      >
        {/* Badge Input */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 6 }}>
            Метка / Бейдж слайда
          </label>
          <input
            type="text"
            disabled={!isAwaitingApproval}
            value={currentSlide.badge || defaultBadgeText}
            onChange={(e) => onSlideChange(activeSlide, "badge", e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              fontSize: 13,
              fontWeight: 700,
              color: "#0F172A",
            }}
          />
        </div>

        {/* Title Input */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 6 }}>
            Заголовок слайда
          </label>
          <input
            type="text"
            disabled={!isAwaitingApproval}
            value={currentSlide.title}
            onChange={(e) => onSlideChange(activeSlide, "title", e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              fontSize: 15,
              fontWeight: 800,
              color: "#0F172A",
            }}
          />
        </div>

        {/* Bullets Input */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 6 }}>
            Буллиты / Текст (по одному на строку)
          </label>
          <textarea
            rows={5}
            disabled={!isAwaitingApproval}
            value={currentSlide.bullets.join("\n")}
            onChange={(e) => onSlideChange(activeSlide, "bullets", e.target.value.split("\n"))}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              fontSize: 13,
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
        </div>

        {/* Illustration / Image Input */}
        <div style={{ marginTop: 14 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 6 }}>
            Иллюстрация / Фото прибора (URL или ключ)
          </label>
          <input
            type="text"
            disabled={!isAwaitingApproval}
            placeholder="например: gauge, testo_300 или https://..."
            value={currentSlide.illustration || ""}
            onChange={(e) => onSlideChange(activeSlide, "illustration", e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              fontSize: 13,
              color: "#0F172A",
              marginBottom: 8,
            }}
          />
          {/* Quick Preset Buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>Пресеты:</span>
            {[
              { label: "Манометр", key: "gauge" },
              { label: "Testo 300", key: "testo_300" },
              { label: "Термометр", key: "thermometer" },
              { label: "Внимание", key: "alert-triangle" },
              { label: "Сертификат", key: "certificate" },
              { label: "График", key: "savings_chart" },
              { label: "Без фото", key: "" },
            ].map((preset) => (
              <button
                key={preset.key}
                type="button"
                disabled={!isAwaitingApproval}
                onClick={() => onSlideChange(activeSlide, "illustration", preset.key)}
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  border: "1px solid #E2E8F0",
                  background: (currentSlide.illustration || "") === preset.key ? "#FFF7ED" : "#F8FAFC",
                  color: (currentSlide.illustration || "") === preset.key ? "#EA580C" : "#475569",
                  fontWeight: (currentSlide.illustration || "") === preset.key ? 700 : 500,
                  cursor: isAwaitingApproval ? "pointer" : "not-allowed",
                  borderColor: (currentSlide.illustration || "") === preset.key ? "#FDBA74" : "#E2E8F0",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pagination Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <button
          onClick={() => onSelectSlide(Math.max(0, activeSlide - 1))}
          disabled={activeSlide === 0}
          className="btn btn-secondary"
          style={{ padding: "8px 14px", fontSize: 13 }}
        >
          ← Назад
        </button>

        <div style={{ display: "flex", gap: 6 }}>
          {slides.map((_, idx) => (
            <span
              key={idx}
              onClick={() => onSelectSlide(idx)}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: activeSlide === idx ? accentColor : "#CBD5E1",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            />
          ))}
        </div>

        <button
          onClick={() => onSelectSlide(Math.min(slides.length - 1, activeSlide + 1))}
          disabled={activeSlide === slides.length - 1}
          className="btn btn-secondary"
          style={{ padding: "8px 14px", fontSize: 13 }}
        >
          Вперед →
        </button>
      </div>

      {/* Direct Save Button */}
      {onSaveManualEdits && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={onSaveManualEdits}
            disabled={!isAwaitingApproval || actionLoading}
            className="btn btn-primary"
            style={{
              width: "100%",
              padding: "13px",
              fontSize: 14,
              fontWeight: 800,
              background: "#FF7900",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 10,
              cursor: (!isAwaitingApproval || actionLoading) ? "not-allowed" : "pointer",
              boxShadow: "0 4px 14px rgba(255, 121, 0, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {actionLoading ? "⏳ Сохранение и рендер..." : "💾 Сохранить и перерендерить слайды"}
          </button>
        </div>
      )}
    </div>
  );
}
