import type { CarrierCredentials } from "../types";
import { type CdekCity, resolveCdekCities } from "./cities";
import { hasCdekErrorCode } from "./order-state";

/**
 * CDEK refuses a location it cannot recognise from a name, and says which END
 * it failed on. Both codes MEASURED 14.08 on edu with the calculator:
 *
 *   from_location {city:"Санкт-Петербург"} → v2_sender_location_not_recognized
 *   to_location   {city:"Санкт-Петербург"} → v2_recipient_location_not_recognized
 *
 * «Москва» is recognised by name, «Санкт-Петербург» and «Екатеринбург» are not.
 */
export const CDEK_SENDER_LOCATION_NOT_RECOGNIZED =
  "v2_sender_location_not_recognized";
export const CDEK_RECIPIENT_LOCATION_NOT_RECOGNIZED =
  "v2_recipient_location_not_recognized";

export type CdekLocationEnd = "sender" | "recipient";

/**
 * TWO ENVELOPES CARRY CDEK ERRORS, and only one of them is what
 * hasCdekErrorCode reads. The order paths answer with the request envelope
 * (`requests[].errors[].code`), which is what that helper walks; the
 * CALCULATOR answers with a bare top level (MEASURED):
 *
 *   { "errors": [ { "code": "v2_recipient_location_not_recognized", … } ] }
 *
 * So this checks both shapes rather than widening hasCdekErrorCode, whose two
 * existing callers reason about the request envelope only. Which envelope a
 * LOCATION error takes on POST /v2/orders is NOT MEASURED — checking both is
 * the reason that gap costs nothing.
 */
function hasCdekTopLevelErrorCode(body: unknown, code: string): boolean {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) {
    return false;
  }
  for (const entry of errors) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    if ((entry as { code?: unknown }).code === code) {
      return true;
    }
  }
  return false;
}

function carriesCode(body: unknown, code: string): boolean {
  return hasCdekErrorCode(body, code) || hasCdekTopLevelErrorCode(body, code);
}

/**
 * Which end CDEK said it could not recognise, or null when the failure is
 * something else entirely.
 *
 * ONLY THE CODE IS READ. The body is never stored, never re-thrown and never
 * forwarded — the same treatment the order lookup and the cancel path already
 * give it (client.ts checks v2_entity_not_found_im_number and
 * v2_entity_not_found the same way). Reading a code to decide what to do next
 * is not «putting a provider response body into an error message»: nothing
 * from the body survives this function but a member of a two-value union.
 *
 * SENDER WINS WHEN BOTH ARE BROKEN — MEASURED: with both ends unrecognisable
 * CDEK returned only v2_sender_location_not_recognized and said nothing about
 * the recipient. That is why the retry resolves BOTH ends rather than only the
 * named one: a fallback that fixed only what was named would need a second
 * round trip to discover the second half.
 */
export function readCdekUnrecognizedLocationEnd(
  body: unknown,
): CdekLocationEnd | null {
  if (carriesCode(body, CDEK_SENDER_LOCATION_NOT_RECOGNIZED)) {
    return "sender";
  }
  if (carriesCode(body, CDEK_RECIPIENT_LOCATION_NOT_RECOGNIZED)) {
    return "recipient";
  }
  return null;
}

/** City codes to attach; an absent end keeps the name it already had. */
export type CdekLocationCodes = {
  senderCode?: number;
  recipientCode?: number;
};

export type ResolveCdekLocationCodesResult =
  | { ok: true; codes: CdekLocationCodes }
  | { ok: false; reason: "city_not_resolved" };

type ResolveCities = (
  cityName: string,
  credentials: CarrierCredentials,
) => Promise<readonly CdekCity[]>;

async function codeForCity(
  cityName: string | null | undefined,
  credentials: CarrierCredentials,
  resolveCities: ResolveCities,
): Promise<{ matches: number; code?: number }> {
  const trimmed = cityName?.trim() ?? "";
  if (!trimmed) {
    return { matches: 0 };
  }
  const matches = await resolveCities(trimmed, credentials);
  if (matches.length !== 1) {
    return { matches: matches.length };
  }
  return { matches: 1, code: matches[0]!.code };
}

/**
 * Turn city NAMES into CDEK city CODES for one retry.
 *
 * THE REFUSAL IS NARROW ON PURPOSE, and this is the whole product rule:
 *
 * - the end CDEK NAMED must resolve to exactly ONE city, or we refuse. Zero
 *   means the directory does not know it; more than one means we would have to
 *   pick, and picking wrong sends a parcel to a different settlement with the
 *   same name (the directory really does return «Москва»/Москва and
 *   «Москва»/Псковская область for one query).
 * - the OTHER end gets a code only when it too is unambiguous. Otherwise it
 *   keeps the name it already had — which is not a guess but exactly today's
 *   behaviour, and the carrier has already accepted that end by not naming it.
 *
 * Refusing on both ends instead would break the ordinary case: the sender city
 * in company settings is «Москва», which has TWO matches and works by name.
 * «Not guessing» means not choosing among several — not refusing because of an
 * end the carrier accepted.
 *
 * resolveCities is injectable so the rule can be tested without network.
 */
export async function resolveCdekLocationCodes(args: {
  namedEnd: CdekLocationEnd;
  senderCity: string;
  /** null when the order has no to_location at all (PVZ destination). */
  recipientCity: string | null;
  credentials: CarrierCredentials;
  resolveCities?: ResolveCities;
}): Promise<ResolveCdekLocationCodesResult> {
  const resolveCities = args.resolveCities ?? resolveCdekCities;

  const [sender, recipient] = await Promise.all([
    codeForCity(args.senderCity, args.credentials, resolveCities),
    args.recipientCity === null
      ? Promise.resolve({ matches: 0 } as { matches: number; code?: number })
      : codeForCity(args.recipientCity, args.credentials, resolveCities),
  ]);

  const named = args.namedEnd === "sender" ? sender : recipient;
  if (named.code === undefined) {
    return { ok: false, reason: "city_not_resolved" };
  }

  const codes: CdekLocationCodes = {};
  if (sender.code !== undefined) {
    codes.senderCode = sender.code;
  }
  if (recipient.code !== undefined) {
    codes.recipientCode = recipient.code;
  }
  return { ok: true, codes };
}

/**
 * Add `code` to a location that already carries city and address.
 *
 * MEASURED 14.08 on edu: {code}, {code, address} and {code, city, address} all
 * return HTTP 200 with an IDENTICAL tariff count (17 for СПб, 13 for
 * Екатеринбург). Keeping city and address means the quote and the order still
 * send ONE shape — the invariant buildCdekLocation exists to protect — and the
 * order still has the street it needs for a courier destination.
 */
export function withCdekLocationCode<T extends object>(
  location: T,
  code: number | undefined,
): T {
  return code === undefined ? location : { ...location, code };
}
