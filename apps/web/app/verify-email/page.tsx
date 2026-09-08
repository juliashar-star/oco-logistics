import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { resendCooldownRemainingSec } from "@/lib/auth/verification";
import { ResendVerificationButton } from "@/components/resend-verification-button";
import { prisma } from "@/lib/db";

type VerifyEmailPageProps = {
  searchParams: Promise<{ token?: string; stale?: string }>;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { token, stale } = await searchParams;

  // FIRST, AND STILL FIRST. `stale` cannot collide with this branch: the route
  // that sets it builds `/verify-email?stale=1` with no token at all. Should
  // both ever arrive together, the token wins — a link worth another attempt
  // beats a notice about a previous one.
  if (token?.trim()) {
    redirect(`/api/auth/verify-email?token=${encodeURIComponent(token.trim())}`);
  }

  const isStale = stale === "1";

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.emailVerified) {
    redirect("/dashboard");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { verificationTokenExpiry: true },
  });

  const initialCooldownSec = resendCooldownRemainingSec(dbUser?.verificationTokenExpiry);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md rounded-[var(--r-lg)] border border-border bg-surface p-8 shadow-sm">
        <Link href="/dashboard" className="text-sm text-text-3 hover:text-text-2">
          ← В кабинет
        </Link>

        <div className="mt-6 flex items-center gap-2.5">
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary" aria-hidden />
          <span className="text-xl font-bold text-text">
            oco<span className="text-primary">.</span>
          </span>
        </div>

        <h1 className="mt-6 text-heading text-text">Проверьте почту</h1>
        <p className="mt-3 text-body text-text-2">
          Мы отправили письмо на{" "}
          <span className="font-medium text-text">{user.email}</span>
        </p>
        <p className="mt-2 text-caption text-text-3">
          Перейдите по ссылке в письме, чтобы подтвердить email. Ссылка действует 24 часа.
        </p>

        {/*
          DELIBERATELY GENERAL, and the generality is the point. A refused link
          is one of three things — a token that was never ours, one whose 24
          hours ran out, and one a later resend overwrote — and NOTHING can tell
          them apart: the resend overwrites the column, redemption nulls it, so
          all three reach the route as no row at all. A sentence naming a cause
          would be a guess dressed as a fact, and two of the three guesses would
          be wrong. This says what is certain and what to do about it.

          Warning, not error: the person did nothing wrong and the fix is the
          button below. Same treatment as the settings notice that asks for a
          missing sender city.
        */}
        {isStale && (
          <p className="mt-6 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            Эта ссылка больше не действует. Отправьте письмо заново.
          </p>
        )}

        <div className="mt-8">
          <ResendVerificationButton initialCooldownSec={initialCooldownSec} />
        </div>
      </div>
    </div>
  );
}
