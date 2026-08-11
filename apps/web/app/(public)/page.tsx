import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PROVIDER_SELLER_DISPLAY_NAMES } from "@oco/core/carrier-adapter/provider-seller-display-names";
import { getCurrentUser } from "@/lib/auth/get-current-user";

/**
 * Metadata for the PUBLIC page only. The root layout keeps the cabinet's own
 * («OCO Logistics» / «Веб-кабинет…»), which is right for the cabinet and wrong
 * for a brand that has never heard of ОСО — that description would have been
 * what a pasted link showed.
 *
 * The Cyrillic mark, because that is what the site itself says in its header.
 *
 * NO IMAGE. There is no opengraph-image and inventing one is a separate
 * decision; a card with title and description and no picture is honest, whereas
 * a broken image reference is not. `metadataBase` is set anyway — without it
 * Next cannot resolve any relative URL, including the canonical below.
 */
/**
 * A canonical or an og:url pointing at localhost is worse than useless: it is
 * the address a share card would send a buyer to. NEXT_PUBLIC_APP_URL is the
 * app's own origin and is `http://localhost:3000` in every dev .env, so it is
 * used only when it is NOT a local host — same hostname test the CSP already
 * makes in lib/security/csp.ts. Otherwise the public site's real address.
 */
function resolveSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) {
    return "https://useoco.ru";
  }
  try {
    const { hostname } = new URL(configured);
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "https://useoco.ru";
    }
    return configured;
  } catch {
    return "https://useoco.ru";
  }
}

const SITE_URL = resolveSiteUrl();

// Shorter than the h1 on purpose. A title appears where we control the
// presentation least — a search result, a browser tab, a pasted link — so
// surviving truncation is worth more than matching the h1, which nobody ever
// sees beside it. openGraph.title and twitter.title both follow this constant.
const TITLE = "ОСО — платформа для независимого канала продаж";
const DESCRIPTION =
  "Все ваши перевозчики в одном окне: сравнить условия, оформить отправление, отследить путь. Договоры и тарифы остаются вашими, деньги идут напрямую перевозчику.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "/",
    siteName: "ОСО",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    // "summary", not "summary_large_image": the large card is a picture frame,
    // and we have no picture to put in it.
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

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
    // TOP PADDING IS DELIBERATELY ASYMMETRIC. It used to be py-28 sm:py-40 —
    // 160px above the h1 on top of the card's own margin and the header, which
    // pushed «Создать аккаунт» past the fold on a laptop. The bottom keeps the
    // old value: that space separates the hero from what follows and costs
    // nothing, because nobody waits to scroll INTO it.
    <main className="px-6 pb-28 pt-12 sm:px-10 sm:pb-40 sm:pt-16">
      {/* Broken at a chosen point rather than by text-balance. The last two
          words are joined by a non-breaking space so no width can strand a
          single word on its own line. Same characters, same punctuation. */}
      <h1 className="site-60 max-w-4xl">
        Платформа для брендов,
        <br />
        которые строят независимый канал&nbsp;продаж
      </h1>

      {/* The h1 keeps the full measure and its chosen break; the SPLIT starts
          below it, because the empty half was never beside the heading — it was
          beside the paragraph and the action, whose measures are deliberately
          narrow. Two columns from `lg` only: at 1152px of card the pair is
          about 512px each, which the panel fits, and below that they stack in
          source order — paragraph, action, panel. */}
      <div className="mt-10 grid gap-x-12 gap-y-12 sm:mt-12 lg:grid-cols-2 lg:items-start">
        <div>
          <p className="site-16 max-w-2xl text-muted">
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
        </div>

        <OffersPreview />
      </div>

      <LogisticsValue />
      <WhoItIsFor />
      <NoContractYet />
      <Prices />

      {/* The hero's call, offered a second time at the foot. This is NOT the
          duplication removed with «Войти»: that was two competing actions
          sharing one screen, where the reader had to choose between them. This
          is the same single action offered again after five screens of
          scrolling, to a reader who has now read the reasons and would
          otherwise have to scroll back up to act. Same href, same classes —
          copied deliberately rather than extracted into a component, because
          two call sites do not yet justify an abstraction and an extracted
          button would invite a variant. */}
      <div className="mt-24 border-t border-line pt-12 sm:mt-32">
        <Link
          href="/register"
          className="site-14 rounded-full bg-ink px-7 py-3.5 text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          Создать аккаунт
        </Link>
      </div>
    </main>
  );
}

