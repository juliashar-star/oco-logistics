import type { SellerReadiness } from "../seller-readiness";

/**
 * Whether a calculation may proceed to create-draft, and the guard that keeps a
 * double click from running it twice.
 *
 * WHY THIS IS NOT IN THE COMPONENT. The decision used to live inside the form's
 * submit handler, where nothing could watch it fail — and it did fail: the
 * handler awaited a loader that returned `void`, then read the answer back from
 * React state through a ref written in an effect. An effect runs AFTER the next
 * render, so the ref still said «loading», the refusal branch never matched, and
 * the draft — recipient name, phone and address — went to the database anyway.
 * The whole point of the check was lost to a rule about when React writes state.
 *
 * So the decision takes its input as an argument and returns its answer. It
 * never reads React state, never reads a ref, and a test can hold it still.
 */

export type ReadinessState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; value: SellerReadiness };

/**
 * How long a calculation waits for the readiness answer before giving up on it.
 *
 * WHY A TIMEOUT AT ALL. Without one, a request that never settles leaves the
 * button reading «Проверяем настройки...» forever, and the seller cannot
 * calculate at all — a worse outcome than the wasted draft this check exists to
 * prevent.
 *
 * WHY FIVE SECONDS. It is the same answer the route gives from two indexed
 * counts and one row read, so anything near this long means the request is not
 * coming back. Long enough that a slow-but-alive network still gets its answer,
 * short enough that a seller does not think the page is broken. On expiry the
 * state becomes `unavailable`, which is the ordinary degradation path — never a
 * hang.
 */
export const READINESS_TIMEOUT_MS = 5_000;

export const CALCULATION_GATE_MESSAGES = {
  no_carrier: "Подключите перевозчика в настройках, чтобы рассчитать доставку",
  no_sender: "Укажите город и телефон отправителя в настройках компании",
} as const;

export type CalculationGateRefusal = keyof typeof CALCULATION_GATE_MESSAGES;

export type CalculationGateDecision =
  | { proceed: true; state: ReadinessState }
  | { proceed: false; state: ReadinessState; reason: CalculationGateRefusal };

type ResolveInput = {
  /** The state as the screen currently holds it. */
  state: ReadinessState;
  /** Fetches a fresh state. MUST resolve to the state, not to void. */
  load: () => Promise<ReadinessState>;
  timeoutMs?: number;
};

function timeoutTo(
  fallback: ReadinessState,
  ms: number,
): { promise: Promise<ReadinessState>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<ReadinessState>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return {
    promise,
    cancel: () => {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

/**
 * WAITS when the answer is still coming, SKIPS only when it came and was
 * unusable.
 *
 * «loading» is the ordinary case on a fast click, not an exceptional one.
 * Skipping the check there is what wrote personal data for a calculation the
 * route was about to refuse. «unavailable» — a failed request, or a route too
 * old to send the field — is the real «не знаю», and there the screen degrades
 * to its previous behaviour rather than blocking every seller on a bad rollout.
 */
export async function resolveCalculationGate(
  input: ResolveInput,
): Promise<CalculationGateDecision> {
  let state = input.state;

  if (state.status === "loading") {
    const ms = input.timeoutMs ?? READINESS_TIMEOUT_MS;
    const fallback: ReadinessState = { status: "unavailable" };
    const timeout = timeoutTo(fallback, ms);
    try {
      // THE RETURNED VALUE, not React state and not a ref — see the file note.
      state = await Promise.race([
        input.load().catch((): ReadinessState => fallback),
        timeout.promise,
      ]);
    } finally {
      timeout.cancel();
    }
  }

  if (state.status !== "ready") {
    return { proceed: true, state };
  }

  // Carrier first: without one there is nothing to quote at all, so naming the
  // sender first would send the seller to fix the smaller thing.
  if (!state.value.carrierConnected) {
    return { proceed: false, state, reason: "no_carrier" };
  }
  if (!state.value.senderConfigured) {
    return { proceed: false, state, reason: "no_sender" };
  }
  return { proceed: true, state };
}

/**
 * One-at-a-time, decided SYNCHRONOUSLY.
 *
 * A `useState` flag cannot guard this: two clicks in the same tick both read
 * the value from the render that has already happened, both see false, and both
 * proceed. A plain closure variable flips on the first call, so the second call
 * in that same tick sees it — which is exactly what a double click is.
 */
export type SubmitGate = {
  /** True when this caller may proceed; false when someone else already is. */
  tryEnter: () => boolean;
  release: () => void;
  isBusy: () => boolean;
};

export function createSubmitGate(): SubmitGate {
  let busy = false;
  return {
    tryEnter: () => {
      if (busy) return false;
      busy = true;
      return true;
    },
    release: () => {
      busy = false;
    },
    isBusy: () => busy,
  };
}
