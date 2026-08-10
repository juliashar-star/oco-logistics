import Link from "next/link";
import { redirect } from "next/navigation";
import { PROVIDER_SELLER_DISPLAY_NAMES } from "@oco/core/carrier-adapter/provider-seller-display-names";
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
      <OffersPreview />
      <WhoItIsFor />
      <NoContractYet />
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
 *   SAME ITEM, SECOND SENTENCE: «ЕСЛИ ДОГОВОРА ЕЩЁ НЕТ» opens with «Сначала
 *   посмотрите в ОСО, чем перевозчики отличаются на ваших направлениях», which
 *   rests on exactly this capability. If the item is unmet, that sentence goes
 *   with point 3 — it is not a separate claim that survives on its own.
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
 * `accent` renders in exactly seven places on the public route, and nowhere
 * else — EYEBROWS, LINKS AND FOCUS RINGS ONLY:
 *   (public)/layout.tsx — the mark's first dot, and two focus rings (the mark
 *     link and the header «Войти»).
 *   here — the primary button's focus ring, and the three section eyebrows:
 *     «ЧТО ВЫ ПОЛУЧАЕТЕ», «ДЛЯ КОГО», «ЕСЛИ ДОГОВОРА ЕЩЁ НЕТ».
 * Keep this list current: it was wrong twice before, and a stale note here is
 * what makes someone "restore" a colour rule that no longer exists.
 * (No accent in the dark band — it measures 3.08:1 on ink, and the obvious use
 * there would draw the unbuilt cheaper/faster highlight.)
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

/**
 * The one block that SHOWS the product rather than describing it: a mock of the
 * offers panel, on a dark band inside the card.
 *
 * CARRIER NAMES ARE MASKED, read from the cabinet's own PROVIDER_SELLER_DISPLAY_NAMES
 * rather than written here — public carrier naming is on hold pending legal
 * advice, and a name typed into this file would sit outside that decision. The
 * MAP is used, not providerSellerDisplayName(): that helper falls back to the
 * registry's REAL displayName for any key it cannot mask, which on a public page
 * is exactly the leak we must not risk. A row whose key has no mask is dropped.
 *
 * THE FIGURES ARE ILLUSTRATIVE and marked «Пример» beside the panel. They show
 * the SHAPE of the comparison — several answers for one parcel, side by side —
 * and must never read as our prices or as any carrier's tariff.
 *
 * CONTRAST, measured against #101214 rather than guessed:
 *   paper  18.15:1  primary text
 *   line   15.21:1  secondary text and the example marker
 *   muted   3.75:1  FAILS normal text on ink — do not use it in this band,
 *                   however much it is the right grey on paper
 *   accent  3.08:1  fails too, and see below
 *
 * NO ACCENT HERE, for two reasons. It is illegible on ink at 3.08:1; and the
 * obvious use — tinting the cheapest row — would draw the «дешевле / быстрее»
 * highlight that does NOT exist yet (publication gate, point 4). Showing it
 * would be the exact claim the gate is there to prevent.
 *
 * NOTHING IS INTERACTIVE: no buttons, no inputs, no hover affordance. The panel
 * illustrates; it must not pretend to work.
 */
const PREVIEW_ROWS = [
  { providerKey: "yataxi", price: "420 ₽", term: "2 дня", handover: "Курьером" },
  { providerKey: "yataxi", price: "350 ₽", term: "3 дня", handover: "В пункт выдачи" },
  { providerKey: "cdek", price: "390 ₽", term: "2 дня", handover: "Курьером" },
  { providerKey: "cdek", price: "310 ₽", term: "4 дня", handover: "В пункт выдачи" },
] as const;

function maskedCarrierName(providerKey: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(
    PROVIDER_SELLER_DISPLAY_NAMES,
    providerKey,
  )
    ? PROVIDER_SELLER_DISPLAY_NAMES[providerKey]
    : undefined;
}

