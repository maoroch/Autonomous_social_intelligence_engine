import { SignJWT, jwtVerify } from "jose";

const AUTH_SECRET = process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me-in-production";
if (process.env.NODE_ENV === "production" && AUTH_SECRET === "dev-insecure-secret-change-me-in-production") {
  // Намеренно не бросаем исключение (чтобы не ронять billing/design), но громко предупреждаем в логах.
  console.warn(
    "[auth] AUTH_SECRET is not set in production — using an insecure default. Set AUTH_SECRET env var before going live.",
  );
}

const secretKey = new TextEncoder().encode(AUTH_SECRET);

export const SESSION_COOKIE_NAME = "session";

export interface SessionPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: "admin" | "creator";
}

/** Подписывает сессию сроком на 7 дней. */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

/** Проверяет и декодирует сессию. Возвращает null, если токен невалиден/истёк. */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (
      typeof payload.userId === "string" &&
      typeof payload.tenantId === "string" &&
      typeof payload.email === "string" &&
      (payload.role === "admin" || payload.role === "creator")
    ) {
      return {
        userId: payload.userId,
        tenantId: payload.tenantId,
        email: payload.email,
        role: payload.role,
      };
    }
    return null;
  } catch {
    return null;
  }
}
