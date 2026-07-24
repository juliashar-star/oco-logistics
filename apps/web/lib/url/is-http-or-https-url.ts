/**
 * WHY this differs from isHttpsUrl: the tracking link is a page we send a BUYER
 * to, so https-only; the label comes from APIShip, whose dev contour serves
 * http://, so an https-only rule would break a working label. Both block
 * javascript:/data:.
 */
export function isHttpOrHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
