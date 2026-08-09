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
  // SESSION FIRST, FLAG SECOND — do not swap these two blocks.
  //
  // Flag-off is precisely the state a deployed cabinet runs in, so this order
  // decides what a real seller sees. Checking the flag first would send a
  // logged-in seller who opens the root to the login screen instead of their
  // own cabinet: they are already authenticated, and the landing's readiness
  // has nothing to do with them. `redirect()` throws, so whichever check comes
  // first wins outright.
  //
  // Logged in  → /dashboard, whatever the flag says.
  // Anonymous  → the landing when the flag is on, /login when it is off.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  // The landing is OFF by default and stays off until the publication gate
  // below is satisfied. Three of its five points describe features that are not
  // built; the only thing keeping those from being a public claim is that
  // nobody sees the page — and that stops being true the day the cabinet is
  // deployed, because this landing lives at «/» in the same app. A flag is what
  // makes "unpublished" a property of the deployment rather than of luck.
  //
  // Same shape as ENABLE_CARRIER_COMPARISON_PAGE: server-side only, compared to
  // the literal "true", so anything else — unset, empty, "1", "yes" — is off.
  // Redirect rather than notFound(): «/» must lead somewhere useful, and an
  // anonymous visitor's destination in this app is the login page.
  if (process.env.ENABLE_PUBLIC_LANDING !== "true") {
    redirect("/login");
  }

  return (
    <main className="px-6 py-28 sm:px-10 sm:py-40">
      {/* Broken at a chosen point rather than by text-balance. The last two
          words are joined by a non-breaking space so no width can strand a
          single word on its own line. Same characters, same punctuation. */}
      <h1 className="site-60 max-w-4xl">
        Платформа для брендов,
        <br />
        которые строят независимый канал&nbsp;продаж
      </h1>

      <p className="site-16 mt-10 max-w-2xl text-muted sm:mt-12">
        Все ваши перевозчики — в одном окне: сравнить условия, оформить отправление, отследить путь и увидеть, как каждый справляется на ваших отправлениях. Договоры и тарифы остаются вашими, деньги идут напрямую перевозчику, данные покупателей — только вам.
      </p>

      <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-4 sm:mt-16">
        <Link
          href="/register"
          className="site-14 rounded-full bg-ink px-7 py-3.5 text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          Создать аккаунт
        </Link>
        {/* One action here; «Войти» lives in the header. The flex row stays for
            the informational secondary link that will sit beside it once there
            is a page to point at. Its arrow-link styling was removed with the
            link rather than left behind as unused code — the pattern was:
            site-14 group inline-flex items-center gap-2 text-accent, with the
            «→» in an aria-hidden span that translates on group-hover. */}
      </div>

      <LogisticsValue />
    </main>
  );
}

/**
 * ============================================================================
 * DO NOT PUBLISH THIS PAGE UNTIL ALL THREE ITEMS BELOW ARE TRUE.
 * ============================================================================
 *
 * Three of the five points describe capabilities that DO NOT EXIST YET. Each
 * unmet item below is a claim we cannot back the moment a seller can read it —
 * the same standard the cabinet applies to «пока недоступна» on the label
 * column.
 *
 * WHAT ENFORCES THIS: `ENABLE_PUBLIC_LANDING`, read at the top of PublicHome
 * and defaulting to OFF, so «/» redirects to /login until someone deliberately
 * turns the landing on. That flag is the mechanism — not the fact that the site
 * happens to be unvisited, which stops protecting anything the day the cabinet
 * is deployed, since this page lives at «/» in the same app.
 *
 * SETTING THE FLAG TO true IS THE PUBLICATION EVENT. Do not set it in any
 * deployed environment until all three items below are satisfied.
 *
 * Point 3 — «Видно, с кем стоит работать.»
 *   Claims ОСО shows how carriers differ on the seller's own directions.
 *   BEFORE PUBLISHING: the carrier-comparison page must be LIVE — served, not
 *   404 behind ENABLE_CARRIER_COMPARISON_PAGE — together with its methodology
 *   page, so a reader can check where the comparison comes from.
 *
 * Point 4 — «На каждую отправку — расчёт и подсказка.»
 *   The quote fan-out exists, but the sentence also promises «Нужно дешевле —
 *   подсветит дешевле. Нужно быстрее — быстрее.»
 *   BEFORE PUBLISHING: that cheaper/faster highlight must be VISIBLE on the
 *   offers screen. A list of offers with no highlight does not satisfy it.
 *
 * Point 5 — «Статистика по вашим отправлениям.»
 *   Claims cost and delivery outcomes accumulate and later inform the advice.
 *   BEFORE PUBLISHING: the statistics must BOTH accumulate AND be shown
 *   somewhere a seller can actually see them. Data sitting in a table nobody
 *   can read does not satisfy it.
 *
 * If any item is still unmet at publication time, cut that point from the page.
 * Shipping the sentence and hoping is not an option available here.
 *
 * ----------------------------------------------------------------------------
 * Also: the module-01…04 tones stay defined in globals.css and the Tailwind
 * config while nothing references them — see the «intentionally unused» note
 * there before deleting them as dead code.
 *
 * `accent` renders in exactly four places on the public route, and nowhere
 * else: the first dot of the mark and the focus rings in (public)/layout.tsx,
 * and the «ЧТО ВЫ ПОЛУЧАЕТЕ» eyebrow plus the primary button's focus ring here.
 * (The accent hairline this note used to describe was removed when the eyebrow
 * took over as the section marker.)
 *
 * Bold openings are weight 500, never 600 or 700 (`strong` defaults to bolder,
 * so .site-w-500 overrides it). MODEL F: the seller's own contracts, the
 * seller's own money. «посредник» describes a role; no company is named.
 */
