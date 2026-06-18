export type NormalizeRuPhoneResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const INVALID_PHONE_MESSAGE =
  "Укажите телефон в формате РФ: +7 и 10 цифр (можно вводить 8, пробелы, скобки)";

/** Нормализует российский номер к виду +7XXXXXXXXXX. Пустая строка — ok с value "". */
export function normalizeRuPhone(input: string): NormalizeRuPhoneResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: true, value: "" };
  }

  const digits = trimmed.replace(/\D/g, "");

  let national: string;
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    national = digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
  } else if (digits.length === 10) {
    national = `7${digits}`;
  } else {
    return { ok: false, error: INVALID_PHONE_MESSAGE };
  }

  if (national.length !== 11 || !national.startsWith("7")) {
    return { ok: false, error: INVALID_PHONE_MESSAGE };
  }

  return { ok: true, value: `+7${national.slice(1)}` };
}
