import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { connectCarrierCredentials } from "@/lib/carriers/connect-carrier-credentials";
import { connectResultToResponse } from "@/lib/carriers/connect-result-response";

/**
 * ENVELOPE ONLY. Which fields each carrier requires lives in the service's
 * CARRIER_CREDENTIAL_FIELDS and is drift-tested against the adapters there —
 * restating it here would be a second spec that eventually disagrees.
 *
 * `.object()` strips unknown keys, so a companyId planted in the body is dropped
 * before it can reach anything; the handler uses the session's companyId only.
 */
const connectSchema = z.object({
  providerKey: z.string().trim().min(1, "Укажите перевозчика"),
  credentials: z.record(z.string()),
});

export const POST = withAuth(async (request, user) => {
  try {
    const body = await request.json();
    const parsed = connectSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Некорректные данные";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const result = await connectCarrierCredentials(prisma, {
      // From the DB-confirmed session, never from the request body.
      companyId: user.companyId,
      providerKey: parsed.data.providerKey,
      credentials: parsed.data.credentials,
    });

    const mapped = connectResultToResponse(result);
    // Not a decision about the result — the mapper decides whether there is
    // anything an operator needs to see; the route only emits it.
    if (mapped.serverLog) {
      console.error(mapped.serverLog);
    }
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  } catch {
    // Log the event only — the request body holds the seller's credentials and
    // must never reach a log line.
    console.error("carrier connect failed");
    return NextResponse.json(
      { error: "Не удалось подключить перевозчика" },
      { status: 500 },
    );
  }
});
