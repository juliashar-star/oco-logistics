import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.redirect(new URL("/verify-email/error", request.url));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { verificationToken: token },
      select: {
        id: true,
        verificationTokenExpiry: true,
      },
    });

    if (!user?.verificationTokenExpiry || user.verificationTokenExpiry < new Date()) {
      return NextResponse.redirect(new URL("/verify-email/error", request.url));
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      },
    });

    return NextResponse.redirect(new URL("/dashboard?verified=true", request.url));
  } catch {
    console.error("verify-email failed");
    return NextResponse.redirect(new URL("/verify-email/error", request.url));
  }
}
