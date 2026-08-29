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
  tenantId?: string;
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
  tenantId,
  onSlideChange,
  onSelectSlide,
  onSaveManualEdits,
}: SlideCardEditorProps) {
  const currentSlide = slides[activeSlide];
  if (!currentSlide) return null;

  const [portalIllustrations, setPortalIllustrations] = React.useState<{ name: string; preview?: string }[]>([]);
  const [portalType, setPortalType] = React.useState<string>("портала");
  const [showPortalGallery, setShowPortalGallery] = React.useState(false);
  const [loadingGallery, setLoadingGallery] = React.useState(false);

  React.useEffect(() => {
    if (!tenantId) return;
    const tid = tenantId;
    let isMounted = true;

    async function loadPortalIllustrations() {
      try {
        setLoadingGallery(true);
        const tRes = await fetch(`/api/tenant-info?tenantId=${encodeURIComponent(tid)}`);
        const tData = await tRes.json();
        const isNiche = tData.verticalName !== "software-development";
        if (isMounted) setPortalType(isNiche ? "нишевой (PNG)" : "tech (SVG)");

        if (isNiche) {
          const tSet = selectedTemplate || tData.templateSetId || "industrial-measurement-equipment";
          const res = await fetch(`/api/illustrations/png?templateSetId=${encodeURIComponent(tSet)}`);
          if (res.ok) {
            const data = await res.json();
            if (isMounted && Array.isArray(data)) {
              setPortalIllustrations(
                data.map((item: any) => {
                  let preview = undefined;
                  if (item.base64Content) {
                    const isSvg = item.base64Content.startsWith("PHN2Zy") || item.base64Content.startsWith("PD94bWw");
                    preview = isSvg
                      ? `data:image/svg+xml;base64,${item.base64Content}`
                      : `data:image/png;base64,${item.base64Content}`;
                  }
                  return {
                    name: item.name,
                    preview,
                  };
                })
              );
            }
          }
        } else {
          const res = await fetch("/api/illustrations");
          if (res.ok) {
            const data = await res.json();
            if (isMounted && Array.isArray(data)) {
              setPortalIllustrations(
                data.map((item: any) => ({
                  name: item.name,
                  preview: item.svgContent ? `data:image/svg+xml;utf8,${encodeURIComponent(item.svgContent)}` : undefined,
                }))
              );
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load portal illustrations:", err);
      } finally {
        if (isMounted) setLoadingGallery(false);
      }
    }

    loadPortalIllustrations();
    return () => {
      isMounted = false;
    };
  }, [tenantId, selectedTemplate]);

  const accentColor = TEMPLATE_ACCENT_COLORS[selectedTemplate] || "#FF7900";
  const defaultBadges = TEMPLATE_BADGE_DEFAULTS[selectedTemplate] || {
    cover: "B2B CASE",
    card: "TECHNICAL OVERVIEW",
  };
  const defaultBadgeText = activeSlide === 0 ? defaultBadges.cover : defaultBadges.card;

  const currentIll = (currentSlide.illustration || "").trim();
  const isDirectUrl = currentIll.startsWith("http://") || currentIll.startsWith("https://") || currentIll.startsWith("data:image/");
  const matchedPortalIll = portalIllustrations.find((p) => p.name.toLowerCase() === currentIll.toLowerCase());
  const previewSrc = isDirectUrl ? currentIll : matchedPortalIll?.preview;

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", margin: 0 }}>
              Иллюстрация / Фото прибора (URL или ключ)
            </label>
            {portalIllustrations.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPortalGallery(!showPortalGallery)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#2563EB",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {showPortalGallery ? "✕ Скрыть хранилище" : `📁 Хранилище ${portalType} (${portalIllustrations.length})`}
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <input
              type="text"
              disabled={!isAwaitingApproval}
              placeholder="например: gauge, testo_300 или https://..."
              value={currentSlide.illustration || ""}
              onChange={(e) => onSlideChange(activeSlide, "illustration", e.target.value)}
              style={{
                flex: 1,
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid #CBD5E1",
                fontSize: 13,
                color: "#0F172A",
              }}
            />
            {previewSrc && (
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 6,
                  border: "1px solid #CBD5E1",
                  overflow: "hidden",
                  background: "#F8FAFC",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
                title="Предпросмотр изображения"
              >
                <img
                  src={previewSrc}
                  alt="preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
            )}
          </div>

          {/* Collapsible Portal Illustrations Gallery */}
          {showPortalGallery && portalIllustrations.length > 0 && (
            <div
              style={{
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
                borderRadius: 8,
                padding: 10,
                marginBottom: 10,
                maxHeight: 180,
                overflowY: "auto",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 6 }}>
                Изолированное хранилище портала ({portalType}):
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                {portalIllustrations.map((item) => (
                  <div
                    key={item.name}
                    onClick={() => {
                      if (!isAwaitingApproval) return;
                      onSlideChange(activeSlide, "illustration", item.name);
                    }}
                    style={{
                      border: currentIll === item.name ? "2px solid #FF7900" : "1px solid #CBD5E1",
                      borderRadius: 6,
                      background: currentIll === item.name ? "#FFF7ED" : "#FFFFFF",
                      padding: 6,
                      cursor: isAwaitingApproval ? "pointer" : "not-allowed",
                      textAlign: "center",
                      transition: "all 0.15s",
                    }}
                  >
                    {item.preview ? (
                      <img
                        src={item.preview}
                        alt={item.name}
                        style={{ width: "100%", height: 42, objectFit: "contain", marginBottom: 4 }}
                      />
                    ) : (
                      <div style={{ height: 42, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                        🖼️
                      </div>
                    )}
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
