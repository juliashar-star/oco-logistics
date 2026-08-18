/**
 * Is there typed text whose confirmation-by-picking has not arrived yet?
 *
 * What this state MEANS FOR THE SELLER. Both the city and the address field are
 * autocomplete inputs holding two values: the text itself, and a display value
 * that is written ONLY by the suggestion-picked handler (`onSelect`) and wiped by
 * ANY manual keystroke (`onChange`). A blank display value next to non-blank text
 * therefore says «what is in this field came from the keyboard, not from the
 * list».
 *
 * That distinction is not cosmetic for the address: the courier branch refuses to
 * submit unless the house flag is set, and that flag is likewise set only on pick.
 * So an address typed by hand is NOT ACCEPTED BY THE FORM even when the seller
 * wrote a perfectly correct house number, and nothing on screen used to say why.
 * This predicate exists so that state can be made visible instead of surfacing
 * later as a refusal the seller cannot explain.
 *
 * Blank-ish text and blank-ish confirmation are both trimmed, so whitespace never
 * counts as either an entry or a confirmation.
 */
export function needsSuggestionPick(text: string, confirmedDisplayValue: string): boolean {
  return Boolean(text.trim()) && !confirmedDisplayValue.trim();
}
