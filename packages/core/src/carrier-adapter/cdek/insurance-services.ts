/** One entry of the calculator's `services` array. */
export type CdekCalculatorService = { code: string; parameter: string };

const UNKNOWN_CONTRACT_TYPE_LOG_MARKER =
  "[cdekCalculatorServices] UNKNOWN_CONTRACT_TYPE";

/** «Интернет-магазин» — the fee is applied by CDEK itself. */
const CONTRACT_TYPE_ONLINE_SHOP = "1";

/**
 * What to put in the calculator's `services` array — or nothing at all.
 *
 * THE ANSWER DEPENDS ON THE CONTRACT TYPE, and getting it wrong is expensive in
 * both directions. CDEK answered both halves directly (18.08):
 *
 * TYPE 1 «Интернет-магазин» → SEND NOTHING. The insurance fee is charged
 * automatically and passing INSURANCE explicitly is forbidden. Measured on the
 * production contract: with the service in the body, 37 of 38 tariff rows came
 * back `status: "false"` with `ve_additional_service_unavailable` and one with
 * `ve_as_insurance_min_declared_cost` — the seller would have seen a quote built
 * from almost nothing. Removing the array returned all 38 rows with
 * `status: "true"`, and the automatic fee showed up by itself in `services[]`
 * on the tariff that carries it.
 *
 * TYPE 2 «Доставка» → SEND THE REAL DECLARED VALUE. If the field is omitted CDEK
 * substitutes `parameter: 1`, and insurance of one rouble is insurance of
 * nothing: the parcel travels effectively uninsured while the seller believes
 * their declared value is covered. That is the reason this is a branch and not a
 * deletion — dropping `services` for everybody would be safe for type 1 and
 * quietly harmful for type 2.
 *
 * ANY OTHER TYPE → behave as type 2 and say so in the log. An unknown contract
 * with insurance requested is no worse off than today; an unknown contract
 * without it may be left with no cover, and that asymmetry decides the default.
 * Unreachable through the adapter today — assertCdekCredentials refuses anything
 * but "1" and "2" — so the log line is a tripwire for the day that changes.
 *
 * Returning `undefined` means «omit the key entirely». Measured 18.08: an absent
 * `services` field and `services: []` produce byte-identical replies, so the
 * distinction is ours for clarity, not the carrier's.
 */
export function cdekCalculatorServices(
  contractType: string,
  declaredValueRub: string,
): CdekCalculatorService[] | undefined {
  const type = contractType.trim();

  if (type === CONTRACT_TYPE_ONLINE_SHOP) {
    return undefined;
  }

  if (type !== "2") {
    console.error(
      UNKNOWN_CONTRACT_TYPE_LOG_MARKER,
      JSON.stringify({ contractType: type }),
    );
  }

  return [{ code: "INSURANCE", parameter: declaredValueRub }];
}