/**
 * ============================================================================
 * DO NOT PUBLISH THIS PAGE UNTIL ALL FOUR ITEMS BELOW ARE TRUE.
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
 * deployed environment until all four items below are satisfied.
 *
 * THE SAME FLAG ALSO GOVERNS INDEXING (app/robots.ts): off disallows crawlers
 * outright, on allows them. One switch for both, deliberately — publication and
 * indexability must not be able to drift apart, and an unmet claim that no
 * crawler can reach is still an unmet claim the moment the page is live.
 *
 * Point 3 — «Видно, с кем стоит работать.»
 *   Claims ОСО shows how carriers differ on the seller's own directions.
 *   BEFORE PUBLISHING: the carrier-comparison page must be LIVE — served, not
 *   404 behind ENABLE_CARRIER_COMPARISON_PAGE — together with its methodology
 *   page, so a reader can check where the comparison comes from.
 *   SAME ITEM, SECOND SENTENCE: «ЕСЛИ ДОГОВОРОВ С ПЕРЕВОЗЧИКАМИ ЕЩЁ НЕТ» opens with «Сначала
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
 * «СТОИМОСТЬ» — the price section as a whole. Not one of the five points; it
 *   gates its own section, which is why it is named rather than numbered. There
 *   is no POINTS[5], and writing «Point 6» would be a cross-reference to
 *   nothing.
 *   A PRICE IS AN OFFER, NOT A DESCRIPTION. Everything the table marks «есть»
 *   is something the tier entitles a seller to, so the standard is higher than
 *   for the points above: it must EXIST and be reachable by that seller.
 *   PAID — must exist before the section is published: отчёт о переплате по
 *   каждому отправлению; рейтинг перевозчиков по вашим отправлениям;
 *   статистика по направлениям и весам; правила автовыбора: дешевле / быстрее /
 *   надёжнее; отчёт для переговоров с перевозчиком.
 *   FREE — a SHORTER fuse, not a longer one. A free feature is promised to
 *   every seller who signs up, with no payment step to delay the reckoning, so
 *   it is claimed the moment the page is live: этикетка, which needs CDEK print
 *   forms — today the cabinet's label column renders «Пока недоступна» for
 *   CDEK; рекомендация, с какими перевозчиками заключить договор; API и
 *   интеграции. THE LAST TWO MOVED HERE FROM A PAID TIER, so if that ever
 *   reverses, move them back rather than dropping them from the gate.
 *   Until every one of those holds, cut the section. A tier is not a roadmap.
 *
 * If any item is still unmet at publication time, cut that point from the page.
 * Shipping the sentence and hoping is not an option available here.
 *
 * ----------------------------------------------------------------------------
 * Also: the module-01…04 tones stay defined in globals.css and the Tailwind
 * config while nothing references them — see the «intentionally unused» note
 * there before deleting them as dead code.
 *
 * There was an inventory of every `accent` use here. It is gone: hand-kept, it
 * drifted four times, and `grep -rn accent app/(public)` answers the same
 * question without being able to go stale. Please do not restore it.
 * (The one accent fact worth keeping, because it is a measurement rather than a
 * list: accent is 3.08:1 on ink, so it is never used in the dark band.)
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

      {/* Point 01 spans both columns as the lead, so 02–05 form a full 2×2
          beneath it. Five cards in a plain two-column grid left the fifth alone
          in a half-empty row, which reads as a layout fault rather than as an
          end. One column below `sm`, exactly as before. */}
      <ul className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
        {POINTS.map((point, index) => (
          <li
            key={point.lead}
            className={`border-t border-line pt-5${index === 0 ? " sm:col-span-2" : ""}`}
          >
            {/* Decoration: every point reads without its number, so the digits
                are hidden from assistive technology rather than announced.
                SIZE DOES THE WORK HERE, not weight: .site-12 was ALREADY
                font-weight 500, which is the cap this page holds itself to, so
                the only lever left in the scale was the step up to .site-24 —
                whose own weight is 400, hence the explicit .site-w-500 to hold
                the numerals at the cap rather than let them drop below it.
                Colour stays `muted`: at 24px the numerals already read as a
                system, and `ink` would set decoration at the same strength as
                the lead sentence it is supposed to introduce. */}
            <span
              aria-hidden="true"
              className="site-mono site-24 site-w-500 block text-muted"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            {/* The lead is the one card wide enough to need a measure of its
                own — across both columns its line length would otherwise run to
                roughly twice the others'. */}
            <p
              className={`site-16 mt-3 text-muted${index === 0 ? " sm:max-w-3xl" : ""}`}
            >
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
 * offers panel, rendered as a dark card inside the light first screen. It used
 * to be a full-bleed band lower down the page with its own eyebrow and heading;
 * both were deleted when it moved, because a hero already has an h1 and a second
 * heading beside it competes with the one that matters.
 *
 * CARRIER NAMES ARE MASKED, read from the cabinet's own PROVIDER_SELLER_DISPLAY_NAMES
 * rather than written here — public carrier naming is on hold pending legal
 * advice, and a name typed into this file would sit outside that decision. The
 * MAP is used, not providerSellerDisplayName(): that helper falls back to the
 * registry's REAL displayName for any key it cannot mask, which on a public page
 * is exactly the leak we must not risk. A row whose key has no mask is dropped.
 *
 * THE FIGURES ARE ILLUSTRATIVE and marked «Пример» by the table's own caption,
 * inside the panel's box — not beside it. They show
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
 *
 * THE «дешевле» MARKER, and why it sits in the CARRIER cell rather than beside
 * the price where it reads most naturally. Four constraints had to hold at once:
 * not accent, no new colour, no widening of the table, and it must reach
 * assistive technology.
 *   Beside the price is the better semantic home, and it is PROBABLY safe — but
 *   only probably. That column's width is set by «310 ₽» in the 14px figure
 *   face, and «дешевле» at 11px lands within a few pixels of it either way. I
 *   cannot settle that without measuring a browser, and a marker that widens the
 *   table breaks a HARD constraint.
 *   The carrier cell needs no measurement: «Перевозчик №2» is thirteen
 *   characters at 14px against seven at 11px, so no plausible font metric makes
 *   the marker the wider of the two. The cell is `whitespace-nowrap`, the marker
 *   is a block beneath the name, and the column keeps the width it already had.
 * It is real text inside the row, so the row reads «Перевозчик №2, дешевле, 310
 * ₽, 4 дня, В пункт выдачи» — the cue is in the content, not in a colour.
 * `line` (15.21:1) is the band's secondary tone, already carrying the term
 * column and the caption; `paper` would set the marker level with the carrier
 * name it hangs under. WITHIN THESE FOUR CONSTRAINTS A COLOUR HIGHLIGHT IS
 * IMPOSSIBLE BY CONSTRUCTION — accent is barred and no other tone may be added —
 * so the mark is a labelled one, not a tinted one. That is a real limit, not an
 * oversight: if the panel should ever actually glow, it needs a fifth token and
 * a decision to go with it.
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

  // DERIVED, never hand-placed: the marker follows whichever row is actually
  // cheapest, so editing a figure above cannot leave «дешевле» pointing at the
  // wrong one. Computed AFTER the mask filter, because a row whose provider key
  // has no mask is dropped and must not win. `parseInt` stops at the space
  // before «₽», which is why these stay plain strings.
  const cheapestIndex = rows.reduce(
    (best, row, index) =>
      parseInt(row.price, 10) < parseInt(rows[best].price, 10) ? index : best,
    0,
  );

  return (
    // A PLAIN <div>, not a <section>, and not by oversight. The section's
    // accessible name came from a heading this slice deletes, and no new string
    // may be invented to replace it — and an unnamed <section> is not exposed
    // as a region by ARIA anyway, so the element was doing nothing but claiming
    // to. `bg-ink text-paper` MUST travel together: several cells below carry no
    // colour of their own and inherit it, so ink without paper would render them
    // ink-on-ink. Only the existing pair inverted; no new colour.
    <div className="rounded-lg bg-ink px-6 py-8 text-paper sm:px-8 sm:py-10">
      <p className="site-16 max-w-2xl text-line">
        Так выглядит расчёт одной посылки: цена, срок и способ получения от каждого — в одном списке. У одного перевозчика бывает несколько тарифов, поэтому он встречается в списке не один раз.
      </p>

      {/* The scroll box is focusable ON PURPOSE. Without tabindex a keyboard
            user in Firefox or Safari cannot scroll an overflow container that
            holds no focusable element, so on a genuinely narrow screen the last
            column would be unreachable. Its focus ring is `paper` rather than
            `accent`: accent measures 3.08:1 on ink, and a focus indicator that
            faint would look like a rendering fault rather than a state.

            NO role="region" AND NO aria-labelledby, deliberately — do not add
            them back as an "accessibility improvement". Naming this box meant
            naming it after the caption, so a screen-reader user entering the
            preview heard «Пример» twice: once for the region, once for the
            table. A focusable scroll container with no landmark role is the
            standard shape; the table's own <caption> does the naming, and
            nothing has to be invented to label the wrapper.

            The caption's `id` went with them: a hook nothing points at is an
            invitation to rewire naming to it and bring the double announcement
            back. */}
      <div
        tabIndex={0}
        className="mt-6 overflow-x-auto rounded border border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
      >
          <table className="w-full border-collapse text-left">
            {/* The example marker as the table's own caption: bound to the
                figures structurally and sitting inside the panel's box, so a
                reader scrolling into the numbers cannot pass it. Same wording,
                same quiet scale — quiet by size and tracking, not by low
                contrast, since `muted` would be 3.75:1 on this ground. */}
            <caption className="caption-top site-11 px-2 py-3 text-left uppercase tracking-[0.18em] text-line sm:px-4">
              Пример
            </caption>
            <thead>
              <tr className="border-b border-muted">
                <th scope="col" className="site-11 px-2 py-3 sm:px-4 uppercase tracking-[0.14em] text-line">
                  Перевозчик
                </th>
                <th scope="col" className="site-11 px-2 py-3 sm:px-4 uppercase tracking-[0.14em] text-line">
                  Цена
                </th>
                <th scope="col" className="site-11 px-2 py-3 sm:px-4 uppercase tracking-[0.14em] text-line">
                  Срок
                </th>
                <th scope="col" className="site-11 px-2 py-3 sm:px-4 uppercase tracking-[0.14em] text-line">
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
                  <td className="site-14 whitespace-nowrap px-2 py-3 sm:px-4">
                    {row.name}
                    {/* The «дешевле» marker rides in the CARRIER cell, under the
                        masked name — see the block comment above the component
                        for why this cell and not the price cell. Real text in
                        the row, so a screen reader reads «Перевозчик №N,
                        дешевле, …» and the cue is never visual-only. */}
                    {index === cheapestIndex ? (
                      <span className="site-11 block text-line">дешевле</span>
                    ) : null}
                  </td>
                  {/* Mono so the columns align down the panel — the utility
                      added in L4 finally has its consumer. */}
                  <td className="site-mono site-14 whitespace-nowrap px-2 py-3 sm:px-4">
                    {row.price}
                  </td>
                  <td className="site-mono site-14 whitespace-nowrap px-2 py-3 sm:px-4 text-line">
                    {row.term}
                  </td>
                  {/* The one column with long text, and the one that forced the
                      overflow. Letting it wrap means the table usually fits, so
                      on most screens there is nothing to scroll past — and the
                      caption above cannot be scrolled out of view. The other
                      three stay nowrap: a carrier label must not break
                      mid-name, and a price or a term is short anyway. */}
                  <td className="site-14 px-2 py-3 sm:px-4 text-line">{row.handover}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  );
}

/** The four audience labels, verbatim, kept out of the markup like POINTS. */
const AUDIENCE_LABELS = [
  "Бренды",
  "Интернет-магазины",
  "Производственные компании",
  "Фулфилмент-операторы",
] as const;

/** The three steps, verbatim and in order — the order is the content here. */
const CONNECT_STEPS = [
  "Посмотрите в ОСО, чем перевозчики отличаются на ваших направлениях, и решите, с кем заключать договор.",
  "Заключите договор напрямую с перевозчиком.",
  "Добавьте выданные им доступы в настройках ОСО — перевозчик появится в общем списке ваших перевозчиков.",
] as const;

/**
 * Two quiet sections after the dark block.
 *
 * NEITHER IS A GRID. A second two-column grid after «ЧТО ВЫ ПОЛУЧАЕТЕ» would
 * make the page monotonous; these two stay calmer — one widens the audience,
 * the other answers an objection. The steps below ARE numbered, but they run in
 * a single column and their numerals sit two steps below the value block's, so
 * the device is quoted rather than repeated.
 *
 * BOTH LISTS ARE REAL LISTS. The steps are an <ol> because the order is the
 * content — you cannot add credentials before the contract exists — and the
 * audience is a <ul> because those four are peers. In the steps the visible
 * 01–03 are `aria-hidden`: the <ol> already conveys position, so leaving them
 * exposed would have a screen reader announce the number twice. The audience
 * row carries no separator character at all — spacing does that job; see the
 * comment at the list itself for what was measured.
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
        ОСО подходит всем, кто отправляет регулярно — неважно, откуда приходит заказ: с вашего сайта, из маркетплейса, из переписки в мессенджере или от оптового клиента. Отправления идут по вашим договорам с перевозчиками — а если договора пока нет, его заключают напрямую с перевозчиком, и он сразу становится вашим активом.
      </p>

      {/* SPACE SEPARATES THESE, NOT A GLYPH — do not put the «·» back.
          MEASURED on a narrow screen: a separator that belongs to the item it
          precedes wraps WITH that item and hangs at the start of the next line,
          which happened before «Производственные компании» and before
          «Фулфилмент-операторы». On a wide screen the same glyph in `line` was
          barely visible, so it was earning nothing and costing that. Deleting it
          removes the defect and the three `aria-hidden` spans together.

          `gap-x-8` is 32px against a 14px word space of roughly 4px — eight
          times the gap inside «Производственные компании», so four labels read
          as four items and not as a sentence with wide tracking. `gap-y-3`
          keeps the rows apart once it does wrap. */}
      <ul className="mt-6 flex max-w-3xl flex-wrap gap-x-8 gap-y-3">
        {AUDIENCE_LABELS.map((label) => (
          <li key={label} className="site-14 text-ink">
            {label}
          </li>
        ))}
      </ul>
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

      <ol className="mt-4 max-w-2xl space-y-3">
        {CONNECT_STEPS.map((step, index) => (
          <li key={step} className="flex items-baseline gap-3">
            <span
              aria-hidden="true"
              className="site-mono site-12 shrink-0 text-muted"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="site-14 text-muted">{step}</span>
          </li>
        ))}
      </ol>

      <p className="site-14 mt-4 max-w-2xl text-muted">
        Начать можно с одного перевозчика, остальных подключить позже.
      </p>
    </section>
  );
}

