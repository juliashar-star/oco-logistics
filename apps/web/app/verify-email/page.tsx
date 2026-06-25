import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { resendCooldownRemainingSec } from "@/lib/auth/verification";
import { ResendVerificationButton } from "@/components/resend-verification-button";
import { prisma } from "@/lib/db";

type VerifyEmailPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { token } = await searchParams;

  if (token?.trim()) {
    redirect(`/api/auth/verify-email?token=${encodeURIComponent(token.trim())}`);
  }

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

        <div className="mt-8">
          <ResendVerificationButton initialCooldownSec={initialCooldownSec} />
        </div>
      </div>
    </div>
  );
}
