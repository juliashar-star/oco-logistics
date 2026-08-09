import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";

/**
 * The first screen. A brand that has never heard of ОСО should know what this
 * is in about ten seconds: one heading, one paragraph, one primary action, one
 * secondary.
 *
 * MODEL F, and every string here obeys it: the seller connects THEIR OWN
 * carrier contracts and ОСО acts inside those accounts. Nothing on this page
 * may say «мы доставим» or «мы подключим перевозчика» — ОСО signs no carrier
 * contract and carries no parcel.
 */
export default async function PublicHome() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
      <h1 className="site-46 max-w-3xl text-balance">
        Платформа для брендов, которые строят независимый канал продаж
      </h1>

      <p className="site-16 mt-8 max-w-2xl text-muted">
        Все ваши перевозчики — в одном окне: сравнить условия, оформить отправление, отследить путь и увидеть, как каждый справляется на ваших отправлениях. Договоры и тарифы остаются вашими, деньги идут напрямую перевозчику, данные покупателей — только вам.
      </p>

      <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
        <Link
          href="/register"
          className="site-14 rounded-sm bg-ink px-6 py-3 text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          Создать аккаунт
        </Link>
        <Link
          href="/login"
          className="site-14 text-accent underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          Войти
        </Link>
      </div>
    </main>
  );
}
