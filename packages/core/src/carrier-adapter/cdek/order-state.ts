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
 * True when a lookup reply carries requests[].errors[].code === code
 * (exact string match).
 *
 * Callers must pass the FULL code — a prefix check would conflate
 * "v2_entity_not_found" (uuid lookup) with "v2_entity_not_found_im_number"
 * (number lookup), because the latter starts with the former.
 *
 * WHY the number-lookup caller exists: CDEK answers «no order with this
 * number» with HTTP 400, not 404, so a naive `!response.ok` throw would turn
 * «nothing exists yet, go ahead and create» into a failure. Defensive about
 * shape: any missing level → false.
 */
export function hasCdekErrorCode(body: unknown, code: string): boolean {
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
      if ((err as { code?: unknown }).code === code) {
        return true;
      }
    }
  }
  return false;
}

/**
 * ONE way to walk requests[]. Every reader of this envelope goes through here —
 * create settlement, the post-delete state, and the already-pending check — so
 * the defensive shape (missing level → null, non-object rows skipped) is
 * written once instead of three times drifting apart.
 */
export function findRequestByType(
  body: unknown,
  type: string,
): Record<string, unknown> | null {
  if (body === null || typeof body !== "object") {
    return null;
  }
  const requests = (body as { requests?: unknown }).requests;
  if (!Array.isArray(requests)) {
    return null;
  }
  for (const entry of requests) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    const row = entry as Record<string, unknown>;
    if (row.type === type) {
      return row;
    }
  }
  return null;
}

function findCreateRequest(
  body: Record<string, unknown>,
): Record<string, unknown> | null {
  return findRequestByType(body, "CREATE");
}

/**
 * States in which a DELETE we already sent is still in flight.
 *
 * MEASURED 13.08 on edu: a day after our DELETE, the order still answered 200
 * with statuses[] unchanged (newest CREATED) and requests[] carrying
 * { type: "DELETE", state: "ACCEPTED" } — so the order still reads as deletable
 * and a second press would queue a duplicate request.
 *
 * SUCCESSFUL and INVALID are deliberately NOT pending. The first means the
 * deletion finished; the second that CDEK rejected it. Neither should block a
 * fresh attempt — and INVALID especially must not, or one rejected request
 * would lock the seller out of cancelling forever.
 */
const PENDING_DELETE_STATES = new Set(["ACCEPTED", "WAITING"]);

/**
 * The state of an already-pending DELETE, or null when none is in flight.
 *
 * Returning the state rather than a boolean because the caller reports it as
 * providerStatus — the same measured word CDEK used, not one of ours.
 *
 * ABSENT OR UNREADABLE → null, i.e. NOT pending. Refusing to act on a body we
 * could not parse would strand a seller who has never asked for anything; the
 * cost of the opposite mistake is one duplicate request, which is what the
 * measured envelope shows CDEK simply queues.
 */
export function readPendingDeleteState(body: unknown): string | null {
  const deleteRequest = findRequestByType(body, "DELETE");
  if (deleteRequest === null) {
    return null;
  }
  const state = deleteRequest.state;
  if (typeof state !== "string") {
    return null;
  }
  const trimmed = state.trim();
  return PENDING_DELETE_STATES.has(trimmed) ? trimmed : null;
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
