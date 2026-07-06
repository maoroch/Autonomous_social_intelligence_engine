import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // В реальном приложении здесь было бы сохранение в базу данных или отправка в CRM (не логируйте raw email в stdout).

    return NextResponse.json({ success: true, message: "Successfully joined waitlist" });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
