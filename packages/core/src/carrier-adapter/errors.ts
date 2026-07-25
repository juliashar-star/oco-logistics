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
