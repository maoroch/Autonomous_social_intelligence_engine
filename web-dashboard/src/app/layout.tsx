import "./globals.css";

export const metadata = {
  title: "LinkedIn AI Content Pipeline Dashboard",
  description: "Human Approval & Analytics Dashboard for LinkedIn AI Pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <header style={{
          background: "rgba(10, 13, 22, 0.8)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
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
              <a href="/">Дашборд</a>
              <a href="/runs">История прогонов</a>
              <a href="/profiles">Профили авторов</a>
              <a href="/illustrations">Иллюстрации</a>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
