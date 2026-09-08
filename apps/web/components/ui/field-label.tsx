import * as React from "react";

/**
 * THE ONE WAY A FIELD IS LABELLED, and the one way a required field is marked.
 *
 * Before this component the cabinet had NO way at all: measured across
 * `apps/web`, not one `aria-required`, not one asterisk, and the word
 * «обязательно» only as a placeholder saying the opposite. Eight controls in
 * the order form carried a bare `required` attribute and looked exactly like
 * the optional ones next to them, so the first a seller learned of the rule was
 * the browser refusing to submit.
 *
 * ONE COMPONENT, NOT EIGHT COPIES OF THE MARKUP. Seven other files carry
 * `required` and will move onto this; a marker pasted into each of them is
 * eight decisions that drift apart, and the drift is invisible until two
 * screens disagree in front of a seller.
 *
 * THE ASTERISK IS FOR EYES ONLY — `aria-hidden`. A screen reader that met it
 * would announce «звёздочка», which names the glyph and not the rule. The rule
 * reaches software through `aria-required` on the CONTROL, which is where the
 * caller puts it: this component renders the label, and a label cannot carry
 * another element's state.
 *
 * `htmlFor` IS MANDATORY, not optional. Every one of the eight labels this
 * replaces was a floating `<label>` with no `htmlFor` and a control with no
 * `id` — text that merely sat above an input. Making the link a required
 * argument means the next form cannot repeat that by omission.
 *
 * COLOUR IS THE PALETTE TOKEN `text-error` (`--error`, #dc2626), the only red
 * the project declares — see `globals.css` and `tailwind.config.ts`. Parts of
 * the cabinet still paint errors with raw Tailwind `red-700`/`red-800`, which
 * are not palette entries; unifying them is a separate slice and must not be
 * done by quietly copying one of them here.
 */

/**
 * Taken VERBATIM from the labels this replaces — every one of the eight in the
 * order form carried exactly this string. Kept as a constant so the next form
 * inherits the same label, not a retyped approximation of it.
 */
const LABEL_CLASS = "mb-1 block text-sm font-medium text-slate-700";

export type FieldLabelProps = {
  /** `id` of the control this labels. */
  htmlFor: string;
  /** The seller-facing caption. */
  children: React.ReactNode;
  /**
   * Draws the asterisk. It does NOT set `aria-required` — that belongs on the
   * control and is the caller's to pass.
   */
  required?: boolean;
};

export function FieldLabel({
  htmlFor,
  children,
  required = false,
}: FieldLabelProps) {
  return (
    <label htmlFor={htmlFor} className={LABEL_CLASS}>
      {children}
      {required && (
        <span aria-hidden className="text-error">
          {" *"}
        </span>
      )}
    </label>
  );
}
