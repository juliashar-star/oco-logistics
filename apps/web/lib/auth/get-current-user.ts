import { prisma } from "@/lib/db";
import { getSession, type SessionPayload } from "./session";

export type CurrentUser = SessionPayload & {
  companyName: string;
};

/** Текущий пользователь из сессии + название компании. null — не авторизован. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      companyId: true,
      email: true,
      role: true,
      company: { select: { name: true } },
    },
  });

  if (!user || user.companyId !== session.companyId) return null;

  return {
    userId: user.id,
    companyId: user.companyId,
    email: user.email,
    role: user.role,
    companyName: user.company.name,
  };
}
