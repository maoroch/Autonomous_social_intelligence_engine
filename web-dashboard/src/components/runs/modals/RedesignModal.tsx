"use client";

import React, { useState } from "react";

interface RedesignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (notes: string, templateName: string) => void;
  currentTemplate: string;
  availableTemplates: { key: string; name: string }[];
  actionLoading: boolean;
}

export function RedesignModal({
  isOpen,
  onClose,
  onSubmit,
  currentTemplate,
  availableTemplates,
  actionLoading,
}: RedesignModalProps) {
  const [notes, setNotes] = useState("");
  const [template, setTemplate] = useState(currentTemplate);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="modal-content" style={{ background: "#FFFFFF", borderRadius: 16, padding: 32, maxWidth: 520, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: "#0F172A" }}>
          🎨 Перегенерация дизайн-шаблона
        </h2>
        <p style={{ fontSize: 14, color: "#64748B", marginBottom: 20, lineHeight: 1.4 }}>
          Выберите стиль оформления или укажите пожелания по акцентам, структуре и расположению данных.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
            Шаблон оформления
          </label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14 }}
          >
            {availableTemplates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
            Пожелания по дизайну (необязательно)
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Например: сделать заголовок более контрастным, добавить акцент на O2..."
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, resize: "none" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button onClick={onClose} disabled={actionLoading} className="btn btn-secondary" style={{ padding: "10px 18px" }}>
            Отмена
          </button>
          <button
            onClick={() => onSubmit(notes, template)}
            disabled={actionLoading}
            className="btn btn-primary"
            style={{ padding: "10px 22px", fontWeight: 700, background: "#FF7900" }}
          >
            {actionLoading ? "Генерация..." : "Запустить перегенерацию"}
          </button>
        </div>
      </div>
    </div>
  );
}