/**
 * СТОИМОСТЬ, as a comparison table. The four prose tier cells are GONE — the
 * same content must not exist in two places, so there is no tier paragraph
 * anywhere on the page any more.
 *
 * Copy kept as data for the same reason POINTS is: so table markup cannot creep
 * into the strings.
 *
 * A cell is `{ words?, figure? }` rather than a plain string because the mono
 * rule cuts INSIDE one value: «свыше 2 000» is a word plus a figure, and only
 * the figure belongs in the figure face. «по запросу», «индивидуально» and «по
 * договору» carry no figure at all, so they render as words — setting prose in
 * the figure face would claim it is a number when it is not.
 */
const TIER_COLUMNS = ["Бесплатный", "Старт", "Бизнес", "Корпоративный"] as const;

type PriceCell = { words?: string; figure?: string };

const PRICE_FACT_ROWS: ReadonlyArray<{
  label: string;
  values: readonly PriceCell[];
}> = [
  {
    label: "Цена, ₽ в месяц",
    values: [
      { figure: "0" },
      { figure: "2 990" },
      { figure: "5 990" },
      { words: "по запросу" },
    ],
  },
  {
    label: "Включено отправлений",
    values: [
      { figure: "100" },
      { figure: "500" },
      { figure: "2 000" },
      { words: "свыше ", figure: "2 000" },
    ],
  },
  {
    label: "Сверх включённого, ₽",
    values: [
      { figure: "10" },
      { figure: "10" },
      { figure: "10" },
      { words: "индивидуально" },
    ],
  },
  {
    label: "Пользователей",
    values: [
      { figure: "1" },
      { figure: "3" },
      { figure: "10" },
      { words: "по договору" },
    ],
  },
];