/**
 * The five points, verbatim. Kept as data so the grid markup cannot creep into
 * the copy: `lead` is the bold opening sentence, `body` the rest. Not one
 * character of either differs from the approved text.
 */
const POINTS = [
  {
    lead: "Договор — ваш актив, а не чужой.",
    body: "Вы работаете по своим договорам с перевозчиками: объём копится у вас, и с ростом улучшаются ваши условия, а не условия посредника. ОСО не перепродаёт доставку и не берёт наценку — вы платите перевозчику по своему договору, счёт выставляет он. Если с грузом что-то случилось, вопрос решается с перевозчиком напрямую.",
  },
  {
    lead: "Все ваши перевозчики — в одном окне.",
    body: "Сравнить тарифы, цены и сроки, оформить отправление, отследить путь. Один экран вместо кабинета у каждого перевозчика и переноса данных руками.",
  },
  {
    lead: "Видно, с кем стоит работать.",
    body: "ОСО показывает, чем перевозчики отличаются на ваших направлениях — условия, покрытие, ограничения. Вы подключаете тех, кто нужен именно вам, а не тех, до кого дошли руки.",
  },
  {
    lead: "На каждую отправку — расчёт и подсказка.",
    body: "ОСО спрашивает всех ваших перевозчиков, сколько стоит и когда приедет именно эта посылка по этому адресу, и показывает ответы одним списком. Нужно дешевле — подсветит дешевле. Нужно быстрее — быстрее.",
  },
  {
    lead: "Статистика по вашим отправлениям.",
    body: "Сколько каждый перевозчик стоил и как довёз — накапливается. Со временем ОСО подсказывает не по обещаниям из тарифа, а по тому, как перевозчики справляются именно у вас.",
  },
] as const;

function LogisticsValue() {
  return (
    <section
      aria-labelledby="what-you-get"
      className="mt-24 border-t border-line pt-12 sm:mt-32"
    >
      {/* The section's accessible name, which the block previously lacked.
          Accent lives here, on the link and on focus rings — nowhere else. */}
      <h2
        id="what-you-get"
        className="site-11 uppercase tracking-[0.18em] text-accent"
      >
        ЧТО ВЫ ПОЛУЧАЕТЕ
      </h2>

      <ul className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
        {POINTS.map((point, index) => (
          <li key={point.lead} className="border-t border-line pt-5">
            {/* Decoration: every point reads without its number, so the digits
                are hidden from assistive technology rather than announced. */}
            <span
              aria-hidden="true"
              className="site-mono site-12 block text-muted"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="site-16 mt-3 text-muted">
              <strong className="site-w-500 text-ink">{point.lead}</strong>{" "}
              {point.body}
            </p>
          </li>
        ))}
      </ul>

      <p className="site-16 mt-12 max-w-2xl border-t border-line pt-6">
        Договоры, тарифы и накопленная история остаются вашими.
      </p>
    </section>
  );
}
