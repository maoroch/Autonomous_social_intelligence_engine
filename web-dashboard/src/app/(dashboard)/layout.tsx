export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
        <header style={{
          background: "rgba(255, 255, 255, 0.8)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          padding: "16px 24px",
          position: "sticky",
          top: 0,
          zIndex: 100
        }}>
          <div style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{
                background: "linear-gradient(135deg, #0a66c2, #8b5cf6)",
                width: 32,
                height: 32,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                color: "white",
                fontSize: 16
              }}>🔗</span>
              <strong style={{ fontSize: 18, letterSpacing: "-0.01em" }}>Pipeline Control</strong>
            </div>
            <nav style={{ display: "flex", gap: 24, fontSize: 14, fontWeight: 500 }}>
              <a href="/dashboard">Дашборд</a>
              <a href="/dashboard/runs">История прогонов</a>
              <a href="/dashboard/profiles">Профили авторов</a>
              <a href="/dashboard/illustrations">Иллюстрации</a>
            </nav>
          </div>
        </header>
        {children}
    </>
  );
}
