import type { PrismaClient } from "@prisma/client";
import { CARRIER_REGISTRY } from "@oco/core";

import { isConnectableByOco } from "./carrier-credential-fields";

/**
 * Records a seller's request that OCO build an integration for a carrier.
 *
 * WHY A SERVICE. A route needs auth, Next and Prisma to run, so nothing can
 * watch its decisions fail — and the decision that matters most here is a
 * REFUSAL, which by definition leaves no trace to inspect afterwards. The route
 * parses, calls this, maps the result to a status and sends the mail.
 *
 * THE REFUSAL THIS FILE WAS ADDED FOR. A carrier OCO can connect itself needs no
 * request: the seller can do it in a minute on the connection tab. The picker
 * card used to offer «Запросить техническую интеграцию» for CDEK and Yandex —
 * asking us for a thing that already exists — and the route accepted it,
 * writing a row and mailing the founder about work already done. A guard that
 * lives only in markup is bypassed by anyone with a terminal.
 */

export type RequestCarrierConnectionResult =
  | { status: "created"; createdAt: Date }
  /** A row already stood; nothing was written and nothing was changed. */
  | { status: "already_requested"; createdAt: Date }
  | { status: "unknown_provider" }
  | { status: "discontinued" }
  | { status: "already_connected" }
  /** OCO connects this carrier itself — see the file note. */
  | { status: "connectable_by_oco" };

export async function requestCarrierConnection(
  prisma: PrismaClient,
  input: { companyId: string; providerKey: string },
): Promise<RequestCarrierConnectionResult> {
  const { companyId, providerKey } = input;

  const carrier = CARRIER_REGISTRY.find((c) => c.providerKey === providerKey);
  if (!carrier) {
    return { status: "unknown_provider" };
  }
  if (carrier.healthStatus === "discontinued") {
    return { status: "discontinued" };
  }

  const connected = await prisma.carrierCredential.findFirst({
    where: { companyId, providerKey },
    select: { id: true },
  });
  if (connected) {
    return { status: "already_connected" };
  }

  // AFTER «already connected», BEFORE the existing-request read. After, because
  // «уже подключён» is the more precise thing to say to a seller who has done
  // it. Before, because a row can already stand for a carrier we have SINCE
  // learned to connect — those rows are in the database today — and reporting
  // success there would leave the seller waiting on us instead of connecting.
  if (isConnectableByOco(providerKey)) {
    return { status: "connectable_by_oco" };
  }

  const existing = await prisma.carrierConnectionRequest.findUnique({
    where: { companyId_providerKey: { companyId, providerKey } },
  });
  if (existing) {
    return { status: "already_requested", createdAt: existing.createdAt };
  }

  const created = await prisma.carrierConnectionRequest.create({
    data: { companyId, providerKey },
  });
  return { status: "created", createdAt: created.createdAt };
}
