import Link from "next/link";
import { listTenants, type TenantContext } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

export default async function PortalPickerPage() {
  const tenants = await listTenants();

  return (
    <div style={{ maxWidth: 720, margin: "80px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Выберите портал</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 32 }}>
        Каждый клиент платформы работает в собственном изолированном портале — со своими данными,
        брендингом и настройками.
      </p>

      {tenants.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          Организации ещё не заведены. Запустите <code>npm run seed-organizations -w services/openclaw</code>.
        </p>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {tenants.map((tenant: TenantContext) => {
          const accent = tenant.colorPalette[0] ?? "#0A66C2";
          return (
            <Link
              key={tenant.tenantId}
              href={`/${tenant.tenantId}/dashboard`}
              className="card"
              style={{ display: "flex", alignItems: "center", gap: 16, textDecoration: "none", color: "inherit" }}
            >
              <span
                style={{
                  background: accent,
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold",
                  color: "white",
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                {tenant.orgName.charAt(0).toUpperCase()}
              </span>
              <div>
                <strong style={{ display: "block" }}>{tenant.orgName}</strong>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {tenant.verticalName ?? tenant.tenantId} · {tenant.publishingTargets.join(", ")}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
