/**
 * WHY: when some connected carriers return points and others do not, the seller
 * still sees a non-empty list and has no red error. Without a status-only
 * caution they cannot tell that part of the network is missing. Naming comes
 * from server-resolved carrierName — never providerKey (masking).
 *
 * Reacts only to failed / city_not_resolved / no_adapter. status "ok" with
 * zero points is an honest empty network for that city — not a failure.
 */

type PartialCarrierInput = {
  status?: unknown;
  carrierName?: unknown;
};

/** Nominative base; after-«Для» transform yields genitive «одного из перевозчиков». */
const EMPTY_NAME_FALLBACK = "один из перевозчиков";

const STATUS_ORDER = ["failed", "city_not_resolved", "no_adapter"] as const;

type PartialStatus = (typeof STATUS_ORDER)[number];

function isPartialStatus(status: unknown): status is PartialStatus {
  return (
    status === "failed" ||
    status === "city_not_resolved" ||
    status === "no_adapter"
  );
}

function displayName(carrier: PartialCarrierInput): string {
  const name =
    typeof carrier.carrierName === "string" ? carrier.carrierName.trim() : "";
  return name.length > 0 ? name : EMPTY_NAME_FALLBACK;
}

/**
 * After «Для»: «Перевозчик №N» → «Перевозчика №N»;
 * «один из перевозчиков» → «одного из перевозчиков».
 */
function nameAfterDlya(name: string): string {
  if (name === EMPTY_NAME_FALLBACK) {
    return "одного из перевозчиков";
  }
  if (name.startsWith("Перевозчик ")) {
    return `Перевозчика ${name.slice("Перевозчик ".length)}`;
  }
  return name;
}

function joinNames(names: string[]): string {
  return names.join(", ");
}

function phraseForGroup(status: PartialStatus, names: string[]): string {
  const joined = joinNames(names);
  switch (status) {
    case "failed":
      return `Не удалось загрузить пункты: ${joined}`;
    case "city_not_resolved": {
      const verb = names.length === 1 ? "не нашёл" : "не нашли";
      return `${joined} ${verb} этот город`;
    }
    case "no_adapter":
      return `Для ${joinNames(names.map(nameAfterDlya))} список пунктов пока недоступен`;
  }
}

/** Capitalise only the first character of the whole notice — not after «; ». */
function capitaliseFirst(text: string): string {
  if (text.length === 0) {
    return text;
  }
  return text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1);
}

export function describePartialPickupPoints(
  carriers: unknown,
): string | null {
  if (!Array.isArray(carriers) || carriers.length === 0) {
    return null;
  }

  const groups = new Map<PartialStatus, string[]>();
  for (const status of STATUS_ORDER) {
    groups.set(status, []);
  }

  for (const entry of carriers as PartialCarrierInput[]) {
    if (!isPartialStatus(entry?.status)) {
      continue;
    }
    groups.get(entry.status)!.push(displayName(entry));
  }

  const parts: string[] = [];
  for (const status of STATUS_ORDER) {
    const names = groups.get(status)!;
    if (names.length === 0) {
      continue;
    }
    parts.push(phraseForGroup(status, names));
  }

  if (parts.length === 0) {
    return null;
  }

  return capitaliseFirst(parts.join("; "));
}
