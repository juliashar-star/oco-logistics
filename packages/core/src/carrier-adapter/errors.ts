export class CarrierAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CarrierAuthError";
  }
}