/**
 * Three groups. Each is a real <tbody> whose first row carries the group title
 * as a <th scope="rowgroup">, so assistive technology announces it as the
 * heading of the rows beneath it rather than reading it as another data row.
 *
 * THAT ROW ALSO REPEATS THE FOUR TIER NAMES, and that is this table's answer to
 * the lost-header problem — not `position: sticky`, which is inert here: the
 * scroll box is `overflow-x: auto`, CSS Overflow 3 computes its `overflow-y` to
 * `auto` as a result («The visible/clip values of overflow compute to auto/hidden
 * (respectively) if one of overflow-x or overflow-y is neither visible nor
 * clip»), and a sticky child pins to its nearest ancestor WITH A SCROLLING
 * MECHANISM even when that ancestor never actually scrolls. The box is
 * content-height, so `top: 0` would pin the header to an edge that scrolls away
 * with the page — a no-op that looks like a fix. Do not "restore" it.
 *
 * THE MARKUP IS VALID, checked against the HTML Standard rather than assumed:
 * the Column state «applies to some of the SUBSEQUENT cells in the same
 * column(s)», with no restriction to <thead>; the Row Group state is legal
 * because a <tbody> is a row group and the cell is anchored in one; and tr's
 * content model is «zero or more td, th, and script-supporting elements», so
 * several th in one row is ordinary.
 *
 * NO `uppercase` CLASS ANYWHERE IN THIS TABLE, and this is not an oversight: the
 * group titles and the column names are mixed case in the approved copy, and a
 * CSS transform would render «ОТПРАВКА — РАБОТАЕТ БЕЗ НАКОПЛЕННОЙ ИСТОРИИ» on
 * screen while the DOM still said otherwise. The eyebrow above is the one place
 * the transform is right, because there the source string is the shout.
 */
