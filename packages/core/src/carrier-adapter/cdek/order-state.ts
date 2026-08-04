/**
 * Pure decisions over CDEK order JSON. No network.
 * Every branch is measured on api.edu.cdek.ru — do not invent new ones.
 */

export type CdekCreateState = {
  state: "pending" | "created" | "invalid";
  uuid: string | null;
  cdekNumber: string | null;
  errorCodes: string[];
};

/**
 * True when a lookup reply carries
 * requests[].errors[].code === "v2_entity_not_found_im_number".
 *
 * WHY: CDEK answers «no order with this number» with HTTP 400, not 404, so a
 * naive `!response.ok` throw would turn «nothing exists yet, go ahead and
 * create» into a failure. Defensive about shape: any missing level → false.
 */
export function isCdekOrderNotFound(body: unknown): boolean {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const requests = (body as { requests?: unknown }).requests;
  if (!Array.isArray(requests)) {
    return false;
  }
  for (const entry of requests) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    const errors = (entry as { errors?: unknown }).errors;
    if (!Array.isArray(errors)) {
      continue;
    }
    for (const err of errors) {
      if (err === null || typeof err !== "object") {
        continue;
      }
      if ((err as { code?: unknown }).code === "v2_entity_not_found_im_number") {
        return true;
      }
    }
  }
  return false;
}

function findCreateRequest(
  body: Record<string, unknown>,
): Record<string, unknown> | null {
  const requests = body.requests;
  if (!Array.isArray(requests)) {
    return null;
  }
  for (const entry of requests) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    const row = entry as Record<string, unknown>;
    if (row.type === "CREATE") {
      return row;
    }
  }
  return null;
}

function readErrorCodes(createRequest: Record<string, unknown>): string[] {
  const errors = createRequest.errors;
  if (!Array.isArray(errors)) {
    return [];
  }
  const codes: string[] = [];
  for (const err of errors) {
    if (err === null || typeof err !== "object") {
      continue;
    }
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) {
      codes.push(code);
    }
  }
  return codes;
}

/**
 * Read create-settlement state from a GET /v2/orders (or POST create) reply.
 *
 * uuid / cdekNumber come from entity ALWAYS, independently of requests[] —
 * a missing CREATE entry must not orphan a known uuid on the read-then-adopt
 * path (that would POST again and create the duplicate the guard exists to
 * prevent). The CREATE entry decides only the STATE.
 *
 * Map CREATE state: ACCEPTED → "pending", SUCCESSFUL → "created",
 * INVALID → "invalid". Every other unrecognised value → "pending", NOT
 * "invalid": a throw does not persist providerOrderId, so reading an unknown
 * state as failure would leave a live order at the carrier that OCO knows
 * nothing about — unrecoverable. Reading it as pending costs at most a
 * timeout, after which the caller returns the uuid and status sync resolves
 * the truth later.
 *
 * Missing or malformed body → state "pending" with nulls, NOT "invalid": we
 * must never conclude an order failed from a reply we could not read.
 */
export function readCdekCreateState(body: unknown): CdekCreateState {
  if (body === null || typeof body !== "object") {
    return {
      state: "pending",
      uuid: null,
      cdekNumber: null,
      errorCodes: [],
    };
  }
  const record = body as Record<string, unknown>;

  const entity =
    record.entity !== null && typeof record.entity === "object"
      ? (record.entity as Record<string, unknown>)
      : null;

  const uuid =
    entity !== null && typeof entity.uuid === "string" && entity.uuid.length > 0
      ? entity.uuid
      : null;

  // Measured: entity.cdek_number arrives as a STRING when present.
  const cdekNumber =
    entity !== null &&
    typeof entity.cdek_number === "string" &&
    entity.cdek_number.length > 0
      ? entity.cdek_number
      : null;

  const createRequest = findCreateRequest(record);
  if (!createRequest) {
    return {
      state: "pending",
      uuid,
      cdekNumber,
      errorCodes: [],
    };
  }

  const errorCodes = readErrorCodes(createRequest);

  const rawState = createRequest.state;
  let state: CdekCreateState["state"];
  if (rawState === "ACCEPTED") {
    state = "pending";
  } else if (rawState === "SUCCESSFUL") {
    state = "created";
  } else if (rawState === "INVALID") {
    state = "invalid";
  } else {
    // Unrecognised → pending (recoverable), never invalid (unrecoverable orphan).
    state = "pending";
  }

  return { state, uuid, cdekNumber, errorCodes };
}
