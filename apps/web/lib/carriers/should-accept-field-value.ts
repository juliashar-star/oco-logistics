/**
 * Should a value arriving for `fieldName` be written into the form state?
 *
 * MEASURED (Chrome, connected Яндекс card): the browser autofilled a text input
 * followed by a type=password input with the seller's OWN site credentials, and
 * it dispatched an event React routed to onChange — so the value reached React
 * state, not just the DOM, and the submit button went live. Pressing it would
 * have sent the seller's site password to a carrier as an API token.
 *
 * The rule that survives that: a value counts only for a field the seller has
 * FOCUSED.
 *
 * That this rule excludes autofill is a MEASUREMENT, not a law — Chrome,
 * 06.08.2026, this repo: the load-time fill landed without ever focusing the
 * field, while typing, pasting and choosing from the password-manager dropdown
 * each focused it first. A different browser, or a later Chrome, could focus
 * before filling, and then this gate would accept that value like any other.
 * Do not write it up as a guarantee about browsers.
 *
 * What the gate does guarantee, whatever a browser does: `values` never holds
 * anything that arrived at a field the seller had not focused. That part is a
 * property of our own state.
 *
 * PURE, so "when is a value allowed in" is decided in one testable place.
 */
export function shouldAcceptFieldValue(
  interactedFields: Readonly<Record<string, boolean>>,
  fieldName: string,
): boolean {
  // Own-property only: a field named "__proto__" or "toString" must not resolve
  // through the prototype chain and unlock itself.
  if (!Object.prototype.hasOwnProperty.call(interactedFields, fieldName)) {
    return false;
  }
  return interactedFields[fieldName] === true;
}
