"use client";

import React from "react";

interface SlidePreviewDeckProps {
  runId: string;
  selectedTemplate: string;
  renderedStyles?: Record<string, any>;
  isReRendering: boolean;
  totalSlides: number;
  activeSlide: number;
  onSelectSlide: (index: number) => void;
}

export function SlidePreviewDeck({
  runId,
  selectedTemplate,
  renderedStyles = {},
  isReRendering,
  totalSlides,
  activeSlide,
  onSelectSlide,
}: SlidePreviewDeckProps) {
  const currentStyleData = renderedStyles[selectedTemplate] || Object.values(renderedStyles)[0];
  const imageIds: string[] = currentStyleData?.imageIds || [];
  const zipId = currentStyleData?.zipId;

  return (
    <div className="card" style={{ padding: 24, background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", margin: 0 }}>
          Визуальный рендер карусели
        </h3>
        {isReRendering && (
          <span style={{ fontSize: 13, color: "#D97706", fontWeight: 700 }}>
            ⏳ Перерендер...
          </span>
        )}
      </div>

      {/* Grid of Slide Previews */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {Array.from({ length: Math.max(totalSlides, imageIds.length || 5) }).map((_, idx) => {
          const imgId = imageIds[idx];
          const isActive = activeSlide === idx;

          return (
            <div
              key={idx}
              onClick={() => onSelectSlide(idx)}
              style={{
                borderRadius: 10,
                overflow: "hidden",
                border: `2.5px solid ${isActive ? "#FF7900" : "#E2E8F0"}`,
                boxShadow: isActive ? "0 4px 14px rgba(255, 121, 0, 0.25)" : "none",
                cursor: "pointer",
                position: "relative",
                aspectRatio: "4/5",
                background: "#F8FAFC",
                transition: "all 0.2s",
              }}
            >
              {imgId ? (
                <img
                  src={`/api/proxy/images/${imgId}`}
                  alt={`Slide ${idx + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#94A3B8" }}>
                  Слайд {idx + 1}
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  bottom: 4,
                  right: 4,
                  background: "rgba(0,0,0,0.6)",
                  color: "#FFFFFF",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                #{idx + 1}
              </div>
            </div>
          );
        })}
      </div>

      {/* ZIP Download Button */}
      {zipId && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <a
            href={`/api/proxy/images/${zipId}`}
            download={`carousel_${runId}_${selectedTemplate}.zip`}
            className="btn btn-primary"
            style={{
              padding: "12px 24px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              fontSize: 15,
              background: "#0F172A",
            }}
          >
            📦 Скачать ZIP Архив (Слайды PNG)
          </a>
        </div>
      )}
    </div>
  );
}
