"use client";

import React from "react";
import type { SlideData } from "@/hooks/useSlideDeckEditor";
import { TEMPLATE_ACCENT_COLORS, TEMPLATE_BADGE_DEFAULTS } from "@/lib/constants";

interface SlideCardEditorProps {
  slides: SlideData[];
  activeSlide: number;
  selectedTemplate: string;
  isAwaitingApproval: boolean;
  onSlideChange: (index: number, field: keyof SlideData, value: string | string[]) => void;
  onSelectSlide: (index: number) => void;
}

export function SlideCardEditor({
  slides,
  activeSlide,
  selectedTemplate,
  isAwaitingApproval,
  onSlideChange,
  onSelectSlide,
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
      <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 16 }}>
        Редактор слайдов
      </h3>

      {/* Mini Interactive Preview Box */}
      <div
        style={{
          aspectRatio: "1/1",
          maxWidth: 420,
          margin: "0 auto 20px auto",
          background: "#FFFFFF",
          border: `3px solid ${accentColor}`,
          borderRadius: 16,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
        }}
      >
        <div>
          {/* Badge Input */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>
              Метка / Бейдж слайда
            </label>
            <input
              type="text"
              disabled={!isAwaitingApproval}
              value={currentSlide.badge || defaultBadgeText}
              onChange={(e) => onSlideChange(activeSlide, "badge", e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #CBD5E1",
                fontSize: 13,
                fontWeight: 700,
                color: "#0F172A",
              }}
            />
          </div>

          {/* Title Input */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>
              Заголовок слайда
            </label>
            <input
              type="text"
              disabled={!isAwaitingApproval}
              value={currentSlide.title}
              onChange={(e) => onSlideChange(activeSlide, "title", e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #CBD5E1",
                fontSize: 15,
                fontWeight: 800,
                color: "#0F172A",
              }}
            />
          </div>

          {/* Bullets Input */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>
              Буллиты / Описание (по одному на строку)
            </label>
            <textarea
              rows={4}
              disabled={!isAwaitingApproval}
              value={currentSlide.bullets.join("\n")}
              onChange={(e) => onSlideChange(activeSlide, "bullets", e.target.value.split("\n"))}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #CBD5E1",
                fontSize: 13,
                lineHeight: 1.4,
                resize: "none",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: 12, marginTop: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>testo.azia</span>
          <span style={{ fontSize: 12, color: "#64748B" }}>
            Слайд {activeSlide + 1} из {slides.length}
          </span>
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
    </div>
  );
}
