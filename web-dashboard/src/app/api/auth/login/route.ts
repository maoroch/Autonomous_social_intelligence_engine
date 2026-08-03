import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectMongo, getCollection, Collections, type UserDoc } from "@pipeline/shared/db";
import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

export async function POST(req: Request) {
  try {
    const { tenantId, email, password } = await req.json();

    if (!tenantId || !email || !password) {
      return NextResponse.json({ error: "tenantId, email and password are required" }, { status: 400 });
    }

    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const user = await getCollection<UserDoc>(Collections.USERS).findOne({
      tenantId,
      email: String(email).toLowerCase().trim(),
    });

    // Одинаковое сообщение об ошибке независимо от того, что именно неверно (email или пароль) —
    // не даём атакующему понять, существует ли аккаунт с таким email в этом портале.
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = await createSessionToken({
      userId: user._id!.toString(),
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 дней
    });
    return res;
  } catch (err) {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
