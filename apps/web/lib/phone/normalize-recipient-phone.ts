import { normalizeRuPhone, type NormalizeRuPhoneResult } from "@/lib/phone/ru-phone";

export type PhoneCountryCode = "RU";

export type NormalizeRecipientPhoneResult = NormalizeRuPhoneResult;

const VALID_RU_OPERATOR_FIRST_DIGITS = new Set(["3", "4", "8", "9"]);

const INVALID_RU_OPERATOR_MESSAGE =
  "Похоже, это не настоящий номер — проверьте код города или оператора";

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

/** Нормализует телефон получателя. Сейчас только РФ; позже — другие коды стран. */
export function normalizeRecipientPhone(
  input: string,
  countryCode: PhoneCountryCode = "RU",
): NormalizeRecipientPhoneResult {
  switch (countryCode) {
    case "RU":
      return validateRuRecipientPhone(normalizeRuPhone(input));
    default: {
      const _exhaustive: never = countryCode;
      return _exhaustive;
    }
  }
}
