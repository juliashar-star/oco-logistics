import {
  CARRIER_CREDENTIAL_FIELDS,
  type CarrierCredentialFieldSpec,
} from "./connect-carrier-credentials";
import { CREDENTIAL_FIELD_LABELS } from "./connect-result-response";

/**
 * What the browser must know to ASK for a carrier's credentials — never what a
 * seller already stored. These descriptors carry names, labels and input kinds
 * only; no credential value can travel through this module.
 *
 * DERIVED from CARRIER_CREDENTIAL_FIELDS rather than re-listed, so the fields a
 * form asks for cannot drift from the fields the service requires — the drift is
 * impossible, not merely tested. Labels are reused from CREDENTIAL_FIELD_LABELS
 * so a 400 that says «Проверьте поле «токен доступа»» names the field a seller
 * saw on the form, in the same words.
 *
 * Anything this module cannot resolve (a field with no label, no kind, or a
 * choice with an unlabelled option) THROWS at module load: it is a programming
 * error in static config, caught by the tests and by the build, never a silent
 * fallback that would render a closed set as a free-text box.
 */

export type CarrierConnectFieldKind =
  /** Ordinary text the seller may see as they type. */
  | "text"
  /** Must be masked in the browser. */
  | "secret"
  /** A fixed set of options; the browser renders a choice, never a text box. */
  | "choice";

export type CarrierConnectFieldOption = {
  value: string;
  label: string;
};

export type CarrierConnectField = {
  name: string;
  label: string;
  kind: CarrierConnectFieldKind;
  /** Present if and only if kind === "choice". */
  options?: readonly CarrierConnectFieldOption[];
};

/**
 * Which input each credential field needs. `secret` marks the values that must
 * be masked in the browser — the token and the API password, not the two
 * identifiers, which a seller needs to be able to read back and check.
 */
const FIELD_KINDS: Readonly<Record<string, CarrierConnectFieldKind>> = {
  platformStationId: "text",
  token: "secret",
  account: "text",
  securePassword: "secret",
  contractType: "choice",
};

/**
 * Seller-facing labels for the values of a choice field.
 *
 * CDEK's contractType is "1" | "2" on the wire; the digits mean nothing to a
 * seller, so each option names the CONTRACT instead. The mapping is the one
 * measured in cdek/transport.ts: «1 = интернет-магазин, 2 = доставка».
 */
const FIELD_OPTION_LABELS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  contractType: {
    "1": "Интернет-магазин",
    "2": "Доставка",
  },
};

function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
}

function describeField(
  providerKey: string,
  spec: CarrierCredentialFieldSpec,
): CarrierConnectField {
  const label = own(CREDENTIAL_FIELD_LABELS, spec.name);
  if (label === undefined) {
    throw new Error(
      `CARRIER_CONNECT_FIELDS: ${providerKey}.${spec.name} has no seller-facing label`,
    );
  }

  const kind = own(FIELD_KINDS, spec.name);
  if (kind === undefined) {
    throw new Error(
      `CARRIER_CONNECT_FIELDS: ${providerKey}.${spec.name} has no input kind`,
    );
  }

  const isClosedSet = spec.allowed !== undefined;
  if (isClosedSet !== (kind === "choice")) {
    // A closed set rendered as text would let a seller type an invalid value;
    // an open field rendered as a choice would hide valid ones.
    throw new Error(
      `CARRIER_CONNECT_FIELDS: ${providerKey}.${spec.name} kind "${kind}" contradicts its allowed-value list`,
    );
  }

  if (kind !== "choice") {
    return { name: spec.name, label, kind };
  }

  const optionLabels = own(FIELD_OPTION_LABELS, spec.name) ?? {};
  const options = spec.allowed!.map((value) => {
    const optionLabel = own(optionLabels, value);
    if (optionLabel === undefined) {
      throw new Error(
        `CARRIER_CONNECT_FIELDS: ${providerKey}.${spec.name} option "${value}" has no label`,
      );
    }
    return { value, label: optionLabel };
  });

  return { name: spec.name, label, kind, options };
}

function buildCarrierConnectFields(): Readonly<
  Record<string, readonly CarrierConnectField[]>
> {
  const built: Record<string, readonly CarrierConnectField[]> = {};
  for (const [providerKey, spec] of Object.entries(CARRIER_CREDENTIAL_FIELDS)) {
    built[providerKey] = spec.map((field) => describeField(providerKey, field));
  }
  return built;
}

/** One entry per carrier the connect service can handle, in the same order. */
export const CARRIER_CONNECT_FIELDS = buildCarrierConnectFields();
