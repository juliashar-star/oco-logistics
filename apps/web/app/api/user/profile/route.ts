import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { validateUserProfile } from "@/lib/auth/validation";
import { prisma } from "@/lib/db";

export const PATCH = withAuth(async (request, user) => {
  try {
    const body = await request.json();
    const name =
      body.name === undefined || body.name === null
        ? undefined
        : String(body.name).trim();

    const errors = validateUserProfile({
      name: name ?? "",
    });
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.userId },
      data: {
        ...(name !== undefined && { name: name || null }),
      },
      select: {
        id: true,
        name: true,
      },
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name ?? "",
      },
    });
  } catch {
    console.error("user profile update failed");
    return NextResponse.json(
      { error: "Не удалось сохранить профиль" },
      { status: 500 },
    );
  }
});
