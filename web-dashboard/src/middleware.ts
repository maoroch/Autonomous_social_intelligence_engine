import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "./lib/auth";

/**
 * Базовая авторизация per-tenant (см. запрос "сделай базовую авторизацию tech и testo").
 * Правило: сессия действительна ТОЛЬКО для того tenantId, для которого она была выдана.
 * Пользователь tech-портала физически не может подставить свою сессию в URL Testo-портала — и наоборот.
 */
export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const isAuthEnforced = process.env.ENFORCE_AUTH === "true";

  if (!isAuthEnforced) {
    return NextResponse.next();
  }

  // ---------- 1. Защита страниц дашборда: /:tenantId/dashboard/... ----------
  const dashboardMatch = pathname.match(/^\/([^/]+)\/dashboard(\/.*)?$/);
  if (dashboardMatch) {
    const tenantId = dashboardMatch[1];
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session || session.tenantId !== tenantId) {
      const loginUrl = new URL(`/${tenantId}/login`, req.url);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ---------- 2. Защита мутирующих API: требуют tenantId в query/теле и валидную сессию ----------
  const protectedApiPrefixes = ["/api/runs", "/api/profiles", "/api/fact-chunks"];
  if (protectedApiPrefixes.some((p) => pathname.startsWith(p))) {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const requestedTenantId = searchParams.get("tenantId");

    if (requestedTenantId && (!session || session.tenantId !== requestedTenantId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:tenantId/dashboard/:path*", "/api/runs/:path*", "/api/profiles/:path*", "/api/fact-chunks/:path*"],
};
