import Link from "next/link";

/**
 * Shell for the public site at useoco.ru — everything a visitor sees before an
 * account exists. Nested under the root layout, so `<html>`, `<body>`, the font
 * variables and globals.css all come from there; this adds only the page frame.
 *
 * WHY THIS LAYOUT EXISTS AT ALL, given how little it does today:
 * the public site wants static rendering, and the root layout is
 * `dynamic = "force-dynamic"` because the nonce-based CSP in middleware needs a
 * per-request render. Those two pull in opposite directions and the question is
 * STILL OPEN — nobody has measured whether a child segment can loosen the root's
 * setting, or whether the CSP should instead stop using a nonce for public
 * pages. This file is the place that decision will land, so the first screen
 * never has to be moved to receive it. Do not change `dynamic` here casually:
 * a static public page served with a stale nonce would break its own CSP.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Ground and card are both L1 tokens, nothing new: `line` is the neutral one
    // step darker than `paper`, so the card reads as lifted without inventing a
    // grey. The shadow is the minimum that keeps the edge from vibrating against
    // the ground — no gradient, no backdrop-filter.
    <div className="min-h-screen bg-line">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-8">
        <div className="rounded-lg bg-paper text-ink shadow-sm">
          <header className="border-b border-line">
            {/* justify-between, so nav items can be added later without the
                mark moving. Only real destinations belong on the right — a nav
                item leading to a page that does not exist is worse than none. */}
            <div className="flex items-center justify-between gap-6 px-6 py-5 sm:px-10">
              <Link
                href="/"
                className="inline-flex items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                {/* точка — маршрут — точка. Decorative: the link is named by
                    «ОСО» alone, so the device is hidden from assistive tech.
                    Deliberately NOT animated — the route-drawing motion is its
                    own decision and needs the reduced-motion question settled
                    first. Drawn in markup: no image, no external asset. */}
                <span aria-hidden="true" className="flex items-center gap-1.5">
                  <span className="block h-1.5 w-1.5 rounded-full bg-accent" />
                  <span className="block h-px w-6 bg-muted" />
                  <span className="block h-1.5 w-1.5 rounded-full bg-ink" />
                </span>
                <span className="site-12 uppercase tracking-[0.28em] text-ink">
                  ОСО
                </span>
              </Link>

              <nav>
                <Link
                  href="/login"
                  className="site-12 text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  Войти
                </Link>
              </nav>
            </div>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
