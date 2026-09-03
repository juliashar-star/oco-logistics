import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
// Relative, not the `@/` alias: this module is reached by a db test running
// outside Next, where the alias does not resolve. Same reason as the other
// services in this folder.
import { anonymizedShipmentUpdate } from "../shipment-anonymization";

/**
 * Erases the recipient's data on one shipment and every carrier response
 * attached to it.
 *
 * WHY THIS IS A SERVICE AND NOT THE ROUTE'S BODY. A route needs auth, Next and
 * Prisma to run, so nothing can watch it fail; the one guarantee that matters
 * here — that the `where` on each `updateMany` is right — is exactly the kind
 * a route test cannot give. The route parses, calls this, maps the reason to a
 * status. See `docs/ANONYMIZATION.md`.
 *
 * WHICH COLUMNS is decided by `lib/shipment-anonymization.ts`, not here.
 */

export type AnonymizeShipmentResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" | "already_anonymized" };

export async function anonymizeShipment(
  prisma: PrismaClient,
  input: { shipmentId: string; companyId: string },
): Promise<AnonymizeShipmentResult> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: input.shipmentId },
    select: { id: true, companyId: true, isAnonymized: true },
  });

  if (!shipment) {
    return { ok: false, reason: "not_found" };
  }
  if (shipment.companyId !== input.companyId) {
    return { ok: false, reason: "forbidden" };
  }
  if (shipment.isAnonymized) {
    return { ok: false, reason: "already_anonymized" };
  }

  const { shipmentId } = input;

  // One transaction: a half-erased shipment is worse than an un-erased one,
  // because the flag would say the work was done.
  await prisma.$transaction([
    prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        ...anonymizedShipmentUpdate(),
        // Our own offer snapshot. Cleared whole, not filtered — every offer in
        // it carries `rawOffer`, the provider's untouched object, whose shape
        // is the carrier's and not ours to vouch for.
        quotedOffers: Prisma.DbNull,
      },
    }),
    // `where: { shipmentId }` is the whole guard on both of these. Without it
    // updateMany would blank every row in the table, for every seller.
    prisma.tariffQuote.updateMany({
      where: { shipmentId },
      data: { rawResponse: Prisma.DbNull },
    }),
    prisma.trackingEvent.updateMany({
      where: { shipmentId },
      data: { rawResponse: Prisma.DbNull },
    }),
  ]);

  return { ok: true };
}
