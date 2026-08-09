"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { capitalizeFieldLabel } from "@/lib/carriers/capitalize-field-label";
import { connectSuccessMessage } from "@/lib/carriers/connect-success-message";
import { isCarrierFormComplete } from "@/lib/carriers/is-carrier-form-complete";
import { pickSuppliedCredentials } from "@/lib/carriers/pick-supplied-credentials";
import { shouldAcceptFieldValue } from "@/lib/carriers/should-accept-field-value";
import type { CarrierConnectField } from "@/lib/carriers/carrier-connect-fields";

/**
 * The «Подключение» tab: one card per carrier the connect service can handle.
 *
 * The field list comes from GET /api/carriers/connections — this component keeps
 * no copy of which fields a carrier needs. Nothing prefills: stored credentials
 * are never sent to a browser, so every input starts empty. For a connected
 * carrier every field is marked «сохранён» from `isConnected` alone (the store
 * gate never writes a partial bag) — no decrypt, no value, no length.
 *
 * A TYPED value — from a text or secret input — is written into `values` only
 * for a field the seller has focused (see shouldAcceptFieldValue). Measured:
 * Chrome autofilled the seller's own site login into the Яндекс pair and fired a
 * change event, which reached React state and armed the submit button. The focus
 * rule is what makes that harmless; the autofill-suppressing attributes below
 * only make it rarer.
 *
 * The CHOICE field deliberately does NOT pass through that gate. It is set by
 * clicking a button, which no password manager can synthesise, so the click IS
 * the interaction and is recorded and applied together. Do NOT "fix" this by
 * routing the choice through focus: that would make click-to-select depend on
 * focus and click landing in separate React renders, and a single batched render
 * would silently drop the seller's pick.
 */

type CarrierConnection = {
  providerKey: string;
  displayName: string;
  isConnected: boolean;
  fields: CarrierConnectField[];
};

/** values[providerKey][fieldName] — the ONLY source for the submit decision. */
type FormValues = Record<string, Record<string, string>>;
/** interacted[providerKey][fieldName] — true once the seller has focused it. */
type InteractedFields = Record<string, Record<string, boolean>>;

/**
 * Empty input on a connected carrier. Short on purpose: it repeats under every
 * field, and the «сохранён» marker beside the label already says a value exists.
 */
const KEEP_STORED_PLACEHOLDER = "Оставьте пустым, чтобы не менять";

/**
 * The same idea for a button group, which has no placeholder and nothing to
 * leave empty — you simply do not touch it.
 */
const KEEP_STORED_CHOICE_NOTE = "Текущий вариант останется, если не выбрать другой";

function forCarrier<T>(
  outer: Readonly<Record<string, Record<string, T>>>,
  providerKey: string,
): Readonly<Record<string, T>> {
  return Object.prototype.hasOwnProperty.call(outer, providerKey)
    ? outer[providerKey]
    : {};
}

/** Per-card outcome of the last submit. Keyed by providerKey — never shared. */
type CardFeedback = { kind: "success" | "error"; text: string };

type ConnectionsFetch =
  | { ok: true; carriers: CarrierConnection[] }
  | { ok: false; error: string };

/** One place that talks to the connections endpoint, used by load AND re-fetch. */
async function fetchConnections(): Promise<ConnectionsFetch> {
  try {
    const response = await fetch("/api/carriers/connections");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error:
          typeof data.error === "string"
            ? data.error
            : "Не удалось загрузить перевозчиков.",
      };
    }
    return {
      ok: true,
      carriers: Array.isArray(data.carriers) ? data.carriers : [],
    };
  } catch {
    return { ok: false, error: "Не удалось связаться с сервером." };
  }
}

