import type { OfferPriority } from "@/lib/shipments/preselect-offer";

export type ParsedOfferPriority =
  /** The key was absent — DO NOT TOUCH the stored value. */
  | { ok: true; present: false }
  /** The key was sent: null clears the preference, a value sets it. */
  | { ok: true; present: true; value: OfferPriority | null }
  | { ok: false };

/**
 * The seller's chosen default, as it arrives from the settings form.
 *
 * AN ABSENT KEY IS NOT THE SAME AS null, and conflating them silently wipes a
 * seller's preference. This endpoint saves the whole settings card, so a
 * request that omits the field is one that was not talking about the priority
 * at all — an older bundle, or any future caller that saves only the sender
 * address. Reading that as «set it to null» would clear a stored choice with
 * nothing on screen saying so. Absent means DO NOT TOUCH; an explicit null
 * means clear.
 *
 * THREE ACCEPTED INPUTS ONCE THE KEY IS PRESENT, AND «NOTHING» IS null, NOT A
 * THIRD VALUE. «Ничего не подставлять» is the absence of a preference, which
 * the database stores as NULL — inventing a NONE enum member would make «has
 * not chosen» and «has chosen not to» two states that behave identically and
 * drift apart the first time anyone counts them.
 *
 * EVERYTHING ELSE IS REJECTED, and the old vocabulary is rejected LOUDLY on
 * purpose. `SelectionMode` still exists on Shipment with FAST, CHEAP, OPTIMAL
 * and MANUAL; those words are close enough to these that a copied form field or
 * a hand-written request could carry them here. OPTIMAL is the one this product
 * refuses to compute at all — its only implementation scores every carrier with
 * a placeholder — so a column that quietly accepted it would store a preference
 * nothing can honour.
 *
 * A PARSER, NOT A ROUTE BRANCH. The route maps the result to HTTP and nothing
 * else, so every accepted and rejected value is reachable by a unit test in
 * milliseconds — route tests here need auth, Prisma and Next together and are
 * not written.
 */
export function parseOfferPriority(body: unknown): ParsedOfferPriority {
  const KEY = "defaultOfferPriority";
  if (
    body === null ||
    typeof body !== "object" ||
    !Object.prototype.hasOwnProperty.call(body, KEY)
  ) {
    return { ok: true, present: false };
  }

  const raw = (body as Record<string, unknown>)[KEY];
  // `undefined` counts as absent even when the key exists: JSON.stringify drops
  // such keys anyway, so a body that carries one was not built by our form.
  if (raw === undefined) {
    return { ok: true, present: false };
  }
  if (raw === null || raw === "") {
    return { ok: true, present: true, value: null };
  }
  if (raw === "CHEAPEST" || raw === "FASTEST") {
    return { ok: true, present: true, value: raw };
  }
  return { ok: false };
}

/** Shown when the value is not one of the three the form can produce. */
export const OFFER_PRIORITY_INVALID_RU =
  "Недопустимое значение приоритета";
