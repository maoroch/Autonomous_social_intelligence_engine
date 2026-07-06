"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AuthorProfile {
  _id: string;
  name: string;
  username?: string;
  topics: string[];
  forbidden_words: string[];
  cta_style?: string;
  use_emoji: boolean;
  tone?: string;
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<AuthorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<Partial<AuthorProfile> | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profiles");
      if (res.ok) {
        const data = await res.json();
        setProfiles(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    const method = editingProfile._id ? "PUT" : "POST";
    const url = editingProfile._id ? `/api/profiles/${editingProfile._id}` : "/api/profiles";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingProfile),
      });
      if (res.ok) {
        setEditingProfile(null);
        fetchProfiles();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete profile?")) return;
    try {
      const res = await fetch(`/api/profiles/${id}`, { method: "DELETE" });
      if (res.ok) fetchProfiles();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <main className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Профили Авторов</h2>
        <button
          onClick={() => setEditingProfile({ name: "", username: "", topics: [], forbidden_words: [], use_emoji: false, cta_style: "", tone: "" })}
          className="btn btn-primary"
        >
          + Создать профиль
        </button>
      </div>

      {editingProfile && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3>{editingProfile._id ? "Редактировать профиль" : "Новый профиль"}</h3>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--text-muted)" }}>Никнейм/Юзернейм (для футера слайдов)</label>
              <input
                value={editingProfile.username || ""}
                onChange={(e) => setEditingProfile({ ...editingProfile, username: e.target.value })}
                placeholder="Например: @maoroch"
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--text-muted)" }}>Имя профиля</label>
              <input
                required
                value={editingProfile.name || ""}
                onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                placeholder="Например: John Doe - Tech Lead"
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--text-muted)" }}>Темы (через запятую)</label>
              <input
                value={(editingProfile.topics || []).join(", ")}
                onChange={(e) => setEditingProfile({ ...editingProfile, topics: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="AI, Node.js, Leadership"
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--text-muted)" }}>Стоп-слова (через запятую)</label>
              <input
                value={(editingProfile.forbidden_words || []).join(", ")}
                onChange={(e) => setEditingProfile({ ...editingProfile, forbidden_words: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="buy now, crypto"
              />
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--text-muted)" }}>Стиль CTA</label>
                <input
                  value={editingProfile.cta_style || ""}
                  onChange={(e) => setEditingProfile({ ...editingProfile, cta_style: e.target.value })}
                  placeholder="Question to audience"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--text-muted)" }}>Тон</label>
                <input
                  value={editingProfile.tone || ""}
                  onChange={(e) => setEditingProfile({ ...editingProfile, tone: e.target.value })}
                  placeholder="Professional, insightful"
                />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={editingProfile.use_emoji || false}
                onChange={(e) => setEditingProfile({ ...editingProfile, use_emoji: e.target.checked })}
              />
              <span style={{ fontSize: 14 }}>Использовать эмодзи</span>
            </label>
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button type="submit" className="btn btn-primary">Сохранить</button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingProfile(null)}>Отмена</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid-main" style={{ gridTemplateColumns: "1fr", gap: 16 }}>
        {loading ? (
          <div>Загрузка...</div>
        ) : profiles.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 12 }}>
            Нет профилей. Создайте первый профиль автора.
          </div>
        ) : (
          profiles.map((profile) => (
            <div key={profile._id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: "0 0 8px 0" }}>{profile.name}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Темы: {profile.topics.join(", ") || "—"}</p>
                <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-muted)" }}>Никнейм: {profile.username || "—"} | Тон: {profile.tone || "—"} | Эмодзи: {profile.use_emoji ? "Да" : "Нет"}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setEditingProfile(profile)}>Редактировать</button>
                <button className="btn btn-secondary" style={{ color: "var(--red)" }} onClick={() => handleDelete(profile._id)}>Удалить</button>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