const PRICE_FEATURE_GROUPS: ReadonlyArray<{
  title: string;
  rows: ReadonlyArray<{ label: string; has: readonly boolean[] }>;
}> = [
  {
    title: "ОТПРАВКА — работает без накопленной истории",
    rows: [
      { label: "Свои договоры и любое число перевозчиков", has: [true, true, true, true] },
      { label: "Расчёт тарифов по всем подключённым", has: [true, true, true, true] },
      { label: "Пункты выдачи и постаматы", has: [true, true, true, true] },
      { label: "Оформление, этикетка, отслеживание", has: [true, true, true, true] },
      { label: "История и выгрузка", has: [true, true, true, true] },
      {
        label: "Рекомендация, с какими перевозчиками заключить договор",
        has: [true, true, true, true],
      },
      { label: "API и интеграции", has: [true, true, true, true] },
    ],
  },
  {
    title: "АНАЛИТИКА — существует только на вашей истории",
    rows: [
      { label: "Отчёт о переплате по каждому отправлению", has: [false, true, true, true] },
      { label: "Рейтинг перевозчиков по вашим отправлениям", has: [false, true, true, true] },
      { label: "Статистика по направлениям и весам", has: [false, true, true, true] },
      {
        label: "Правила автовыбора: дешевле / быстрее / надёжнее",
        has: [false, false, true, true],
      },
      { label: "Отчёт для переговоров с перевозчиком", has: [false, false, false, true] },
    ],
  },
  {
    title: "ОБСЛУЖИВАНИЕ",
    rows: [
      {
        label: "Индивидуальный договор и выделенная поддержка",
        has: [false, false, false, true],
      },
    ],
  },
];

