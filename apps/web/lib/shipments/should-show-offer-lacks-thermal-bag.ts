/**
 * Show «без термосумки» on an offer card only when the seller asked for a
 * thermal bag on this quote and THIS service cannot carry one.
 * Decision, not markup — keep out of JSX.
 */
export function shouldShowOfferLacksThermalBag(args: {
  needsThermalBag: boolean;
  supportsThermalBag: boolean;
}): boolean {
  return args.needsThermalBag === true && args.supportsThermalBag !== true;
}
