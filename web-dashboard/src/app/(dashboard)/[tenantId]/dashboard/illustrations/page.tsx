"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface SvgIllustration {
  _id: string;
  name: string;
  svgContent: string;
}

interface PngIllustration {
  _id: string;
  name: string;
  templateSetId: string;
  base64Content: string;
}

export default function IllustrationsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [templateSetId, setTemplateSetId] = useState<string | null>(null);
  const [isNiche, setIsNiche] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/tenant-info?tenantId=${encodeURIComponent(tenantId)}`)
      .then((res) => res.json())
      .then((data) => {
        setTemplateSetId(data.templateSetId);
        setIsNiche(data.verticalName !== "software-development");
      })
      .catch(() => setIsNiche(false));
  }, [tenantId]);

  if (isNiche === null) {
    return (
      <main className="container" style={{ padding: "40px 20px" }}>
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Загрузка...</div>
      </main>
    );
  }

  // Библиотеки полностью разделены: tech-портал редактирует общую SVG-библиотеку (IT-иконки),
  // нишевые порталы (Testo и будущие клиенты) работают со своей PNG-библиотекой, изолированной по templateSetId.
  // Ни один из порталов не видит и не может изменить иллюстрации другого.
  return isNiche ? <PngLibrary templateSetId={templateSetId!} /> : <SvgLibrary />;
}

// ---------- Tech-портал: существующая SVG-библиотека (без изменений в поведении) ----------

function SvgLibrary() {
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
          <h2 style={{ fontSize: "28px", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
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
        <div className="card" style={{ marginBottom: 32, padding: 24, border: "1px solid var(--border)", borderRadius: 16 }}>
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
                style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", background: "#ffffff", color: "var(--text-main)" }}
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
                style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", background: "#f8fafc", color: "var(--text-main)", fontFamily: "monospace", fontSize: 13 }}
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
          style={{ width: "100%", maxWidth: "350px", padding: "10px 16px", borderRadius: "8px", border: "1px solid var(--border)", background: "#ffffff", color: "var(--text-main)" }}
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
                background: "#ffffff",
              }}
            >
              <div
                style={{
                  height: "160px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#f1f5f9",
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

// ---------- Нишевые порталы (Testo и др.): собственная PNG-библиотека ----------

function PngLibrary({ templateSetId }: { templateSetId: string }) {
  const [illustrations, setIllustrations] = useState<PngIllustration[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchIllustrations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/illustrations/png?templateSetId=${encodeURIComponent(templateSetId)}`);
      if (res.ok) {
        setIllustrations(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIllustrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateSetId]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadName || !uploadFile) return;
    setUploading(true);
    try {
      const base64Content = await fileToBase64(uploadFile);
      const res = await fetch("/api/illustrations/png", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: uploadName.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
          templateSetId,
          base64Content,
        }),
      });
      if (res.ok) {
        setUploadName("");
        setUploadFile(null);
        fetchIllustrations();
      } else {
        const data = await res.json();
        alert(data.error || "Ошибка при загрузке");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="container" style={{ padding: "40px 20px" }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: "28px", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
          Библиотека PNG-иллюстраций
        </h2>
        <p style={{ margin: "8px 0 0 0", color: "var(--text-muted)", fontSize: "14px" }}>
          Отдельная библиотека для этого портала (template-set: <code>{templateSetId}</code>) —
          не пересекается с SVG-библиотекой tech-портала. Текущие иконки — плейсхолдеры, замените
          на официальный брендбук клиента.
        </p>
      </div>

      <form
        onSubmit={handleUpload}
        className="card"
        style={{ marginBottom: 32, padding: 24, borderRadius: 16, border: "1px solid var(--border)", display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}
      >
        <div>
          <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>
            Название (идентификатор для AI)
          </label>
          <input
            required
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
            placeholder="Например: thermometer, gauge"
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)" }}
          />
        </div>
        <div>
          <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>
            PNG-файл
          </label>
          <input type="file" accept="image/png" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
        </div>
        <button type="submit" disabled={uploading} className="btn btn-primary" style={{ padding: "10px 24px" }}>
          {uploading ? "Загрузка..." : "Загрузить"}
        </button>
      </form>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Загрузка иллюстраций...</div>
      ) : illustrations.length === 0 ? (
        <div style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 16 }}>
          В этой библиотеке пока нет иконок.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 24 }}>
          {illustrations.map((ill) => (
            <div
              key={ill._id}
              className="card"
              style={{ display: "flex", flexDirection: "column", padding: 16, borderRadius: 16, border: "1px solid var(--border)", background: "#ffffff" }}
            >
              <div
                style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", borderRadius: 12, marginBottom: 16 }}
              >
                <img
                  src={`data:image/png;base64,${ill.base64Content}`}
                  alt={ill.name}
                  style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
                />
              </div>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{ill.name}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
