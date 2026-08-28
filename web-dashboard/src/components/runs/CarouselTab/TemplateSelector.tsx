"use client";

import React from "react";

interface TemplateSelectorProps {
  selectedTemplate: string;
  onTemplateChange: (template: string) => void;
  isAwaitingApproval: boolean;
  tenantId: string;
  availableTemplates?: { key: string; name: string }[];
}

export function TemplateSelector({
  selectedTemplate,
  onTemplateChange,
  isAwaitingApproval,
  tenantId,
  availableTemplates = [],
}: TemplateSelectorProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
      <label style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
        🎨 Выбранный стиль шаблона:
      </label>
      <select
        value={selectedTemplate}
        disabled={!isAwaitingApproval}
        onChange={(e) => onTemplateChange(e.target.value)}
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid #CBD5E1",
          background: "#FFFFFF",
          fontSize: 14,
          fontWeight: 600,
          color: "#0F172A",
          cursor: isAwaitingApproval ? "pointer" : "default",
        }}
      >
        {availableTemplates.length > 0 ? (
          availableTemplates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))
        ) : (
          <>
            <option value="industrial-measurement-equipment">🔶 Testo Brand (Default)</option>
            <option value="testo-brand-orange">Testo Brand Orange</option>
            <option value="testo-pharma-compliance">Testo Pharma Blue</option>
            <option value="testo-pharma-cold-chain">Testo Cold Chain Cyan</option>
            <option value="testo-pharma-audit">Testo Audit Green</option>
          </>
        )}
      </select>
    </div>
  );
}
