import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { validateUserProfile } from "@/lib/auth/validation";
import { prisma } from "@/lib/db";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name =
      body.name === undefined || body.name === null
        ? undefined
        : String(body.name).trim();
    const warehouseAddress =
      body.warehouseAddress === undefined || body.warehouseAddress === null
        ? undefined
        : String(body.warehouseAddress).trim();

    const errors = validateUserProfile({
      name: name ?? "",
      warehouseAddress: warehouseAddress ?? "",
    });
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.userId },
      data: {
        ...(name !== undefined && { name: name || null }),
        ...(warehouseAddress !== undefined && {
          warehouseAddress: warehouseAddress || null,
        }),
      },
      select: {
        id: true,
        name: true,
        warehouseAddress: true,
      },
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name ?? "",
        warehouseAddress: updated.warehouseAddress ?? "",
      },
    });
  } catch {
    console.error("user profile update failed");
    return NextResponse.json(
      { error: "Не удалось сохранить профиль" },
      { status: 500 },
    );
  }
}
