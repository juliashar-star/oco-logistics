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