/**
 * THE GLYPH IS NEVER THE ONLY SIGNAL. Every boolean cell renders the mark
 * `aria-hidden` and carries the word «есть» or «нет» in an `sr-only` span, so a
 * screen reader hears a word and never has to interpret a symbol — and a reader
 * who cannot tell ✓ from the absence mark still gets the answer.
 *
 * THE ABSENCE MARK IS «—», an em dash, chosen over «×» deliberately. A cross
 * reads as an error or a failure, and a feature the cheaper tier does not
 * include is neither — it is simply not part of that tier. The em dash is the
 * ordinary Russian table mark for «нет значения», it needs no colour or weight
 * of its own to sit quieter than the tick, and it cannot be mistaken for a
 * value. `muted` on `paper` keeps it a step back without inventing a tone.
 */
function PriceMark({ has }: { has: boolean }) {
  return (
    <>
      <span aria-hidden="true">{has ? "✓" : "—"}</span>
      <span className="sr-only">{has ? "есть" : "нет"}</span>
    </>
  );
}

/**
 * NO TIER IS HIGHLIGHTED and no cell is tinted: a highlight is a
 * recommendation, and choosing for the seller is not what this page does.
 *
 * NO ACTION HERE. The page keeps exactly one, «Создать аккаунт» in the hero.
 * «по запросу» stays a statement rather than a link because there is no form
 * and no published address to point at — inventing a mailto would be inventing
 * a channel nobody watches.
 *
 * THE SCROLL BOX IS THE OFFERS PANEL'S PATTERN, not a second answer to the same
 * problem: focusable so a keyboard user in Firefox or Safari can scroll it, no
 * landmark role, `px-2 sm:px-4` cell padding, and NO `position: sticky` — see
 * PRICE_FEATURE_GROUPS above for why sticky cannot work inside this box and
 * what carries the header information instead. Only the focus ring differs,
 * because the ground does: that
 * panel sits on ink and rings in `paper`, this one sits on paper and rings in
 * `ink`. Accent is reserved for the eyebrow here, and it measures 3.08:1
 * anyway — a focus indicator that faint reads as a rendering fault.
 *
 * BORDERS RUN ON THE TOP of every body row, never the bottom. A bottom border
 * on the last row would land directly on the container's own edge and read as a
 * double rule; running them upward also gives each group heading its dividing
 * line for free.
 *
 * MODEL F. Every figure here is a fee for using ОСО. The «10 ₽» is charged per
 * shipment PROCESSED IN ОСО beyond the plan's volume — not a share of delivery
 * cost, not a markup, and not money that touches a carrier. The second line
 * below the table says so outright. No VAT statement anywhere: that is an
 * accounting claim and its absence is deliberate.
 */
