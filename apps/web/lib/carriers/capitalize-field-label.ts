/**
 * Capitalise a stored field label for display AT RENDER.
 *
 * The labels in CREDENTIAL_FIELD_LABELS stay lowercase on purpose: the rejection
 * messages use them mid-sentence («Проверьте поле «токен доступа»…»). A form
 * label wants the same words with a capital, so the capital is added here rather
 * than stored — otherwise one of the two readings would always be wrong.
 *
 * Only the first character changes: «пароль для доступа к API» must keep API.
 */
export function capitalizeFieldLabel(label: string): string {
  if (label.length === 0) {
    return "";
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}
