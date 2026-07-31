import { parcelFitsPickupPointKind } from "@oco/core/carrier-adapter/parcel-fits-pickup-point-kind";

/** Shown once under the parcel fields when the current parcel exceeds postamat limits. */
export const POSTAMAT_TOO_LARGE_NOTICE =
  "Такая посылка не поместится в постамат";

/**
 * Whether to show the postamat-too-large notice under the parcel fields.
 * Decision, not markup — keep out of JSX.
 *
 * The limit is a property of the PARCEL (and a kind-wide rule), not of each
 * point — so the cue is stated once here, not repeated on every postamat option.
 * Only on ПВЗ: postamats do not exist on the courier branch.
 */
export function shouldShowPostamatTooLargeNotice(args: {
  pickupType: "PVZ" | "COURIER";
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}): boolean {
  if (args.pickupType !== "PVZ") {
    return false;
  }
  const { weightG, lengthCm, widthCm, heightCm } = args;
  if (
    !Number.isFinite(weightG) ||
    !Number.isFinite(lengthCm) ||
    !Number.isFinite(widthCm) ||
    !Number.isFinite(heightCm)
  ) {
    return false;
  }
  return !parcelFitsPickupPointKind(
    { weightG, lengthCm, widthCm, heightCm },
    "postamat",
  );
}
