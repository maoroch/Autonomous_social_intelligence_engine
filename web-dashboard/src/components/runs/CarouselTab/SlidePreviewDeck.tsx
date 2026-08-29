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

      {/* Featured Large HD Active Slide Preview */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            aspectRatio: "4/5",
            borderRadius: 16,
            overflow: "hidden",
            border: "3px solid #FF7900",
            boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
            background: "#F8FAFC",
            position: "relative",
          }}
        >
          {imageIds[activeSlide] ? (
            <img
              key={imageIds[activeSlide]}
              src={`/api/proxy/images/${imageIds[activeSlide]}`}
              alt={`Slide ${activeSlide + 1}`}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#94A3B8" }}>
              Слайд {activeSlide + 1}
            </div>
          )}
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "rgba(15, 23, 42, 0.85)",
              color: "#FFFFFF",
              fontSize: 12,
              fontWeight: 800,
              padding: "4px 10px",
              borderRadius: 8,
              backdropFilter: "blur(8px)",
            }}
          >
            Слайд #{activeSlide + 1}
          </div>
        </div>
      </div>

      {/* Thumbnails Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
          gap: 10,
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
                borderRadius: 8,
                overflow: "hidden",
                border: `2px solid ${isActive ? "#FF7900" : "#CBD5E1"}`,
                boxShadow: isActive ? "0 4px 12px rgba(255, 121, 0, 0.3)" : "none",
                cursor: "pointer",
                position: "relative",
                aspectRatio: "4/5",
                background: "#F8FAFC",
                transition: "all 0.2s",
                transform: isActive ? "scale(1.04)" : "scale(1)",
              }}
            >
              {imgId ? (
                <img
                  key={imgId}
                  src={`/api/proxy/images/${imgId}`}
                  alt={`Slide ${idx + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#94A3B8" }}>
                  #{idx + 1}
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  bottom: 2,
                  right: 2,
                  background: "rgba(0,0,0,0.65)",
                  color: "#FFFFFF",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "1px 4px",
                  borderRadius: 3,
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
