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
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center px-6 py-5">
          <Link
            href="/"
            className="site-12 uppercase tracking-[0.18em] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            ОСО
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
