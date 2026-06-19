import type { ApishipOrderStatusOrderInfo, ApishipStatusEvent } from "./types";

type RawStatus = {
  key?: string;
  name?: string;
  description?: string;
  created?: string;
  providerCode?: string | null;
  providerName?: string | null;
  providerDescription?: string | null;
  createdProvider?: string | null;
  errorCode?: string | null;
};

type RawOrderInfo = {
  orderId?: number | string;
  clientNumber?: string | null;
  providerKey?: string | null;
  providerNumber?: string | null;
  additionalProviderNumber?: string | null;
  returnProviderNumber?: string | null;
  barcode?: string | null;
  trackingUrl?: string | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parseApishipStatusEvent(raw: RawStatus | null | undefined): ApishipStatusEvent {
  return {
    key: raw?.key?.trim() ?? "",
    name: raw?.name?.trim() ?? "",
    description: raw?.description?.trim() ?? "",
    created: raw?.created?.trim() ?? "",
    providerCode: trimOrNull(raw?.providerCode ?? undefined),
    providerName: trimOrNull(raw?.providerName ?? undefined),
    providerDescription: trimOrNull(raw?.providerDescription ?? undefined),
    createdProvider: trimOrNull(raw?.createdProvider ?? undefined),
    errorCode: trimOrNull(raw?.errorCode ?? undefined),
  };
}

export function parseApishipOrderStatusOrderInfo(
  raw: RawOrderInfo | null | undefined,
): ApishipOrderStatusOrderInfo {
  const orderId =
    raw?.orderId != null && String(raw.orderId).trim()
      ? String(raw.orderId).trim()
      : "";

  return {
    orderId,
    clientNumber: trimOrNull(raw?.clientNumber ?? undefined),
    providerKey: trimOrNull(raw?.providerKey ?? undefined),
    providerNumber: trimOrNull(raw?.providerNumber ?? undefined),
    additionalProviderNumber: trimOrNull(raw?.additionalProviderNumber ?? undefined),
    returnProviderNumber: trimOrNull(raw?.returnProviderNumber ?? undefined),
    barcode: trimOrNull(raw?.barcode ?? undefined),
    trackingUrl: trimOrNull(raw?.trackingUrl ?? undefined),
  };
}
