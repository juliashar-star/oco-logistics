import { NextResponse } from "next/server";
import { ApishipError } from "@oco/apiship";
import { withAuth } from "@/lib/auth/with-auth";
import { createApishipClientFromCredentials } from "@/lib/apiship-client-for-company";

export const POST = withAuth(async (request, user) => {
  try {
    const body = await request.json();
    const login = String(body.login ?? "").trim();
    const password = String(body.password ?? "");

    if (!login || !password) {
      return NextResponse.json(
        { error: "Укажите логин и пароль для проверки" },
        { status: 400 },
      );
    }

    const client = createApishipClientFromCredentials({ login, password });
    await client.testConnection();

    return NextResponse.json({
      ok: true,
      message: "Подключение успешно",
    });
  } catch (error) {
    if (error instanceof ApishipError) {
      return NextResponse.json(
        { error: error.message || "Подключение отклонено" },
        { status: 502 },
      );
    }
    console.error("apiship test failed");
    return NextResponse.json(
      { error: "Не удалось проверить подключение" },
      { status: 500 },
    );
  }
});
