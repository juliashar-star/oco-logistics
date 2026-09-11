import type { CarrierConnectField } from "./carrier-connect-fields";
import type { CarrierFormGap } from "./describe-carrier-form-gap";

/**
 * What to tell the seller while the connect button is disabled.
 *
 * The button used to go grey and say nothing: login and password filled, the
 * contract type not chosen, and the seller left to guess which of three fields
 * the form was waiting for. The reason was known to the code and never reached
 * the screen.
 *
 * PURE, so the wording is testable without a browser — the same shape as
 * `connectSuccessMessage`.
 *
 * LABELS GO IN VERBATIM, LOWERCASE. `capitalizeFieldLabel` is NOT called here
 * and must not be: the labels in CREDENTIAL_FIELD_LABELS are stored lowercase
 * precisely because messages use them mid-sentence («Проверьте поле «токен
 * доступа»…»), and the capital is added at render on the form label instead.
 * Applying it here would put a capital in the middle of a sentence.
 *
 * NOTHING BUT LABELS CROSSES INTO THE TEXT. No `field.name`, because a raw key
 * like `platformStationId` must never reach a seller; and no value from
 * `values`, because those are the seller's carrier credentials. Both are pinned
 * by tests rather than left to care.
 *
 * NO NUMERALS, ON PURPOSE. Every sentence is phrased around count-noun
 * agreement — «не заполнено: a, b» rather than «не заполнено 2 поля» — so one
 * wording is correct for any number of fields and no branch on count exists to
 * fall out of step.
 */

/** Field order is the order the seller sees on screen. Never sorted. */
function listLabels(fields: readonly CarrierConnectField[]): string {
  return fields.map((field) => field.label).join(", ");
}

/**
 * Returns null when there is nothing to say — a caller rendering the notice
 * shows nothing rather than an empty box.
 */
export function carrierFormGapMessage(gap: CarrierFormGap): string | null {
  switch (gap.kind) {
    case "ready":
      return null;

    case "no_fields":
      // A configuration error on our side, not something a seller can act on:
      // there is no field to name and no value to ask for. The button stays
      // disabled — describeCarrierFormGap never reports this as ready — and the
      // notice stays silent rather than invent an instruction.
      return null;

    case "nothing_supplied":
      // «Сохранить», not «Подключить»: this branch only happens on a carrier
      // that is already connected, which is also what the button says there.
      // The companion fact — that an empty field keeps its stored value — is
      // already under every field as KEEP_STORED_PLACEHOLDER, so it is not
      // repeated here.
      return "Чтобы сохранить, заполните хотя бы одно поле.";

    case "missing": {
      // «Подключить» is safe: `missing` cannot arise on a connected carrier,
      // where one filled field is enough and refusal names no field at all.
      const sentences: string[] = [];

      if (gap.blank.length > 0) {
        sentences.push(`Для подключения не заполнено: ${listLabels(gap.blank)}.`);
      }

      if (gap.badChoice.length > 0) {
        // A separate sentence, because «заполните» would be wrong: the field
        // has a value, and it is the value that cannot be sent.
        sentences.push(
          `Не подходит выбранное: ${listLabels(gap.badChoice)}. Выберите из предложенных вариантов.`,
        );
      }

      // Blanks first — the order the checks run in, and the order the fields
      // appear on screen.
      return sentences.join(" ");
    }
  }
}
