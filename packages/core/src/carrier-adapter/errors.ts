export class CarrierAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CarrierAuthError";
  }
}

/** A chosen offer is no longer valid at confirm time; carriers with short offer TTLs raise this. */
export class CarrierOfferExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CarrierOfferExpiredError";
  }
}

/**
 * The carrier's assessed price no longer matches the quote the seller was shown,
 * so the order must not be placed and the seller must re-quote.
 */
export class CarrierQuoteChangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CarrierQuoteChangedError";
  }
}

/**
 * Label generation refused / not ready (Yandex other-day: HTTP 409 on
 * request/generate-labels).
 *
 * Named rather than a generic Error BECAUSE a fabricated request_id and a
 * genuinely-not-yet-ready order return the SAME 409 body — they are
 * indistinguishable at the API. The provider message says «try again later»,
 * which is NOT safe to show a seller (it would also fire for a wrong/typo id).
 * The Error message may carry the raw provider text for logs ONLY — never
 * surface it in the UI.
 */
export class CarrierLabelsNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CarrierLabelsNotReadyError";
  }
}
