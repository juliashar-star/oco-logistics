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
  /** One short line telling the seller where this value comes from. */
  hint: string;
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
 * Where each value comes from, in one line.
 *
 * Chrome keeps offering its saved-password dropdown on the token field however
 * the input is marked up, so the remaining lever is telling the seller what the
 * field actually is: a value from THEIR carrier cabinet, never an OCO password.
 *
 * Names the cabinet and nothing more — no URLs, no menu paths. We have not
 * verified either carrier's UI, and an invented click-path would be a fact we
 * cannot stand behind.
 */
const FIELD_HINTS: Readonly<Record<string, string>> = {
  // Grounded in what WE send: source.platform_station_id — the place a shipment
  // is collected from. Says what the value is, not where a button lives; we have
  // not seen Yandex's interface.
  platformStationId:
    "Указывает место, откуда забирают ваши посылки — его идентификатор есть в кабинете Яндекс Доставки.",
  token:
    "Токен для API из кабинета Яндекс Доставки; иногда его выдаёт менеджер после подписания договора. Это не пароль — ни от OCO, ни от любого другого сервиса.",
  // Grounded in what WE send: `account` goes to CDEK as the client identifier of
  // the OAuth request, paired with securePassword. No manager clause here — that
  // belongs to the secret fields.
  account:
    "С ним OCO обращается к API СДЭК — вместе с паролем для интеграции. Есть в вашем кабинете СДЭК.",
  securePassword:
    "Отдельный пароль для интеграции из кабинета СДЭК — не тот, которым вы входите на сайт; иногда его выдаёт менеджер после подписания договора.",
  contractType: "Какой из двух договоров вы заключили со СДЭК.",
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

  const hint = own(FIELD_HINTS, spec.name);
  if (hint === undefined) {
    throw new Error(
      `CARRIER_CONNECT_FIELDS: ${providerKey}.${spec.name} has no hint`,
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
    return { name: spec.name, label, hint, kind };
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

  return { name: spec.name, label, hint, kind, options };
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
