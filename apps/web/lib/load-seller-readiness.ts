import type { PrismaClient, ShipmentStatus } from "@prisma/client";

import {
  describeSellerReadiness,
  type SellerReadiness,
} from "./seller-readiness";

/**
 * Loads the two counts the readiness rules need and hands everything to the pure
 * function. The RULES live in `seller-readiness.ts`; this file only fetches.
 *
 * WHY A LOADER AND NOT A ROUTE. Two routes serve this state —
 * `/api/settings/company` and `/api/dashboard/stats` — because both are already
 * fetched by the screens that need it, and a third endpoint would be a third
 * network round-trip for the same answer. What must not be duplicated is the
 * ASSEMBLY: if each route built the object itself, the two would drift, which is
 * the defect this whole slice removes.
 *
 * SENDER FIELDS ARE PASSED IN, not fetched here. Both callers already hold the
 * company row for their own response, and a second `company.findFirst` inside
 * this function would add a query to buy nothing.
 */

/**
 * A shipment in one of these is NOT a shipment the seller completed: DRAFT means
 * they started and stopped, SUBMITTING means the carrier has not confirmed yet.
 * Declared once, here, because the dashboard excluded them while the shipments
 * list counted them — the two answered «есть отправление» differently.
 */
export const SHIPMENT_STATUSES_NOT_REAL: readonly ShipmentStatus[] = [
  "DRAFT",
  "SUBMITTING",
];

export type LoadSellerReadinessInput = {
  companyId: string;
  /** From the session — `withAuth` already carries it, so it costs no query. */
  emailVerified: boolean;
  senderCity: string | null;
  senderPhone: string | null;
};

export async function loadSellerReadiness(
  prisma: PrismaClient,
  input: LoadSellerReadinessInput,
): Promise<SellerReadiness> {
  const [connectedCarrierCount, completedShipmentCount] = await Promise.all([
    prisma.carrierCredential.count({ where: { companyId: input.companyId } }),
    prisma.shipment.count({
      where: {
        companyId: input.companyId,
        status: { notIn: [...SHIPMENT_STATUSES_NOT_REAL] },
      },
    }),
  ]);

  return describeSellerReadiness({
    emailVerified: input.emailVerified,
    senderCity: input.senderCity,
    senderPhone: input.senderPhone,
    connectedCarrierCount,
    completedShipmentCount,
  });
}