function Prices() {
  return (
    <section
      aria-labelledby="prices"
      className="mt-24 border-t border-line pt-12 sm:mt-32"
    >
      <h2
        id="prices"
        className="site-11 uppercase tracking-[0.18em] text-accent"
      >
        СТОИМОСТЬ
      </h2>

      <p className="site-16 mt-6 max-w-3xl text-muted">
        Бесплатно то, что работает без истории отправлений; платно то, чего без накопленной истории не существует.
      </p>

      <div
        tabIndex={0}
        className="mt-10 max-w-4xl overflow-x-auto rounded border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              {/* The corner cell heads nothing, so it is a td rather than an
                  empty th — and it stays empty rather than inventing a column
                  name that is not in the approved copy. */}
              <td className="px-2 py-3 sm:px-4" />
              {TIER_COLUMNS.map((name) => (
                <th
                  key={name}
                  scope="col"
                  className="site-12 px-2 py-3 text-ink sm:px-4"
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {PRICE_FACT_ROWS.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th
                  scope="row"
                  className="site-14 px-2 py-3 text-muted sm:px-4"
                >
                  {row.label}
                </th>
                {row.values.map((cell, index) => (
                  <td
                    key={TIER_COLUMNS[index]}
                    className="site-14 px-2 py-3 text-ink sm:px-4"
                  >
                    {cell.words}
                    {cell.figure ? (
                      // nowrap on the figure only: «2 990» contains a space and
                      // must never break across two lines. The words around it
                      // may wrap freely, which is what keeps the table narrow.
                      <span className="site-mono whitespace-nowrap">
                        {cell.figure}
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>

          {PRICE_FEATURE_GROUPS.map((group) => (
            <tbody key={group.title}>
              <tr className="border-t border-line">
                <th
                  scope="rowgroup"
                  className="site-11 px-2 pb-3 pt-8 text-ink sm:px-4"
                >
                  {group.title}
                </th>
                {/* The tier names again, from the SAME constant the head row
                    renders — not retyped, so they cannot drift apart. One step
                    down the scale from the head row (.site-11 against its
                    .site-12) and in `muted` rather than `ink`, because this is a
                    reminder of a header, not a second one competing with it.
                    `muted` is the label column's own colour, so nothing new
                    enters the table. */}
                {TIER_COLUMNS.map((name) => (
                  <th
                    key={name}
                    scope="col"
                    className="site-11 px-2 pb-3 pt-8 text-muted sm:px-4"
                  >
                    {name}
                  </th>
                ))}
              </tr>
              {group.rows.map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <th
                    scope="row"
                    className="site-14 px-2 py-3 text-muted sm:px-4"
                  >
                    {row.label}
                  </th>
                  {row.has.map((has, index) => (
                    <td
                      key={TIER_COLUMNS[index]}
                      className={`site-14 px-2 py-3 sm:px-4 ${has ? "text-ink" : "text-muted"}`}
                    >
                      <PriceMark has={has} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <p className="site-16 mt-12 max-w-2xl border-t border-line pt-6">
        Сверх включённого объёма — <span className="site-mono">10 ₽</span> за отправление или переход на следующий уровень.
      </p>

      {/* Subordinate to the line above by rhythm and scale, the same device
          «ЕСЛИ ДОГОВОРОВ С ПЕРЕВОЗЧИКАМИ ЕЩЁ НЕТ» uses — never by a dimmer
          colour, because `muted` is the only quiet token on paper. */}
      <p className="site-14 mt-4 max-w-2xl text-muted">
        Подписка — плата за пользование программой. За перевозку вы платите перевозчику напрямую по своему договору.
      </p>
    </section>
  );
}
