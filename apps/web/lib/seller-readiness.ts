/**
 * ONE computed answer to «что продавцу осталось сделать», for every screen that
 * asks it.
 *
 * WHY THIS EXISTS. Three screens computed this independently and disagreed.
 * «Адрес задан» meant the city alone in the settings route and city + phone on
 * the order path, so a company without a phone passed the check and was refused
 * at the quote. «Есть отправление» counted drafts in the shipments list and
 * excluded them on the dashboard. «Перевозчик подключён» was asked by nobody
 * except the offers route, at the last possible moment.
 *
 * COMPUTED, NEVER STORED. There is no onboardingCompleted column and there must
 * not be one: a stored flag drifts away from the facts it claims to summarise,
 * which is exactly how the two field lists drifted apart. Every value here is
 * derived at read time from what the database already knows.
 *
 * WHAT «CONNECTED» DOES NOT MEAN. `carrierConnected` says a CarrierCredential
 * row exists — nothing more. The carrier did accept those credentials once, at
 * connect time, because nothing is stored unless it did. But that verdict is not
 * saved, there is no re-check, and the row carries no status, no expiry and no
 * last-verified time. So credentials that have since been revoked or have
 * expired are INDISTINGUISHABLE here from working ones, and the failure surfaces
 * only as an error from the carrier during a real quote. Do not read this flag as
 * «доставка сейчас работает». Closing that gap is an open task — see
 * `docs/SELLER_READINESS.md`.
 *
 * NEVER THROWS. Every input is treated as unknown: a missing, malformed or
 * surprising value leaves its step OPEN rather than raising. A readiness check
 * that can throw would take down the screen it exists to help.
 */

/** The steps, in the order a seller must close them. */
export type SellerReadinessStep =
  | "verify_email"
  | "sender_address"
  | "connect_carrier"
  | "first_shipment";

export type SellerReadinessInput = {
  emailVerified?: unknown;
  senderCity?: unknown;
  senderPhone?: unknown;
  connectedCarrierCount?: unknown;
  completedShipmentCount?: unknown;
};

export type SellerReadiness = {
  emailVerified: boolean;
  /** City AND phone — the order path's rule, not the settings route's. */
  senderConfigured: boolean;
  /** A stored credential row exists. NOT a claim that it still works. */
  carrierConnected: boolean;
  /** At least one shipment that is neither DRAFT nor SUBMITTING. */
  hasShipment: boolean;
  /** The first step still open, or null when all four are closed. */
  nextStep: SellerReadinessStep | null;
  /** Convenience for callers that only render while something is open. */
  allDone: boolean;
};

/**
 * The order is not cosmetic. A carrier must be connected BEFORE a first
 * shipment is possible at all, so asking for the shipment first would point the
 * seller at a wall.
 */
export const STEP_ORDER: readonly SellerReadinessStep[] = [
  "verify_email",
  "sender_address",
  "connect_carrier",
  "first_shipment",
];

/**
 * Which flag closes which step. Exported so a screen can render the checklist
 * BY the order rather than repeating it in markup — four hand-placed rows are a
 * second copy of this list, and a second copy drifts.
 */
export const STEP_FLAG: Readonly<Record<SellerReadinessStep, keyof SellerReadiness>> = {
  verify_email: "emailVerified",
  sender_address: "senderConfigured",
  connect_carrier: "carrierConnected",
  first_shipment: "hasShipment",
};

export function isStepDone(
  readiness: SellerReadiness,
  step: SellerReadinessStep,
): boolean {
  return readiness[STEP_FLAG[step]] === true;
}

function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * A count is only a count when it is a real, finite, positive number. A numeric
 * STRING is deliberately not accepted: it would mean some caller is passing a
 * shape we did not agree on, and treating that as «done» would close a step on
 * a guess.
 */
function isPositiveCount(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * CITY AND PHONE. Exported because two callers need this one rule and only this
 * rule: the readiness object below, and the settings POST, which answers right
 * after a save and has no reason to count carriers or shipments a save cannot
 * have changed. Feeding the full function dummy counts to read one field back
 * would work and would read like a trick.
 *
 * build-offer-input.ts refuses a quote without either half, so the looser rule
 * (city only) let a seller reach the calculate button and hit a wall there.
 */
export function isSenderConfigured(
  senderCity: unknown,
  senderPhone: unknown,
): boolean {
  return isFilled(senderCity) && isFilled(senderPhone);
}

/**
 * Is this value a readiness object a screen may trust?
 *
 * WHY A SCREEN NEEDS THIS. A browser tab holding an old bundle can reach a route
 * that does not send `readiness` yet, and a screen that BLOCKS on this state
 * must be able to tell «нет перевозчика» from «поле не пришло». Absent or
 * malformed → the caller treats it as «не знаю», shows nothing and blocks
 * nothing, degrading to its previous behaviour. Guessing the other way would
 * disable the calculate button for every seller on a bad rollout.
 */
export function isSellerReadiness(value: unknown): value is SellerReadiness {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const flagsAreBooleans = [
    "emailVerified",
    "senderConfigured",
    "carrierConnected",
    "hasShipment",
    "allDone",
  ].every((key) => typeof candidate[key] === "boolean");

  const step = candidate.nextStep;
  const stepIsValid =
    step === null ||
    (typeof step === "string" &&
      (STEP_ORDER as readonly string[]).includes(step));

  return flagsAreBooleans && stepIsValid;
}

export function describeSellerReadiness(
  input: SellerReadinessInput = {},
): SellerReadiness {
  const source = input ?? {};

  // Strictly `true`. A truthy 1 or "yes" means the caller is guessing at the
  // shape, and an unverified address must not be reported as verified.
  const emailVerified = source.emailVerified === true;

  // One rule, shared with the settings POST — see isSenderConfigured.
  const senderConfigured = isSenderConfigured(
    source.senderCity,
    source.senderPhone,
  );

  const carrierConnected = isPositiveCount(source.connectedCarrierCount);
  const hasShipment = isPositiveCount(source.completedShipmentCount);

  const closed: Record<SellerReadinessStep, boolean> = {
    verify_email: emailVerified,
    sender_address: senderConfigured,
    connect_carrier: carrierConnected,
    first_shipment: hasShipment,
  };

  const nextStep = STEP_ORDER.find((step) => !closed[step]) ?? null;

  return {
    emailVerified,
    senderConfigured,
    carrierConnected,
    hasShipment,
    nextStep,
    allDone: nextStep === null,
  };
}
