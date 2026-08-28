"use client";

import React, { useState } from "react";

interface ReprocessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (notes: string) => void;
  actionLoading: boolean;
}

export function ReprocessModal({
  isOpen,
  onClose,
  onSubmit,
  actionLoading,
}: ReprocessModalProps) {
  const [notes, setNotes] = useState("");

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="modal-content" style={{ background: "#FFFFFF", borderRadius: 16, padding: 32, maxWidth: 520, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: "#0F172A" }}>
          🔄 Переписать весь пост
        </h2>
        <p style={{ fontSize: 14, color: "#64748B", marginBottom: 20, lineHeight: 1.4 }}>
          Пайплайн заново сгенерирует стратегию, текст поста и слайды с учетом ваших замечаний.
        </p>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
            Замечания для копирайтера и стратега
          </label>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Укажите, что именно нужно изменить в тоне, аргументах, хуке или CTA..."
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, resize: "none" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button onClick={onClose} disabled={actionLoading} className="btn btn-secondary" style={{ padding: "10px 18px" }}>
            Отмена
          </button>
          <button
            onClick={() => onSubmit(notes)}
            disabled={actionLoading}
            className="btn btn-primary"
            style={{ padding: "10px 22px", fontWeight: 700, background: "#6366F1" }}
          >
            {actionLoading ? "Отправка..." : "Переписать пост"}
          </button>
        </div>
      </div>
    </div>
  );
}
