"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface FactChunk {
  _id: string;
  productName: string;
  sourceLabel: string;
  content: string;
  createdAt: string;
}

export default function FactsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [chunks, setChunks] = useState<FactChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [productName, setProductName] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchChunks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fact-chunks?tenantId=${encodeURIComponent(tenantId)}`);
      if (res.ok) setChunks(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChunks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName || !sourceLabel || !content) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/fact-chunks?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, productName, sourceLabel, content }),
      });
      if (res.ok) {
        setProductName("");
        setSourceLabel("");
        setContent("");
        fetchChunks();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить этот факт из базы?")) return;
    try {
      const res = await fetch(`/api/fact-chunks/${id}?tenantId=${encodeURIComponent(tenantId)}`, { method: "DELETE" });
      if (res.ok) fetchChunks();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <main className="container" style={{ padding: "40px 20px" }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "var(--text-main)" }}>База фактов (RAG)</h2>
        <p style={{ margin: "8px 0 0 0", color: "var(--text-muted)", fontSize: 14, maxWidth: 640 }}>
          Эти факты подтягиваются агентом-писателем перед генерацией текста для регулируемых ниш
          (<code>complianceConfig.factCheckRequired</code>) — модель обязана цитировать числа и
          характеристики отсюда, а не придумывать их. Добавляйте только проверенные данные из
          официальных спецификаций.
        </p>
      </div>

      <form
        onSubmit={handleAdd}
        className="card"
        style={{ marginBottom: 32, padding: 24, borderRadius: 16, border: "1px solid var(--border)", display: "grid", gap: 12 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>
              Название изделия / темы
            </label>
            <input
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Например: testo 400"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>
              Источник (для атрибуции)
            </label>
            <input
              required
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="Например: Официальный datasheet testo 400, стр. 2"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)" }}
            />
          </div>
        </div>
        <div>
          <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>
            Текст факта (короткий, самодостаточный)
          </label>
          <textarea
            required
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Например: Диапазон измерения температуры: от -20°C до +60°C, точность ±0.5°C."
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)" }}
          />
        </div>
        <div>
          <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: "10px 24px" }}>
            {saving ? "Сохранение..." : "Добавить факт"}
          </button>
        </div>
      </form>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Загрузка...</div>
      ) : chunks.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 16 }}>
          База фактов пуста. Без фактов агент-писатель будет писать только качественно, без конкретных цифр.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {chunks.map((chunk) => (
            <div
              key={chunk._id}
              className="card"
              style={{ padding: 16, borderRadius: 12, border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 16 }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{chunk.productName}</div>
                <div style={{ fontSize: 14, marginBottom: 6 }}>{chunk.content}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Источник: {chunk.sourceLabel}</div>
              </div>
              <button
                onClick={() => handleDelete(chunk._id)}
                className="btn btn-secondary"
                style={{ padding: "6px 12px", fontSize: 13, color: "var(--red)", height: "fit-content" }}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
