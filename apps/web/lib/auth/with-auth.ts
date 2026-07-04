import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "./get-current-user";

type RouteContext<T = Record<string, string>> = {
  params: Promise<T>;
};

type AuthenticatedHandler<T = Record<string, string>> = (
  request: Request,
  user: CurrentUser,
  context: RouteContext<T>,
) => Promise<Response>;

export function withAuth<T = Record<string, string>>(
  handler: AuthenticatedHandler<T>,
  options?: { requireEmailVerified?: boolean },
) {
  return async (request: Request, context: RouteContext<T>): Promise<Response> => {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }
    if (options?.requireEmailVerified && !user.emailVerified) {
      return NextResponse.json({ error: "Email не подтверждён" }, { status: 403 });
    }
    return handler(request, user, context);
  };
}
