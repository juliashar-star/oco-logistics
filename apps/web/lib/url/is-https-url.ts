/**
 * WHY https-only (vs isHttpOrHttpsUrl for labels): the tracking link is a page we
 * send a BUYER to, so https-only; the label comes from APIShip, whose dev contour
 * serves http://, so labels use isHttpOrHttpsUrl. Both block javascript:/data:.
 */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
