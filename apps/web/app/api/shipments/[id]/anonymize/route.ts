import { NextResponse } from "next/server";

import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit/log";
import { anonymizeShipment } from "@/lib/shipments/anonymize-shipment";

/**
 * Anonymizes recipient PII on a Shipment, and clears every column that holds a
 * carrier response or a snapshot built from one.
 *
 * WHICH FIELDS is not decided here. The list lives in
 * `lib/shipment-anonymization.ts`, next to the code that encrypts those same
 * fields, and a guard test derives the encrypted set from that code and fails
 * when the two drift. This route naming fields itself is exactly how
 * destApartment and deliveryComment came to survive anonymisation as encrypted
 * personal data.
 *
 * ALL THREE Json columns are cleared, not filtered:
 * - `Shipment.quotedOffers` — our own offer snapshot, and every offer in it
 *   carries `rawOffer`, the provider's untouched object. An allow-list over the
 *   snapshot would still have to decide what is safe inside `rawOffer`, which is
 *   the carrier's shape and not ours to guarantee. Nothing reads the column
 *   after submit (`ShipmentDecision` already holds the reportable values), so
 *   clearing the block costs nothing a report needs.
 * - `TariffQuote.rawResponse` — the legacy APIShip calculator path.
 * - `TrackingEvent.rawResponse` — this used to be skipped as «low PII risk».
 *   That estimate no longer stands: the column holds the carrier's raw response,
 *   whose composition we do not control and which the provider may widen at any
 *   time without telling us. Judging it safe means judging a shape we do not own.
 *
 * `rawOffer` is still SAVED at quote time on purpose — the snapshot is declared
 * Carrier Score's input (see the column comment in schema.prisma), and what that
 * scoring will need is not measured. It is cleared here with everything else.
 *
 * Known limitation (152-FZ): APIShip retains a copy of recipient data on their
 * servers after order creation — there is no delete/anonymize API on their side.
 *
 * NOT REACHED FROM HERE: TariffQuote rows whose `shipmentId` is null. They are
 * legacy and unreachable by a per-shipment anonymisation — see
 * `docs/ANONYMIZATION.md`.
 */
export const POST = withAuth<{ id: string }>(async (_request, user, { params }) => {
  const { id } = await params;
  const shipmentId = id.trim();
  if (!shipmentId) {
    return NextResponse.json({ error: "Отправление не найдено" }, { status: 404 });
  }

  try {
    const result = await anonymizeShipment(prisma, {
      shipmentId,
      companyId: user.companyId,
    });

    if (!result.ok) {
      if (result.reason === "not_found") {
        return NextResponse.json({ error: "Отправление не найдено" }, { status: 404 });
      }
      if (result.reason === "forbidden") {
        return NextResponse.json(
          { error: "Нет доступа к этому отправлению" },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: "already_anonymized" }, { status: 400 });
    }

    void logAuditEvent({
      userId: user.userId,
      companyId: user.companyId,
      action: "shipment.anonymize",
      entityType: "shipment",
      entityId: shipmentId,
    });

    return NextResponse.json({ ok: true });
  } catch {
    console.error("anonymize shipment failed", { shipmentId });
    return NextResponse.json(
      { error: "Не удалось удалить данные получателя" },
      { status: 500 },
    );
  }
});
