import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A link that looks like the cabinet's primary button.
 *
 * THE FIRST SHARED BUTTON IN THE CABINET, and therefore a precedent. Until now
 * every button was an inline set of Tailwind classes — nineteen of them by the
 * last count — and this component exists so the twentieth is not another one.
 *
 * CLASSES TAKEN FROM `carrier-picker-dashboard-form.tsx:308`, the picker's own
 * «Подобрать перевозчика» button: the same screen this component first appears
 * on, so the two cannot disagree. That string is also the cabinet's dominant
 * primary style — the same `rounded-lg bg-primary px-4 py-2.5 text-sm
 * font-medium text-white hover:bg-primary-hover` appears in the auth forms, the
 * order form, the verification banner and the empty state.
 *
 * ONE VARIANT, ON PURPOSE. No `primary | secondary | ghost | danger` prop:
 * exactly one shape is needed today, and a variant set invented ahead of use is
 * a design system, which the cabinet does not have. When a second shape is
 * genuinely needed, it gets added then, from a real second case.
 *
 * EXISTING BUTTONS ARE NOT CONVERTED. That is separate work and must not ride
 * along with a defect fix — a diff that both fixes a funnel and restyles the
 * cabinet is a diff nobody can review.
 *
 * A LINK, NOT A BUTTON. It navigates; it does not submit or mutate. `<button>`
 * with an onClick that pushes a route would lose middle-click, «open in new
 * tab» and the status bar preview, all of which a seller expects from something
 * that goes to another page.
 */
export function ButtonLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  /** Spacing for the call site only — never colours or size. */
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </Link>
  );
}
