import { notFound } from "next/navigation";
import { getTenantContext } from "../../../lib/tenant";
import { LogoutButton } from "../../../components/LogoutButton";

export default async function TenantPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const tenant = await getTenantContext(tenantId);

  // Портал существует только для реально заведённых Organization — так гарантируется, что
  // tech-портал и Testo-портал (и любой будущий клиент) физически не пересекаются по URL/данным.
  if (!tenant) {
    notFound();
  }

  const accentColor = tenant.colorPalette[0];
  const base = `/${tenant.tenantId}/dashboard`;

  return (
    <>
      {accentColor && (
        <style>{`:root { --primary: ${accentColor}; }`}</style>
      )}
      <header
        style={{
          background: "rgba(255, 255, 255, 0.8)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          padding: "16px 24px",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                background: accentColor ? accentColor : "linear-gradient(135deg, #0a66c2, #8b5cf6)",
                width: 32,
                height: 32,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                color: "white",
                fontSize: 16,
              }}
            >
              {tenant.orgName.charAt(0).toUpperCase()}
            </span>
            <div>
              <strong style={{ fontSize: 18, letterSpacing: "-0.01em", display: "block" }}>{tenant.orgName}</strong>
              {tenant.verticalName && (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{tenant.verticalName}</span>
              )}
            </div>
          </div>
          <nav style={{ display: "flex", gap: 24, fontSize: 14, fontWeight: 500, alignItems: "center" }}>
            <a href={base}>Дашборд</a>
            <a href={`${base}/runs`}>История прогонов</a>
            <a href={`${base}/profiles`}>Профили авторов</a>
            <a href={`/${tenant.tenantId}/templates`}>🎨 Шаблоны Дизайна</a>
            <a href={`${base}/illustrations`}>Иллюстрации</a>
            <a href={`${base}/facts`}>База фактов</a>
            <LogoutButton tenantId={tenant.tenantId} />
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}
