"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface DesignTemplate {
  _id: string;
  tenantId: string;
  name: string;
  type: "cover" | "card";
  pillarId: string;
  htmlTemplate: string;
  cssContent?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ContentPillar {
  id: string;
  label: string;
}

const DEFAULT_COVER_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; width: 1080px; height: 1350px; background: #0d1117; color: #f0f6fc; font-family: sans-serif; display: flex; flex-direction: column; justify-content: space-between; padding: 80px; box-sizing: border-box; }
    .badge { font-size: 24px; color: #58a6ff; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; }
    .title { font-size: 64px; font-weight: 800; line-height: 1.2; background: linear-gradient(130deg, #ffffff 30%, #58a6ff 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .footer { font-size: 24px; color: #8b949e; display: flex; justify-content: space-between; border-top: 1px solid #30363d; padding-top: 30px; }
  </style>
</head>
<body>
  <div class="badge">{{BADGE}}</div>
  <h1 class="title">{{TITLE}}</h1>
  <div class="bullets">{{BODY}}</div>
  <div class="footer">
    <span>{{FOOTER_LEFT}}</span>
    <span>{{PAGE_TEXT}}</span>
  </div>
</body>
</html>`;

const DEFAULT_CARD_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; width: 1080px; height: 1350px; background: #0d1117; color: #f0f6fc; font-family: sans-serif; padding: 80px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; }
    .header { font-size: 24px; color: #58a6ff; font-weight: bold; }
    .title { font-size: 48px; font-weight: bold; margin-top: 20px; color: #ffffff; }
    .body { font-size: 32px; line-height: 1.5; color: #8b949e; margin-top: 30px; }
    .footer { font-size: 24px; color: #8b949e; border-top: 1px solid #30363d; padding-top: 30px; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div>
    <div class="header">{{BADGE}}</div>
    <div class="title">{{TITLE}}</div>
    <div class="body">{{BODY}}</div>
  </div>
  <div class="footer">
    <span>{{FOOTER_LEFT}}</span>
    <span>{{PAGE_TEXT}}</span>
  </div>
</body>
</html>`;

export default function TemplatesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilterPillar, setSelectedFilterPillar] = useState<string>("all_filter");
  // Рубрики контента — загружаются из tenant-info API динамически для изоляции Tech/Testo.
  const [contentPillars, setContentPillars] = useState<ContentPillar[]>([]);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"cover" | "card">("cover");
  const [pillarId, setPillarId] = useState("");
  const [htmlTemplate, setHtmlTemplate] = useState("");
  const [cssContent, setCssContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTenantPillars = async () => {
    try {
      const res = await fetch(`/api/tenant-info?tenantId=${encodeURIComponent(tenantId)}`);
      if (res.ok) {
        const data = await res.json();
        const pillars: ContentPillar[] = (data.contentPillars ?? []).map((p: any) => ({
          id: p.id,
          label: p.label,
        }));
        setContentPillars(pillars);
        // Устанавливаем дефолтный pillarId на первую рубрику.
        if (pillars.length > 0 && !pillarId) {
          setPillarId(pillars[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch tenant pillars:", err);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/templates?tenantId=${encodeURIComponent(tenantId)}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchTenantPillars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleOpenCreate = (templateType: "cover" | "card" = "cover") => {
    setEditingId(null);
    setName(templateType === "cover" ? "Кастомный Шаблон Обложки" : "Кастомный Шаблон Карточки");
    setType(templateType);
    // Дефолтный pillarId — первая рубрика для этого tenant (не hardcoded Tech-рубрика).
    setPillarId(contentPillars[0]?.id ?? "all");
    setHtmlTemplate(templateType === "cover" ? DEFAULT_COVER_HTML : DEFAULT_CARD_HTML);
    setCssContent("");
    setShowModal(true);
  };

  const handleOpenEdit = (t: DesignTemplate) => {
    setEditingId(t._id);
    setName(t.name);
    setType(t.type);
    setPillarId(t.pillarId);
    setHtmlTemplate(t.htmlTemplate);
    setCssContent(t.cssContent || "");
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        // Update
        const res = await fetch(`/api/templates/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, type, pillarId, htmlTemplate, cssContent }),
        });
        if (!res.ok) throw new Error("Failed to update template");
      } else {
        // Create
        const res = await fetch(`/api/templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, name, type, pillarId, htmlTemplate, cssContent }),
        });
        if (!res.ok) throw new Error("Failed to create template");
      }
      setShowModal(false);
      fetchTemplates();
    } catch (err) {
      alert("Не удалось сохранить шаблон");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Вы уверены, что хотите удалить этот шаблон дизайна?")) return;
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchTemplates();
      }
    } catch (err) {
      alert("Не удалось удалить шаблон");
    }
  };

  const filteredTemplates = selectedFilterPillar === "all_filter"
    ? templates
    : templates.filter(t => t.pillarId === selectedFilterPillar);

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>🎨 Управление Шаблонами Дизайна</h1>
          <p style={{ color: "#6e7681", marginTop: 4 }}>
            Настраивайте уникальный HTML/CSS дизайн обложек и карточек для каждой из 8 тех-рубрик портала.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => handleOpenCreate("cover")}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              background: "#0a66c2",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Новый Шаблон Обложки
          </button>
          <button
            onClick={() => handleOpenCreate("card")}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              background: "#8b5cf6",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Новый Шаблон Карточки
          </button>
        </div>
      </div>

      {/* Pillar Filter Bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24, padding: 12, background: "#f6f8fa", borderRadius: 12, border: "1px solid #e1e4e8" }}>
        <button
          onClick={() => setSelectedFilterPillar("all_filter")}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: selectedFilterPillar === "all_filter" ? "2px solid #0969da" : "1px solid #d0d7de",
            background: selectedFilterPillar === "all_filter" ? "#ddf4ff" : "#ffffff",
            color: selectedFilterPillar === "all_filter" ? "#0969da" : "#24292f",
            fontWeight: selectedFilterPillar === "all_filter" ? 700 : 500,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          🌐 Все шаблоны ({templates.length})
        </button>
        {contentPillars.map((pillar) => {
          const count = templates.filter(t => t.pillarId === pillar.id).length;
          return (
            <button
              key={pillar.id}
              onClick={() => setSelectedFilterPillar(pillar.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: selectedFilterPillar === pillar.id ? "2px solid #0969da" : "1px solid #d0d7de",
                background: selectedFilterPillar === pillar.id ? "#ddf4ff" : "#ffffff",
                color: selectedFilterPillar === pillar.id ? "#0969da" : "#24292f",
                fontWeight: selectedFilterPillar === pillar.id ? 700 : 500,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              📌 {pillar.label} ({count})
            </button>
          );
        })}
        {/* Отдельная кнопка для шаблонов типа "all" (дефолты для всех рубрик) */}
        {templates.some(t => t.pillarId === "all") && (
          <button
            onClick={() => setSelectedFilterPillar("all")}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: selectedFilterPillar === "all" ? "2px solid #0969da" : "1px solid #d0d7de",
              background: selectedFilterPillar === "all" ? "#ddf4ff" : "#ffffff",
              color: selectedFilterPillar === "all" ? "#0969da" : "#24292f",
              fontWeight: selectedFilterPillar === "all" ? 700 : 500,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            🌐 Все рубрики — Дефолты ({templates.filter(t => t.pillarId === "all").length})
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "#8b949e" }}>Загрузка шаблонов...</div>
      ) : filteredTemplates.length === 0 ? (
        <div
          style={{
            background: "#ffffff",
            border: "1px dashed #d0d7de",
            borderRadius: 12,
            padding: 48,
            textAlign: "center",
          }}
        >
          <h3 style={{ margin: "0 0 8px 0" }}>Шаблоны не найдены</h3>
          <p style={{ color: "#6e7681", marginBottom: 24 }}>
            Для выбранного фильтра нет сохраненных шаблонов. Создайте новый кастомный шаблон!
          </p>
          <button
            onClick={() => handleOpenCreate("cover")}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              background: "#0a66c2",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Создать шаблон
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20 }}>
          {filteredTemplates.map((t) => {
            // Ищем label в динамически загруженных рубриках.
            const pillarInfo = contentPillars.find(p => p.id === t.pillarId)
              ?? { id: t.pillarId, label: t.pillarId === "all" ? "Все рубрики (Дефолт)" : t.pillarId };
            return (
              <div
                key={t._id}
                style={{
                  background: "#ffffff",
                  border: "1px solid #d0d7de",
                  borderRadius: 12,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: t.type === "cover" ? "#ddf4ff" : "#f3e8ff",
                        color: t.type === "cover" ? "#0969da" : "#6b21a8",
                      }}
                    >
                      {t.type === "cover" ? "🖼️ Обложка (Cover)" : "🎴 Карточка (Card)"}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#57606a", background: "#f6f8fa", padding: "4px 8px", borderRadius: 6, border: "1px solid #eaeef2" }}>
                      📌 {pillarInfo.label}
                    </span>
                  </div>
                  <h3 style={{ margin: "0 0 8px 0", fontSize: 18, color: "#1f2328" }}>{t.name}</h3>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      background: "#f6f8fa",
                      padding: 10,
                      borderRadius: 6,
                      maxHeight: 120,
                      overflow: "hidden",
                      color: "#57606a",
                      border: "1px solid #e1e4e8",
                    }}
                  >
                    {t.htmlTemplate.substring(0, 220)}...
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 16, borderTop: "1px solid #eaeef2", paddingTop: 12 }}>
                  <button
                    onClick={() => handleOpenEdit(t)}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: 6,
                      border: "1px solid #d0d7de",
                      background: "#f6f8fa",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    ✏️ Редактировать
                  </button>
                  <button
                    onClick={() => handleDelete(t._id)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: "1px solid #ffc9c9",
                      background: "#ffebe9",
                      color: "#cf222e",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Editor */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              width: "100%",
              maxWidth: 900,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 32,
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 24 }}>
              {editingId ? "✏️ Редактирование Шаблона Дизайна" : "✨ Новый Шаблон Дизайна"}
            </h2>
            <form onSubmit={handleSave}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Название</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d0d7de" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Тип Слайда</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as "cover" | "card")}
                    style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d0d7de" }}
                  >
                    <option value="cover">Обложка (Slide 1 Cover)</option>
                    <option value="card">Карточка (Slide 2..N Card)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Рубрика (Pillar)</label>
                  <select
                    value={pillarId}
                    onChange={(e) => setPillarId(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d0d7de" }}
                  >
                    {/* Дефолт для всех рубрик */}
                    <option value="all">🌐 Все рубрики (Дефолт для всех)</option>
                    {/* Динамические рубрики из IndustryProfile текущего tenant */}
                    {contentPillars.map(p => (
                      <option key={p.id} value={p.id}>📌 {p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                  HTML Шаблон (Puppeteer Placeholder: {"{{TITLE}}, {{BODY}}, {{BADGE}}, {{FOOTER_LEFT}}, {{PAGE_TEXT}}"})
                </label>
                <textarea
                  rows={14}
                  required
                  value={htmlTemplate}
                  onChange={(e) => setHtmlTemplate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: 8,
                    border: "1px solid #d0d7de",
                    fontFamily: "monospace",
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 8,
                    border: "1px solid #d0d7de",
                    background: "#ffffff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 8,
                    background: "#0a66c2",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {submitting ? "Сохранение..." : "Сохранить Шаблон"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
