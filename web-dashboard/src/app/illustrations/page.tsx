"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SvgIllustration {
  _id: string;
  name: string;
  svgContent: string;
}

export default function IllustrationsPage() {
  const [illustrations, setIllustrations] = useState<SvgIllustration[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingIll, setEditingIll] = useState<Partial<SvgIllustration> | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchIllustrations();
  }, []);

  const fetchIllustrations = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/illustrations");
      if (res.ok) {
        const data = await res.json();
        setIllustrations(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIll || !editingIll.name || !editingIll.svgContent) return;

    const method = editingIll._id ? "PUT" : "POST";
    const url = editingIll._id ? `/api/illustrations/${editingIll._id}` : "/api/illustrations";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingIll),
      });
      if (res.ok) {
        setEditingIll(null);
        fetchIllustrations();
      } else {
        const data = await res.json();
        alert(data.error || "Ошибка при сохранении");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить эту иллюстрацию?")) return;
    try {
      const res = await fetch(`/api/illustrations/${id}`, { method: "DELETE" });
      if (res.ok) fetchIllustrations();
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = illustrations.filter((ill) =>
    ill.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="container" style={{ padding: "40px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h2 style={{ fontSize: "28px", fontWeight: 700, margin: 0, background: "linear-gradient(135deg, #fff 0%, #a5b4fc 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Библиотека SVG Иллюстраций
          </h2>
          <p style={{ margin: "8px 0 0 0", color: "var(--text-muted)", fontSize: "14px" }}>
            Управляйте графическими ассетами, которые дизайн-агент вставляет в слайды и обложки.
          </p>
        </div>
        <button
          onClick={() => setEditingIll({ name: "", svgContent: "" })}
          className="btn btn-primary"
          style={{ padding: "10px 20px", borderRadius: "8px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}
        >
          <span>+ Добавить SVG</span>
        </button>
      </div>

      {editingIll && (
        <div className="card" style={{ marginBottom: 32, padding: 24, border: "1px solid var(--border)", borderRadius: 16, background: "rgba(30, 30, 40, 0.6)", backdropFilter: "blur(12px)" }}>
          <h3 style={{ margin: "0 0 20px 0", fontSize: "20px", fontWeight: 600 }}>
            {editingIll._id ? "Редактировать иллюстрацию" : "Новая иллюстрация"}
          </h3>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>
                Название иллюстрации (идентификатор для AI)
              </label>
              <input
                required
                value={editingIll.name || ""}
                onChange={(e) => setEditingIll({ ...editingIll, name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                placeholder="Например: database, react, server"
                style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", background: "rgba(0,0,0,0.2)", color: "#fff" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>
                Код SVG иллюстрации (валидный XML)
              </label>
              <textarea
                required
                rows={10}
                value={editingIll.svgContent || ""}
                onChange={(e) => setEditingIll({ ...editingIll, svgContent: e.target.value })}
                placeholder="<svg ...>...</svg>"
                style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", background: "rgba(0,0,0,0.2)", color: "#fff", fontFamily: "monospace", fontSize: 13 }}
              />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button type="submit" className="btn btn-primary" style={{ padding: "10px 24px" }}>Сохранить</button>
              <button type="button" className="btn btn-secondary" style={{ padding: "10px 24px" }} onClick={() => setEditingIll(null)}>Отмена</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Поиск по названию..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: "100%", maxWidth: "350px", padding: "10px 16px", borderRadius: "8px", border: "1px solid var(--border)", background: "rgba(255,255,255,0.05)", color: "#fff" }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Загрузка иллюстраций...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 16 }}>
          Иллюстрации не найдены.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
          {filtered.map((ill) => (
            <div
              key={ill._id}
              className="card"
              style={{
                display: "flex",
                flexDirection: "column",
                padding: 16,
                borderRadius: 16,
                border: "1px solid var(--border)",
                background: "rgba(20, 20, 30, 0.4)",
                transition: "transform 0.2s ease, border-color 0.2s ease",
              }}
            >
              <div
                style={{
                  height: "160px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: 12,
                  marginBottom: 16,
                  padding: 12,
                  overflow: "hidden",
                }}
                dangerouslySetInnerHTML={{ __html: ill.svgContent }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: "15px" }}>{ill.name}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "6px 12px", fontSize: "13px" }}
                    onClick={() => setEditingIll(ill)}
                  >
                    Редактировать
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "6px 12px", fontSize: "13px", color: "var(--red)" }}
                    onClick={() => handleDelete(ill._id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
