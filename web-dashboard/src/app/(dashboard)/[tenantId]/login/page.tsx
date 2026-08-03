"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, email, password }),
      });
      if (res.ok) {
        router.push(`/${tenantId}/dashboard`);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Не удалось войти");
      }
    } catch (err) {
      setError("Не удалось войти");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 380, margin: "120px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Вход в портал</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>{tenantId}</p>

      <form onSubmit={handleSubmit} className="card" style={{ display: "grid", gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}
          />
        </label>

        {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{
            background: "var(--primary)",
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "10px 16px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {loading ? "Вход..." : "Войти"}
        </button>
      </form>
    </div>
  );
}