export function CarrierConnectionsPanel() {
  const [carriers, setCarriers] = useState<CarrierConnection[] | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [interacted, setInteracted] = useState<InteractedFields>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, CardFeedback>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /**
   * providerKeys with a POST in flight. A ref, not state, because the guard has
   * to be readable and writable in the SAME tick as the click — see
   * submitCarrier. `submitting` above mirrors this for the button's appearance.
   */
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    void loadConnections();
  }, []);

  async function loadConnections() {
    setLoading(true);
    setError("");
    const result = await fetchConnections();
    if (result.ok) {
      setCarriers(result.carriers);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  /**
   * Send only what the seller supplied, then take the new connected state from
   * the server — never from an assumption.
   */
  async function submitCarrier(carrier: CarrierConnection) {
    const providerKey = carrier.providerKey;

    // THE guard, and it must be synchronous. `submitting` is state: reading it
    // and calling setSubmitting are separated by a render, so two clicks in one
    // frame both read `false` and both POST — two real carrier calls. The
    // disabled attribute is no guard either; it only lands after that render.
    // A ref is checked and set in the same tick, so the second click loses.
    if (inFlight.current.has(providerKey)) {
      return;
    }
    inFlight.current.add(providerKey);
    // Read BEFORE the re-fetch, which is what flips it.
    const wasConnected = carrier.isConnected;
    const credentials = pickSuppliedCredentials(forCarrier(values, providerKey));

    setSubmitting((previous) => ({ ...previous, [providerKey]: true }));
    setFeedback((previous) => {
      const next = { ...previous };
      delete next[providerKey];
      return next;
    });

    try {
      const response = await fetch("/api/carriers/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerKey, credentials }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // The server's message is written for this screen and pinned by tests
        // there — shown verbatim, never rewritten or prefixed. Typed values are
        // left alone: a sandbox 503 must not cost a retyped token.
        setFeedback((previous) => ({
          ...previous,
          [providerKey]: {
            kind: "error",
            text:
              typeof data.error === "string"
                ? data.error
                : "Не удалось подключить перевозчика.",
          },
        }));
        return;
      }

      // Stored. Clear the typed values AND the interaction marks: a mark left
      // behind would let a later autofill through the focus gate on a field the
      // seller never touched again.
      setValues((previous) => ({ ...previous, [providerKey]: {} }));
      setInteracted((previous) => ({ ...previous, [providerKey]: {} }));

      const refreshed = await fetchConnections();
      if (!refreshed.ok) {
        // Do NOT claim success we cannot confirm, and do not mark the card
        // optimistically — that would look identical whether or not the row
        // exists. Say what is known: the save returned 200, the state did not.
        setFeedback((previous) => ({
          ...previous,
          [providerKey]: {
            kind: "error",
            text: "Данные сохранены, но состояние подключений не обновилось. Обновите страницу.",
          },
        }));
        return;
      }

      setCarriers(refreshed.carriers);
      setFeedback((previous) => ({
        ...previous,
        [providerKey]: {
          kind: "success",
          text: connectSuccessMessage(wasConnected),
        },
      }));
    } catch {
      setFeedback((previous) => ({
        ...previous,
        [providerKey]: {
          kind: "error",
          text: "Не удалось связаться с сервером.",
        },
      }));
    } finally {
      // Both released together: the ref so a next click is allowed, the state
      // so the button comes back. The ref is the guard, the state is only the
      // appearance.
      inFlight.current.delete(providerKey);
      setSubmitting((previous) => ({ ...previous, [providerKey]: false }));
    }
  }

  function markInteracted(providerKey: string, fieldName: string) {
    setInteracted((previous) => {
      const current = forCarrier(previous, providerKey);
      if (current[fieldName] === true) {
        return previous;
      }
      return {
        ...previous,
        [providerKey]: { ...current, [fieldName]: true },
      };
    });
  }

  function writeValue(providerKey: string, fieldName: string, value: string) {
    setValues((previous) => ({
      ...previous,
      [providerKey]: {
        ...forCarrier(previous, providerKey),
        [fieldName]: value,
      },
    }));
  }

  /**
   * The gate for the ONE channel autofill can use: an <input> change event.
   * Returns whether the value was accepted, so the field can undo the paint when
   * it was not.
   */
  function acceptTypedValue(
    providerKey: string,
    fieldName: string,
    value: string,
  ): boolean {
    if (!shouldAcceptFieldValue(forCarrier(interacted, providerKey), fieldName)) {
      return false;
    }
    writeValue(providerKey, fieldName, value);
    return true;
  }

  /**
   * A choice is set by clicking a button, which no autofill can do — the click
   * IS the interaction, so it is recorded and applied together. Keeping this off
   * the gated path also avoids depending on focus and click landing in separate
   * React renders.
   */
  function chooseValue(providerKey: string, fieldName: string, value: string) {
    markInteracted(providerKey, fieldName);
    writeValue(providerKey, fieldName, value);
  }

  if (loading) {
    return <p className="text-sm text-text-3">Загружаем перевозчиков…</p>;
  }

  if (error) {
    return (
      <p
        className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        role="alert"
      >
        {error}{" "}
        <button
          type="button"
          onClick={() => void loadConnections()}
          className="rounded-lg bg-primary px-2 py-0.5 text-white hover:bg-primary-hover"
        >
          Повторить
        </button>
      </p>
    );
  }

  if (!carriers || carriers.length === 0) {
    return <p className="text-sm text-text-3">Перевозчики пока недоступны.</p>;
  }

  return (
    <div className="space-y-6">
      {carriers.map((carrier) => {
        const carrierValues = forCarrier(values, carrier.providerKey);
        // Reads `values` and nothing else. Part two's POST body MUST read this
        // same object — never the DOM, never a ref to an input. A value the
        // seller did not type into this component is not in here.
        const isReady = isCarrierFormComplete(
          carrier.fields,
          carrierValues,
          carrier.isConnected,
        );
        // Per card, never shared between them.
        const isSubmitting = submitting[carrier.providerKey] === true;
        const cardFeedback = Object.prototype.hasOwnProperty.call(
          feedback,
          carrier.providerKey,
        )
          ? feedback[carrier.providerKey]
          : undefined;

        return (
          <section
            key={carrier.providerKey}
            className="rounded-xl border border-slate-200 p-4"
            aria-label={carrier.displayName}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-slate-900">{carrier.displayName}</p>
              <Badge
                className={
                  carrier.isConnected
                    ? "bg-slate-200 text-slate-700"
                    : "bg-slate-100 text-slate-600"
                }
              >
                {carrier.isConnected ? "Подключён" : "Не подключён"}
              </Badge>
            </div>

            <div className="mt-4 space-y-4">
              {carrier.fields.map((field, index) => (
                <CarrierField
                  key={field.name}
                  providerKey={carrier.providerKey}
                  index={index}
                  field={field}
                  value={carrierValues[field.name] ?? ""}
                  isStored={carrier.isConnected}
                  onInteract={() =>
                    markInteracted(carrier.providerKey, field.name)
                  }
                  onTypedValue={(next) =>
                    acceptTypedValue(carrier.providerKey, field.name, next)
                  }
                  onChoose={(next) =>
                    chooseValue(carrier.providerKey, field.name, next)
                  }
                />
              ))}
            </div>

            {cardFeedback?.kind === "error" && (
              <p
                className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                role="alert"
              >
                {cardFeedback.text}
              </p>
            )}

            {cardFeedback?.kind === "success" && (
              <p
                className="mt-4 rounded-lg bg-success-soft px-3 py-2 text-sm text-success"
                role="status"
              >
                {cardFeedback.text}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!isReady || isSubmitting}
                onClick={() => void submitCarrier(carrier)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {/* «Сохранить», not «Заменить данные»: a seller may be changing
                    one field of three, and the rest stay as they are. */}
                {isSubmitting
                  ? "Проверяем у перевозчика…"
                  : carrier.isConnected
                    ? "Сохранить"
                    : "Подключить"}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

type CarrierFieldProps = {
  providerKey: string;
  index: number;
  field: CarrierConnectField;
  value: string;
  /** Derived from isConnected — never from a decrypted bag. */
  isStored: boolean;
  onInteract: () => void;
  /** Returns whether the value was accepted into state. */
  onTypedValue: (value: string) => boolean;
  onChoose: (value: string) => void;
};

function CarrierField({
  providerKey,
  index,
  field,
  value,
  isStored,
  onInteract,
  onTypedValue,
  onChoose,
}: CarrierFieldProps) {
  // Local to the field and read by NOTHING else. The focus gate reads only the
  // panel's `interacted`, which this cannot reach — so revealing a value can
  // never make an unfocused field submittable.
  const [isRevealed, setIsRevealed] = useState(false);

  const label = capitalizeFieldLabel(field.label);
  // Opaque id AND name: neither carries a token a password manager reads as a
  // login field. The field's real name (e.g. securePassword) must not appear —
  // it contains "Password", which is exactly what the heuristics look for.
  const inputId = `oco-cc-${providerKey}-${index}`;

  const labelRow = (
    <span className="flex flex-wrap items-baseline gap-2">
      <span>{label}</span>
      {isStored && (
        <span className="text-xs font-normal text-slate-500">сохранён</span>
      )}
    </span>
  );

  if (field.kind === "choice") {
    // No native radio exists anywhere in this cabinet — same button group as
    // delivery-interval-picker. Nothing is preselected: a default would be a
    // silent guess about which contract the seller signed.
    return (
      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">{labelRow}</p>
        {/* One hint for the field, never per option. */}
        <p className="mb-2 text-xs text-slate-500">{field.hint}</p>
        {isStored && (
          <p className="mb-2 text-xs text-slate-400">{KEEP_STORED_CHOICE_NOTE}</p>
        )}
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={label}
        >
          {(field.options ?? []).map((option) => {
            const isSelected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onChoose(option.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isSelected
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const isSecret = field.kind === "secret";

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1 block text-sm font-medium text-slate-700"
      >
        {labelRow}
      </label>
      <p className="mb-2 text-xs text-slate-500">{field.hint}</p>
      <div className="relative">
        <Input
          id={inputId}
          name={inputId}
          type={isSecret && !isRevealed ? "password" : "text"}
          // MITIGATION ONLY — these are a request to the browser, and Chrome was
          // measured ignoring the earlier set. They make autofill rarer; the
          // focus rule is what makes a value that arrives anyway harmless.
          autoComplete={isSecret ? "new-password" : "off"}
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          spellCheck={false}
          className={isSecret ? "pr-10" : ""}
          value={value}
          placeholder={isStored ? KEEP_STORED_PLACEHOLDER : undefined}
          onFocus={onInteract}
          onChange={(event) => {
            const accepted = onTypedValue(event.target.value);
            if (!accepted) {
              // Never focused: this came from the browser, not the seller. Put
              // the element back to what state says, so the field cannot show a
              // value the form will not send.
              event.target.value = value;
            }
          }}
        />
        {isSecret && (
          <button
            type="button"
            // A real accessible name that changes with the state — the icon is
            // decoration, never the only thing a screen reader gets.
            aria-label={
              isRevealed ? `Скрыть «${label}»` : `Показать «${label}»`
            }
            aria-pressed={isRevealed}
            onClick={() => setIsRevealed((previous) => !previous)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-slate-900"
          >
            <EyeIcon crossed={isRevealed} />
          </button>
        )}
      </div>
    </div>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.6" />
      {crossed && <path d="m4 20 16-16" />}
    </svg>
  );
}
