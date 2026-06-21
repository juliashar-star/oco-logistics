import { parsePhoneNumberFromString } from "libphonenumber-js";
import { normalizeRuPhone, type NormalizeRuPhoneResult } from "@/lib/phone/ru-phone";

export type PhoneCountryCode = "RU" | "INTL";

export type NormalizeRecipientPhoneResult = NormalizeRuPhoneResult;

const VALID_RU_OPERATOR_FIRST_DIGITS = new Set(["3", "4", "8", "9"]);

const INVALID_RU_OPERATOR_MESSAGE =
  "Похоже, это не настоящий номер — проверьте код города или оператора";

const INVALID_INTL_PHONE_MESSAGE =
  "Введите корректный номер телефона с кодом страны";

function validateRuRecipientPhone(result: NormalizeRuPhoneResult): NormalizeRecipientPhoneResult {
  if (!result.ok || result.value === "") {
    return result;
  }

  const firstNationalDigit = result.value[2];
  if (!firstNationalDigit || !VALID_RU_OPERATOR_FIRST_DIGITS.has(firstNationalDigit)) {
    return { ok: false, error: INVALID_RU_OPERATOR_MESSAGE };
  }

  return result;
}

function tryNormalizeKzPhoneAfterRuOperatorRejection(
  input: string,
): NormalizeRecipientPhoneResult | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("+7")) {
    return null;
  }

  const parsed = parsePhoneNumberFromString(trimmed, "KZ");
  if (!parsed || !parsed.isValid()) {
    return null;
  }

  return { ok: true, value: parsed.format("E.164") };
}

function normalizeRuRecipientPhone(input: string): NormalizeRecipientPhoneResult {
  const normalized = normalizeRuPhone(input);
  if (!normalized.ok) {
    return normalized;
  }

  const validated = validateRuRecipientPhone(normalized);
  if (validated.ok || validated.error !== INVALID_RU_OPERATOR_MESSAGE) {
    return validated;
  }

  const kzFallback = tryNormalizeKzPhoneAfterRuOperatorRejection(input);
  return kzFallback ?? validated;
}

function resolveCountryBranch(input: string, countryCode: PhoneCountryCode): PhoneCountryCode {
  if (countryCode === "INTL") {
    return "INTL";
  }

  const trimmed = input.trim();
  if (trimmed.startsWith("+") && !trimmed.startsWith("+7")) {
    return "INTL";
  }

  return "RU";
}

function normalizeIntlPhone(input: string): NormalizeRecipientPhoneResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: true, value: "" };
  }

  const parsed = parsePhoneNumberFromString(trimmed);
  if (!parsed || !parsed.isValid()) {
    return { ok: false, error: INVALID_INTL_PHONE_MESSAGE };
  }

  return { ok: true, value: parsed.format("E.164") };
}

/** Нормализует телефон получателя: РФ (как раньше) или международный (+…, не +7). */
export function normalizeRecipientPhone(
  input: string,
  countryCode: PhoneCountryCode = "RU",
): NormalizeRecipientPhoneResult {
  const branch = resolveCountryBranch(input, countryCode);

  switch (branch) {
    case "RU":
      return normalizeRuRecipientPhone(input);
    case "INTL":
      return normalizeIntlPhone(input);
    default: {
      const _exhaustive: never = branch;
      return _exhaustive;
    }
  }
}