function OffersPreview() {
  const rows = PREVIEW_ROWS.map((row) => ({
    ...row,
    name: maskedCarrierName(row.providerKey),
  })).filter((row): row is typeof row & { name: string } => row.name !== undefined);

  return (
    // Full-bleed inside the card: the negative margins cancel <main>'s padding,
    // so the band spans the card edge to edge. Only the existing pair inverted —
    // ink ground, paper text. No new colour.
    <section
      aria-labelledby="offers-preview"
      className="-mx-6 mt-24 bg-ink px-6 py-16 text-paper sm:-mx-10 sm:mt-32 sm:px-10 sm:py-20"
    >
      <p className="site-11 uppercase tracking-[0.18em] text-line">
        ЧТО ВИДИТ ПРОДАВЕЦ
      </p>

      <h2 id="offers-preview" className="site-24 site-w-500 mt-4 max-w-3xl">
        Один запрос — ответы всех ваших перевозчиков рядом
      </h2>

      <p className="site-16 mt-4 max-w-2xl text-line">
        Так выглядит расчёт одной посылки: цена, срок и способ получения от
        каждого — в одном списке.
      </p>

      <div className="mt-10 max-w-3xl">
        {/* One quiet word, and the panel's accessible caption. Quiet by scale
            and tracking, not by low contrast: `muted` would be 3.75:1 here. */}
        <p className="site-11 uppercase tracking-[0.18em] text-line" id="preview-note">
          Пример
        </p>

        <div className="mt-3 overflow-x-auto rounded border border-muted">
          <table className="w-full border-collapse text-left" aria-describedby="preview-note">
            <thead>
              <tr className="border-b border-muted">
                <th scope="col" className="site-11 px-4 py-3 uppercase tracking-[0.14em] text-line">
                  Перевозчик
                </th>
                <th scope="col" className="site-11 px-4 py-3 uppercase tracking-[0.14em] text-line">
                  Цена
                </th>
                <th scope="col" className="site-11 px-4 py-3 uppercase tracking-[0.14em] text-line">
                  Срок
                </th>
                <th scope="col" className="site-11 px-4 py-3 uppercase tracking-[0.14em] text-line">
                  Получение
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${row.providerKey}-${index}`}
                  className="border-b border-muted last:border-b-0"
                >
                  <td className="site-14 whitespace-nowrap px-4 py-3">{row.name}</td>
                  {/* Mono so the columns align down the panel — the utility
                      added in L4 finally has its consumer. */}
                  <td className="site-mono site-14 whitespace-nowrap px-4 py-3">
                    {row.price}
                  </td>
                  <td className="site-mono site-14 whitespace-nowrap px-4 py-3 text-line">
                    {row.term}
                  </td>
                  <td className="site-14 whitespace-nowrap px-4 py-3 text-line">
                    {row.handover}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/**
 * Two quiet sections after the dark block, both single paragraphs.
 *
 * NOT grids. Two numbered grids in a row would make the page monotonous, and
 * these two are deliberately calmer than «ЧТО ВЫ ПОЛУЧАЕТЕ»: one widens the
 * audience, the other answers an objection.
 *
 * The second is SUBORDINATE to the first, achieved with rhythm and scale — a
 * tighter top margin binding it to what it answers, a narrower measure, and
 * body text one step down — never with a dimmer colour. `muted` is the only
 * quiet token on paper and it has to keep carrying body text legibly; dimming
 * further would mean a colour that is not in the set.
 *
 * MODEL F: the contract is concluded «напрямую с перевозчиком», and ОСО neither
 * concludes it, holds it, nor helps with it. No date, no duration, no claim
 * about how long any carrier takes. Neither section has a link or an action.
 */
function WhoItIsFor() {
  return (
    <section
      aria-labelledby="who-its-for"
      className="mt-24 border-t border-line pt-12 sm:mt-32"
    >
      <h2
        id="who-its-for"
        className="site-11 uppercase tracking-[0.18em] text-accent"
      >
        ДЛЯ КОГО
      </h2>

      <p className="site-16 mt-6 max-w-3xl text-muted">
        ОСО подходит всем, кто отправляет регулярно — неважно, откуда приходит заказ: с вашего сайта, из маркетплейса, из переписки в мессенджере или от оптового клиента. Бренды, интернет-магазины, производственные компании, фулфилмент-операторы. Отправления идут по вашим договорам с перевозчиками — а если договора пока нет, его заключают напрямую с перевозчиком, и он сразу становится вашим активом.
      </p>
    </section>
  );
}

function NoContractYet() {
  return (
    // Bound to the section above by a tighter margin and no rule of its own:
    // it reads as the answer to a question that section raises, not as a new
    // claim of equal weight.
    <section aria-labelledby="no-contract-yet" className="mt-12 sm:mt-14">
      <h2
        id="no-contract-yet"
        className="site-11 uppercase tracking-[0.18em] text-accent"
      >
        ЕСЛИ ДОГОВОРОВ С ПЕРЕВОЗЧИКАМИ ЕЩЁ НЕТ
      </h2>

      <p className="site-14 mt-4 max-w-2xl text-muted">
        Сначала посмотрите в ОСО, чем перевозчики отличаются на ваших направлениях, и решите, с кем заключать договор. Договор заключается напрямую с перевозчиком. Перевозчик выдаёт доступы для интеграции, вы добавляете их в настройках ОСО, и он появляется в общем списке ваших перевозчиков. Начать можно с одного перевозчика, остальных подключить позже.
      </p>
    </section>
  );
}
