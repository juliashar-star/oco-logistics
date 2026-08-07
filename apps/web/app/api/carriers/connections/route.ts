import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { CARRIER_CONNECT_FIELDS } from "@/lib/carriers/carrier-connect-fields";
import { buildCarrierConnectionsView } from "@/lib/carriers/carrier-connections-view";
import { listConnectedProviderKeys } from "@/lib/shipments/list-connected-carriers";

/**
 * What the «Подключение» tab renders: every carrier the connect service can
 * handle, its real name, whether this company already connected it, and which
 * fields to ask for. The field list is served from here so the form never keeps
 * its own copy of it.
 *
 * listConnectedProviderKeys, NOT listConnectedCarriers: the latter DECRYPTS every
 * stored bag, and a decrypted credential must never travel toward a browser.
 * Answering "which carriers are connected" needs the keys and nothing more.
 */
export const GET = withAuth(async (_request, user) => {
  try {
    const connectedProviderKeys = await listConnectedProviderKeys(
      prisma,
      user.companyId,
    );

    return NextResponse.json({
      carriers: buildCarrierConnectionsView(
        CARRIER_CONNECT_FIELDS,
        connectedProviderKeys,
      ),
    });
  } catch (error) {
    // Logging the error OBJECT is safe in THIS route and only here: a GET has no
    // request body, so nothing a seller submitted — and therefore no credential —
    // can be inside the error. The unnamed-provider-key throw above is exactly
    // what an operator needs to see.
    //
    // Do NOT copy this catch into POST /api/carriers/connect: that request body
    // carries the credentials, so an error raised while handling it can quote
    // them, and logging the object would write a seller's secret to the log.
    // That route logs a fixed phrase on purpose.
    console.error("list carrier connections failed", error);
    // The seller still reads a generic message — the provider key belongs in the
    // log, not in the response.
    return NextResponse.json(
      { error: "Не удалось загрузить подключения" },
      { status: 500 },
    );
  }
});
