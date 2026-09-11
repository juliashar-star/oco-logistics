/**
 * What `/verify-email` says about the letter — PURE and import-free, so the
 * choice and every string are reachable by a unit test.
 */

export type LetterState = "sent" | "not_sent";

/**
 * A null expiry on an unconfirmed account means no letter is live: a first
 * letter proven not sent had its token rolled back to null, and accounts made
 * before verification existed never had one. Either way «Мы отправили письмо»
 * would be false.
 */
export function verificationLetterState(
  expiry: Date | null | undefined,
): LetterState {
  return expiry === null || expiry === undefined ? "not_sent" : "sent";
}

/**
 * The page's words for each state. The address sits between `bodyBeforeEmail`
 * and `bodyAfterEmail` because the page sets it in bold.
 */
export type LetterCopy = {
  heading: string;
  bodyBeforeEmail: string;
  bodyAfterEmail: string;
  /** Null when there is no link to describe. */
  hint: string | null;
  buttonLabel: string;
};

const COPY: Readonly<Record<LetterState, LetterCopy>> = {
  sent: {
    heading: "Проверьте почту",
    bodyBeforeEmail: "Мы отправили письмо на ",
    bodyAfterEmail: "",
    hint: "Перейдите по ссылке в письме, чтобы подтвердить email. Ссылка действует 24 часа.",
    buttonLabel: "Отправить повторно",
  },
  not_sent: {
    heading: "Письмо не отправлено",
    bodyBeforeEmail: "Не удалось отправить письмо на ",
    bodyAfterEmail: ". Отправьте его ещё раз.",
    hint: null,
    buttonLabel: "Отправить письмо",
  },
};

export function letterCopy(state: LetterState): LetterCopy {
  return COPY[state];
}
